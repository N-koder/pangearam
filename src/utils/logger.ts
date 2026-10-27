import winston from "winston";

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  gray: "\x1b[90m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  brightCyan: "\x1b[96m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightMagenta: "\x1b[95m",
};

/**
 * Redacts 64-character or 66-character (0x...) hex strings that resemble private keys
 */
const sanitizeSensitiveInfo = winston.format((info) => {
  if (typeof info.message === "string") {
    info.message = info.message.replace(/(0x)?[0-9a-fA-F]{64}/g, "[REDACTED_KEY]");
  }
  return info;
});

function getTimestamp(): string {
  const now = new Date();
  return now.toTimeString().split(" ")[0];
}

const baseLogger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    sanitizeSensitiveInfo(),
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.printf(({ level, message, timestamp, stack }) => {
      if (stack) {
        return `[${timestamp}] ${level}: ${message}\n${stack}`;
      }
      return `[${timestamp}] ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
    }),
  ],
  exitOnError: false,
});

export const logger = {
  info: (msg: string, ...meta: any[]) => baseLogger.info(msg, ...meta),
  warn: (msg: string, ...meta: any[]) => baseLogger.warn(msg, ...meta),
  error: (msg: string, ...meta: any[]) => baseLogger.error(msg, ...meta),
  debug: (msg: string, ...meta: any[]) => baseLogger.debug(msg, ...meta),

  tg: (action: string, user: string, details?: string, durationMs?: number) => {
    const badge = `${ANSI.cyan}${ANSI.bold}[TG IN]${ANSI.reset}`;
    const userTag = `${ANSI.white}${user}${ANSI.reset}`;
    const actionTag = `${ANSI.brightCyan}${action}${ANSI.reset}`;
    const durationTag =
      durationMs !== undefined
        ? durationMs > 500
          ? ` ${ANSI.yellow}(+${durationMs}ms)${ANSI.reset}`
          : ` ${ANSI.green}(+${durationMs}ms)${ANSI.reset}`
        : "";
    const extra = details ? ` ${ANSI.dim}• ${details}${ANSI.reset}` : "";

    baseLogger.info(`⚡ ${badge} ${userTag} │ ${actionTag}${durationTag}${extra}`);
  },

  platform: (user: string, platform: string) => {
    const badge = `${ANSI.magenta}${ANSI.bold}[PLATFORM]${ANSI.reset}`;
    baseLogger.info(
      `🔄 ${badge} ${user} switched active launchpad to: ${ANSI.brightMagenta}${platform.toUpperCase()}${ANSI.reset}`
    );
  },

  wallet: (msg: string) => {
    const badge = `${ANSI.blue}${ANSI.bold}[WALLET]${ANSI.reset}`;
    baseLogger.info(`💳 ${badge} ${msg}`);
  },

  withdraw: (msg: string) => {
    const badge = `${ANSI.yellow}${ANSI.bold}[WITHDRAW]${ANSI.reset}`;
    baseLogger.info(`📤 ${badge} ${msg}`);
  },

  launch: (msg: string) => {
    const badge = `${ANSI.brightGreen}${ANSI.bold}[LAUNCH]${ANSI.reset}`;
    baseLogger.info(`🚀 ${badge} ${msg}`);
  },

  launchReceipt: (info: {
    user: string;
    platform: string;
    tokenName: string;
    tokenSymbol: string;
    pairSymbol: string;
    modeLabel?: string;
    evmCa: string;
    solanaMint?: string;
    txHash: string;
    initialBuyEth: string;
  }) => {
    baseLogger.info(
      `\n${ANSI.brightGreen}${ANSI.bold}┏━━━━━━━━━━━━━━━━━━━ 🚀 LIVE TOKEN DEPLOYED ━━━━━━━━━━━━━━━━━━━┓${ANSI.reset}\n` +
        `${ANSI.brightGreen}┃${ANSI.reset} 👤 User          : ${ANSI.white}${info.user}${ANSI.reset}\n` +
        `${ANSI.brightGreen}┃${ANSI.reset} 🌐 Launchpad     : ${ANSI.brightMagenta}${info.platform.toUpperCase()}${ANSI.reset}${info.modeLabel ? ` (${info.modeLabel})` : ""}\n` +
        `${ANSI.brightGreen}┃${ANSI.reset} 🏷️  Token         : ${ANSI.brightYellow}${info.tokenName} ($${info.tokenSymbol})${ANSI.reset} / ${info.pairSymbol} (First Buy: ${info.initialBuyEth} ETH)\n` +
        `${ANSI.brightGreen}┃${ANSI.reset} 🔷 EVM CA        : ${ANSI.brightCyan}${info.evmCa}${ANSI.reset}\n` +
        (info.solanaMint
          ? `${ANSI.brightGreen}┃${ANSI.reset} 🟣 Solana OFT CA : ${ANSI.brightMagenta}${info.solanaMint}${ANSI.reset}\n`
          : "") +
        `${ANSI.brightGreen}┃${ANSI.reset} 🔗 Tx Hash       : ${ANSI.dim}${info.txHash}${ANSI.reset}\n` +
        `${ANSI.brightGreen}${ANSI.bold}┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛${ANSI.reset}`
    );
  },

  wizard: (user: string, step: string, detail?: string) => {
    const badge = `${ANSI.brightYellow}${ANSI.bold}[WIZARD]${ANSI.reset}`;
    const extra = detail ? ` ${ANSI.dim}→ ${detail}${ANSI.reset}` : "";
    baseLogger.info(`🧭 ${badge} ${ANSI.white}${user}${ANSI.reset} │ ${step}${extra}`);
  },

  admin: (msg: string) => {
    const badge = `${ANSI.magenta}${ANSI.bold}[ADMIN]${ANSI.reset}`;
    baseLogger.info(`🛡️ ${badge} ${msg}`);
  },

  rpc: (msg: string) => {
    const badge = `${ANSI.cyan}[RPC]${ANSI.reset}`;
    baseLogger.info(`🌐 ${badge} ${msg}`);
  },
};
