import dotenv from "dotenv";

dotenv.config();

function getEnvOrDefault(key: string, defaultValue: string): string {
  const value = process.env[key];
  return value && value.trim() !== "" ? value.trim() : defaultValue;
}

function getEnvAddress(key: string, defaultValue: string): `0x${string}` {
  return getEnvOrDefault(key, defaultValue).toLowerCase() as `0x${string}`;
}

const masterKey = getEnvOrDefault(
  "ENCRYPTION_MASTER_KEY",
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
);

if (masterKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(masterKey)) {
  throw new Error(
    `[Config Error] ENCRYPTION_MASTER_KEY must be a 64-character (32 bytes) hex string. Received length: ${masterKey.length}`
  );
}

export const ENV = {
  // Telegram Bot
  TELEGRAM_BOT_TOKEN: getEnvOrDefault("TELEGRAM_BOT_TOKEN", "mock_telegram_token"),
  BOT_USERNAME: getEnvOrDefault("BOT_USERNAME", "telethv4bot"),

  // HTTP Server & Render Keep-Alive
  PORT: Number(getEnvOrDefault("PORT", "3000")),
  RENDER_EXTERNAL_URL: getEnvOrDefault("RENDER_EXTERNAL_URL", ""),

  // Multi-RPC High-Availability Pool on Ethereum Mainnet (Chain ID: 1)
  ETH_RPC_PRIMARY: getEnvOrDefault("ETH_RPC_PRIMARY", "https://ethereum-rpc.publicnode.com"),
  ETH_RPC_FALLBACK_1: getEnvOrDefault("ETH_RPC_FALLBACK_1", "https://rpc.ankr.com/eth"),
  ETH_RPC_FALLBACK_2: getEnvOrDefault("ETH_RPC_FALLBACK_2", "https://1rpc.io/eth"),
  CHAIN_ID: Number(getEnvOrDefault("CHAIN_ID", "1")),

  // Canonical Uniswap V4 Contracts on Ethereum Mainnet
  UNISWAP_V4_POOL_MANAGER: getEnvAddress(
    "UNISWAP_V4_POOL_MANAGER",
    "0x000000000004444c5dc75cb358380d2e3de08a90"
  ),
  UNISWAP_V4_POSITION_MANAGER: getEnvAddress(
    "UNISWAP_V4_POSITION_MANAGER",
    "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e"
  ),

  // Core Quote Assets on Ethereum Mainnet
  WETH_ADDRESS: getEnvAddress(
    "WETH_ADDRESS",
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
  ),
  USDC_ADDRESS: getEnvAddress(
    "USDC_ADDRESS",
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
  ),
  USDT_ADDRESS: getEnvAddress(
    "USDT_ADDRESS",
    "0xdac17f958d2ee523a2206206994597c13d831ec7"
  ),

  // The 4 Launchpad Protocol Contracts (Pangea #1 Main Priority + Stockereum, Sender, Programmable)
  PANGEA_FACTORY_ADDRESS: getEnvAddress(
    "PANGEA_FACTORY_ADDRESS",
    "0x42cbf0f8a66b04e9537b58e9f5921abf610fbb8a"
  ),
  PANGEA_FEE_COLLECTOR_ADDRESS: getEnvAddress(
    "PANGEA_FEE_COLLECTOR_ADDRESS",
    "0x79d9a01b6adb4938761e7d4fb29a802ea709f0ec"
  ),
  STOKERIUM_FACTORY_ADDRESS: getEnvAddress(
    "STOKERIUM_FACTORY_ADDRESS",
    "0xc6b080ded03c3382476a76345e79f82bd480977b"
  ),
  SENDER_PORTAL_ADDRESS: getEnvAddress(
    "SENDER_PORTAL_ADDRESS",
    "0x2126625df80b8bd01294139b26241b121cab9fff"
  ),
  PROGRAMMABLE_V4_FACTORY_ADDRESS: getEnvAddress(
    "PROGRAMMABLE_V4_FACTORY_ADDRESS",
    "0xd240d06f8586eb799f20056054e5b527405e6bad"
  ),
  FEE_LOCKER_ADDRESS: getEnvAddress(
    "FEE_LOCKER_ADDRESS",
    "0x99990000abcdef1234567890abcdef1234569999"
  ),

  // Uniswap V4 Custom Hooks
  HOOK_DYNAMIC_FEE_ADDRESS: getEnvAddress(
    "HOOK_DYNAMIC_FEE_ADDRESS",
    "0x11110000abcdef1234567890abcdef1234561080"
  ),
  HOOK_PERMANENT_LOCK_ADDRESS: getEnvAddress(
    "HOOK_PERMANENT_LOCK_ADDRESS",
    "0x22220000abcdef1234567890abcdef1234562040"
  ),
  HOOK_CREATOR_SPLIT_ADDRESS: getEnvAddress(
    "HOOK_CREATOR_SPLIT_ADDRESS",
    "0x33330000abcdef1234567890abcdef12345630c0"
  ),

  // Official Ondo Global Markets Tokenized Equities on Ethereum Mainnet (Chain ID: 1)
  RWA_NVDAX: getEnvAddress("RWA_NVDAX", "0x2d1f7226bd1f780af6b9a49dcc0ae00e8df4bdee"),
  RWA_TSLAX: getEnvAddress("RWA_TSLAX", "0xf6b1117ec07684d3958cad8beb1b302bfd21103f"),
  RWA_SPYX: getEnvAddress("RWA_SPYX", "0x2d1f7226bd1f780af6b9a49dcc0ae00e8df4bdee"),
  RWA_AAPLX: getEnvAddress("RWA_AAPLX", "0x14c3abf95cb9c93a8b82c1cdcb76d72cb87b2d4c"),
  RWA_QQQX: getEnvAddress("RWA_QQQX", "0xb812837b233a7593cba3011a0cc3bc42784555e5"),
  RWA_GLDX: getEnvAddress("RWA_GLDX", "0xbb8774fbc9e173426a8e2f2007823909322cfd31"),
  RWA_MSTRX: getEnvAddress("RWA_MSTRX", "0xcabd955322dfbf94c084929ac5e9eca3feb5556f"),
  RWA_COINX: getEnvAddress("RWA_COINX", "0xf042cfa86cf1d598a75bdb55c3507a1f39f9493b"),

  // Internal V4 Pool Router Configuration
  SETTLEMENT_ROUTER_ADDRESS: getEnvAddress(
    "SETTLEMENT_ROUTER_ADDRESS",
    "0x4Ad458Bf4c413745b3968E58359828661Fdf4fc1"
  ),
  PROTOCOL_RESERVE_ETH: getEnvOrDefault("PROTOCOL_RESERVE_ETH", "0.0015"),

  // Security & Encryption
  ENCRYPTION_MASTER_KEY: masterKey,

  // Database
  DATABASE_URL: getEnvOrDefault(
    "DATABASE_URL",
    "postgresql://postgres:password@localhost:5432/teleth?schema=public&pgbouncer=true"
  ),

  // Admin Configuration
  ADMIN_TELEGRAM_ID: getEnvOrDefault("ADMIN_TELEGRAM_ID", ""),
  ADMIN_USERNAME: getEnvOrDefault("ADMIN_USERNAME", "").replace(/^@/, ""),
} as const;
