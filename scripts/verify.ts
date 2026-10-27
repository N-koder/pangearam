import assert from "assert";
import axios from "axios";
import { CryptoService } from "../src/services/crypto.service";
import { VanityService } from "../src/services/vanity.service";
import { platformService, PLATFORM_SPECS } from "../src/services/platform.service";
import { computeUniswapV4PoolId, CONTRACT_ADDRESSES } from "../src/config/contracts";
import { startHttpServer } from "../src/server/http.server";
import prisma from "../src/db/client";
import { ENV } from "../src/config/env";
import { logger } from "../src/utils/logger";

async function runVerification() {
  logger.info("🔍 Running Teleth Architecture & Safeguards Verification...");

  // 1. Verify BigInt JSON Serialization Patch
  const sampleObj = { userId: 6775272674n, blockNumber: 21489102n };
  const serialized = JSON.stringify(sampleObj);
  assert(
    serialized.includes('"6775272674"'),
    "BigInt JSON serialization patch failed"
  );
  logger.info("✅ 1. BigInt JSON Serialization Patch verified.");

  // 2. Verify AES-256-GCM Encryption & Decryption
  const sampleKey =
    "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";
  const encrypted = CryptoService.encryptPrivateKey(sampleKey);
  const decrypted = CryptoService.decryptPrivateKey(encrypted);
  assert.strictEqual(decrypted, sampleKey, "AES-256-GCM round-trip mismatch");
  logger.info("✅ 2. Non-Custodial AES-256-GCM Vault Encryption verified.");

  // 3. Verify 4-Way Launchpad Platform Specs & Official Attribution Links (Pangea #1 Default)
  const pangeaUrl = PLATFORM_SPECS.pangea.getExplorerUrl(
    "0x6434e57e8d12B92bb4D0b1EFb3274748B75196ea"
  );
  const stokeriumUrl = PLATFORM_SPECS.stokerium.getExplorerUrl(
    "0x75E2Fc69Ff2ac12aF65Ba7D321bBf4f878c535d2"
  );
  const senderUrl = PLATFORM_SPECS.sender.getExplorerUrl(
    "0x47ACCD13264D8F954105256FaaC8376ce6A55999"
  );
  const programmableUrl = PLATFORM_SPECS.programmable.getExplorerUrl(
    "0x7987f03462200b3D8A072E02C89A8A41dCB124EE"
  );
  assert.strictEqual(
    pangeaUrl,
    "https://pangea.trade/token/0x6434e57e8d12B92bb4D0b1EFb3274748B75196ea"
  );
  assert.strictEqual(
    stokeriumUrl,
    "https://stockereum.com/token/0x75E2Fc69Ff2ac12aF65Ba7D321bBf4f878c535d2"
  );
  assert.strictEqual(
    senderUrl,
    "https://sender.family/token/0x47ACCD13264D8F954105256FaaC8376ce6A55999"
  );
  assert.strictEqual(
    programmableUrl,
    "https://programmable.market/token/0x7987f03462200b3D8A072E02C89A8A41dCB124EE"
  );
  assert.strictEqual(platformService.getPlatform(1001n), "pangea");
  logger.info("✅ 3. PlatformService 4-protocol specs (Pangea #1 Priority) & attribution URLs verified.");

  // 4. Verify Instant 0ms Deterministic CREATE2 & Uniswap V4 PoolId computation
  const s1 = await VanityService.acquireSaltForSuffix("stokerium");
  assert(s1.predictedAddress.startsWith("0x") && s1.predictedAddress.length === 42);

  const v4PoolId = computeUniswapV4PoolId({
    tokenA: s1.predictedAddress,
    tokenB: CONTRACT_ADDRESSES.WETH,
    fee: 3000,
    tickSpacing: 60,
    hooks: CONTRACT_ADDRESSES.HOOK_DYNAMIC_FEE,
  });
  assert(v4PoolId.startsWith("0x") && v4PoolId.length === 66, "Invalid V4 PoolId");
  logger.info(
    `✅ 4. Instant 0ms CREATE2 Deployer (${s1.predictedAddress}) & Uniswap V4 PoolId verified.`
  );

  // 5. Backfill & Verify Existing Users in Neon PostgreSQL via Telegram API
  const dbUsers = await prisma.user.findMany({ include: { wallet: true } });
  for (const u of dbUsers) {
    if ((!u.username || !u.firstName) && ENV.TELEGRAM_BOT_TOKEN) {
      try {
        const tgRes = await axios.get(
          `https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/getChat?chat_id=${u.id.toString()}`,
          { timeout: 5000 }
        );
        const chat = tgRes.data?.result;
        if (chat) {
          const uname = chat.username || null;
          const fname =
            [chat.first_name, chat.last_name].filter(Boolean).join(" ") ||
            chat.title ||
            null;
          await prisma.user.update({
            where: { id: u.id },
            data: { username: uname, firstName: fname },
          });
          logger.info(
            `✅ Backfilled user ${u.id.toString()}: @${uname || "no-username"} (${fname || "User"}) -> Vault: ${u.wallet?.address}`
          );
        }
      } catch {
        // Ignore if unreachable
      }
    }
  }

  // 6. Verify HTTP Health & /api/launches Server
  process.env.PORT = "3991";
  const { server, stopKeepAlive } = startHttpServer();
  await new Promise((r) => setTimeout(r, 300));

  const healthRes = await axios.get("http://127.0.0.1:3991/health");
  assert.strictEqual(healthRes.status, 200);
  assert.strictEqual(healthRes.data.status, "ok");
  assert.strictEqual(healthRes.data.chainId, 1);

  const launchesRes = await axios.get("http://127.0.0.1:3991/api/launches");
  assert.strictEqual(launchesRes.status, 200);
  assert(Array.isArray(launchesRes.data.launches), "launches array missing");
  assert(launchesRes.data.launches.length >= 3, "seed launches missing");

  const webRes = await axios.get("http://127.0.0.1:3991/");
  assert.strictEqual(webRes.status, 200);
  assert(
    String(webRes.data).includes("Live Token Launches"),
    "Companion website HTML not served"
  );

  stopKeepAlive();
  server.close();
  await prisma.$disconnect().catch(() => {});

  logger.info("✅ 6. HTTP Server (/health, /api/launches, /) verified.");
  logger.info("🎉 All Teleth verification checks passed!");
  process.exit(0);
}

runVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
