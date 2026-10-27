import { PrismaClient } from "@prisma/client";
import { ENV } from "../config/env";

// Critical BigInt JSON Serialization Patch so JSON APIs (/api/launches, etc.) never crash on Telegram User IDs or block numbers
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

/**
 * Ensures Neon Serverless PostgreSQL connection URL includes sufficient connect_timeout (30s)
 * so cold-start wakeups never fail with P1001.
 */
function buildResilientDatabaseUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  let url = rawUrl;
  if (!url.includes("connect_timeout=")) {
    url += (url.includes("?") ? "&" : "?") + "connect_timeout=30&pool_timeout=30";
  }
  return url;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createResilientPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    datasources: {
      db: {
        url: buildResilientDatabaseUrl(ENV.DATABASE_URL),
      },
    },
    log: [
      { emit: "event", level: "error" },
      { emit: "event", level: "warn" },
    ],
  });

  // Auto-retry transient Neon serverless cold-start / socket reset errors (P1001, P1002, P1017)
  client.$use(async (params, next) => {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await next(params);
      } catch (err: unknown) {
        lastErr = err;
        const msg = (err as Error)?.message || "";
        const code = (err as { code?: string })?.code || "";
        const isUpsertRace =
          params.action === "upsert" &&
          (code === "P2002" || msg.includes("Unique constraint failed"));
        const isTransient =
          isUpsertRace ||
          msg.includes("Can't reach database server") ||
          msg.includes("Server has closed the connection") ||
          msg.includes("Timed out fetching a new connection") ||
          msg.includes("P1001") ||
          msg.includes("P1002") ||
          msg.includes("P1017");

        if (!isTransient || attempt === 3) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, isUpsertRace ? 60 * attempt : 700 * attempt));
      }
    }
    throw lastErr;
  });

  return client;
}

export const prisma = globalForPrisma.prisma ?? createResilientPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
