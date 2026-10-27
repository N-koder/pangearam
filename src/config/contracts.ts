import {
  type Address,
  type Hex,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
} from "viem";
import { ENV } from "./env";

export const CONTRACT_ADDRESSES = {
  // Uniswap V4 Core on Ethereum Mainnet (Chain ID: 1)
  UNISWAP_V4_POOL_MANAGER: ENV.UNISWAP_V4_POOL_MANAGER,
  UNISWAP_V4_POSITION_MANAGER: ENV.UNISWAP_V4_POSITION_MANAGER,

  // Core Ethereum Quote Tokens
  WETH: ENV.WETH_ADDRESS,
  USDC: ENV.USDC_ADDRESS,
  USDT: ENV.USDT_ADDRESS,

  // The 4 Launchpad Protocol Contracts (Pangea #1 Main Priority + Stockereum, Sender, Programmable)
  PANGEA_FACTORY: ENV.PANGEA_FACTORY_ADDRESS,
  PANGEA_FEE_COLLECTOR: ENV.PANGEA_FEE_COLLECTOR_ADDRESS,
  STOKERIUM_FACTORY: ENV.STOKERIUM_FACTORY_ADDRESS,
  SENDER_PORTAL: ENV.SENDER_PORTAL_ADDRESS,
  PROGRAMMABLE_V4_FACTORY: ENV.PROGRAMMABLE_V4_FACTORY_ADDRESS,
  FEE_LOCKER: ENV.FEE_LOCKER_ADDRESS,

  // Uniswap V4 Programmable Hook Contracts
  HOOK_DYNAMIC_FEE: ENV.HOOK_DYNAMIC_FEE_ADDRESS,
  HOOK_PERMANENT_LOCK: ENV.HOOK_PERMANENT_LOCK_ADDRESS,
  HOOK_CREATOR_SPLIT: ENV.HOOK_CREATOR_SPLIT_ADDRESS,
} as const;

export const PROTOCOL_CONSTANTS = {
  DEFAULT_TOTAL_SUPPLY: 1_000_000_000n * 10n ** 18n, // 1 Billion 18-decimal ERC-20 supply per chain
  PANGEA_OMNICHAIN_SUPPLY: 5_000_000_000n * 10n ** 18n, // 5 Billion Omnichain OFT Total Supply (1B x 5 chains)
  DEFAULT_V4_FEE_TIER: 3000, // 0.30% standard or 0x800000 for dynamic fee flag
  DYNAMIC_FEE_FLAG: 0x800000, // Uniswap V4 dynamic fee flag
  DEFAULT_TICK_SPACING: 60,
  DEFAULT_INITIAL_TICK: -202100,
} as const;

export interface SyntheticAssetPair {
  symbol: string;
  name: string;
  category: "rwa_stock" | "rwa_index" | "rwa_commodity" | "core";
  address: Address;
  initialTick: number;
  badge: string;
}

/**
 * Stokerium Synthetic RWA & Core Pairing Catalog on Ethereum (Chain ID: 1)
 */
export const STOKERIUM_ASSET_PAIRS: Record<string, SyntheticAssetPair> = {
  ETH: {
    symbol: "ETH",
    name: "Native Ether / WETH",
    category: "core",
    address: ENV.WETH_ADDRESS,
    initialTick: -202100,
    badge: "Ξ ETH",
  },
  WETH: {
    symbol: "WETH",
    name: "Wrapped Ether",
    category: "core",
    address: ENV.WETH_ADDRESS,
    initialTick: -202100,
    badge: "Ξ WETH",
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    category: "core",
    address: ENV.USDC_ADDRESS,
    initialTick: -276324,
    badge: "💵 USDC",
  },
  PEPE: {
    symbol: "PEPE",
    name: "Pepe (Ethereum)",
    category: "core",
    address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933" as Address,
    initialTick: -230000,
    badge: "🐸 PEPE",
  },
  USDT: {
    symbol: "USDT",
    name: "Tether USD",
    category: "core",
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address,
    initialTick: -276324,
    badge: "💵 USDT",
  },
  SPX: {
    symbol: "SPX",
    name: "SPX6900",
    category: "core",
    address: "0xE0f63A424a4439cBE457D80E4f4b51aD25b2c56C" as Address,
    initialTick: -210000,
    badge: "💹 SPX6900",
  },
  SPX6900: {
    symbol: "SPX",
    name: "SPX6900",
    category: "core",
    address: "0xE0f63A424a4439cBE457D80E4f4b51aD25b2c56C" as Address,
    initialTick: -210000,
    badge: "💹 SPX6900",
  },
  WBTC: {
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    category: "core",
    address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as Address,
    initialTick: -130000,
    badge: "₿ WBTC",
  },
  SHIB: {
    symbol: "SHIB",
    name: "Shiba Inu",
    category: "core",
    address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE" as Address,
    initialTick: -250000,
    badge: "🐕 SHIB",
  },
  MOG: {
    symbol: "MOG",
    name: "Mog Coin",
    category: "core",
    address: "0xaaeE1A9723aadb7afA2810263653A34bA2C21C7a" as Address,
    initialTick: -250000,
    badge: "😹 MOG",
  },
  LINK: {
    symbol: "LINK",
    name: "Chainlink",
    category: "core",
    address: "0x514910771AF9Ca656af840dff83E8264EcF986CA" as Address,
    initialTick: -200000,
    badge: "🔗 LINK",
  },
  UNI: {
    symbol: "UNI",
    name: "Uniswap",
    category: "core",
    address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984" as Address,
    initialTick: -200000,
    badge: "🦄 UNI",
  },
  PANGEA: {
    symbol: "PANGEA",
    name: "Pangea.trade ($PANGEA)",
    category: "core",
    address: "0x6434e57e8d12B92bb4D0b1EFb3274748B75196ea" as Address,
    initialTick: -210000,
    badge: "🌍 PANGEA",
  },
  STOCKER: {
    symbol: "STOCKER",
    name: "Stockereum.fun ($STOCKER)",
    category: "core",
    address: "0x75E2Fc69Ff2ac12aF65Ba7D321bBf4f878c535d2" as Address,
    initialTick: -210000,
    badge: "🏛️ STOCKER",
  },
  SEND: {
    symbol: "SEND",
    name: "Sender.family ($SEND)",
    category: "core",
    address: "0x47ACCD13264D8F954105256FaaC8376ce6A55999" as Address,
    initialTick: -210000,
    badge: "📡 SEND",
  },
  V4: {
    symbol: "V4",
    name: "Programmable ($V4)",
    category: "core",
    address: "0x7987f03462200b3D8A072E02C89A8A41dCB124EE" as Address,
    initialTick: -210000,
    badge: "🦄 V4",
  },
  NVDAon: {
    symbol: "NVDAon",
    name: "NVIDIA (Ondo Tokenized Stock)",
    category: "rwa_stock",
    address: ENV.RWA_NVDAX,
    initialTick: -184200,
    badge: "🏛️ NVDAon",
  },
  TSLAon: {
    symbol: "TSLAon",
    name: "Tesla (Ondo Tokenized Stock)",
    category: "rwa_stock",
    address: ENV.RWA_TSLAX,
    initialTick: -181500,
    badge: "🏛️ TSLAon",
  },
  AAPLon: {
    symbol: "AAPLon",
    name: "Apple (Ondo Tokenized Stock)",
    category: "rwa_stock",
    address: ENV.RWA_AAPLX,
    initialTick: -183100,
    badge: "🏛️ AAPLon",
  },
  SPCXon: {
    symbol: "SPCXon",
    name: "SpaceX (Ondo Tokenized Stock)",
    category: "rwa_stock",
    address: "0x75E2Fc69Ff2ac12aF65Ba7D321bBf4f878c535d2" as Address,
    initialTick: -180500,
    badge: "🚀 SPCXon",
  },
  MSFTon: {
    symbol: "MSFTon",
    name: "Microsoft (Ondo Tokenized Stock)",
    category: "rwa_stock",
    address: "0xB812837b233a7593cba3011a0cc3bc42784555E5" as Address,
    initialTick: -182400,
    badge: "🏛️ MSFTon",
  },
  AMZNon: {
    symbol: "AMZNon",
    name: "Amazon (Ondo Tokenized Stock)",
    category: "rwa_stock",
    address: "0xbb8774FBc9e173426a8E2F2007823909322cFD31" as Address,
    initialTick: -183500,
    badge: "🏛️ AMZNon",
  },
  GOOGLon: {
    symbol: "GOOGLon",
    name: "Alphabet / Google (Ondo Tokenized Stock)",
    category: "rwa_stock",
    address: "0xba47214edd2bb43099611b208f75e4b42fdcfedc" as Address,
    initialTick: -183800,
    badge: "🏛️ GOOGLon",
  },
  METAon: {
    symbol: "METAon",
    name: "Meta Platforms (Ondo Tokenized Stock)",
    category: "rwa_stock",
    address: "0x59644165502c2864C6c230691458EEB581C71EB2" as Address,
    initialTick: -180200,
    badge: "🏛️ METAon",
  },
  MSTRon: {
    symbol: "MSTRon",
    name: "MicroStrategy (Ondo Tokenized Stock)",
    category: "rwa_stock",
    address: ENV.RWA_MSTRX,
    initialTick: -179400,
    badge: "🏛️ MSTRon",
  },
  COINon: {
    symbol: "COINon",
    name: "Coinbase (Ondo Tokenized Stock)",
    category: "rwa_stock",
    address: ENV.RWA_COINX,
    initialTick: -180800,
    badge: "🏛️ COINon",
  },
  PLTRon: {
    symbol: "PLTRon",
    name: "Palantir (Ondo Tokenized Stock)",
    category: "rwa_stock",
    address: "0x4444000000000000000000000000000000000113" as Address,
    initialTick: -186100,
    badge: "🏛️ PLTRon",
  },
  AMDon: {
    symbol: "AMDon",
    name: "AMD (Ondo Tokenized Stock)",
    category: "rwa_stock",
    address: "0x4444000000000000000000000000000000000114" as Address,
    initialTick: -184900,
    badge: "🏛️ AMDon",
  },
  GMEon: {
    symbol: "GMEon",
    name: "GameStop (Ondo Tokenized Stock)",
    category: "rwa_stock",
    address: "0x4444000000000000000000000000000000000115" as Address,
    initialTick: -189000,
    badge: "🏛️ GMEon",
  },
  HOODon: {
    symbol: "HOODon",
    name: "Robinhood (Ondo Tokenized Stock)",
    category: "rwa_stock",
    address: "0x4444000000000000000000000000000000000116" as Address,
    initialTick: -188200,
    badge: "🏛️ HOODon",
  },
  SPYon: {
    symbol: "SPYon",
    name: "S&P 500 ETF (Ondo Tokenized)",
    category: "rwa_index",
    address: ENV.RWA_SPYX,
    initialTick: -174600,
    badge: "📊 SPYon",
  },
  QQQon: {
    symbol: "QQQon",
    name: "Nasdaq-100 ETF (Ondo Tokenized)",
    category: "rwa_index",
    address: ENV.RWA_QQQX,
    initialTick: -175900,
    badge: "📊 QQQon",
  },
  GLDon: {
    symbol: "GLDon",
    name: "Gold Bullion ETF (Ondo Tokenized)",
    category: "rwa_commodity",
    address: ENV.RWA_GLDX,
    initialTick: -178200,
    badge: "🥇 GLDon",
  },
  SLVon: {
    symbol: "SLVon",
    name: "Silver Bullion ETF (Ondo Tokenized)",
    category: "rwa_commodity",
    address: "0x4444000000000000000000000000000000000117" as Address,
    initialTick: -187500,
    badge: "🥈 SLVon",
  },
};

export interface StokeriumCurveSetting {
  id: "LINEAR_RWA" | "EXPONENTIAL_SYNTH" | "INDEX_ANCHORED";
  name: string;
  description: string;
  slopeBps: number;
  initialTickOffset: number;
}

export const STOKERIUM_CURVE_PRESETS: Record<string, StokeriumCurveSetting> = {
  LINEAR_RWA: {
    id: "LINEAR_RWA",
    name: "Linear RWA Peg Curve",
    description: "Balanced synthetic liquidity curve anchored to the underlying equity/commodity index.",
    slopeBps: 2500,
    initialTickOffset: 0,
  },
  EXPONENTIAL_SYNTH: {
    id: "EXPONENTIAL_SYNTH",
    name: "Steep Growth Curve",
    description: "Concentrated early price discovery with deeper upper-tick Uniswap V4 liquidity.",
    slopeBps: 5000,
    initialTickOffset: -4200,
  },
  INDEX_ANCHORED: {
    id: "INDEX_ANCHORED",
    name: "Low-Slippage Index Curve",
    description: "Tight concentrated range around synthetic oracle parity for institutional-style swaps.",
    slopeBps: 1000,
    initialTickOffset: 2400,
  },
};

export interface V4HookSpecification {
  id: "DYNAMIC_SWAP_FEE" | "PERMANENT_LP_LOCK" | "CREATOR_FEE_SPLIT";
  name: string;
  shortLabel: string;
  hookAddress: Address;
  lpFee: number;
  tickSpacing: number;
  description: string;
}

export const UNISWAP_V4_HOOK_PROFILES: Record<string, V4HookSpecification> = {
  DYNAMIC_SWAP_FEE: {
    id: "DYNAMIC_SWAP_FEE",
    name: "Dynamic Swap Fee Hook",
    shortLabel: "Dynamic Swap Fee",
    hookAddress: ENV.HOOK_DYNAMIC_FEE_ADDRESS,
    lpFee: PROTOCOL_CONSTANTS.DYNAMIC_FEE_FLAG,
    tickSpacing: 60,
    description: "Swap fees adjust automatically between 0.10% and 1.00% based on on-chain volatility.",
  },
  PERMANENT_LP_LOCK: {
    id: "PERMANENT_LP_LOCK",
    name: "Permanent Liquidity Lock Hook",
    shortLabel: "Permanent LP Lock",
    hookAddress: ENV.HOOK_PERMANENT_LOCK_ADDRESS,
    lpFee: 3000,
    tickSpacing: 60,
    description: "Enforces non-withdrawable on-chain LP positions inside Uniswap V4 PoolManager.",
  },
  CREATOR_FEE_SPLIT: {
    id: "CREATOR_FEE_SPLIT",
    name: "Creator Fee Split Hook",
    shortLabel: "Creator Fee Split",
    hookAddress: ENV.HOOK_CREATOR_SPLIT_ADDRESS,
    lpFee: 5000,
    tickSpacing: 60,
    description: "Streams 50% of ongoing Uniswap V4 pool swap fees back to the creator's dev vault.",
  },
};

/**
 * Computes the canonical Uniswap V4 PoolId (bytes32) from PoolKey components:
 * keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
 */
export function computeUniswapV4PoolId(params: {
  tokenA: Address;
  tokenB: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}): Hex {
  const addrA = params.tokenA.toLowerCase() as Address;
  const addrB = params.tokenB.toLowerCase() as Address;
  const hooksAddr = params.hooks.toLowerCase() as Address;

  const [currency0, currency1] = addrA < addrB ? [addrA, addrB] : [addrB, addrA];

  const encoded = encodeAbiParameters(
    parseAbiParameters("address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks"),
    [currency0, currency1, params.fee, params.tickSpacing, hooksAddr]
  );

  return keccak256(encoded);
}

// ============================================================================
// SMART CONTRACT ABIs
// ============================================================================

export const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * 1. Stokerium Launchpad Factory ABI (RWA / Stock-Backed / Synthetic Curve on Uniswap V4)
 */
export const STOKERIUM_FACTORY_ABI = [
  {
    inputs: [],
    name: "launchFeeWei",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { internalType: "string", name: "name", type: "string" },
          { internalType: "string", name: "symbol", type: "string" },
          { internalType: "string", name: "metadataURI", type: "string" },
          { internalType: "uint256", name: "totalSupply", type: "uint256" },
          { internalType: "address", name: "syntheticQuoteAsset", type: "address" },
          { internalType: "uint24", name: "slopeBps", type: "uint24" },
          { internalType: "int24", name: "initialTick", type: "int24" },
          { internalType: "address", name: "feeRecipient", type: "address" },
          { internalType: "uint256", name: "initialBuyQuoteAmount", type: "uint256" },
          { internalType: "bytes32", name: "salt", type: "bytes32" },
        ],
        internalType: "struct IStokeriumFactory.SyntheticLaunchParams",
        name: "params",
        type: "tuple",
      },
    ],
    name: "launchSyntheticToken",
    outputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "bytes32", name: "v4PoolId", type: "bytes32" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "token", type: "address" },
      { indexed: true, internalType: "address", name: "creator", type: "address" },
      { indexed: true, internalType: "address", name: "syntheticQuoteAsset", type: "address" },
      { indexed: false, internalType: "bytes32", name: "v4PoolId", type: "bytes32" },
    ],
    name: "SyntheticTokenLaunched",
    type: "event",
  },
] as const;

/**
 * 2. Sender Protocol Portal ABI (Launch + Integrated Multi-Wallet Disperse Engine)
 */
export const SENDER_PORTAL_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: "string", name: "name", type: "string" },
          { internalType: "string", name: "symbol", type: "string" },
          { internalType: "string", name: "metadataURI", type: "string" },
          { internalType: "bytes32", name: "salt", type: "bytes32" },
          { internalType: "address", name: "quoteToken", type: "address" },
          { internalType: "uint256", name: "initialBuyAmount", type: "uint256" },
          { internalType: "address", name: "creator", type: "address" },
          { internalType: "address[]", name: "disperseRecipients", type: "address[]" },
          { internalType: "uint256[]", name: "disperseBps", type: "uint256[]" },
        ],
        internalType: "struct ISenderPortal.LaunchAndDisperseParams",
        name: "params",
        type: "tuple",
      },
    ],
    name: "launchAndDisperse",
    outputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "bytes32", name: "v4PoolId", type: "bytes32" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "token", type: "address" },
      { indexed: true, internalType: "address", name: "creator", type: "address" },
      { indexed: false, internalType: "bytes32", name: "v4PoolId", type: "bytes32" },
      { indexed: false, internalType: "uint256", name: "recipientCount", type: "uint256" },
    ],
    name: "SenderTokenLaunched",
    type: "event",
  },
] as const;

/**
 * 3. Programmable Launchpad Factory ABI (Uniswap V4 Custom Hooks & Dynamic Fee Architecture)
 */
export const PROGRAMMABLE_V4_FACTORY_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: "string", name: "name", type: "string" },
          { internalType: "string", name: "symbol", type: "string" },
          { internalType: "string", name: "metadataURI", type: "string" },
          { internalType: "uint256", name: "totalSupply", type: "uint256" },
          { internalType: "address", name: "currency1", type: "address" },
          { internalType: "uint24", name: "lpFee", type: "uint24" },
          { internalType: "int24", name: "tickSpacing", type: "int24" },
          { internalType: "address", name: "hooks", type: "address" },
          { internalType: "bytes", name: "hookData", type: "bytes" },
          { internalType: "uint256", name: "initialBuyAmount", type: "uint256" },
          { internalType: "address", name: "feeRecipient", type: "address" },
          { internalType: "bytes32", name: "salt", type: "bytes32" },
        ],
        internalType: "struct IProgrammableV4Factory.V4LaunchParams",
        name: "params",
        type: "tuple",
      },
    ],
    name: "deployTokenWithV4Hook",
    outputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "bytes32", name: "poolId", type: "bytes32" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "token", type: "address" },
      { indexed: true, internalType: "bytes32", name: "poolId", type: "bytes32" },
      { indexed: true, internalType: "address", name: "hooks", type: "address" },
    ],
    name: "ProgrammablePoolInitialized",
    type: "event",
  },
] as const;

/**
 * Fee Locker ABI for claiming accrued creator royalties
 */
export const FEE_LOCKER_ABI = [
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "address", name: "creator", type: "address" },
    ],
    name: "getClaimableCreatorFees",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "token", type: "address" }],
    name: "claimCreatorFees",
    outputs: [{ internalType: "uint256", name: "claimedAmount", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// ============================================================================
// REAL VERIFIED ON-CHAIN FACTORY ABIs (ETHEREUM MAINNET)
// ============================================================================

const POOL_KEY_TUPLE_COMPONENTS = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
] as const;

const STOCKEREUM_LAUNCH_PARAMS_V3_COMPONENTS = [
  { name: "name", type: "string" },
  { name: "symbol", type: "string" },
  { name: "metadataUri", type: "string" },
  { name: "quote", type: "address" },
  { name: "quoteUsdPrice", type: "uint256" },
  { name: "priceDeadline", type: "uint256" },
  { name: "priceSignature", type: "bytes" },
  { name: "feePpm", type: "uint24" },
  { name: "feesToHolders", type: "bool" },
] as const;

/**
 * Real Stockereum LaunchFactory V3 ABI (0xc6B080DEd03C3382476A76345e79f82BD480977B)
 */
export const STOKERIUM_REAL_FACTORY_V3_ABI = [
  {
    type: "function",
    name: "creationFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "createLaunch",
    stateMutability: "payable",
    inputs: [
      {
        name: "p",
        type: "tuple",
        components: STOCKEREUM_LAUNCH_PARAMS_V3_COMPONENTS,
      },
    ],
    outputs: [
      { name: "token", type: "address" },
      { name: "key", type: "tuple", components: POOL_KEY_TUPLE_COMPONENTS },
      { name: "poolId", type: "bytes32" },
    ],
  },
  {
    type: "function",
    name: "createLaunchAndBuy",
    stateMutability: "payable",
    inputs: [
      {
        name: "p",
        type: "tuple",
        components: STOCKEREUM_LAUNCH_PARAMS_V3_COMPONENTS,
      },
      { name: "minOut", type: "uint256" },
    ],
    outputs: [
      { name: "token", type: "address" },
      { name: "key", type: "tuple", components: POOL_KEY_TUPLE_COMPONENTS },
      { name: "poolId", type: "bytes32" },
    ],
  },
  {
    type: "event",
    name: "Launched",
    anonymous: false,
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "quote", type: "address", indexed: true },
      { name: "poolId", type: "bytes32", indexed: false },
      { name: "sqrtPriceX96", type: "uint160", indexed: false },
      { name: "openingTick", type: "int24", indexed: false },
      { name: "quoteUsdPrice", type: "uint256", indexed: false },
      { name: "metadataUri", type: "string", indexed: false },
      { name: "feePpm", type: "uint24", indexed: false },
      { name: "distributor", type: "address", indexed: false },
    ],
  },
] as const;

/**
 * Real Sender.family SendItFactory ABI (0x2126625DF80b8bD01294139B26241B121caB9fff)
 */
export const SENDER_REAL_FACTORY_ABI = [
  {
    type: "function",
    name: "launchFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "launch",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [
      { name: "token", type: "address" },
      { name: "poolId", type: "bytes32" },
      { name: "tokensBought", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "Launched",
    anonymous: false,
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "poolId", type: "bytes32", indexed: true },
      { name: "quote", type: "address", indexed: false },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
      { name: "metadataURI", type: "string", indexed: false },
      { name: "initialBuyIn", type: "uint256", indexed: false },
      { name: "initialTokensOut", type: "uint256", indexed: false },
    ],
  },
] as const;

/**
 * Real Programmable.market MemeLaunchV1 ABI (0xD240D06f8586eB799f20056054e5b527405E6bAd)
 */
export const PROGRAMMABLE_REAL_FACTORY_ABI = [
  {
    type: "function",
    name: "MIN_INITIAL_BUY_WEI",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "predictTokenAddress",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "creator", type: "address" },
      { name: "creatorSalt", type: "bytes32" },
    ],
    outputs: [{ name: "predicted", type: "address" }],
  },
  {
    type: "function",
    name: "launch",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "totalSwapFeeBps", type: "uint16" },
          { name: "creatorSalt", type: "bytes32" },
          {
            name: "metadata",
            type: "tuple",
            components: [
              { name: "description", type: "string" },
              { name: "website", type: "string" },
              { name: "image", type: "string" },
              { name: "extraData", type: "bytes" },
            ],
          },
        ],
      },
    ],
    outputs: [
      { name: "token", type: "address" },
      { name: "poolId", type: "bytes32" },
      { name: "positionTokenId", type: "uint256" },
      { name: "initialTokensOut", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "TokenLaunched",
    anonymous: false,
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "poolId", type: "bytes32", indexed: true },
      { name: "positionTokenId", type: "uint256", indexed: false },
      { name: "totalSwapFeeBps", type: "uint16", indexed: false },
      { name: "initialBuyEth", type: "uint256", indexed: false },
      { name: "initialTokensOut", type: "uint256", indexed: false },
      { name: "metadataHash", type: "bytes32", indexed: false },
    ],
  },
] as const;
