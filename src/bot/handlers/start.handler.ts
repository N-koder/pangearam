import { InlineKeyboard } from "grammy";
import { BotContext } from "../types";
import { walletService, ETH_APPROX_USD } from "../../services/wallet.service";
import {
  platformService,
  LaunchPlatform,
  PLATFORM_SPECS,
} from "../../services/platform.service";
import { formatEth, escapeHtml } from "../../utils/formatters";
import { logger } from "../../utils/logger";
import { AdminHandler } from "./admin.handler";
import prisma from "../../db/client";

export class StartHandler {
  /**
   * Builds the main dashboard keyboard with Pangea (#1 Priority Omnichain Launchpad)
   * featured at the top of the protocol switcher alongside Stockereum, Sender, and Programmable.
   */
  public static getMainMenuKeyboard(
    launchCount: number = 0,
    _platform: LaunchPlatform = "pangea"
  ): InlineKeyboard {
    const coinsLabel = launchCount > 0 ? `🌕 My Coins (${launchCount})` : "🌕 My Coins";

    return new InlineKeyboard()
      .text("🚀 Launch Token on Pangea ($PANGEA)", "action_launch")
      .row()
      .text("● 🌍 Pangea ($PANGEA) • 5-Chain Omnichain V4 ⭐", "action_select_platform_pangea")
      .row()
      .text("👛 Wallet", "action_wallet")
      .text("📤 Withdraw", "action_withdraw")
      .row()
      .text(coinsLabel, "action_coins")
      .text("🔥 Live Feed", "action_trending")
      .row()
      .text("👤 Profile", "action_profile")
      .text("🔄 Refresh", "action_back_main");
  }

  /**
   * Generates the main dashboard text and state
   */
  public static async getDashboardData(
    userId: bigint,
    username?: string,
    firstName?: string,
    forceRefresh: boolean = false
  ) {
    const { address, launchCount, isNew } = await walletService.getUserData(
      userId,
      forceRefresh,
      { username, firstName }
    );
    const balances = await walletService.getBalances(address, forceRefresh);
    const ethNum = parseFloat(balances.eth);
    const approxUsd = (ethNum * ETH_APPROX_USD).toFixed(2);
    const platform: LaunchPlatform = "pangea";
    const spec = PLATFORM_SPECS.pangea;

    const text =
      `🌍 <b>Pangea • Omnichain V4 Launchpad Terminal</b>\n` +
      `Network: Ethereum Mainnet + 5-Chain LayerZero V2 OFT\n\n` +
      `<b>Dev Vault:</b> <code>${address}</code>\n` +
      `<b>ETH Balance:</b> <b>${formatEth(balances.eth)} ETH</b> (~$${approxUsd} USD)\n` +
      `<b>Active Protocol:</b> <b>${spec.badge}</b>\n` +
      `<b>Omnichain Targets:</b> ETH • Base • Solana • BNB • Robinhood\n` +
      `<b>Pool Architecture:</b> ${spec.poolTarget}\n` +
      (launchCount > 0 ? `<b>Deployed Tokens:</b> ${launchCount}\n\n` : `\n`) +
      `<i>Tap Launch below to deploy your 5B supply token with a signature <code>...6ea</code> address:</i>`;

    return { text, address, isNew, launchCount, platform };
  }

  /**
   * Handles /start command and renders the dashboard
   */
  public static async handleStart(
    ctx: BotContext,
    edit: boolean = false,
    forceRefresh: boolean = false
  ) {
    const user = ctx.from;
    if (!user) return;

    const userId = BigInt(user.id);

    try {
      const { text, address, isNew, launchCount, platform } =
        await this.getDashboardData(
          userId,
          user.username,
          user.first_name,
          forceRefresh
        );

      if (isNew) {
        AdminHandler.notifyAdminNewUser(ctx.api, {
          id: userId,
          username: user.username,
          firstName: user.first_name,
          walletAddress: address,
          isNew: true,
        }).catch(() => {});
      }

      const keyboard = this.getMainMenuKeyboard(launchCount, platform);

      if (edit && ctx.callbackQuery) {
        try {
          await ctx.editMessageText(text, {
            parse_mode: "HTML",
            reply_markup: keyboard,
          });
          return;
        } catch {
          return;
        }
      }

      await ctx.reply(text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } catch (error: unknown) {
      const err = error as Error;
      if (
        err.message.includes("bot was blocked by the user") ||
        err.message.includes("403")
      ) {
        logger.warn(`User ${userId} blocked the bot. Skipping message.`);
        return;
      }
      logger.error(`Start handler error: ${err.message}`);
    }
  }

  /**
   * Renders the user Profile & Stats view (0ms RAM cache lookup)
   */
  public static async handleProfile(ctx: BotContext) {
    const from = ctx.from!;
    const userId = BigInt(from.id);
    const userData = await walletService.getUserData(userId, false, {
      username: from.username,
      firstName: from.first_name,
    });

    if (!userData.address) return;

    const totalLaunches = userData.launchCount;
    const totalClaims = userData.feeClaimCount;
    const balances = await walletService.getBalances(userData.address);
    const ethNum = parseFloat(balances.eth);
    const approxUsd = (ethNum * ETH_APPROX_USD).toFixed(2);
    const platform = platformService.getPlatform(userId);
    const spec = PLATFORM_SPECS[platform];

    const keyboard = new InlineKeyboard()
      .text("🚀 Launch a Token", "action_launch")
      .text("👛 Wallet", "action_wallet")
      .row()
      .text("📤 Withdraw", "action_withdraw")
      .text("🏠 Main Menu", "action_back_main");

    const text =
      `┌───「 👤 <b>ACCOUNT PROFILE</b> 」───\n` +
      `│ 🌐 <b>Network</b>   : Ethereum Mainnet (Chain ID: 1)\n` +
      `│ 🏷️ <b>Protocol</b>  : <b>${spec.badge}</b>\n` +
      `└───────────────────────────────\n\n` +
      `👤 <b>Account:</b> @${escapeHtml(userData.username || from.username || "Creator")}\n` +
      `💳 <b>Dev Vault:</b> <code>${userData.address}</code>\n` +
      `💰 <b>Balance:</b> <b>${formatEth(balances.eth)} ETH</b> (~$${approxUsd} USD)\n\n` +
      `📊 <b>DEPLOYMENT SUMMARY:</b>\n` +
      `├─ Tokens Deployed : <b>${totalLaunches}</b>\n` +
      `├─ Fee Claims      : <b>${totalClaims}</b>\n` +
      `└─ Active Target   : <b>${spec.poolTarget}</b>\n\n` +
      `<i>Your non-custodial Dev Vault key is encrypted with AES-256-GCM.</i>`;

    try {
      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } catch {
      await ctx.reply(text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    }
  }
}
