import http from "http";
import fs from "fs";
import path from "path";
import axios from "axios";
import { ENV } from "../config/env";
import { IndexerService } from "../services/indexer.service";
import { VanityService } from "../services/vanity.service";
import { logger } from "../utils/logger";

/**
 * Lightweight native HTTP server for Render Free Tier 24/7 compatibility & Companion Website API.
 * Serves:
 * - GET /health       -> 200 OK health check
 * - GET /api/launches -> Real-time JSON feed of deployed tokens across Stokerium, Sender & Programmable V4
 * - GET /             -> Serves the companion website (web/index.html)
 */
export function startHttpServer(): {
  server: http.Server;
  stopKeepAlive: () => void;
} {
  const port = Number(process.env.PORT || ENV.PORT || 3000);
  const webRoot = path.resolve(process.cwd(), "web");

  const server = http.createServer(async (req, res) => {
    // Enable CORS for standalone companion website deployments
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const rawUrl = req.url || "/";
    const pathname = rawUrl.split("?")[0];

    // 1. Render Health Check Endpoint
    if (pathname === "/health" || pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          status: "ok",
          service: "pangearam-launchpad-bot",
          chainId: ENV.CHAIN_ID,
          uptimeSeconds: Math.floor(process.uptime()),
          memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
          vanityPool: VanityService.getPoolStats(),
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // 2. Live Token Launches Feed API for Companion Website
    if (pathname === "/api/launches") {
      try {
        const urlObj = new URL(rawUrl, `http://localhost:${port}`);
        const limitParam = parseInt(urlObj.searchParams.get("limit") || "24", 10);
        const platformFilter = urlObj.searchParams.get("platform")?.toLowerCase();
        const limit = Math.max(1, Math.min(50, isNaN(limitParam) ? 24 : limitParam));

        let launches = await IndexerService.getRecentLaunches(limit);
        if (
          platformFilter &&
          (platformFilter === "pangea" ||
            platformFilter === "stokerium" ||
            platformFilter === "sender" ||
            platformFilter === "programmable")
        ) {
          launches = launches.filter((l) => l.platform === platformFilter);
        }

        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            status: "ok",
            chainId: 1,
            network: "Ethereum Mainnet",
            count: launches.length,
            launches,
          })
        );
      } catch (err) {
        logger.error(`Error serving /api/launches: ${(err as Error).message}`);
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ status: "error", message: "Internal server error" }));
      }
      return;
    }

    // 3. Serve Interactive Companion Website (web/index.html)
    if (pathname === "/" || pathname === "/index.html") {
      const indexHtmlPath = path.join(webRoot, "index.html");
      if (fs.existsSync(indexHtmlPath)) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        fs.createReadStream(indexHtmlPath).pipe(res);
        return;
      }
    }

    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ status: "not_found", path: pathname }));
  });

  server.listen(port, "0.0.0.0", () => {
    logger.info(
      `🌐 HTTP Health & Live Feed Server listening on port ${port} (/health, /api/launches, /)`
    );
  });

  // Render Free Tier Anti-Sleep Self-Ping Mechanism (every 10 minutes)
  const keepAliveTarget = ENV.RENDER_EXTERNAL_URL
    ? `${ENV.RENDER_EXTERNAL_URL.replace(/\/$/, "")}/health`
    : `http://127.0.0.1:${port}/health`;

  const keepAliveTimer = setInterval(async () => {
    try {
      await axios.get(keepAliveTarget, { timeout: 5000 });
      logger.debug(`[Keep-Alive] Heartbeat ping OK -> ${keepAliveTarget}`);
    } catch (err) {
      logger.debug(`[Keep-Alive] Ping notice: ${(err as Error).message}`);
    }
  }, 10 * 60 * 1000); // 10 minutes (under Render's 15-minute idle threshold)

  keepAliveTimer.unref();

  return {
    server,
    stopKeepAlive: () => clearInterval(keepAliveTimer),
  };
}
