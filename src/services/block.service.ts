import prisma from "../db/client";
import { logger } from "../utils/logger";

/**
 * Persistent BlockService backed by PostgreSQL (User.isBlocked) + in-memory Set for 0ms lookup.
 * Uses zero local disk files (.json or .db) for Render Free Tier zero-data-loss compliance.
 */
export class BlockService {
  private static blockedSet: Set<string> = new Set();
  private static initialized: boolean = false;

  /**
   * Hydrates the in-memory blocked set from PostgreSQL
   */
  public static async init(): Promise<void> {
    if (this.initialized) return;
    try {
      const blockedUsers = await prisma.user.findMany({
        where: { isBlocked: true },
        select: { id: true },
      });
      this.blockedSet = new Set(blockedUsers.map((u) => u.id.toString()));
      this.initialized = true;
      logger.info(`🛡️ BlockService synced with PostgreSQL. Blocked users: ${this.blockedSet.size}`);
    } catch (err) {
      logger.warn(`BlockService DB sync deferred: ${(err as Error).message}`);
    }
  }

  /**
   * Checks if user is blocked (0ms in-memory lookup)
   */
  public static isBlocked(userId: string | bigint | number): boolean {
    return this.blockedSet.has(userId.toString());
  }

  /**
   * Blocks a user by Telegram ID and persists to PostgreSQL
   */
  public static async blockUser(userId: string | bigint | number): Promise<boolean> {
    const idStr = userId.toString();
    const idBigInt = BigInt(idStr);
    this.blockedSet.add(idStr);

    try {
      await prisma.user.upsert({
        where: { id: idBigInt },
        update: { isBlocked: true },
        create: { id: idBigInt, isBlocked: true },
      });
    } catch (err) {
      logger.warn(`Failed to persist block state for ${idStr}: ${(err as Error).message}`);
    }

    logger.warn(`🚫 User ${idStr} has been BLOCKED by admin.`);
    return true;
  }

  /**
   * Unblocks a user by Telegram ID and persists to PostgreSQL
   */
  public static async unblockUser(userId: string | bigint | number): Promise<boolean> {
    const idStr = userId.toString();
    const idBigInt = BigInt(idStr);
    const existed = this.blockedSet.delete(idStr);

    try {
      await prisma.user.upsert({
        where: { id: idBigInt },
        update: { isBlocked: false },
        create: { id: idBigInt, isBlocked: false },
      });
    } catch (err) {
      logger.warn(`Failed to persist unblock state for ${idStr}: ${(err as Error).message}`);
    }

    logger.info(`🟢 User ${idStr} has been UNBLOCKED by admin.`);
    return existed;
  }

  public static getBlockedList(): string[] {
    return Array.from(this.blockedSet);
  }
}
