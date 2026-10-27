import QRCode from "qrcode";
import { InputFile, InlineKeyboard } from "grammy";
import { BotContext } from "../types";
import { walletService, ETH_APPROX_USD } from "../../services/wallet.service";
import { logger } from "../../utils/logger";
import { formatEth, deriveSolanaWalletFromEvmKey } from "../../utils/formatters";

export class WalletHandler {
  /**
   * Builds the wallet view inline keyboard
   */
  public static getWalletKeyboard(): InlineKeyboard {
    return new InlineKeyboard()
      .text("📥 Deposit ETH", "action_deposit")
      .text("📤 Withdraw ETH", "action_withdraw")
      .row()
      .text("➕ Import Key", "action_import_wallet")
      .text("🔑 Export Key", "action_export_key")
      .row()
      .text("🔄 Refresh", "action_wallet_refresh")
      .text("🏠 Main Menu", "action_back_main");
  }

  /**
   * Renders the wallet card in-place
   */
  public static async handleBalance(
    ctx: BotContext,
    edit: boolean = true,
    forceRefresh: boolean = false
  ) {
    const userId = BigInt(ctx.from!.id);
    const { address } = await walletService.getUserData(userId, forceRefresh);

    if (!address) {
      await ctx.reply("❌ Wallet not found. Type /start to initialize your account.");
      return;
    }

    const balances = await walletService.getBalances(address, forceRefresh);
    const ethNum = parseFloat(balances.eth);
    const approxUsd = (ethNum * ETH_APPROX_USD).toFixed(2);
    const minRequiredNum = 0.002;
    const isLaunchReady = ethNum >= minRequiredNum;
    const launchStatus = isLaunchReady
      ? "🟢 Ready for deployment"
      : "🟡 Recommended ~0.002 ETH (~$5) for Ethereum pool gas";

    const text =
      `👛 <b>Ethereum Dev Vault</b>\n\n` +
      `<b>Address:</b> <code>${address}</code>\n\n` +
      `<b>ETH Balance:</b> <b>${formatEth(balances.eth)} ETH</b> (~$${approxUsd} USD)\n` +
      `<b>WETH Balance:</b> <b>${formatEth(balances.weth)} WETH</b>\n` +
      `<b>USDC Balance:</b> <b>${parseFloat(balances.usdc).toFixed(2)} USDC</b>\n` +
      `<b>Status:</b> ${launchStatus}\n\n` +
      `<i>Tap address to copy. Non-custodial key controlled by your account.</i>`;

    const keyboard = this.getWalletKeyboard();

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
  }

  /**
   * Generates deposit QR code with close button
   */
  public static async handleDeposit(ctx: BotContext) {
    const userId = BigInt(ctx.from!.id);
    const { address } = await walletService.getUserData(userId);

    if (!address) {
      await ctx.reply("❌ Dev Vault not found.");
      return;
    }

    try {
      const qrBuffer = await QRCode.toBuffer(address, {
        type: "png",
        margin: 2,
        width: 320,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });

      const qrKeyboard = new InlineKeyboard()
        .text("📤 Withdraw", "action_withdraw")
        .text("👛 Wallet", "action_wallet")
        .row()
        .text("❌ Dismiss QR", "action_dismiss_msg");

      await ctx.replyWithPhoto(new InputFile(qrBuffer, "deposit-qr.png"), {
        caption:
          `┌───「 📥 <b>DEPOSIT TO DEV VAULT</b> 」───\n` +
          `│ 🌐 <b>Network</b> : Ethereum Mainnet (ERC-20)\n` +
          `│ ⛓️ <b>Chain ID</b>: 1\n` +
          `└───────────────────────────────\n\n` +
          `💳 <b>Your Ethereum Deposit Address:</b>\n` +
          `<code>${address}</code> <i>(Tap to copy)</i>\n\n` +
          `• <b>Accepted Assets:</b> ETH, WETH, USDC\n` +
          `• <b>Recommended Balance:</b> <code>0.002 ETH (~$5)</code>\n\n` +
          `<i>Deposits are credited as soon as the Ethereum block confirms.</i>`,
        parse_mode: "HTML",
        reply_markup: qrKeyboard,
      });
    } catch (err: unknown) {
      logger.error(`Error generating QR code: ${(err as Error).message}`);
      await ctx.reply(
        `💳 <b>Deposit Address:</b>\n<code>${address}</code>\n\nSend ETH on Ethereum Mainnet (Chain ID: 1).`,
        { parse_mode: "HTML" }
      );
    }
  }

  /**
   * Exports private key with 60-second self-destruct timer
   */
  public static async handleExportKey(ctx: BotContext) {
    const userId = BigInt(ctx.from!.id);
    const { address } = await walletService.getUserData(userId);

    if (!address) {
      await ctx.reply("❌ Dev Vault not found.");
      return;
    }

    try {
      const privateKey = await walletService.getDecryptedPrivateKey(userId);
      const { solAddress, solPrivateKeyBase58 } =
        deriveSolanaWalletFromEvmKey(privateKey);

      const dismissKeyboard = new InlineKeyboard().text(
        "❌ Delete Message",
        "action_dismiss_msg"
      );

      const warningMsg = await ctx.reply(
        `┌───「 🔑 <b>PRIVATE KEY EXPORT</b> 」───\n` +
          `│ ⚠️ <b>CONFIDENTIAL CREDENTIALS</b>\n` +
          `└───────────────────────────────\n\n` +
          `🔷 <b>EVM Private Key (ETH / Base / BNB / Robinhood — MetaMask):</b>\n` +
          `<code>${privateKey}</code>\n\n` +
          `🟣 <b>Paired Solana Address (Pangea Creator Vault):</b>\n` +
          `<code>${solAddress}</code>\n\n` +
          `🟣 <b>Solana Private Key (Import to Phantom / Solflare):</b>\n` +
          `<code>${solPrivateKeyBase58}</code>\n\n` +
          `⚠️ <b>SECURITY NOTICE:</b>\n` +
          `• Do not share these private keys with anyone.\n` +
          `• These keys grant 100% custody of your EVM &amp; Solana Creator Vaults.\n` +
          `• This message will automatically delete in <b>60 seconds</b>.`,
        { parse_mode: "HTML", reply_markup: dismissKeyboard }
      );

      const chatId = ctx.chat!.id;
      const messageId = warningMsg.message_id;

      setTimeout(async () => {
        try {
          await ctx.api.deleteMessage(chatId, messageId);
        } catch {}
      }, 60_000);
    } catch (err: unknown) {
      logger.error(
        `Failed to export key for user ${userId}: ${(err as Error).message}`
      );
      await ctx.reply("❌ Error retrieving private key.");
    }
  }
}
