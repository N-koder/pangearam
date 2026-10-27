import { Context, InlineKeyboard } from "grammy";
import { isAddress, getAddress } from "viem";
import { BotConversation, BotContext } from "../types";
import { walletService, ETH_APPROX_USD } from "../../services/wallet.service";
import { CoinsHandler } from "../handlers/coins.handler";
import { WalletHandler } from "../handlers/wallet.handler";
import { StartHandler } from "../handlers/start.handler";
import { TrendingHandler } from "../handlers/trending.handler";
import prisma from "../../db/client";
import { logger } from "../../utils/logger";
import { formatEth, escapeHtml } from "../../utils/formatters";

export async function withdrawWizard(conversation: BotConversation, ctx: Context) {
  const userId = BigInt(ctx.from!.id);
  const username = ctx.from?.username
    ? `@${ctx.from.username}`
    : ctx.from?.first_name || "User";

  logger.withdraw(`User ${username} (${userId}) opened ETH withdrawal wizard.`);

  const userData = await conversation.external(() =>
    walletService.getUserData(userId, false, {
      username: ctx.from?.username,
      firstName: ctx.from?.first_name,
    })
  );

  if (!userData || !userData.address) {
    await ctx.reply("❌ Dev Vault not found. Please type /start to initialize your account.");
    return;
  }

  const wallet = { address: userData.address };

  const balances = await conversation.external(() =>
    walletService.getBalances(wallet.address as `0x${string}`, false)
  );

  const ethNum = parseFloat(balances.eth);
  const approxUsd = (ethNum * ETH_APPROX_USD).toFixed(2);
  const estimatedGasReserve = 0.0008;

  if (ethNum <= estimatedGasReserve) {
    const depositKb = new InlineKeyboard()
      .text("📥 Deposit ETH", "action_deposit")
      .text("🏠 Main Menu", "action_back_main");

    await ctx.reply(
      `┌───「 ⚠️ <b>INSUFFICIENT ETH BALANCE</b> 」───\n` +
        `│ 💳 <b>Dev Vault</b> : <code>${wallet.address}</code>\n` +
        `│ 💰 <b>Balance</b>   : <b>${formatEth(balances.eth)} ETH</b> (~$${approxUsd} USD)\n` +
        `└───────────────────────────────\n\n` +
        `To withdraw, your Dev Vault requires at least <b>${estimatedGasReserve} ETH</b> to cover Ethereum Mainnet transfer gas.`,
      { parse_mode: "HTML", reply_markup: depositKb }
    );
    return;
  }

  const maxSendableEth = Math.max(0, ethNum - estimatedGasReserve);
  const step1Keyboard = new InlineKeyboard().text("❌ Cancel", "withdraw_cancel");

  await ctx.reply(
    `┌───「 📤 <b>WITHDRAW ETH</b> 」───\n` +
      `│ 🌐 <b>Network</b>    : Ethereum Mainnet (Chain ID: 1)\n` +
      `│ 💳 <b>Dev Vault</b>  : <code>${wallet.address}</code>\n` +
      `│ 💰 <b>Available</b>  : <b>${formatEth(balances.eth)} ETH</b> (~$${approxUsd} USD)\n` +
      `│ ⛽ <b>Gas Buffer</b> : ~${estimatedGasReserve} ETH\n` +
      `└───────────────────────────────\n\n` +
      `📍 <b>STEP 1 OF 2: RECIPIENT ADDRESS</b>\n` +
      `Paste your destination Ethereum (0x...) address below:`,
    { parse_mode: "HTML", reply_markup: step1Keyboard }
  );

  let recipientAddress = "";
  while (true) {
    const input = await conversation.waitFor(["message:text", "callback_query:data"]);

    if (input.callbackQuery) {
      await input.answerCallbackQuery().catch(() => {});
      const data = input.callbackQuery.data;

      if (data === "withdraw_cancel") {
        await ctx.reply("🚫 Withdrawal cancelled.");
        return;
      }
      if (data === "action_coins") {
        await CoinsHandler.listUserCoins(input as unknown as BotContext, false);
        return;
      }
      if (data === "action_wallet") {
        await WalletHandler.handleBalance(input as unknown as BotContext, false);
        return;
      }
      if (data === "action_back_main") {
        await StartHandler.handleStart(input as unknown as BotContext, false);
        return;
      }
      if (data === "action_trending") {
        await TrendingHandler.handleTrending(input as unknown as BotContext, false);
        return;
      }
      if (data?.startsWith("action_")) {
        return;
      }
      continue;
    }

    const text = input.message!.text!.trim();
    if (text.startsWith("/")) {
      await ctx.reply("🚫 Withdrawal cancelled.");
      return;
    }

    const clean = text.replace(/^ethereum:/i, "").replace(/[`'"]/g, "").trim();
    if (!isAddress(clean, { strict: false })) {
      await ctx.reply(
        `⚠️ <b>Invalid Ethereum Address</b>\n\nPlease enter a valid 42-character <code>0x...</code> address:`,
        { parse_mode: "HTML", reply_markup: step1Keyboard }
      );
      continue;
    }

    try {
      recipientAddress = getAddress(clean);
    } catch {
      recipientAddress = clean;
    }
    break;
  }

  const pct25 = (maxSendableEth * 0.25).toFixed(4);
  const pct50 = (maxSendableEth * 0.5).toFixed(4);
  const pct75 = (maxSendableEth * 0.75).toFixed(4);
  const pct100 = maxSendableEth.toFixed(4);

  const amountKeyboard = new InlineKeyboard()
    .text(`25% (${pct25} ETH)`, "withdraw_pct_25")
    .text(`50% (${pct50} ETH)`, "withdraw_pct_50")
    .row()
    .text(`75% (${pct75} ETH)`, "withdraw_pct_75")
    .text(`100% Max (${pct100} ETH)`, "withdraw_pct_100")
    .row()
    .text("✏️ Custom Amount", "withdraw_pct_custom")
    .text("❌ Cancel", "withdraw_cancel");

  await ctx.reply(
    `┌───「 📤 <b>WITHDRAW ETH</b> 」───\n` +
      `│ 📍 <b>STEP 2 OF 2: SELECT AMOUNT</b>\n` +
      `│ 💰 <b>Total Balance</b> : <b>${formatEth(balances.eth)} ETH</b>\n` +
      `│ 🎯 <b>Max Sendable</b>  : <b>${pct100} ETH</b>\n` +
      `│ 📥 <b>Destination</b>   : <code>${recipientAddress}</code>\n` +
      `└───────────────────────────────\n\n` +
      `<i>Select a percentage below or type a custom ETH amount:</i>`,
    { parse_mode: "HTML", reply_markup: amountKeyboard }
  );

  let finalAmountEth = "";
  let isMaxWithdrawal = false;

  while (true) {
    const input = await conversation.waitFor(["message:text", "callback_query:data"]);

    if (input.callbackQuery) {
      await input.answerCallbackQuery().catch(() => {});
      const data = input.callbackQuery.data;

      if (data === "withdraw_cancel") {
        await ctx.reply("🚫 Withdrawal cancelled.");
        return;
      }
      if (data === "action_coins") {
        await CoinsHandler.listUserCoins(input as unknown as BotContext, false);
        return;
      }
      if (data === "action_wallet") {
        await WalletHandler.handleBalance(input as unknown as BotContext, false);
        return;
      }
      if (data === "action_back_main") {
        await StartHandler.handleStart(input as unknown as BotContext, false);
        return;
      }
      if (data === "action_trending") {
        await TrendingHandler.handleTrending(input as unknown as BotContext, false);
        return;
      }
      if (data?.startsWith("action_")) {
        return;
      }

      if (data === "withdraw_pct_25") {
        finalAmountEth = pct25;
        break;
      } else if (data === "withdraw_pct_50") {
        finalAmountEth = pct50;
        break;
      } else if (data === "withdraw_pct_75") {
        finalAmountEth = pct75;
        break;
      } else if (data === "withdraw_pct_100") {
        finalAmountEth = pct100;
        isMaxWithdrawal = true;
        break;
      } else if (data === "withdraw_pct_custom") {
        await ctx.reply(
          `✏️ Enter the exact amount of ETH to withdraw (up to ${pct100} ETH):`,
          { parse_mode: "HTML" }
        );
        continue;
      }
      continue;
    }

    const text = input.message!.text!.trim();
    if (text.startsWith("/")) {
      await ctx.reply("🚫 Withdrawal cancelled.");
      return;
    }

    if (text.toLowerCase() === "all" || text.toLowerCase() === "max") {
      finalAmountEth = pct100;
      isMaxWithdrawal = true;
      break;
    }

    const parsed = parseFloat(text);
    if (isNaN(parsed) || parsed <= 0 || parsed > maxSendableEth) {
      await ctx.reply(
        `⚠️ Please enter a valid ETH amount between 0.0001 and ${pct100} ETH:`,
        { parse_mode: "HTML" }
      );
      continue;
    }

    finalAmountEth = parsed.toString();
    break;
  }

  const sendUsd = (parseFloat(finalAmountEth) * ETH_APPROX_USD).toFixed(2);
  const confirmKeyboard = new InlineKeyboard()
    .text("🚀 Confirm & Broadcast", "withdraw_confirm_execute")
    .row()
    .text("❌ Cancel", "withdraw_confirm_cancel");

  await ctx.reply(
    `┌───「 📋 <b>CONFIRM ETH WITHDRAWAL</b> 」───\n` +
      `│ 🌐 <b>Network</b>     : Ethereum Mainnet (1)\n` +
      `│ 💳 <b>From Vault</b>  : <code>${wallet.address}</code>\n` +
      `│ 📥 <b>Destination</b> : <code>${recipientAddress}</code>\n` +
      `│ 💰 <b>Amount</b>      : <b>${finalAmountEth} ETH</b> (~$${sendUsd} USD)\n` +
      `└───────────────────────────────\n\n` +
      `<i>Confirm below to sign and broadcast this transfer on Ethereum.</i>`,
    { parse_mode: "HTML", reply_markup: confirmKeyboard }
  );

  const confirmChoice = await conversation.waitForCallbackQuery(/^withdraw_confirm_/);
  await confirmChoice.answerCallbackQuery().catch(() => {});

  if (confirmChoice.callbackQuery.data === "withdraw_confirm_cancel") {
    await ctx.reply("🚫 Withdrawal cancelled.");
    return;
  }

  const statusMsg = await ctx.reply(
    "⏳ <b>Broadcasting ETH transfer to Ethereum Mainnet...</b>",
    { parse_mode: "HTML" }
  );

  const result = await conversation.external(() =>
    walletService.withdrawEth({
      userId,
      recipientAddress,
      amountEth: finalAmountEth,
      isMax: isMaxWithdrawal,
    })
  );

  if (result.success && result.txHash) {
    const etherscanUrl = `https://etherscan.io/tx/${result.txHash}`;
    const sentAmount = result.sentAmount || finalAmountEth;
    const completionKeyboard = new InlineKeyboard()
      .text("👛 Wallet", "action_wallet")
      .text("🏠 Main Menu", "action_back_main");

    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `┌───「 ✅ <b>WITHDRAWAL CONFIRMED</b> 」───\n` +
        `│ 💰 <b>Amount Sent</b> : <b>${sentAmount} ETH</b>\n` +
        `│ 📥 <b>Destination</b> : <code>${recipientAddress}</code>\n` +
        `└───────────────────────────────\n\n` +
        `🔗 <a href="${etherscanUrl}"><b>View Transaction on Etherscan ↗</b></a>`,
      {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: completionKeyboard,
      }
    );
  } else {
    const failKeyboard = new InlineKeyboard()
      .text("🔄 Try Again", "action_withdraw")
      .text("👛 Wallet", "action_wallet");

    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `❌ <b>Withdrawal Notice:</b> ${escapeHtml(
        result.error || "Transaction failed on Ethereum."
      )}`,
      {
        parse_mode: "HTML",
        reply_markup: failKeyboard,
      }
    );
  }
}
