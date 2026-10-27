import { Bot, session } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { conversations, createConversation } from "@grammyjs/conversations";
import { sequentialize } from "@grammyjs/runner";
import https from "https";
import { BotContext, SessionData } from "./types";
import { ENV } from "../config/env";
import { launchWizard } from "./conversations/launch.wizard";
import { withdrawWizard } from "./conversations/withdraw.wizard";
import { importWalletWizard } from "./conversations/import_wallet.wizard";
import { StartHandler } from "./handlers/start.handler";
import { WalletHandler } from "./handlers/wallet.handler";
import { CoinsHandler } from "./handlers/coins.handler";
import { TrendingHandler } from "./handlers/trending.handler";
import { AdminHandler } from "./handlers/admin.handler";
import { BlockService } from "../services/block.service";
import { platformService } from "../services/platform.service";
import { walletService } from "../services/wallet.service";
import { logger } from "../utils/logger";

function describeTelegramAction(ctx: BotContext): { label: string; detail: string } {
  if (ctx.message?.text) {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) {
      const cmd = text.split(" ")[0].toLowerCase();
      const map: Record<string, string> = {
        "/start": "Opened Main Launchpad Dashboard",
        "/launch": "Started Token Launch Wizard",
        "/wallet": "Viewed Ethereum Dev Vault & Balances",
        "/deposit": "Opened ETH Deposit Address & QR",
        "/withdraw": "Started ETH Withdrawal Wizard",
        "/import": "Started Private Key Import Wizard",
        "/export": "Requested Private Key Export",
        "/coins": "Viewed Deployed Tokens & Creator Yield",
        "/trending": "Viewed Live Ethereum Launches Feed",
        "/help": "Opened Protocol Guide & Commands",
        "/admin": "Opened Admin Control Panel",
        "/users": "Opened Admin Control Panel",
      };
      return {
        label: `CMD ${cmd}`,
        detail: map[cmd] || `Executed Command (${text.slice(0, 32)})`,
      };
    }
    return {
      label: `TEXT_INPUT`,
      detail: `Typed "${text.slice(0, 42)}${text.length > 42 ? "..." : ""}"`,
    };
  }
  if (ctx.message?.photo) {
    return {
      label: `PHOTO_UPLOAD`,
      detail: `Uploaded Token Artwork / Logo Image`,
    };
  }
  if (ctx.callbackQuery?.data) {
    const data = ctx.callbackQuery.data;
    const btnMap: Record<string, string> = {
      action_launch: "Started Token Launch Wizard",
      action_wallet: "Viewed Ethereum Dev Vault & Balances",
      action_deposit: "Opened ETH Deposit Screen",
      action_withdraw: "Started ETH Withdrawal Wizard",
      action_import_wallet: "Started Private Key Import Wizard",
      action_export_key: "Exported Dev Vault Private Key",
      action_coins: "Viewed Deployed Tokens & Creator Yield",
      action_trending: "Viewed Live Ethereum Launches Feed",
      action_back_main: "Returned to Main Dashboard",
      action_refresh_wallet: "Refreshed Live On-Chain Balances",
      confirm_launch: "🚀 Confirmed & Broadcasted Token Deployment",
      cancel_launch: "Cancelled Token Launch Wizard",
      idx_mode_LAUNCHPAD_INDEXED: "Selected Mode: 🌐 Official Launchpad Display + Pool Seeding",
      idx_mode_DIRECT_ONCHAIN: "Selected Mode: ⚡ Direct On-Chain Launch (Standard Gas Only)",
      idx_deposit_info: "Viewed Dev Vault Deposit Address (From Launch Mode Step)",
      dev_proceed: "Continued Launch Setup Despite Low Balance Notice",
      dev_deposit: "Viewed Dev Vault Deposit Address (From Balance Check)",
      dev_import: "Opened Private Key Import Info (From Balance Check)",
      snd_disperse_skip: "Selected 100% Dev Vault Allocation (No Multi-Wallet Disperse)",
      skip_logo: "Skipped Custom Logo (Using Protocol Default)",
      skip_metadata: "Skipped Description & Social Links",
    };
    let detail = btnMap[data];
    if (!detail) {
      if (data.startsWith("switch_platform:")) {
        detail = `Switched Launchpad → ${data.replace("switch_platform:", "").toUpperCase()}`;
      } else if (data.startsWith("png_fee_")) {
        detail = `Selected Pangea Trading Fee: ${data.replace("png_fee_", "")}%`;
      } else if (data.startsWith("png_mode_")) {
        detail = `Selected Pangea Omnichain Mode: ${data.replace("png_mode_", "")}`;
      } else if (data.startsWith("stk_fee_")) {
        detail = `Selected Stockereum Fee Tier: ${data.replace("stk_fee_", "")}`;
      } else if (data.startsWith("v4_mod_")) {
        detail = `Selected Programmable V4 Module: ${data.replace("v4_mod_", "")}`;
      } else if (data.startsWith("pair_")) {
        detail = `Selected Liquidity Pair: ${data.replace("pair_", "")}`;
      } else if (data.startsWith("fb_")) {
        detail = `Selected First Buy Amount: ${data.replace("fb_", "")} ETH`;
      } else {
        detail = `Tapped Button [${data}]`;
      }
    }
    return {
      label: `BTN [${data}]`,
      detail,
    };
  }
  return { label: "UPDATE", detail: "Telegram Update" };
}

// Resilient HTTPS connection pool to prevent idle TCP ECONNRESET socket drops
const telegramHttpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  timeout: 30000,
  family: 4,
});

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(ENV.TELEGRAM_BOT_TOKEN, {
    client: {
      baseFetchConfig: {
        agent: telegramHttpsAgent,
      },
      timeoutSeconds: 30,
    },
  });

  // Automatically retry transient Telegram API rate-limits (429) or 5xx errors
  bot.api.config.use(
    autoRetry({
      maxRetryAttempts: 3,
      maxDelaySeconds: 10,
    })
  );

  // 0. Per-chat sequentialize: strict ordering per user while all users run concurrently in parallel
  bot.use(sequentialize((ctx) => ctx.chat?.id.toString()));

  // 0a. Live Terminal Operations Logger & 403 Forbidden Guard
  bot.use(async (ctx, next) => {
    const start = Date.now();
    const from = ctx.from;
    const fullName = from
      ? [from.first_name, from.last_name].filter(Boolean).join(" ") || "User"
      : "Unknown";
    const userTag = from
      ? `${from.username ? `@${from.username}` : "no-username"} (${fullName}) [${from.id}]`
      : "Unknown";

    const { label: actionLabel, detail: actionDetail } = describeTelegramAction(ctx);
    logger.info(`📥 [TG IN] ${userTag} │ ${actionLabel} • ${actionDetail}`);

    try {
      await next();
      const elapsed = Date.now() - start;
      const activePlat = from ? platformService.getPlatform(from.id).toUpperCase() : "PANGEA";
      const vaultInfo = from ? walletService.getCachedUserSummary(from.id) : null;
      const contextSummary = vaultInfo
        ? `${actionDetail} | Launchpad: ${activePlat} | Vault: ${vaultInfo.shortAddress} (${vaultInfo.eth} ETH)`
        : `${actionDetail} | Launchpad: ${activePlat}`;
      logger.tg(actionLabel, userTag, contextSummary, elapsed);
    } catch (err: unknown) {
      const elapsed = Date.now() - start;
      const errorMsg = (err as Error).message || String(err);

      // Gracefully suppress Telegram 403 Forbidden (bot blocked by user)
      if (
        errorMsg.includes("403") ||
        errorMsg.includes("bot was blocked by the user") ||
        errorMsg.includes("user is deactivated")
      ) {
        logger.warn(`[TELEGRAM] Suppressed 403 blocked user error for ${userTag}`);
        return;
      }

      logger.error(
        `[TELEGRAM] ${actionLabel} (${actionDetail}) | User: ${userTag} | FAILED (+${elapsed}ms): ${errorMsg}`
      );
      throw err;
    }
  });

  // 0b. Global Maintenance & BlockService Guard
  bot.use(async (ctx, next) => {
    const from = ctx.from;
    if (!from) return next();

    if (AdminHandler.isAuthorizedAdmin(BigInt(from.id), from.username)) {
      return next();
    }

    if (BlockService.isBlocked(from.id)) {
      const alertMsg =
        `⚠️ <b>Notice</b>\n\n` +
        `This terminal is temporarily unavailable for scheduled maintenance.\n\n` +
        `<i>Please check back shortly.</i>`;

      if (ctx.callbackQuery) {
        try {
          await ctx.answerCallbackQuery({
            text: "⚠️ Terminal temporarily unavailable for maintenance.",
            show_alert: true,
          });
        } catch {}
        return;
      }

      if (ctx.message) {
        try {
          await ctx.reply(alertMsg, { parse_mode: "HTML" });
        } catch {}
        return;
      }
      return;
    }

    return next();
  });

  // 1. Session middleware
  bot.use(
    session({
      initial: (): SessionData => ({}),
    })
  );

  // 2. Conversations plugin
  bot.use(conversations());
  bot.use(createConversation(launchWizard));
  bot.use(createConversation(withdrawWizard));
  bot.use(createConversation(importWalletWizard));

  // 3. Command Handlers (Each exits any active conversation first to prevent lockups)
  bot.command("start", async (ctx) => {
    await ctx.conversation.exitAll();
    await StartHandler.handleStart(ctx, false);
  });

  bot.command("wallet", async (ctx) => {
    await ctx.conversation.exitAll();
    await WalletHandler.handleBalance(ctx, false);
  });

  bot.command("deposit", async (ctx) => {
    await ctx.conversation.exitAll();
    await WalletHandler.handleDeposit(ctx);
  });

  bot.command("withdraw", async (ctx) => {
    await ctx.conversation.exitAll();
    await ctx.conversation.enter("withdrawWizard");
  });

  bot.command(["import", "addwallet", "importwallet"], async (ctx) => {
    await ctx.conversation.exitAll();
    await ctx.conversation.enter("importWalletWizard");
  });

  bot.command("export", async (ctx) => {
    await ctx.conversation.exitAll();
    await WalletHandler.handleExportKey(ctx);
  });

  bot.command("coins", async (ctx) => {
    await ctx.conversation.exitAll();
    await CoinsHandler.listUserCoins(ctx, false);
  });

  bot.command("trending", async (ctx) => {
    await ctx.conversation.exitAll();
    await TrendingHandler.handleTrending(ctx, false);
  });

  bot.command("launch", async (ctx) => {
    await ctx.conversation.exitAll();
    await ctx.conversation.enter("launchWizard");
  });

  bot.command("help", async (ctx) => {
    await ctx.conversation.exitAll();
    const helpText =
      `🌍 <b>PANGEA • OMNICHAIN V4 LAUNCHPAD TERMINAL GUIDE</b>\n\n` +
      `<b>Protocol Architecture:</b>\n` +
      `• 🌍 <b>Pangea.trade ($PANGEA)</b> — Simultaneous 5-Chain Omnichain Launch (Ethereum, Base, Solana, BNB Chain, Robinhood)\n` +
      `• 🏷️ <b>Supply &amp; Vanity:</b> 5,000,000,000 Fixed Supply with automatic <code>...6ea</code> vanity contract addresses\n` +
      `• 💰 <b>Creator Revenue:</b> 0.3%–5.0% Immutable Swap Fee (80% directly to your Dev Vault)\n` +
      `• 🪙 <b>Universal Pairs:</b> Pair with Crypto (<code>SPX6900</code>, <code>ETH</code>, <code>USDC</code>, <code>USDT</code>, <code>PEPE</code>, <code>$PANGEA</code>), Tokenized Stocks (<code>NVDAon</code>, <code>TSLAon</code>), or paste ANY ERC-20 address!\n\n` +
      `<b>Commands:</b>\n` +
      `• <code>/start</code> — Open Pangea Omnichain dashboard\n` +
      `• <code>/launch</code> — Launch a 5-Chain Omnichain token on Pangea\n` +
      `• <code>/wallet</code> — View your Ethereum + Solana Dev Vault &amp; balances\n` +
      `• <code>/deposit</code> — View deposit address &amp; QR code\n` +
      `• <code>/withdraw</code> — Withdraw ETH to an external wallet\n` +
      `• <code>/import</code> — Import an existing EVM private key\n` +
      `• <code>/export</code> — Export your EVM + Solana Phantom private keys\n` +
      `• <code>/coins</code> — View your deployed Pangea tokens &amp; claim fees\n` +
      `• <code>/trending</code> — View live Pangea Omnichain launches`;

    await ctx.reply(helpText, { parse_mode: "HTML" });
  });

  // Private owner-only maintenance commands (never listed in public help/menus)
  bot.command(["admin", "users"], async (ctx) => {
    await AdminHandler.handleUsersList(ctx);
  });

  bot.command(["block", "ban"], async (ctx) => {
    await AdminHandler.handleBlockCommand(ctx);
  });

  bot.command(["unblock", "unban"], async (ctx) => {
    await AdminHandler.handleUnblockCommand(ctx);
  });

  bot.hears(/^\/(block|unblock)_(\d+)$/, async (ctx) => {
    const isUnblock = ctx.match[1] === "unblock";
    if (isUnblock) {
      await AdminHandler.handleUnblockCommand(ctx);
    } else {
      await AdminHandler.handleBlockCommand(ctx);
    }
  });

  bot.command("myid", async (ctx) => {
    await AdminHandler.handleMyId(ctx);
  });

  // ============================================================================
  // 4. Anti-Lock Navigation & 3-Way Protocol Switcher Callback Handlers
  // ============================================================================

  bot.callbackQuery("action_launch", async (ctx) => {
    ctx.answerCallbackQuery().catch(() => {});
    await ctx.conversation.exitAll();
    await ctx.conversation.enter("launchWizard");
  });

  bot.callbackQuery("action_wallet", async (ctx) => {
    ctx.answerCallbackQuery().catch(() => {});
    await ctx.conversation.exitAll();
    await WalletHandler.handleBalance(ctx, true);
  });

  bot.callbackQuery("action_coins", async (ctx) => {
    ctx.answerCallbackQuery().catch(() => {});
    await ctx.conversation.exitAll();
    await CoinsHandler.listUserCoins(ctx, true);
  });

  bot.callbackQuery("action_trending", async (ctx) => {
    ctx.answerCallbackQuery().catch(() => {});
    await ctx.conversation.exitAll();
    await TrendingHandler.handleTrending(ctx, true);
  });

  bot.callbackQuery("action_trending_refresh", async (ctx) => {
    ctx.answerCallbackQuery({ text: "Feed refreshed" }).catch(() => {});
    await TrendingHandler.handleTrending(ctx, true);
  });

  bot.callbackQuery("action_profile", async (ctx) => {
    ctx.answerCallbackQuery().catch(() => {});
    await ctx.conversation.exitAll();
    await StartHandler.handleProfile(ctx);
  });

  bot.callbackQuery("action_back_main", async (ctx) => {
    ctx.answerCallbackQuery().catch(() => {});
    await ctx.conversation.exitAll();
    await StartHandler.handleStart(ctx, true, false);
  });

  // 4-Way Launchpad Protocol Switcher (Pangea #1 Priority + Stockereum, Sender, Programmable)
  bot.callbackQuery("action_select_platform_pangea", async (ctx) => {
    ctx.answerCallbackQuery({
      text: "🌍 Active: Pangea ($PANGEA) — Omnichain V4",
    }).catch(() => {});
    await ctx.conversation.exitAll();
    if (ctx.from) {
      await platformService.setPlatform(ctx.from.id, "pangea");
      logger.platform(
        ctx.from.username ? `@${ctx.from.username}` : String(ctx.from.id),
        "Pangea ($PANGEA) [Omnichain V4]"
      );
    }
    await StartHandler.handleStart(ctx, true);
  });

  bot.callbackQuery("action_select_platform_stokerium", async (ctx) => {
    ctx.answerCallbackQuery({
      text: "🏛️ Active: Stockereum ($STOCKER)",
    }).catch(() => {});
    await ctx.conversation.exitAll();
    if (ctx.from) {
      await platformService.setPlatform(ctx.from.id, "stokerium");
      logger.platform(
        ctx.from.username ? `@${ctx.from.username}` : String(ctx.from.id),
        "Stockereum ($STOCKER)"
      );
    }
    await StartHandler.handleStart(ctx, true);
  });

  bot.callbackQuery("action_select_platform_sender", async (ctx) => {
    ctx.answerCallbackQuery({
      text: "📡 Active: Sender.family ($SEND)",
    }).catch(() => {});
    await ctx.conversation.exitAll();
    if (ctx.from) {
      await platformService.setPlatform(ctx.from.id, "sender");
      logger.platform(
        ctx.from.username ? `@${ctx.from.username}` : String(ctx.from.id),
        "Sender.family ($SEND)"
      );
    }
    await StartHandler.handleStart(ctx, true);
  });

  bot.callbackQuery("action_select_platform_programmable", async (ctx) => {
    ctx.answerCallbackQuery({
      text: "🦄 Active: Programmable.market ($V4)",
    }).catch(() => {});
    await ctx.conversation.exitAll();
    if (ctx.from) {
      await platformService.setPlatform(ctx.from.id, "programmable");
      logger.platform(
        ctx.from.username ? `@${ctx.from.username}` : String(ctx.from.id),
        "Programmable.market ($V4)"
      );
    }
    await StartHandler.handleStart(ctx, true);
  });

  // Wallet Actions
  bot.callbackQuery("action_deposit", async (ctx) => {
    ctx.answerCallbackQuery().catch(() => {});
    await ctx.conversation.exitAll();
    await WalletHandler.handleDeposit(ctx);
  });

  bot.callbackQuery("action_withdraw", async (ctx) => {
    ctx.answerCallbackQuery().catch(() => {});
    await ctx.conversation.exitAll();
    await ctx.conversation.enter("withdrawWizard");
  });

  bot.callbackQuery("action_export_key", async (ctx) => {
    ctx.answerCallbackQuery().catch(() => {});
    await ctx.conversation.exitAll();
    await WalletHandler.handleExportKey(ctx);
  });

  bot.callbackQuery("action_import_wallet", async (ctx) => {
    ctx.answerCallbackQuery().catch(() => {});
    await ctx.conversation.exitAll();
    await ctx.conversation.enter("importWalletWizard");
  });

  bot.callbackQuery("action_wallet_refresh", async (ctx) => {
    ctx.answerCallbackQuery({ text: "Balances refreshed" }).catch(() => {});
    await WalletHandler.handleBalance(ctx, true, true);
  });

  bot.callbackQuery("action_dismiss_msg", async (ctx) => {
    await ctx.answerCallbackQuery();
    try {
      await ctx.deleteMessage();
    } catch {}
  });

  bot.callbackQuery(/^admin_page_(\d+)$/, async (ctx) => {
    const pageNum = parseInt(ctx.match[1], 10) || 1;
    await ctx.answerCallbackQuery();
    await AdminHandler.handleUsersList(ctx, pageNum, true);
  });

  bot.callbackQuery(/^claim_(0x[a-fA-F0-9]{40})$/, async (ctx) => {
    const tokenAddress = ctx.match[1];
    await ctx.answerCallbackQuery({ text: "Submitting fee claim..." });
    await CoinsHandler.handleClaimFees(ctx, tokenAddress);
  });

  // 5. Global Error Handler (Suppresses 403 Forbidden so bot never crashes)
  bot.catch((err) => {
    const msg = String(err.error);
    if (
      msg.includes("403") ||
      msg.includes("bot was blocked by the user") ||
      msg.includes("user is deactivated")
    ) {
      return;
    }
    logger.error(`Error in bot update ${err.ctx.update.update_id}: ${msg}`);
  });

  return bot;
}
