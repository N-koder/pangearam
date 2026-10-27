import { LaunchpadPlatform } from "@prisma/client";
import prisma from "../db/client";
import { CONTRACT_ADDRESSES } from "../config/contracts";
import { logger } from "../utils/logger";

export type LaunchPlatform = "pangea" | "stokerium" | "sender" | "programmable";

export interface PlatformMetadata {
  id: LaunchPlatform;
  name: string;
  shortName: string;
  badge: string;
  tagline: string;
  factoryAddress: `0x${string}`;
  poolTarget: string;
  minRecommendedEth: number;
  getExplorerUrl: (tokenCa: string, poolId?: string) => string;
}

export const PLATFORM_SPECS: Record<LaunchPlatform, PlatformMetadata> = {
  pangea: {
    id: "pangea",
    name: "Pangea Omnichain Launchpad",
    shortName: "Pangea",
    badge: "🌍 Pangea ($PANGEA)",
    tagline:
      "Simultaneous 5-Chain Omnichain Launch (Ethereum, Base, Solana, BNB, Robinhood) • 5B Supply • LayerZero OFT • 0.3%–5% Fee",
    factoryAddress: CONTRACT_ADDRESSES.PANGEA_FACTORY,
    poolTarget:
      "Omnichain Uniswap V4 + Meteora DAMM v2 (LayerZero OFT • 5B Supply • 80% Creator Fee)",
    minRecommendedEth: 0.002,
    getExplorerUrl: (tokenCa: string) => `https://www.pangea.trade/app/t/${tokenCa}`,
  },
  stokerium: {
    id: "stokerium",
    name: "Stockereum Launchpad",
    shortName: "Stockereum",
    badge: "🏛️ Stockereum ($STOCKER)",
    tagline: "Fixed-Supply Token Launch Paired with Tokenized Stocks (Ondo RWA) or ETH on Uniswap V4",
    factoryAddress: CONTRACT_ADDRESSES.STOKERIUM_FACTORY,
    poolTarget: "Uniswap V4 Permanent Locked Market (1%–3% Fee / Holder Rewards)",
    minRecommendedEth: 0.002,
    getExplorerUrl: (tokenCa: string) => `https://stockereum.com/t/${tokenCa}`,
  },
  sender: {
    id: "sender",
    name: "Sender.family Launchpad",
    shortName: "Sender.family",
    badge: "📡 Sender ($SEND)",
    tagline: "Direct-to-Uniswap V4 Locked Pool (ETH & Allowlisted Tokenized Equities • 70% Creator Fee)",
    factoryAddress: CONTRACT_ADDRESSES.SENDER_PORTAL,
    poolTarget: "Uniswap V4 Locked Market (70% Creator / 30% $SEND Buy-and-Burn)",
    minRecommendedEth: 0.002,
    getExplorerUrl: (tokenCa: string) => `https://sender.family/token/${tokenCa}`,
  },
  programmable: {
    id: "programmable",
    name: "Programmable.market ($V4)",
    shortName: "Programmable ($V4)",
    badge: "🦄 Programmable ($V4)",
    tagline: "Uniswap V4 Module Mode & Classic Mode (Custom Hooks, Creator Fee % & First Buy)",
    factoryAddress: CONTRACT_ADDRESSES.PROGRAMMABLE_V4_FACTORY,
    poolTarget: "Uniswap V4 Module Mode & Hook Pool",
    minRecommendedEth: 0.002,
    getExplorerUrl: (tokenCa: string, _poolId?: string) =>
      `https://programmable.market/token/${tokenCa}`,
  },
};

class PlatformService {
  // Zero-latency in-memory cache synchronized with PostgreSQL (Zero local disk .json files)
  private userPlatforms = new Map<string, LaunchPlatform>();
  private pendingTimers = new Map<string, NodeJS.Timeout>();
  private initialized = false;

  /**
   * Hydrates in-memory cache from PostgreSQL on startup
   */
  public async init(): Promise<void> {
    if (this.initialized) return;
    try {
      const users = await prisma.user.findMany({
        select: { id: true, platform: true },
      });
      for (const u of users) {
        if (
          u.platform === "pangea" ||
          u.platform === "stokerium" ||
          u.platform === "sender" ||
          u.platform === "programmable"
        ) {
          this.userPlatforms.set(u.id.toString(), u.platform);
        }
      }
      this.initialized = true;
      logger.info(
        `🌐 PlatformService synced with PostgreSQL (${this.userPlatforms.size} user preferences loaded).`
      );
    } catch (err) {
      logger.warn(
        `PlatformService DB hydration deferred: ${(err as Error).message}`
      );
    }
  }

  public getSpec(platform: LaunchPlatform): PlatformMetadata {
    return PLATFORM_SPECS[platform] || PLATFORM_SPECS.pangea;
  }

  public getPlatform(_userId: bigint | number | string): LaunchPlatform {
    return "pangea";
  }

  public async setPlatform(
    userId: bigint | number | string,
    platform: LaunchPlatform
  ): Promise<LaunchPlatform> {
    const key = userId.toString();
    const idBigInt = BigInt(key);
    this.userPlatforms.set(key, platform);

    // Coalesce rapid button-spam switches per user so RAM updates in 0ms
    // while PostgreSQL only receives the final settled preference (prevents DB pool saturation)
    const existingTimer = this.pendingTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    const timer = setTimeout(() => {
      this.pendingTimers.delete(key);
      const latestPlatform = this.userPlatforms.get(key) || platform;
      prisma.user
        .upsert({
          where: { id: idBigInt },
          update: { platform: latestPlatform as LaunchpadPlatform },
          create: { id: idBigInt, platform: latestPlatform as LaunchpadPlatform },
        })
        .catch((err: unknown) => {
          logger.warn(
            `Could not persist platform preference to PostgreSQL for ${key}: ${(err as Error).message}`
          );
        });
    }, 350);
    timer.unref?.();
    this.pendingTimers.set(key, timer);

    logger.info(`🔄 User ${key} switched launchpad to: ${platform.toUpperCase()}`);
    return platform;
  }

  /**
   * Cycles through the 4 launchpads: pangea -> stokerium -> sender -> programmable -> pangea
   */
  public async cyclePlatform(userId: bigint | number | string): Promise<LaunchPlatform> {
    const current = this.getPlatform(userId);
    const order: LaunchPlatform[] = ["pangea", "stokerium", "sender", "programmable"];
    const nextIndex = (order.indexOf(current) + 1) % order.length;
    return this.setPlatform(userId, order[nextIndex]);
  }
}

export const platformService = new PlatformService();
