import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  formatEther,
  formatUnits,
  parseEther,
  isAddress,
  type Address,
  type Hash,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { ENV } from "../config/env";
import { CONTRACT_ADDRESSES, ERC20_ABI } from "../config/contracts";
import { CryptoService } from "./crypto.service";
import prisma from "../db/client";
import { logger } from "../utils/logger";

export const MIN_DEV_BALANCE_ETH = "0.002";
export const ETH_APPROX_USD = 2650;

interface BalanceCacheEntry {
  eth: string;
  weth: string;
  usdc: string;
  timestamp: number;
}

export interface UserCacheEntry {
  address: Address;
  encryptedKey: string;
  username?: string | null;
  firstName?: string | null;
  launchCount: number;
  feeClaimCount: number;
  timestamp: number;
}

export class WalletService {
  // In-memory balance cache with Stale-While-Revalidate (0ms UI responses)
  private balanceCache = new Map<string, BalanceCacheEntry>();
  private inFlightBalances = new Map<
    string,
    Promise<{ eth: string; weth: string; usdc: string }>
  >();
  private readonly CACHE_TTL_MS = 25_000;

  // In-memory user & wallet record cache (10-minute TTL + startup pre-warm)
  private userCache = new Map<string, UserCacheEntry>();
  private readonly USER_CACHE_TTL_MS = 600_000;

  // Ethereum Mainnet Multi-RPC pool with Multicall3 batching enabled
  private publicClient = createPublicClient({
    chain: mainnet,
    batch: {
      multicall: true,
    },
    transport: fallback([
      http(ENV.ETH_RPC_PRIMARY, { timeout: 3_500, retryCount: 1 }),
      http(ENV.ETH_RPC_FALLBACK_1, { timeout: 3_500, retryCount: 1 }),
      http(ENV.ETH_RPC_FALLBACK_2, { timeout: 3_500, retryCount: 1 }),
    ]),
  });

  /**
   * Pre-warms in-memory user & balance caches from PostgreSQL on startup
   * so even the very first tap by any user responds in <5ms.
   */
  public async init(): Promise<void> {
    try {
      const users = await prisma.user.findMany({
        include: {
          wallet: true,
          launches: { select: { id: true } },
          feeClaims: { select: { id: true } },
        },
      });
      const now = Date.now();
      for (const u of users) {
        if (u.wallet) {
          const addr = u.wallet.address as Address;
          this.userCache.set(u.id.toString(), {
            address: addr,
            encryptedKey: u.wallet.encryptedKey,
            username: u.username,
            firstName: u.firstName,
            launchCount: u.launches.length,
            feeClaimCount: u.feeClaims.length,
            timestamp: now,
          });
          // Pre-warm balance cache asynchronously in background
          this.fetchAndCacheBalances(addr).catch(() => {});
        }
      }
      logger.info(
        `⚡ WalletService pre-warmed ${this.userCache.size} Dev Vaults into RAM cache (0ms lookup).`
      );
    } catch (err) {
      logger.warn(`WalletService pre-warm notice: ${(err as Error).message}`);
    }
  }

  /**
   * Finds or generates an encrypted ERC-20 Dev Vault for the given Telegram user.
   */
  public async getOrCreateWallet(
    userId: bigint,
    metadata?: { username?: string; firstName?: string },
    forceDb: boolean = false
  ): Promise<{ address: Address; isNew: boolean; entry: UserCacheEntry }> {
    const userKey = userId.toString();
    const now = Date.now();

    if (!forceDb && this.userCache.has(userKey)) {
      const cached = this.userCache.get(userKey)!;
      if (now - cached.timestamp < this.USER_CACHE_TTL_MS) {
        if (
          (metadata?.username && metadata.username !== cached.username) ||
          (metadata?.firstName && metadata.firstName !== cached.firstName)
        ) {
          cached.username = metadata.username || cached.username;
          cached.firstName = metadata.firstName || cached.firstName;
          prisma.user
            .update({
              where: { id: userId },
              data: {
                username: cached.username || undefined,
                firstName: cached.firstName || undefined,
              },
            })
            .catch(() => {});
        }
        return {
          address: cached.address,
          isNew: false,
          entry: cached,
        };
      }
    }

    const userRecord = await prisma.user.upsert({
      where: { id: userId },
      update: {
        username: metadata?.username || undefined,
        firstName: metadata?.firstName || undefined,
      },
      create: {
        id: userId,
        username: metadata?.username,
        firstName: metadata?.firstName,
        platform: "pangea",
      },
      include: {
        wallet: true,
        launches: { select: { id: true } },
        feeClaims: { select: { id: true } },
      },
    });

    if (userRecord.wallet) {
      const address = userRecord.wallet.address as Address;
      const entry: UserCacheEntry = {
        address,
        encryptedKey: userRecord.wallet.encryptedKey,
        username: userRecord.username,
        firstName: userRecord.firstName,
        launchCount: userRecord.launches?.length || 0,
        feeClaimCount: userRecord.feeClaims?.length || 0,
        timestamp: now,
      };
      this.userCache.set(userKey, entry);
      return {
        address,
        isNew: false,
        entry,
      };
    }

    // Generate new Ethereum keypair and encrypt with AES-256-GCM
    const newPrivateKey = generatePrivateKey();
    const account = privateKeyToAccount(newPrivateKey);
    const encryptedKey = CryptoService.encryptPrivateKey(newPrivateKey);

    const savedWallet = await prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        address: account.address,
        encryptedKey,
      },
    });

    const finalAddress = savedWallet.address as Address;
    const finalEncryptedKey = savedWallet.encryptedKey;

    const entry: UserCacheEntry = {
      address: finalAddress,
      encryptedKey: finalEncryptedKey,
      username: userRecord.username,
      firstName: userRecord.firstName,
      launchCount: 0,
      feeClaimCount: 0,
      timestamp: now,
    };
    this.userCache.set(userKey, entry);
    this.balanceCache.set(finalAddress.toLowerCase(), {
      eth: "0.0",
      weth: "0.0",
      usdc: "0.0",
      timestamp: now,
    });

    logger.wallet(`Generated new Ethereum dev vault for user ${userId}: ${finalAddress}`);

    return {
      address: finalAddress,
      isNew: true,
      entry,
    };
  }

  /**
   * 0ms RAM retrieval of cached user address, encrypted key, and deployment count
   */
  public async getUserData(
    userId: bigint,
    forceRefresh: boolean = false,
    metadata?: { username?: string; firstName?: string }
  ): Promise<{
    address: Address;
    encryptedKey: string;
    username?: string | null;
    firstName?: string | null;
    launchCount: number;
    feeClaimCount: number;
    isNew: boolean;
  }> {
    const { address, isNew, entry } = await this.getOrCreateWallet(
      userId,
      metadata,
      forceRefresh
    );
    return {
      address,
      encryptedKey: entry.encryptedKey,
      username: entry.username,
      firstName: entry.firstName,
      launchCount: entry.launchCount,
      feeClaimCount: entry.feeClaimCount,
      isNew,
    };
  }

  /**
   * Synchronous 0ms RAM lookup for terminal telemetry logging (Dev Vault short address + ETH balance).
   */
  public getCachedUserSummary(userId: bigint | number): {
    address: Address;
    shortAddress: string;
    eth: string;
    launchCount: number;
  } | null {
    const entry = this.userCache.get(userId.toString());
    if (!entry) return null;
    const bal = this.balanceCache.get(entry.address.toLowerCase());
    const ethNum = bal ? parseFloat(bal.eth) : 0;
    const ethFormatted = isNaN(ethNum) ? "0.0000" : ethNum.toFixed(4);
    return {
      address: entry.address,
      shortAddress: `${entry.address.slice(0, 6)}...${entry.address.slice(-4)}`,
      eth: ethFormatted,
      launchCount: entry.launchCount,
    };
  }

  /**
   * Imports an external Ethereum Dev Wallet private key for the user.
   */
  public async importDevWallet(
    userId: bigint,
    rawPrivateKey: string
  ): Promise<{ address: Address; previousAddress?: string }> {
    const cleanKey = rawPrivateKey.trim().replace(/^0x/i, "");
    if (!/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
      throw new Error("Invalid private key format. Must be a 64-character hexadecimal string.");
    }

    const formattedKey = `0x${cleanKey}` as `0x${string}`;
    const account = privateKeyToAccount(formattedKey);
    const encryptedKey = CryptoService.encryptPrivateKey(formattedKey);

    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, platform: "pangea" },
    });

    const existingWallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (existingWallet) {
      this.invalidateCache(existingWallet.address as Address);
    }

    await prisma.wallet.upsert({
      where: { userId },
      update: {
        address: account.address,
        encryptedKey,
      },
      create: {
        userId,
        address: account.address,
        encryptedKey,
      },
    });

    this.invalidateCache(account.address);
    this.invalidateUserCache(userId);
    logger.wallet(`User ${userId} imported custom Ethereum Dev Vault: ${account.address}`);

    return {
      address: account.address as Address,
      previousAddress: existingWallet?.address,
    };
  }

  /**
   * Retrieves decrypted private key for signing or user export (0ms from RAM cache when warm).
   */
  public async getDecryptedPrivateKey(userId: bigint): Promise<`0x${string}`> {
    const userKey = userId.toString();
    const cached = this.userCache.get(userKey);
    if (cached && cached.encryptedKey) {
      return CryptoService.decryptPrivateKey(cached.encryptedKey) as `0x${string}`;
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new Error("No wallet found for this user");
    }

    const decryptedKey = CryptoService.decryptPrivateKey(wallet.encryptedKey);
    return decryptedKey as `0x${string}`;
  }

  /**
   * Deduplicated background/foreground balance fetcher via Viem Multicall3
   */
  private async fetchAndCacheBalances(
    address: Address
  ): Promise<{ eth: string; weth: string; usdc: string }> {
    const key = address.toLowerCase();
    if (this.inFlightBalances.has(key)) {
      return this.inFlightBalances.get(key)!;
    }

    const promise = (async () => {
      try {
        const queryStart = Date.now();
        const [ethBalanceWei, wethBalanceWei, usdcBalanceRaw] = await Promise.all([
          this.publicClient.getBalance({ address }),
          this.publicClient
            .readContract({
              address: CONTRACT_ADDRESSES.WETH,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [address],
            })
            .catch(() => 0n),
          this.publicClient
            .readContract({
              address: CONTRACT_ADDRESSES.USDC,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [address],
            })
            .catch(() => 0n),
        ]);

        const result = {
          eth: formatEther(ethBalanceWei),
          weth: formatEther(wethBalanceWei as bigint),
          usdc: formatUnits(usdcBalanceRaw as bigint, 6),
        };

        this.balanceCache.set(key, { ...result, timestamp: Date.now() });
        const queryDuration = Date.now() - queryStart;
        logger.wallet(
          `Fetched balances for ${address.slice(0, 8)}... (${queryDuration}ms): ${result.eth} ETH | ${result.weth} WETH`
        );
        return result;
      } catch (error: unknown) {
        const err = error as Error;
        logger.error(`Error querying balances for ${address}: ${err.message}`);
        const prev = this.balanceCache.get(key);
        return prev
          ? { eth: prev.eth, weth: prev.weth, usdc: prev.usdc }
          : { eth: "0.0", weth: "0.0", usdc: "0.0" };
      } finally {
        this.inFlightBalances.delete(key);
      }
    })();

    this.inFlightBalances.set(key, promise);
    return promise;
  }

  /**
   * Fetches native ETH, WETH, and USDC balances with Stale-While-Revalidate (0ms UI responses).
   */
  public async getBalances(
    address: Address,
    forceRefresh: boolean = false
  ): Promise<{ eth: string; weth: string; usdc: string }> {
    const key = address.toLowerCase();
    const now = Date.now();

    if (!forceRefresh && this.balanceCache.has(key)) {
      const cached = this.balanceCache.get(key)!;
      if (now - cached.timestamp >= this.CACHE_TTL_MS) {
        // Stale-While-Revalidate: return cached balance in 0ms and refresh in background
        this.fetchAndCacheBalances(address).catch(() => {});
      }
      return { eth: cached.eth, weth: cached.weth, usdc: cached.usdc };
    }

    return this.fetchAndCacheBalances(address);
  }

  public invalidateCache(address: Address) {
    this.balanceCache.delete(address.toLowerCase());
  }

  public invalidateUserCache(userId: bigint) {
    this.userCache.delete(userId.toString());
  }

  /**
   * Sends native ETH from user's non-custodial Dev Vault to an external Ethereum address.
   */
  public async withdrawEth(params: {
    userId: bigint;
    recipientAddress: string;
    amountEth?: string;
    isMax?: boolean;
  }): Promise<{ success: boolean; txHash?: Hash; sentAmount?: string; error?: string }> {
    try {
      const cleanRecipient = params.recipientAddress.replace(/^ethereum:/i, "").trim();
      if (!isAddress(cleanRecipient, { strict: false })) {
        return { success: false, error: "Invalid Ethereum recipient address format." };
      }

      const privateKey = await this.getDecryptedPrivateKey(params.userId);
      const account = privateKeyToAccount(privateKey);

      const [currentBalance, gasPrice] = await Promise.all([
        this.publicClient.getBalance({ address: account.address }),
        this.publicClient.getGasPrice(),
      ]);

      const gasLimit = 21000n;
      const gasEstimateWei = (gasLimit * gasPrice * 115n) / 100n;

      let amountWei: bigint;

      if (params.isMax) {
        if (currentBalance <= gasEstimateWei) {
          return {
            success: false,
            error: `Balance too low to cover Ethereum network gas (~${formatEther(gasEstimateWei)} ETH). Current balance: ${formatEther(currentBalance)} ETH.`,
          };
        }
        amountWei = currentBalance - gasEstimateWei;
      } else {
        if (!params.amountEth || parseFloat(params.amountEth) <= 0) {
          return { success: false, error: "Withdrawal amount must be greater than 0." };
        }
        amountWei = parseEther(params.amountEth);
        const totalNeeded = amountWei + gasEstimateWei;

        if (currentBalance < totalNeeded) {
          return {
            success: false,
            error: `Insufficient balance. Available: ${formatEther(currentBalance)} ETH. Required (including ~${formatEther(gasEstimateWei)} ETH gas): ${formatEther(totalNeeded)} ETH.`,
          };
        }
      }

      const formattedSentAmount = formatEther(amountWei);

      const walletClient = createWalletClient({
        account,
        chain: mainnet,
        transport: fallback([
          http(ENV.ETH_RPC_PRIMARY, { timeout: 6_000, retryCount: 2 }),
          http(ENV.ETH_RPC_FALLBACK_1, { timeout: 6_000, retryCount: 2 }),
          http(ENV.ETH_RPC_FALLBACK_2, { timeout: 6_000, retryCount: 2 }),
        ]),
      });

      logger.withdraw(
        `User ${params.userId} broadcasting ${formattedSentAmount} ETH from ${account.address.slice(0, 8)}... to ${cleanRecipient.slice(0, 8)}...`
      );

      const txHash = await walletClient.sendTransaction({
        to: cleanRecipient as Address,
        value: amountWei,
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60_000,
      });

      if (receipt.status === "success") {
        this.invalidateCache(account.address);
        this.invalidateUserCache(params.userId);
        logger.withdraw(`ETH withdrawal confirmed on Ethereum! Tx: ${txHash} (Block: ${receipt.blockNumber})`);
        return { success: true, txHash, sentAmount: formattedSentAmount };
      } else {
        return { success: false, error: "Withdrawal transaction reverted on Ethereum." };
      }
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Withdrawal failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}

export const walletService = new WalletService();
