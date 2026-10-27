import { Context, InlineKeyboard } from "grammy";
import { BotConversation, BotContext } from "../types";
import { walletService } from "../../services/wallet.service";
import { WalletHandler } from "../handlers/wallet.handler";
import { StartHandler } from "../handlers/start.handler";
import { formatEth, escapeHtml } from "../../utils/formatters";
import { logger } from "../../utils/logger";

export async function importWalletWizard(conversation: BotConversation, ctx: Context) {
  const userId = BigInt(ctx.from!.id);

  const cancelKb = new InlineKeyboard().text("❌ Cancel", "import_cancel");

  await ctx.reply(
    `🔐 <b>IMPORT ETHEREUM DEV WALLET</b>\n\n` +
      `Paste your 64-character hexadecimal EVM Private Key (with or without <code>0x</code> prefix).\n\n` +
      `🛡️ <b>Security Safeguards:</b>\n` +
      `• Your private key is encrypted with <b>AES-256-GCM</b> before storing in PostgreSQL.\n` +
      `• <b>Automatic Message Purge:</b> Your key message is immediately deleted from Telegram chat history.\n\n` +
      `Type <code>/cancel</code> at any time to abort.`,
    { parse_mode: "HTML", reply_markup: cancelKb }
  );

  while (true) {
    const upd = await conversation.waitFor(["message:text", "callback_query:data"]);

    if (upd.callbackQuery) {
      await upd.answerCallbackQuery().catch(() => {});
      const data = upd.callbackQuery.data;
      if (data === "import_cancel") {
        await ctx.reply("🚫 Wallet import cancelled.");
        return;
      }
      if (data === "action_wallet") {
        await WalletHandler.handleBalance(upd as unknown as BotContext, false);
        return;
      }
      if (data === "action_back_main") {
        await StartHandler.handleStart(upd as unknown as BotContext, false);
        return;
      }
      if (data?.startsWith("action_")) {
        return;
      }
      continue;
    }

    const rawInput = upd.message!.text!.trim();

    // Immediately delete the user's message containing the private key
    try {
      await ctx.api.deleteMessage(ctx.chat!.id, upd.message!.message_id);
    } catch {}

    if (rawInput.startsWith("/")) {
      await ctx.reply("🚫 Wallet import cancelled.");
      return;
    }

    const cleanKey = rawInput.replace(/^0x/i, "").trim();

    if (!/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
      await ctx.reply(
        `⚠️ <b>Invalid Private Key Format</b>\n\nA valid EVM private key is 64 hexadecimal characters. Please try again or type <code>/cancel</code>:`,
        { parse_mode: "HTML" }
      );
      continue;
    }

    try {
      const { address } = await conversation.external(() =>
        walletService.importDevWallet(userId, cleanKey)
      );

      const balances = await conversation.external(() =>
        walletService.getBalances(address, true)
      );

      const keyboard = new InlineKeyboard()
        .text("🚀 Launch a Token", "action_launch")
        .text("👛 View Wallet", "action_wallet")
        .row()
        .text("🏠 Main Menu", "action_back_main");

      await ctx.reply(
        `✅ <b>DEV WALLET IMPORTED</b>\n\n` +
          `• <b>Address:</b> <code>${address}</code>\n` +
          `• <b>ETH Balance:</b> <b>${formatEth(balances.eth)} ETH</b>\n` +
          `• <b>WETH Balance:</b> <b>${formatEth(balances.weth)} WETH</b>\n\n` +
          `🔒 <i>Your key message was purged from chat and encrypted with AES-256-GCM.</i>`,
        { parse_mode: "HTML", reply_markup: keyboard }
      );
      return;
    } catch (err: unknown) {
      logger.error(`Import wallet failed for user ${userId}: ${(err as Error).message}`);
      await ctx.reply(
        `❌ Error importing wallet: ${escapeHtml((err as Error).message)}`,
        { parse_mode: "HTML" }
      );
    }
  }
}
