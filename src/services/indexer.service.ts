import prisma from "../db/client";
import { PLATFORM_SPECS, LaunchPlatform } from "./platform.service";
import { logger } from "../utils/logger";

export interface LiveLaunchItem {
  id: string;
  name: string;
  symbol: string;
  tokenAddress: string;
  poolAddress: string;
  platform: LaunchPlatform;
  platformBadge: string;
  platformUrl: string;
  etherscanTokenUrl: string;
  etherscanTxUrl: string;
  hookProfile: string;
  quoteTokenSymbol: string;
  initialBuyEth: string;
  disperseWalletsCount: number;
  creatorAddress: string;
  imageUrl: string;
  txHash: string;
  blockNumber: string;
  createdAt: string;
}

/**
 * Curated fallback showcase items so the companion website and /trending feed
 * always display realistic examples across all 3 Ethereum launchpads even before
 * the first live DB launch is recorded.
 */
const SEED_SHOWCASE_LAUNCHES: LiveLaunchItem[] = [
  {
    id: "seed-pangea-0",
    name: "Pangea World Index",
    symbol: "PWRLD",
    tokenAddress: "0x373C863E4C34Db35B58C98Dd15a018E1ab53F6ea",
    poolAddress: "0x81a3c9e04f12b7d39c541a8b6f2d0e9c7a5f4d3e2b1c0a9f8e7d6c5b4a3f2e10",
    platform: "pangea",
    platformBadge: "🌍 Pangea ($PANGEA)",
    platformUrl: "https://www.pangea.trade/app/t/0x373C863E4C34Db35B58C98Dd15a018E1ab53F6ea",
    etherscanTokenUrl: "https://etherscan.io/token/0x373C863E4C34Db35B58C98Dd15a018E1ab53F6ea",
    etherscanTxUrl: "https://etherscan.io/tx/0x3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c",
    hookProfile: "OMNICHAIN_OFT_V4",
    quoteTokenSymbol: "ETH",
    initialBuyEth: "0.3500",
    disperseWalletsCount: 0,
    creatorAddress: "0x373C863E4C34Db35B58C98Dd15a018E1ab53F6ea",
    imageUrl: "",
    txHash: "0x3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c",
    blockNumber: "21489140",
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: "seed-stokerium-1",
    name: "Nvidia Stockereum",
    symbol: "NVDAS",
    tokenAddress: "0x75E2Fc69Ff2ac12aF65Ba7D321bBf4f878c535d2",
    poolAddress: "0x94c2e1f87a03d4b18e765c3a9f0d2b4e8c1a7f6d5e4b3c2a1f0e9d8c7b6a5432",
    platform: "stokerium",
    platformBadge: "🏛️ Stockereum ($STOCKER)",
    platformUrl: "https://stockereum.com/t/0x75E2Fc69Ff2ac12aF65Ba7D321bBf4f878c535d2",
    etherscanTokenUrl: "https://etherscan.io/token/0x75E2Fc69Ff2ac12aF65Ba7D321bBf4f878c535d2",
    etherscanTxUrl: "https://etherscan.io/tx/0x5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e",
    hookProfile: "SYNTHETIC_RWA_CURVE",
    quoteTokenSymbol: "NVDAon",
    initialBuyEth: "0.2500",
    disperseWalletsCount: 0,
    creatorAddress: "0x71C95911E9a5D330f4D621842EC243EE1343292e",
    imageUrl: "",
    txHash: "0x5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e",
    blockNumber: "21489102",
    createdAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
  },
  {
    id: "seed-sender-2",
    name: "Send It Guild",
    symbol: "SGLD",
    tokenAddress: "0x47ACCD13264D8F954105256FaaC8376ce6A55999",
    poolAddress: "0x21b8d4c79e02f3a15c678b9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f",
    platform: "sender",
    platformBadge: "📡 Sender ($SEND)",
    platformUrl: "https://sender.family/token/0x47ACCD13264D8F954105256FaaC8376ce6A55999",
    etherscanTokenUrl: "https://etherscan.io/token/0x47ACCD13264D8F954105256FaaC8376ce6A55999",
    etherscanTxUrl: "https://etherscan.io/tx/0x8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b",
    hookProfile: "MULTI_WALLET_DISPERSE",
    quoteTokenSymbol: "TSLAon",
    initialBuyEth: "0.5000",
    disperseWalletsCount: 12,
    creatorAddress: "0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5",
    imageUrl: "",
    txHash: "0x8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b",
    blockNumber: "21489045",
    createdAt: new Date(Date.now() - 1000 * 60 * 38).toISOString(),
  },
  {
    id: "seed-programmable-3",
    name: "Programmable V4 Pulse",
    symbol: "VPULSE",
    tokenAddress: "0x7987f03462200b3D8A072E02C89A8A41dCB124EE",
    poolAddress: "0x7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d",
    platform: "programmable",
    platformBadge: "🦄 Programmable ($V4)",
    platformUrl: "https://programmable.market/token/0x7987f03462200b3D8A072E02C89A8A41dCB124EE",
    etherscanTokenUrl: "https://etherscan.io/token/0x7987f03462200b3D8A072E02C89A8A41dCB124EE",
    etherscanTxUrl: "https://etherscan.io/tx/0x1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d",
    hookProfile: "DYNAMIC_SWAP_FEE",
    quoteTokenSymbol: "ETH",
    initialBuyEth: "0.1500",
    disperseWalletsCount: 0,
    creatorAddress: "0x388C818CA8B9251b393131C08a736A67ccB19297",
    imageUrl: "",
    txHash: "0x1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d",
    blockNumber: "21488910",
    createdAt: new Date(Date.now() - 1000 * 60 * 75).toISOString(),
  },
];

export class IndexerService {
  private static cache: LiveLaunchItem[] | null = null;
  private static inFlightFetch: Promise<LiveLaunchItem[]> | null = null;
  private static lastFetchTime = 0;
  private static readonly CACHE_TTL_MS = 15_000; // 15s TTL with Stale-While-Revalidate

  public static invalidateCache() {
    this.lastFetchTime = 0;
    this.refreshCacheInBackground().catch(() => {});
  }

  private static async refreshCacheInBackground(): Promise<LiveLaunchItem[]> {
    if (this.inFlightFetch) {
      return this.inFlightFetch;
    }

    this.inFlightFetch = (async () => {
      try {
        const dbLaunches = await prisma.tokenLaunch.findMany({
          where: { platform: "pangea" },
          orderBy: { createdAt: "desc" },
          take: 24,
        });

        const mapped: LiveLaunchItem[] = dbLaunches.map((item) => {
          const platform = (item.platform || "pangea") as LaunchPlatform;
          const spec = PLATFORM_SPECS[platform] || PLATFORM_SPECS.pangea;

          return {
            id: item.id,
            name: item.name,
            symbol: item.symbol,
            tokenAddress: item.tokenAddress,
            poolAddress: item.poolAddress,
            platform,
            platformBadge: spec.badge,
            platformUrl: spec.getExplorerUrl(item.tokenAddress, item.poolAddress),
            etherscanTokenUrl: `https://etherscan.io/token/${item.tokenAddress}`,
            etherscanTxUrl: `https://etherscan.io/tx/${item.txHash}`,
            hookProfile: item.hookProfile,
            quoteTokenSymbol: item.quoteTokenSymbol,
            initialBuyEth: item.initialBuyEth.toString(),
            disperseWalletsCount: item.disperseWalletsCount,
            creatorAddress: item.creatorAddress,
            imageUrl: item.imageUrl || "",
            txHash: item.txHash,
            blockNumber: item.blockNumber.toString(),
            createdAt: item.createdAt.toISOString(),
          };
        });

        const combined = [...mapped, ...SEED_SHOWCASE_LAUNCHES].slice(0, 24);
        this.cache = combined;
        this.lastFetchTime = Date.now();
        return combined;
      } catch (err) {
        logger.warn(`IndexerService DB read fallback: ${(err as Error).message}`);
        if (!this.cache) {
          this.cache = SEED_SHOWCASE_LAUNCHES;
        }
        return this.cache;
      } finally {
        this.inFlightFetch = null;
      }
    })();

    return this.inFlightFetch;
  }

  /**
   * Returns recent token launches from RAM cache in 0ms (Stale-While-Revalidate)
   * with deduplicated background PostgreSQL refresh.
   */
  public static async getRecentLaunches(limit: number = 24): Promise<LiveLaunchItem[]> {
    const now = Date.now();
    if (this.cache) {
      if (now - this.lastFetchTime >= this.CACHE_TTL_MS) {
        this.refreshCacheInBackground().catch(() => {});
      }
      return this.cache.slice(0, limit);
    }

    const fresh = await this.refreshCacheInBackground();
    return fresh.slice(0, limit);
  }
}
