import { InlineKeyboard } from "grammy";
import { BotContext } from "../types";
import { IndexerService } from "../../services/indexer.service";
import { escapeHtml, deriveSolanaOftMint } from "../../utils/formatters";

export class TrendingHandler {
  /**
   * Displays live & recent token launches across Pangea, Stockereum, Sender.family, and Programmable V4
   */
  public static async handleTrending(ctx: BotContext, edit: boolean = true) {
    const launches = await IndexerService.getRecentLaunches(6);

    const keyboard = new InlineKeyboard()
      .text("🔄 Refresh Feed", "action_trending_refresh")
      .text("🚀 Launch a Token", "action_launch")
      .row()
      .text("🏠 Main Menu", "action_back_main");

    let message =
      `┌───「 🔥 <b>LIVE ETHEREUM &amp; OMNICHAIN FEED</b> 」───\n` +
      `│ 🌍 Pangea V4 ⭐ · Stockereum · Sender · Programmable\n` +
      `└─────────────────────────────────────────\n\n`;

    launches.forEach((token, index) => {
      const num = (index + 1).toString().padStart(2, "0");
      const uniswapUrl = `https://app.uniswap.org/swap?chain=mainnet&outputCurrency=${token.tokenAddress}`;

      if (token.platform === "pangea") {
        const solMint = deriveSolanaOftMint(token.tokenAddress);
        const basescanUrl = `https://basescan.org/token/${token.tokenAddress}`;
        const bscscanUrl = `https://bscscan.com/token/${token.tokenAddress}`;
        const solscanUrl = `https://solscan.io/token/${solMint}`;
        message +=
          `┌─ <b>[#${num}] ${escapeHtml(token.name)}</b> (<code>$${escapeHtml(token.symbol)}</code>)\n` +
          `│  ├─ 🏷️ <b>Launchpad</b>   : <b>${escapeHtml(token.platformBadge)}</b> · Pair: ${escapeHtml(token.quoteTokenSymbol)}\n` +
          `│  ├─ 🔷 <b>EVM CA (ETH/Base/BNB/RH)</b>: <code>${token.tokenAddress}</code>\n` +
          `│  ├─ 🟣 <b>Solana OFT Mint</b>         : <code>${solMint}</code>\n` +
          `│  └─ 🔗 <b>Explore</b>     : <a href="${token.platformUrl}">Pangea</a> · <a href="${token.etherscanTokenUrl}">ETH</a> · <a href="${basescanUrl}">Base</a> · <a href="${bscscanUrl}">BNB</a> · <a href="${solscanUrl}">Solana</a>\n\n`;
      } else {
        message +=
          `┌─ <b>[#${num}] ${escapeHtml(token.name)}</b> (<code>$${escapeHtml(token.symbol)}</code>)\n` +
          `│  ├─ 🏷️ <b>Launchpad</b> : <b>${escapeHtml(token.platformBadge)}</b>\n` +
          `│  ├─ 🪙 <b>Quote Pair</b>: ${escapeHtml(token.quoteTokenSymbol)}\n` +
          `│  ├─ 📄 <b>Contract</b>  : <code>${token.tokenAddress}</code>\n` +
          `│  └─ 🔗 <b>Explore</b>   : <a href="${token.platformUrl}">Official App</a> · <a href="${uniswapUrl}">Uniswap V4</a> · <a href="${token.etherscanTokenUrl}">Etherscan</a>\n\n`;
      }
    });

    message += `──────────────────────────────────`;

    if (edit && ctx.callbackQuery) {
      try {
        await ctx.editMessageText(message, {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
          reply_markup: keyboard,
        });
        return;
      } catch {
        return;
      }
    }

    await ctx.reply(message, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard,
    });
  }
}
