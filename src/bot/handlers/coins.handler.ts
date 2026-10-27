import { InlineKeyboard } from "grammy";
import { BotContext } from "../types";
import { blockchainService } from "../../services/blockchain.service";
import { walletService } from "../../services/wallet.service";
import { PLATFORM_SPECS, LaunchPlatform } from "../../services/platform.service";
import { escapeHtml, deriveSolanaOftMint } from "../../utils/formatters";
import prisma from "../../db/client";

export class CoinsHandler {
  private static coinsTextCache = new Map<
    string,
    { text: string; keyboard: InlineKeyboard; timestamp: number }
  >();
  private static readonly COINS_CACHE_TTL_MS = 15_000;

  public static invalidateCoinsCache(userId: bigint) {
    this.coinsTextCache.delete(userId.toString());
  }

  /**
   * Lists all tokens deployed by the user across Stockereum, Sender.family, and Programmable ($V4),
   * with 0ms RAM cache fast-path for brutal button spamming.
   */
  public static async listUserCoins(ctx: BotContext, edit: boolean = true) {
    const userId = BigInt(ctx.from!.id);
    const userKey = userId.toString();

    // Fast-path 1: Check 0ms RAM user cache if user has 0 deployed coins
    const userData = await walletService.getUserData(userId, false, {
      username: ctx.from?.username,
      firstName: ctx.from?.first_name,
    });

    if (!userData.address) {
      await ctx.reply("❌ Please initialize your wallet with /start first.");
      return;
    }

    if (userData.launchCount === 0) {
      const emptyKeyboard = new InlineKeyboard()
        .text("🚀 Launch Your First Token", "action_launch")
        .row()
        .text("🏠 Main Menu", "action_back_main");

      const emptyText =
        `┌───「 🌕 <b>MY DEPLOYED PANGEA TOKENS</b> 」───\n` +
        `│ 🌐 <b>Active Vault</b>: 0 Deployed Tokens\n` +
        `└──────────────────────────────────────\n\n` +
        `You have not deployed any Omnichain tokens on Pangea yet.\n\n` +
        `🌍 <b>Pangea.trade ($PANGEA) • 5-Chain Omnichain V4:</b>\n` +
        `• Simultaneous 5-Chain Launch (Ethereum, Base, Solana, BNB Chain, Robinhood)\n` +
        `• 5,000,000,000 Fixed Supply • LayerZero V2 OFT • Signature <code>...6ea</code> Vanity CAs\n` +
        `• 0.3%–5.0% Immutable Swap Fee (80% Creator Share directly to your Dev Vault)\n` +
        `• Pair with Crypto (<code>SPX6900</code>, <code>ETH</code>, <code>USDC</code>, <code>USDT</code>, <code>PEPE</code>, <code>$PANGEA</code>), Stocks, or ANY ERC-20!\n\n` +
        `<i>Tap Launch below to deploy your first Pangea token:</i>`;

      if (edit && ctx.callbackQuery) {
        try {
          await ctx.editMessageText(emptyText, {
            parse_mode: "HTML",
            reply_markup: emptyKeyboard,
          });
          return;
        } catch {
          return;
        }
      }

      await ctx.reply(emptyText, {
        parse_mode: "HTML",
        reply_markup: emptyKeyboard,
      });
      return;
    }

    // Fast-path 2: Check 15s rendered coins cache to prevent DB/RPC choke on rapid clicks
    const cachedRender = this.coinsTextCache.get(userKey);
    if (cachedRender && Date.now() - cachedRender.timestamp < this.COINS_CACHE_TTL_MS) {
      if (edit && ctx.callbackQuery) {
        try {
          await ctx.editMessageText(cachedRender.text, {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
            reply_markup: cachedRender.keyboard,
          });
          return;
        } catch {
          return;
        }
      }
      await ctx.reply(cachedRender.text, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: cachedRender.keyboard,
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        wallet: true,
        launches: {
          where: { platform: "pangea" },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!user || !user.wallet) {
      await ctx.reply("❌ Please initialize your wallet with /start first.");
      return;
    }

    const creatorAddress = user.wallet.address as `0x${string}`;

    // Parallel Multicall3 query for all user tokens simultaneously
    const claimableFees = await Promise.all(
      user.launches.map(async (launch) => {
        try {
          return await blockchainService.getClaimableCreatorFees(
            launch.tokenAddress as `0x${string}`,
            creatorAddress
          );
        } catch {
          return "0.0000";
        }
      })
    );

    let responseText =
      `┌───「 🌕 <b>MY DEPLOYED TOKENS</b> 」───\n` +
      `│ 🌐 <b>Active Vault</b>: <b>${user.launches.length} Deployed Tokens</b>\n` +
      `│ ⛓️ <b>Network</b>     : Ethereum Mainnet (Chain ID: 1)\n` +
      `└───────────────────────────────\n\n`;

    const keyboard = new InlineKeyboard();

    for (let i = 0; i < user.launches.length; i++) {
      const launch = user.launches[i];
      const claimableFee = claimableFees[i] || "0.0000";
      const platform = (launch.platform || "pangea") as LaunchPlatform;
      const spec = PLATFORM_SPECS[platform] || PLATFORM_SPECS.pangea;
      const platformUrl = spec.getExplorerUrl(launch.tokenAddress, launch.poolAddress);
      const uniswapUrl = `https://app.uniswap.org/swap?chain=mainnet&outputCurrency=${launch.tokenAddress}`;
      const etherscanUrl = `https://etherscan.io/token/${launch.tokenAddress}`;
      const num = (i + 1).toString().padStart(2, "0");

      if (platform === "pangea") {
        const solMint = deriveSolanaOftMint(launch.tokenAddress);
        const basescanUrl = `https://basescan.org/token/${launch.tokenAddress}`;
        const bscscanUrl = `https://bscscan.com/token/${launch.tokenAddress}`;
        const solscanUrl = `https://solscan.io/token/${solMint}`;
        responseText +=
          `┌─ <b>[#${num}] ${escapeHtml(launch.name)}</b> (<code>$${escapeHtml(launch.symbol)}</code>)\n` +
          `│  ├─ 🏷️ <b>Protocol</b>   : <b>${spec.badge}</b> · Pair: ${escapeHtml(launch.quoteTokenSymbol)}\n` +
          `│  ├─ 🔷 <b>ETH/Base/BNB/RH CA</b>: <code>${launch.tokenAddress}</code>\n` +
          `│  ├─ 🟣 <b>Solana OFT Mint</b>   : <code>${solMint}</code>\n` +
          `│  ├─ 💰 <b>Claimable</b>  : <b>${claimableFee} ${escapeHtml(launch.quoteTokenSymbol)}</b>\n` +
          `│  └─ 🔗 <b>Explorers</b>  : <a href="${platformUrl}">Pangea</a> · <a href="${etherscanUrl}">ETH</a> · <a href="${basescanUrl}">Base</a> · <a href="${bscscanUrl}">BNB</a> · <a href="${solscanUrl}">Solana</a>\n\n`;
      } else {
        responseText +=
          `┌─ <b>[#${num}] ${escapeHtml(launch.name)}</b> (<code>$${escapeHtml(launch.symbol)}</code>)\n` +
          `│  ├─ 📄 <b>CA</b>        : <code>${launch.tokenAddress}</code>\n` +
          `│  ├─ 🏷️ <b>Protocol</b>  : <b>${spec.badge}</b> · Pair: ${escapeHtml(launch.quoteTokenSymbol)}\n` +
          `│  ├─ 💰 <b>Claimable</b> : <b>${claimableFee} ${escapeHtml(launch.quoteTokenSymbol)}</b>\n` +
          `│  └─ 🔗 <b>Links</b>     : <a href="${platformUrl}">Launchpad</a> · <a href="${uniswapUrl}">Uniswap V4</a> · <a href="${etherscanUrl}">Etherscan</a>\n\n`;
      }

      keyboard
        .text(`💰 Claim Fees: $${launch.symbol}`, `claim_${launch.tokenAddress}`)
        .row();
    }

    responseText += `────────────────────────────────`;

    keyboard.text("🚀 Launch Another Token", "action_launch").row();
    keyboard.text("🏠 Main Menu", "action_back_main");

    this.coinsTextCache.set(userKey, {
      text: responseText,
      keyboard,
      timestamp: Date.now(),
    });

    if (edit && ctx.callbackQuery) {
      try {
        await ctx.editMessageText(responseText, {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
          reply_markup: keyboard,
        });
        return;
      } catch {
        return;
      }
    }

    await ctx.reply(responseText, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard,
    });
  }

  /**
   * Triggers on-chain creator fee harvest
   */
  public static async handleClaimFees(ctx: BotContext, tokenAddress: string) {
    const userId = BigInt(ctx.from!.id);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true },
    });

    if (!user || !user.wallet) return;

    try {
      const privateKey = await walletService.getDecryptedPrivateKey(userId);
      const result = await blockchainService.claimCreatorFees(
        privateKey,
        tokenAddress as `0x${string}`
      );

      if (result.success && result.txHash) {
        await ctx.reply(
          `✅ <b>Creator Fees Claimed</b>\n\nTransaction: <a href="https://etherscan.io/tx/${result.txHash}"><code>${result.txHash}</code></a>`,
          { parse_mode: "HTML" }
        );
      } else {
        await ctx.reply(
          `ℹ️ <b>Fee Claim Notice:</b> ${escapeHtml(result.error || "No accrued fees currently available to claim.")}`,
          { parse_mode: "HTML" }
        );
      }
    } catch (err: unknown) {
      await ctx.reply(
        `❌ <b>Claim Error:</b> ${escapeHtml((err as Error).message)}`,
        { parse_mode: "HTML" }
      );
    }
  }
}
