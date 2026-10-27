import { Context, InlineKeyboard } from "grammy";
import { HookProfile, LaunchpadPlatform } from "@prisma/client";
import { isAddress, getAddress, type Address } from "viem";
import { BotConversation, BotContext } from "../types";
import {
  blockchainService,
  SenderDisperseEntry,
} from "../../services/blockchain.service";
import { ImageService } from "../../services/image.service";
import { CryptoService } from "../../services/crypto.service";
import { walletService } from "../../services/wallet.service";
import {
  platformService,
  PLATFORM_SPECS,
  LaunchPlatform,
} from "../../services/platform.service";
import { IndexerService } from "../../services/indexer.service";
import {
  CONTRACT_ADDRESSES,
  STOKERIUM_ASSET_PAIRS,
  UNISWAP_V4_HOOK_PROFILES,
  SyntheticAssetPair,
} from "../../config/contracts";
import { CoinsHandler } from "../handlers/coins.handler";
import { WalletHandler } from "../handlers/wallet.handler";
import { StartHandler } from "../handlers/start.handler";
import { TrendingHandler } from "../handlers/trending.handler";
import { AdminHandler } from "../handlers/admin.handler";
import prisma from "../../db/client";
import { logger } from "../../utils/logger";
import {
  formatEth,
  escapeHtml,
  formatPangeaMultichainCas,
} from "../../utils/formatters";

/**
 * Helper to intercept external navigation button clicks inside wizard wait loops
 * so users are never trapped inside an active wizard.
 */
async function handleExternalNavigation(ctx: Context, data: string): Promise<boolean> {
  const botCtx = ctx as unknown as BotContext;
  if (data === "action_coins") {
    await CoinsHandler.listUserCoins(botCtx, false);
    return true;
  }
  if (data === "action_wallet") {
    await WalletHandler.handleBalance(botCtx, false);
    return true;
  }
  if (data === "action_deposit") {
    await WalletHandler.handleDeposit(botCtx);
    return true;
  }
  if (data === "action_export_key") {
    await WalletHandler.handleExportKey(botCtx);
    return true;
  }
  if (data === "action_back_main") {
    await StartHandler.handleStart(botCtx, false);
    return true;
  }
  if (data === "action_trending") {
    await TrendingHandler.handleTrending(botCtx, false);
    return true;
  }
  if (data === "action_profile") {
    await StartHandler.handleProfile(botCtx);
    return true;
  }
  if (data.startsWith("action_select_platform_")) {
    const targetPlatform = data.replace(
      "action_select_platform_",
      ""
    ) as LaunchPlatform;
    if (ctx.from) {
      await platformService.setPlatform(ctx.from.id, targetPlatform);
    }
    await StartHandler.handleStart(botCtx, true);
    return true;
  }
  if (data.startsWith("action_")) {
    await StartHandler.handleStart(botCtx, false);
    return true;
  }
  return false;
}

/**
 * Builds the comprehensive Quote Pair Keyboard (ETH, USDC, PEPE, Native Platform Token, and Ondo Tokenized Stocks)
 * supported across Pangea.trade, Stockereum.com, Sender.family, and Programmable.market
 */
function buildQuotePairKeyboard(
  platform: LaunchPlatform,
  tab: "crypto" | "stocks" = "crypto"
): InlineKeyboard {
  const nativeTokenBtn =
    platform === "pangea"
      ? { label: "🌍 PANGEA ($PANGEA)", key: "PANGEA" }
      : platform === "stokerium"
      ? { label: "🏛️ STOCKER ($STOCKER)", key: "STOCKER" }
      : platform === "sender"
      ? { label: "📡 SEND ($SEND)", key: "SEND" }
      : { label: "🦄 V4 ($V4)", key: "V4" };

  const kb = new InlineKeyboard();

  if (tab === "crypto") {
    kb.text("🔘 🪙 CRYPTO PAIRS", "tab_noop")
      .text("⚪ 🏛️ STOCKS & RWAs ➔", "tab_pair_stocks")
      .row()
      .text("💹 SPX6900 ($SPX)", "pair_sel_SPX")
      .text("Ξ ETH (Native / WETH)", "pair_sel_ETH")
      .row()
      .text("💵 USDC", "pair_sel_USDC")
      .text("💵 USDT", "pair_sel_USDT")
      .row()
      .text("🐸 PEPE", "pair_sel_PEPE")
      .text("₿ WBTC", "pair_sel_WBTC")
      .row()
      .text("🐕 SHIB", "pair_sel_SHIB")
      .text("😹 MOG", "pair_sel_MOG")
      .row()
      .text("🔗 LINK (Chainlink)", "pair_sel_LINK")
      .text(nativeTokenBtn.label, `pair_sel_${nativeTokenBtn.key}`)
      .row()
      .text("🏛️ View Tokenized Stocks Tab ➔", "tab_pair_stocks")
      .row()
      .text("✕ Cancel", "cancel_launch");
  } else {
    kb.text("⚪ 🪙 CRYPTO PAIRS ➔", "tab_pair_crypto")
      .text("🔘 🏛️ STOCKS & RWAs", "tab_noop")
      .row()
      .text("🏛️ NVDAon (NVIDIA)", "pair_sel_NVDAon")
      .text("🏛️ TSLAon (Tesla)", "pair_sel_TSLAon")
      .row()
      .text("🏛️ AAPLon (Apple)", "pair_sel_AAPLon")
      .text("🚀 SPCXon (SpaceX)", "pair_sel_SPCXon")
      .row()
      .text("🏛️ MSFTon (Microsoft)", "pair_sel_MSFTon")
      .text("🏛️ AMZNon (Amazon)", "pair_sel_AMZNon")
      .row()
      .text("🏛️ GOOGLon (Google)", "pair_sel_GOOGLon")
      .text("🏛️ METAon (Meta)", "pair_sel_METAon")
      .row()
      .text("🏛️ MSTRon (MicroStrategy)", "pair_sel_MSTRon")
      .text("🏛️ COINon (Coinbase)", "pair_sel_COINon")
      .row()
      .text("🏛️ PLTRon (Palantir)", "pair_sel_PLTRon")
      .text("🏛️ AMDon (AMD)", "pair_sel_AMDon")
      .row()
      .text("🏛️ GMEon (GameStop)", "pair_sel_GMEon")
      .text("🏛️ HOODon (Robinhood)", "pair_sel_HOODon")
      .row()
      .text("📊 SPYon (S&P 500)", "pair_sel_SPYon")
      .text("📊 QQQon (Nasdaq 100)", "pair_sel_QQQon")
      .row()
      .text("🥇 GLDon (Gold RWA)", "pair_sel_GLDon")
      .text("🥈 SLVon (Silver RWA)", "pair_sel_SLVon")
      .row()
      .text("🪙 View Crypto Pairs Tab ➔", "tab_pair_crypto")
      .row()
      .text("✕ Cancel", "cancel_launch");
  }

  return kb;
}

/**
 * Interactive prompt for Pair (Quote Asset) selection across all 4 launchpads
 */
async function promptPairSelection(
  conversation: BotConversation,
  ctx: Context,
  platform: LaunchPlatform,
  specName: string,
  tokenSymbol: string,
  stepLabel: string
): Promise<SyntheticAssetPair | null> {
  let currentTab: "crypto" | "stocks" = "crypto";
  const nativeSym =
    platform === "pangea"
      ? "PANGEA"
      : platform === "stokerium"
      ? "STOCKER"
      : platform === "sender"
      ? "SEND"
      : "V4";

  const getPromptText = (tab: "crypto" | "stocks") =>
    `🪙 <b>${escapeHtml(specName.toUpperCase())}</b>\n` +
    `${stepLabel} • Liquidity Pair (Quote Asset)\n\n` +
    `Select the asset to pair with <code>$${escapeHtml(tokenSymbol)}</code> in its permanent Uniswap V4 pool:\n\n` +
    (tab === "crypto"
      ? `<b>[ 🪙 CRYPTO PAIRS TAB ]</b> (Tap button to view Stocks)\n` +
        `• <b>Culture & Meme:</b> <code>SPX6900</code>, <code>PEPE</code>, <code>SHIB</code>, <code>MOG</code>\n` +
        `• <b>Core Crypto:</b> <code>ETH</code>, <code>USDC</code>, <code>USDT</code>, <code>WBTC</code>, <code>LINK</code>, <code>$${nativeSym}</code>\n\n`
      : `<b>[ 🏛️ TOKENIZED STOCKS TAB ]</b> (Tap button to view Crypto)\n` +
        `• <b>Big Tech & AI:</b> <code>NVDAon</code>, <code>TSLAon</code>, <code>AAPLon</code>, <code>MSFTon</code>, <code>AMZNon</code>\n` +
        `• <b>Crypto Equities & Space:</b> <code>SPCXon</code>, <code>MSTRon</code>, <code>COINon</code>, <code>HOODon</code>\n` +
        `• <b>Indices & Metals:</b> <code>SPYon</code>, <code>QQQon</code>, <code>GLDon</code>, <code>SLVon</code>\n\n`) +
    `<i>💡 <b>Universal Pairing:</b> Tap any pair above, toggle tabs, type any ticker (e.g. <code>SPX</code>, <code>NVDA</code>), OR paste <b>ANY ERC-20 contract address</b> (e.g. <code>0x...</code>) to pair with any token on Ethereum!</i>`;

  const promptMsg = await ctx.reply(getPromptText(currentTab), {
    parse_mode: "HTML",
    reply_markup: buildQuotePairKeyboard(platform, currentTab),
  });

  while (true) {
    const upd = await conversation.waitFor(["callback_query:data", "message:text"]);
    if (upd.callbackQuery) {
      await upd.answerCallbackQuery().catch(() => {});
      const data = upd.callbackQuery.data;
      if (data === "cancel_launch") {
        await ctx.reply("🚫 Token launch cancelled.");
        return null;
      }
      if (await handleExternalNavigation(upd, data)) return null;

      // Handle Tab Switching (Crypto vs Stocks)
      if (data === "tab_pair_crypto") {
        currentTab = "crypto";
        await ctx.api
          .editMessageText(ctx.chat!.id, promptMsg.message_id, getPromptText("crypto"), {
            parse_mode: "HTML",
            reply_markup: buildQuotePairKeyboard(platform, "crypto"),
          })
          .catch(() => {});
        continue;
      }
      if (data === "tab_pair_stocks") {
        currentTab = "stocks";
        await ctx.api
          .editMessageText(ctx.chat!.id, promptMsg.message_id, getPromptText("stocks"), {
            parse_mode: "HTML",
            reply_markup: buildQuotePairKeyboard(platform, "stocks"),
          })
          .catch(() => {});
        continue;
      }
      if (data === "tab_noop") {
        continue;
      }

      if (data.startsWith("pair_sel_")) {
        const key = data.replace("pair_sel_", "");
        return STOKERIUM_ASSET_PAIRS[key] || STOKERIUM_ASSET_PAIRS.ETH;
      }
      continue;
    }

    const rawText = upd.message!.text!.trim();
    if (rawText.startsWith("/")) {
      await ctx.reply("🚫 Token launch cancelled.");
      return null;
    }

    // 1. Direct ERC-20 Contract Address Support (Pair with ANY token on Ethereum)
    if (isAddress(rawText)) {
      try {
        const tokenAddr = getAddress(rawText);
        // If already recognized in presets
        const existingKey = Object.keys(STOKERIUM_ASSET_PAIRS).find(
          (k) => STOKERIUM_ASSET_PAIRS[k].address.toLowerCase() === tokenAddr.toLowerCase()
        );
        if (existingKey) {
          const match = STOKERIUM_ASSET_PAIRS[existingKey];
          await ctx.reply(
            `✅ <b>Pair Selected:</b> <code>${escapeHtml(match.name)} ($${escapeHtml(match.symbol)})</code>\n` +
              `Contract: <code>${tokenAddr}</code>`,
            { parse_mode: "HTML" }
          );
          return match;
        }

        const waitNotice = await ctx.reply(
          `🔍 <i>Querying Ethereum Mainnet for ERC-20 token at <code>${tokenAddr}</code>...</i>`,
          { parse_mode: "HTML" }
        );

        const meta = await blockchainService.getErc20Metadata(tokenAddr);
        const dynamicPair: SyntheticAssetPair = {
          symbol: meta.symbol,
          name: meta.name,
          category: "core",
          address: tokenAddr,
          initialTick: -210000,
          badge: `🌐 ${meta.symbol}`,
        };

        await ctx.api.deleteMessage(ctx.chat!.id, waitNotice.message_id).catch(() => {});
        await ctx.reply(
          `✅ <b>Custom On-Chain Pair Confirmed!</b>\n` +
            `• <b>Token:</b> ${escapeHtml(meta.name)} (<code>$${escapeHtml(meta.symbol)}</code>)\n` +
            `• <b>Address:</b> <code>${tokenAddr}</code>\n` +
            `• <b>Decimals:</b> ${meta.decimals}`,
          { parse_mode: "HTML" }
        );
        return dynamicPair;
      } catch (err: unknown) {
        await ctx.reply(
          `⚠️ Could not fetch token at <code>${escapeHtml(rawText)}</code>: ${(err as Error).message}\n` +
            `Please verify the contract address on Etherscan, or select a preset pair below:`,
          { parse_mode: "HTML" }
        );
        continue;
      }
    }

    // 2. Ticker symbol input (e.g. SPX, SPX6900, NVDA, TSLA)
    const cleanTicker = rawText.replace(/[^a-zA-Z0-9.]/g, "");
    if (cleanTicker.length >= 2 && cleanTicker.length <= 14) {
      const upper = cleanTicker.toUpperCase();
      const exactMatch =
        STOKERIUM_ASSET_PAIRS[cleanTicker] ||
        STOKERIUM_ASSET_PAIRS[upper] ||
        STOKERIUM_ASSET_PAIRS[`${upper.replace(/ON$/i, "")}on`];
      if (exactMatch) {
        await ctx.reply(
          `✅ <b>Pair Selected:</b> <code>${escapeHtml(exactMatch.name)} ($${escapeHtml(exactMatch.symbol)})</code>`,
          { parse_mode: "HTML" }
        );
        return exactMatch;
      }
      const baseTicker = upper.replace(/(ON|X)$/i, "");
      const formattedSym = `${baseTicker}on`;
      return {
        symbol: formattedSym,
        name: `${baseTicker} (Ondo Tokenized Stock)`,
        category: "rwa_stock",
        address: STOKERIUM_ASSET_PAIRS.NVDAon.address,
        initialTick: -184200,
        badge: `🏛️ ${formattedSym}`,
      };
    }
  }
}

/**
 * Interactive prompt for First Buy (ETH amount) supporting preset buttons OR custom ETH input
 */
async function promptFirstBuyEth(
  conversation: BotConversation,
  ctx: Context,
  specName: string,
  tokenSymbol: string,
  stepLabel: string
): Promise<string | null> {
  const buyKb = new InlineKeyboard()
    .text("0 ETH (No First Buy)", "fbuy_0")
    .row()
    .text("0.01 ETH", "fbuy_0.01")
    .text("0.02 ETH", "fbuy_0.02")
    .text("0.05 ETH", "fbuy_0.05")
    .row()
    .text("0.10 ETH", "fbuy_0.10")
    .text("0.25 ETH", "fbuy_0.25")
    .text("0.50 ETH", "fbuy_0.50")
    .row()
    .text("✕ Cancel", "cancel_launch");

  await ctx.reply(
    `💰 <b>${escapeHtml(specName.toUpperCase())}</b>\n` +
      `${stepLabel} • First Buy (Initial ETH Allocation)\n\n` +
      `Choose how much ETH to allocate for your Block-0 First Buy of <code>$${escapeHtml(
        tokenSymbol
      )}</code>, or type a custom ETH amount (e.g., <code>0.03</code>):`,
    { parse_mode: "HTML", reply_markup: buyKb }
  );

  while (true) {
    const upd = await conversation.waitFor(["callback_query:data", "message:text"]);
    if (upd.callbackQuery) {
      await upd.answerCallbackQuery().catch(() => {});
      const data = upd.callbackQuery.data;
      if (data === "cancel_launch") {
        await ctx.reply("🚫 Token launch cancelled.");
        return null;
      }
      if (await handleExternalNavigation(upd, data)) return null;
      if (data.startsWith("fbuy_")) {
        return data.replace("fbuy_", "");
      }
      continue;
    }

    const raw = upd.message!.text!.trim();
    if (raw.startsWith("/")) {
      await ctx.reply("🚫 Token launch cancelled.");
      return null;
    }
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      return parsed.toString();
    }
    await ctx.reply("⚠️ Please tap a preset ETH amount or enter a valid number (e.g., 0.05):");
  }
}

export type LaunchIndexingMode = "LAUNCHPAD_INDEXED" | "DIRECT_ONCHAIN";

export interface IndexingModeSelection {
  mode: LaunchIndexingMode;
  modeLabel: string;
  launchpadFeeEth: number;
  estimatedTotalEth: string;
}

/**
 * Interactive prompt giving the creator a transparent choice between:
 * 1) Official Launchpad Display + Pool Seeding (lists on pangea.trade / stockereum.com / sender.family / programmable.market)
 * 2) Direct On-Chain Token Launch (standard network gas only, 100% supply to Dev Vault, live on Etherscan & Uniswap)
 */
async function promptLaunchIndexingMode(
  conversation: BotConversation,
  ctx: Context,
  platform: LaunchPlatform,
  specShortName: string,
  tokenSymbol: string,
  initialBuyEth: string,
  devVaultAddress: Address
): Promise<IndexingModeSelection | null> {
  const firstBuyNum = parseFloat(initialBuyEth) || 0;
  const baseGasEth = 0.0007;
  const launchpadSeedEth = platform === "pangea" ? 0.0012 : 0.001;

  const indexedTotal = (launchpadSeedEth + baseGasEth + firstBuyNum).toFixed(4);
  const directTotal = (baseGasEth + firstBuyNum).toFixed(4);

  const domainMap: Record<LaunchPlatform, string> = {
    pangea: "pangea.trade",
    stokerium: "stockereum.com",
    sender: "sender.family",
    programmable: "programmable.market",
  };
  const domain = domainMap[platform];

  const modeKb = new InlineKeyboard()
    .text(
      `🌐 Display on ${domain} + Seed Pool (~${indexedTotal} ETH)`,
      "idx_mode_LAUNCHPAD_INDEXED"
    )
    .row()
    .text(
      `⚡ Direct On-Chain Launch Only (~${directTotal} ETH)`,
      "idx_mode_DIRECT_ONCHAIN"
    )
    .row()
    .text("✕ Cancel", "cancel_launch");

  await ctx.reply(
    `⚖️ <b>DEPLOYMENT &amp; LAUNCHPAD DISPLAY MODE</b>\n\n` +
      `Choose how you want <code>$${escapeHtml(tokenSymbol)}</code> deployed:\n\n` +
      `1️⃣ <b>🌐 Official Launchpad Display (<code>${domain}</code>)</b>\n` +
      `├─ <b>Launchpad Pool Seeding:</b> <code>${launchpadSeedEth.toFixed(4)} ETH</code> (required by ${escapeHtml(specShortName)} to seed &amp; list on ${domain})\n` +
      `├─ <b>Network &amp; V4 Init Gas:</b> <code>~${baseGasEth.toFixed(4)} ETH</code>\n` +
      (firstBuyNum > 0
        ? `├─ <b>First Buy Allocation:</b> <code>${firstBuyNum.toFixed(4)} ETH</code>\n`
        : "") +
      `└─ <b>Total Required:</b> <b>~${indexedTotal} ETH</b>\n\n` +
      `2️⃣ <b>⚡ Direct On-Chain Launch (Standard Gas Only)</b>\n` +
      `├─ <b>Launchpad Pool Deposit:</b> <code>0.0000 ETH</code> (No ETH locked in third-party launchpad)\n` +
      `├─ <b>Network &amp; Contract Gas:</b> <code>~${baseGasEth.toFixed(4)} ETH</code>\n` +
      (firstBuyNum > 0
        ? `├─ <b>First Buy Allocation:</b> <code>${firstBuyNum.toFixed(4)} ETH</code>\n`
        : "") +
      `├─ <b>Total Required:</b> <b>~${directTotal} ETH</b>\n` +
      `└─ <i>Deploys 100% of supply to your Dev Vault; live on Etherscan, Uniswap &amp; Teleth Feed.</i>`,
    { parse_mode: "HTML", reply_markup: modeKb }
  );

  while (true) {
    const q = await conversation.waitFor("callback_query:data");
    await q.answerCallbackQuery().catch(() => {});
    const data = q.callbackQuery.data;

    if (data === "cancel_launch") {
      await ctx.reply("🚫 Token launch cancelled.");
      return null;
    }
    if (await handleExternalNavigation(q, data)) return null;

    if (data === "idx_mode_DIRECT_ONCHAIN") {
      const uLabel = ctx.from?.username
        ? `@${ctx.from.username} (${ctx.from.id})`
        : `${ctx.from?.first_name || "User"} (${ctx.from?.id})`;
      logger.wizard(
        uLabel,
        "Selected Deployment Mode",
        `⚡ Direct On-Chain Launch (~${directTotal} ETH)`
      );
      return {
        mode: "DIRECT_ONCHAIN",
        modeLabel: "⚡ Direct On-Chain V4 Launch (Etherscan & Uniswap)",
        launchpadFeeEth: 0,
        estimatedTotalEth: directTotal,
      };
    }

    if (data === "idx_mode_LAUNCHPAD_INDEXED") {
      const uLabel = ctx.from?.username
        ? `@${ctx.from.username} (${ctx.from.id})`
        : `${ctx.from?.first_name || "User"} (${ctx.from?.id})`;
      const balances = await conversation.external(() =>
        walletService.getBalances(devVaultAddress, true)
      );
      const currentBal = parseFloat(balances.eth) || 0;
      const neededNum = parseFloat(indexedTotal);

      if (currentBal < neededNum) {
        logger.wizard(
          uLabel,
          `Official ${specShortName} Pool Check`,
          `Balance ${formatEth(balances.eth)} ETH < Required ${indexedTotal} ETH (Prompted Fallback)`
        );
        const fallbackKb = new InlineKeyboard()
          .text(
            `⚡ Switch to Direct On-Chain Launch (~${directTotal} ETH)`,
            "idx_mode_DIRECT_ONCHAIN"
          )
          .row()
          .text("📥 View Deposit Address", "idx_deposit_info")
          .row()
          .text("✕ Cancel", "cancel_launch");

        await ctx.reply(
          `⚠️ <b>LAUNCHPAD POOL SEEDING BALANCE CHECK</b>\n\n` +
            `• <b>Selected Option:</b> 🌐 Official Display on <code>${domain}</code>\n` +
            `• <b>Required Total:</b> <code>${indexedTotal} ETH</code> (<code>${launchpadSeedEth.toFixed(4)} ETH</code> Launchpad Pool Seeding + <code>~${baseGasEth.toFixed(4)} ETH</code> Network Gas${firstBuyNum > 0 ? ` + ${firstBuyNum.toFixed(4)} ETH First Buy` : ""})\n` +
            `• <b>Your Dev Vault Balance:</b> <code>${formatEth(balances.eth)} ETH</code>\n\n` +
            `Listing directly on <code>${domain}</code> requires depositing <code>${launchpadSeedEth.toFixed(4)} ETH</code> into the protocol's pool seeding contract.\n\n` +
            `<i>You can switch to <b>⚡ Direct On-Chain Launch (~${directTotal} ETH)</b> right now, or deposit additional ETH into your Dev Vault:</i>`,
          { parse_mode: "HTML", reply_markup: fallbackKb }
        );
        continue;
      }

      return {
        mode: "LAUNCHPAD_INDEXED",
        modeLabel: `🌐 Official ${specShortName} Display (${domain}) + V4 Pool`,
        launchpadFeeEth: launchpadSeedEth,
        estimatedTotalEth: indexedTotal,
      };
    }

    if (data === "idx_deposit_info") {
      await ctx.reply(
        `📥 <b>Ethereum Deposit Address (Chain ID: 1):</b>\n<code>${devVaultAddress}</code>\n\n` +
          `Send ETH to your Dev Vault, then run <code>/launch</code> when ready.`,
        { parse_mode: "HTML" }
      );
      return null;
    }
  }
}

export async function launchWizard(conversation: BotConversation, ctx: Context) {
  const userId = BigInt(ctx.from!.id);

  // 0. Load user & Dev Vault from 0ms RAM cache (falls back to PostgreSQL only on cold miss)
  const userData = await conversation.external(() =>
    walletService.getUserData(userId, false, {
      username: ctx.from?.username,
      firstName: ctx.from?.first_name,
    })
  );

  if (!userData || !userData.address || !userData.encryptedKey) {
    await ctx.reply("Please initialize your Dev Vault first via /start.", {
      parse_mode: "HTML",
    });
    return;
  }

  const user = {
    wallet: {
      address: userData.address,
      encryptedKey: userData.encryptedKey,
    },
  };

  const platform: LaunchPlatform = "pangea";
  const spec = PLATFORM_SPECS.pangea;
  const totalSteps = 6;
  const userLabel = ctx.from?.username
    ? `@${ctx.from.username} (${ctx.from.id})`
    : `${ctx.from?.first_name || "User"} (${userId})`;

  logger.wizard(
    userLabel,
    `Entered Launch Wizard [${spec.shortName}]`,
    `Dev Vault: ${user.wallet.address}`
  );

  // Balance Verification
  const initialBalances = await conversation.external(() =>
    walletService.getBalances(user.wallet!.address as Address)
  );
  const currentEthNum = parseFloat(initialBalances.eth);
  const MIN_DEV_ETH = spec.minRecommendedEth;

  if (currentEthNum < MIN_DEV_ETH) {
    const insufficientKb = new InlineKeyboard()
      .text("🚀 Continue Setup", "dev_proceed")
      .row()
      .text("➕ Import Key", "dev_import")
      .text("📥 Deposit ETH", "dev_deposit")
      .row()
      .text("✕ Cancel", "cancel_launch");

    await ctx.reply(
      `ℹ️ <b>DEV VAULT BALANCE CHECK</b>\n\n` +
        `• <b>Active Protocol:</b> ${spec.badge}\n` +
        `• <b>Current Balance:</b> <code>${formatEth(initialBalances.eth)} ETH</code>\n` +
        `• <b>Recommended Gas Balance:</b> <code>~${MIN_DEV_ETH} ETH</code>\n\n` +
        `Deploying a fixed-supply token (1,000,000,000 supply) and opening its permanent Uniswap V4 market on Ethereum Mainnet requires standard network gas.\n\n` +
        `<i>You may fund your Dev Vault now or continue configuring your token parameters.</i>`,
      { parse_mode: "HTML", reply_markup: insufficientKb }
    );

    const warnChoice = await conversation.waitFor("callback_query:data");
    await warnChoice.answerCallbackQuery().catch(() => {});
    const warnData = warnChoice.callbackQuery.data;

    if (await handleExternalNavigation(warnChoice, warnData)) return;

    if (warnData === "cancel_launch") {
      await ctx.reply("🚫 Token launch cancelled.");
      return;
    }

    if (warnData === "dev_deposit") {
      await ctx.reply(
        `📥 <b>Ethereum Deposit Address (Chain ID: 1):</b>\n<code>${user.wallet.address}</code>\n\n` +
          `Send ETH to your Dev Vault, then run <code>/launch</code> when ready.`,
        { parse_mode: "HTML" }
      );
      return;
    }

    if (warnData === "dev_import") {
      await ctx.reply(
        `➕ Use <code>/import</code> or open 👛 Wallet → <b>➕ Import Key</b> to connect an existing wallet.`,
        { parse_mode: "HTML" }
      );
      return;
    }
  }

  // =========================================================================
  // STEP 1: TOKEN NAME
  // =========================================================================
  const cancelKb = new InlineKeyboard().text("✕ Cancel", "cancel_launch");

  await ctx.reply(
    `🪙 <b>TOKEN LAUNCH • ${spec.name.toUpperCase()}</b>\n` +
      `Protocol: <b>${spec.badge}</b> (Ethereum Chain ID: 1)\n` +
      `Step 1 of ${totalSteps} • Token Name\n\n` +
      `Enter the full name for your token (2–32 characters):\n\n` +
      `<i>Example:</i> <code>${
        platform === "pangea"
          ? "Pangea World Index"
          : platform === "stokerium"
          ? "Nvidia Stockereum"
          : platform === "sender"
          ? "Send It Guild"
          : "Programmable Pulse"
      }</code>`,
    { parse_mode: "HTML", reply_markup: cancelKb }
  );

  let tokenName = "";
  while (true) {
    const upd = await conversation.waitFor(["message:text", "callback_query:data"]);
    if (upd.callbackQuery) {
      await upd.answerCallbackQuery().catch(() => {});
      const data = upd.callbackQuery.data;
      if (data === "cancel_launch") {
        await ctx.reply("🚫 Token launch cancelled.");
        return;
      }
      if (await handleExternalNavigation(upd, data)) return;
      continue;
    }

    const rawName = upd.message!.text!.trim();
    if (rawName.startsWith("/")) {
      await ctx.reply("🚫 Token launch cancelled.");
      return;
    }
    if (rawName.length < 2 || rawName.length > 32) {
      await ctx.reply("⚠️ Token name must be between 2 and 32 characters. Please re-enter:");
      continue;
    }
    tokenName = rawName;
    logger.wizard(userLabel, "Step 1/6 Complete (Token Name)", tokenName);
    break;
  }

  // =========================================================================
  // STEP 2: TICKER SYMBOL
  // =========================================================================
  const supplyCaption =
    platform === "pangea"
      ? "5,000,000,000 Omnichain Total • 1B/Chain • 100% Locked LP"
      : "fixed supply: 1,000,000,000";

  await ctx.reply(
    `🏷️ <b>TOKEN LAUNCH • ${spec.shortName.toUpperCase()}</b>\n` +
      `Step 2 of ${totalSteps} • Ticker Symbol\n\n` +
      `Enter the ticker symbol for <b>${escapeHtml(tokenName)}</b> (2–10 characters, ${supplyCaption}):\n\n` +
      `<i>Example:</i> <code>${
        platform === "pangea"
          ? "PWRLD"
          : platform === "stokerium"
          ? "NVDAS"
          : platform === "sender"
          ? "SGLD"
          : "VPULSE"
      }</code>`,
    { parse_mode: "HTML", reply_markup: cancelKb }
  );

  let tokenSymbol = "";
  while (true) {
    const upd = await conversation.waitFor(["message:text", "callback_query:data"]);
    if (upd.callbackQuery) {
      await upd.answerCallbackQuery().catch(() => {});
      const data = upd.callbackQuery.data;
      if (data === "cancel_launch") {
        await ctx.reply("🚫 Token launch cancelled.");
        return;
      }
      if (await handleExternalNavigation(upd, data)) return;
      continue;
    }

    const rawSymbol = upd.message!.text!.trim();
    if (rawSymbol.startsWith("/")) {
      await ctx.reply("🚫 Token launch cancelled.");
      return;
    }
    const cleanSymbol = rawSymbol.replace(/[$]/g, "").toUpperCase();
    if (cleanSymbol.length < 2 || cleanSymbol.length > 10) {
      await ctx.reply("⚠️ Ticker symbol must be between 2 and 10 characters. Please re-enter:");
      continue;
    }
    tokenSymbol = cleanSymbol;
    logger.wizard(userLabel, "Step 2/6 Complete (Ticker Symbol)", `$${tokenSymbol}`);
    break;
  }

  // =========================================================================
  // STEP 3: TOKEN LOGO / ARTWORK
  // =========================================================================
  const imageStepKb = new InlineKeyboard()
    .text("⏭️ Use Default Protocol Logo", "skip_logo")
    .row()
    .text("✕ Cancel", "cancel_launch");

  await ctx.reply(
    `🖼️ <b>TOKEN LAUNCH • ${spec.shortName.toUpperCase()}</b>\n` +
      `Step 3 of ${totalSteps} • Token Artwork / Logo\n\n` +
      `Upload a photo for <b>${escapeHtml(tokenName)}</b> (<code>$${escapeHtml(tokenSymbol)}</code>), or tap <b>Use Default Protocol Logo</b> below.\n\n` +
      `<i>Images are automatically streamed and compressed to WebP.</i>`,
    { parse_mode: "HTML", reply_markup: imageStepKb }
  );

  let imageUri = "";
  while (true) {
    const upd = await conversation.waitFor([
      "message:photo",
      "message:text",
      "callback_query:data",
    ]);

    if (upd.callbackQuery) {
      await upd.answerCallbackQuery().catch(() => {});
      const data = upd.callbackQuery.data;
      if (data === "cancel_launch") {
        await ctx.reply("🚫 Token launch cancelled.");
        return;
      }
      if (data === "skip_logo") {
        imageUri = "";
        logger.wizard(userLabel, "Step 3/6 Complete (Logo)", "Skipped (Default)");
        break;
      }
      if (await handleExternalNavigation(upd, data)) return;
      continue;
    }

    if (upd.message?.text?.startsWith("/")) {
      await ctx.reply("🚫 Token launch cancelled.");
      return;
    }

    if (!upd.message?.photo || upd.message.photo.length === 0) {
      await ctx.reply("⚠️ Please upload a photo image or tap 'Use Default Protocol Logo':");
      continue;
    }

    const photoArray = upd.message.photo;
    const largestPhoto = photoArray[photoArray.length - 1];

    try {
      const fileInfo = await ctx.api.getFile(largestPhoto.file_id);
      const botToken = ctx.api.token;
      const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.file_path}`;

      const processed = await conversation.external(() =>
        ImageService.processTelegramImage(fileUrl)
      );
      imageUri = processed.previewUri;
      logger.wizard(userLabel, "Step 3/6 Complete (Logo)", "Custom Photo Uploaded");
      break;
    } catch (imgErr) {
      logger.error(`Error processing logo: ${(imgErr as Error).message}`);
      await ctx.reply("❌ Could not process image. Please try another photo or skip:");
    }
  }

  // =========================================================================
  // STEP 4: OPTIONAL DESCRIPTION & SOCIAL LINKS (WEB / X / TELEGRAM)
  // =========================================================================
  const metaSkipKb = new InlineKeyboard()
    .text("⏭️ Skip Description & Social Links", "skip_metadata")
    .row()
    .text("✕ Cancel", "cancel_launch");

  await ctx.reply(
    `📝 <b>TOKEN LAUNCH • ${spec.shortName.toUpperCase()}</b>\n` +
      `Step 4 of ${totalSteps} • Description &amp; Social Links (Optional)\n\n` +
      `Enter a description and/or social links (Website, X/Twitter, Telegram) for <code>$${escapeHtml(
        tokenSymbol
      )}</code>, or tap <b>Skip Description &amp; Social Links</b>:\n\n` +
      `<i>Example:</i>\n` +
      `<code>Tokenized community index | https://x.com/myproject | https://t.me/myproject</code>`,
    { parse_mode: "HTML", reply_markup: metaSkipKb }
  );

  let customDescription = "";
  let websiteUrl = "";
  let twitterUrl = "";
  let telegramUrl = "";

  while (true) {
    const upd = await conversation.waitFor(["message:text", "callback_query:data"]);
    if (upd.callbackQuery) {
      await upd.answerCallbackQuery().catch(() => {});
      const data = upd.callbackQuery.data;
      if (data === "cancel_launch") {
        await ctx.reply("🚫 Token launch cancelled.");
        return;
      }
      if (data === "skip_metadata") {
        logger.wizard(userLabel, "Step 4/6 Complete (Metadata)", "Skipped");
        break;
      }
      if (await handleExternalNavigation(upd, data)) return;
      continue;
    }

    const rawMeta = upd.message!.text!.trim();
    if (rawMeta.startsWith("/")) {
      await ctx.reply("🚫 Token launch cancelled.");
      return;
    }

    customDescription = rawMeta.slice(0, 220);
    const urls = rawMeta.match(/https?:\/\/[^\s|]+/gi) || [];
    for (const u of urls) {
      const lower = u.toLowerCase();
      if (lower.includes("x.com/") || lower.includes("twitter.com/")) {
        twitterUrl = u;
      } else if (lower.includes("t.me/") || lower.includes("telegram.me/")) {
        telegramUrl = u;
      } else if (!websiteUrl) {
        websiteUrl = u;
      }
    }
    logger.wizard(userLabel, "Step 4/6 Complete (Metadata)", customDescription.slice(0, 40));
    break;
  }

  // =========================================================================
  // STEP 5: PAIR (QUOTE ASSET SELECTION — SUPPORTED ON ALL 3 PLATFORMS)
  // =========================================================================
  const pairAsset = await promptPairSelection(
    conversation,
    ctx,
    platform,
    spec.name,
    tokenSymbol,
    `Step 5 of ${totalSteps}`
  );
  if (!pairAsset) return;

  logger.wizard(
    userLabel,
    "Step 5/6 Complete (Liquidity Pair)",
    `${pairAsset.symbol} (${pairAsset.name})`
  );

  // =========================================================================
  // STEP 6-0: PANGEA.TRADE ($PANGEA) — #1 PRIORITY OMNICHAIN LAUNCHPAD
  // (0.3%–5.0% Immutable Fee + 80/20 Creator Split + 5-Chain LayerZero OFT + First Buy)
  // =========================================================================
  if (platform === "pangea") {
    const pangeaFeeKb = new InlineKeyboard()
      .text("⚡ 0.30% Fee (Low-Slippage Standard)", "png_fee_0.30")
      .text("⚖️ 0.50% Fee (Balanced Volume)", "png_fee_0.50")
      .row()
      .text("⭐ 1.00% Fee (80% Creator / 20% $PANGEA Burn)", "png_fee_1.00")
      .row()
      .text("💼 2.00% Fee (High-Yield Creator Tier)", "png_fee_2.00")
      .text("🔥 3.00% Fee (Ecosystem Tier)", "png_fee_3.00")
      .row()
      .text("💎 5.00% Fee (Max Creator Revenue Tier)", "png_fee_5.00")
      .row()
      .text("✕ Cancel", "cancel_launch");

    await ctx.reply(
      `🌍 <b>PANGEA OMNICHAIN LAUNCHPAD ($PANGEA)</b>\n` +
        `Step 6 of ${totalSteps} • Immutable Trading Fee (<code>0.3%</code> – <code>5.0%</code>)\n\n` +
        `• <b>Creator Revenue Split:</b> <b>80%</b> of trading fees flow directly to you as continuous creator yield; <b>20%</b> routes to Pangea protocol (<b>80%</b> used to buy back &amp; burn <code>$PANGEA</code>).\n` +
        `• <b>Immutable Parameter:</b> Once set at launch, the trading fee cannot be altered.\n\n` +
        `<i>Tap a preset fee tier below, or type any custom fee percentage between <code>0.3</code> and <code>5.0</code> (e.g., <code>1.5</code>):</i>`,
      { parse_mode: "HTML", reply_markup: pangeaFeeKb }
    );

    let tradingFeePct = "1.00%";
    while (true) {
      const upd = await conversation.waitFor(["callback_query:data", "message:text"]);
      if (upd.callbackQuery) {
        await upd.answerCallbackQuery().catch(() => {});
        const data = upd.callbackQuery.data;
        if (data === "cancel_launch") {
          await ctx.reply("🚫 Token launch cancelled.");
          return;
        }
        if (await handleExternalNavigation(upd, data)) return;
        if (data.startsWith("png_fee_")) {
          const val = data.replace("png_fee_", "");
          tradingFeePct = `${val}%`;
          break;
        }
        continue;
      }

      const rawFee = upd.message!.text!.trim().replace(/%/g, "");
      if (rawFee.startsWith("/")) {
        await ctx.reply("🚫 Token launch cancelled.");
        return;
      }
      const parsedFee = parseFloat(rawFee);
      if (!isNaN(parsedFee) && parsedFee >= 0.3 && parsedFee <= 5.0) {
        tradingFeePct = `${parsedFee.toFixed(2)}%`;
        break;
      }
      await ctx.reply(
        "⚠️ Trading fee on Pangea must be between <b>0.3%</b> and <b>5.0%</b>. Tap a button or enter a value (e.g., <code>1.5</code>):",
        { parse_mode: "HTML" }
      );
    }

    const omnichainKb = new InlineKeyboard()
      .text(
        "🌐 5-Chain Omnichain Sync (ETH + Base + SOL + BNB + Robinhood)",
        "png_mode_FIVE_CHAIN_OFT"
      )
      .row()
      .text("🔷 EVM Uniswap V4 Cluster (ETH + Base + BNB + Robinhood)", "png_mode_EVM_V4_CLUSTER")
      .row()
      .text("Ξ Ethereum Mainnet V4 Pool + LayerZero OFT Ready", "png_mode_ETH_MAINNET_OFT")
      .row()
      .text("✕ Cancel", "cancel_launch");

    await ctx.reply(
      `🌍 <b>PANGEA OMNICHAIN LAUNCHPAD ($PANGEA)</b>\n` +
        `Step 6b of 6 • LayerZero OFT Multi-Chain Topology\n\n` +
        `• <b>Supply Architecture:</b> <b>5,000,000,000 Total Supply</b> (<code>1,000,000,000</code> per chain, 100% placed into permanently locked liquidity pools, 0% team pre-mint).\n` +
        `• <b>DEX Routing:</b> <b>Uniswap V4</b> on Ethereum/Base/BNB/Robinhood + <b>Meteora DAMM v2</b> on Solana at the exact same opening USD price.\n` +
        `• <b>Cross-Chain Sync:</b> Powered by <b>LayerZero OFT</b> (burn on source chain, mint on destination chain).\n\n` +
        `Select your Omnichain synchronization topology:`,
      { parse_mode: "HTML", reply_markup: omnichainKb }
    );

    type OmnichainModeType = "FIVE_CHAIN_OFT" | "EVM_V4_CLUSTER" | "ETH_MAINNET_OFT";
    let omnichainMode: OmnichainModeType = "FIVE_CHAIN_OFT";
    let omnichainLabel = "5-Chain Omnichain (ETH • Base • SOL • BNB • Robinhood)";

    while (true) {
      const q = await conversation.waitFor("callback_query:data");
      await q.answerCallbackQuery().catch(() => {});
      const data = q.callbackQuery.data;
      if (data === "cancel_launch") {
        await ctx.reply("🚫 Token launch cancelled.");
        return;
      }
      if (await handleExternalNavigation(q, data)) return;
      if (data.startsWith("png_mode_")) {
        omnichainMode = data.replace("png_mode_", "") as OmnichainModeType;
        if (omnichainMode === "EVM_V4_CLUSTER") {
          omnichainLabel = "EVM V4 Cluster (ETH • Base • BNB • Robinhood)";
        } else if (omnichainMode === "ETH_MAINNET_OFT") {
          omnichainLabel = "Ethereum Mainnet V4 + LayerZero OFT";
        }
        break;
      }
    }

    const initialBuyEth = await promptFirstBuyEth(
      conversation,
      ctx,
      spec.name,
      tokenSymbol,
      "Step 6c of 6"
    );
    if (initialBuyEth === null) return;

    const indexingChoice = await promptLaunchIndexingMode(
      conversation,
      ctx,
      platform,
      spec.shortName,
      tokenSymbol,
      initialBuyEth,
      user.wallet!.address as Address
    );
    if (!indexingChoice) return;

    const freshBalances = await conversation.external(() =>
      walletService.getBalances(user.wallet!.address as Address, true)
    );

    const creatorShareNum = (parseFloat(tradingFeePct) * 0.8).toFixed(2);
    const protocolShareNum = Math.max(0.2, parseFloat(tradingFeePct) * 0.2).toFixed(2);

    const reviewKb = new InlineKeyboard()
      .text("🚀 Confirm & Broadcast Deployment", "confirm_launch")
      .row()
      .text("✕ Cancel", "cancel_launch");

    await ctx.reply(
      `┌───「 📋 <b>PANGEA OMNICHAIN DEPLOYMENT REVIEW</b> 」───\n` +
        `│ 🌍 Pangea.trade ($PANGEA) · LayerZero OFT V4\n` +
        `│ 🌐 5,000,000,000 Supply (1B/Chain · 100% Locked LP)\n` +
        `└──────────────────────────────────────────────\n\n` +
        `🎯 <b>PARAMETERS:</b>\n` +
        `├─ Protocol         : <b>🌍 Pangea ($PANGEA)</b>\n` +
        `├─ Deployment Mode  : <b>${escapeHtml(indexingChoice.modeLabel)}</b>\n` +
        `├─ Token Name       : <b>${escapeHtml(tokenName)}</b>\n` +
        `├─ Ticker Symbol    : <code>$${escapeHtml(tokenSymbol)}</code>\n` +
        `├─ Liquidity Pair   : <b>${escapeHtml(pairAsset.symbol)}</b> (${escapeHtml(pairAsset.name)})\n` +
        `├─ Omnichain Sync   : <b>${escapeHtml(omnichainLabel)}</b>\n` +
        `├─ Immutable Fee    : <b>${tradingFeePct}</b> (<b>${creatorShareNum}% Creator</b> / ${protocolShareNum}% $PANGEA Burn)\n` +
        `├─ First Buy        : <b>${initialBuyEth} ETH</b>\n` +
        `├─ Est. Total Cost  : <b>~${indexingChoice.estimatedTotalEth} ETH</b>\n` +
        `└─ Dev Vault Bal    : <b>${formatEth(freshBalances.eth)} ETH</b>\n\n` +
        `<i>Confirm below to broadcast your Pangea Omnichain deployment from your Ethereum Dev Vault.</i>`,
      { parse_mode: "HTML", reply_markup: reviewKb }
    );

    const confirmQ = await conversation.waitFor("callback_query:data");
    await confirmQ.answerCallbackQuery().catch(() => {});
    if (await handleExternalNavigation(confirmQ, confirmQ.callbackQuery.data)) return;
    if (confirmQ.callbackQuery.data !== "confirm_launch") {
      await ctx.reply("🚫 Token launch cancelled.");
      return;
    }

    await ctx.reply(
      "⏳ <b>Broadcasting Pangea Omnichain (Uniswap V4 + LayerZero OFT) deployment...</b>",
      { parse_mode: "HTML" }
    );

    const privateKey = CryptoService.decryptPrivateKey(
      user.wallet.encryptedKey
    ) as `0x${string}`;

    const result = await conversation.external(() =>
      blockchainService.launchPangeaToken({
        userPrivateKey: privateKey,
        name: tokenName,
        symbol: tokenSymbol,
        description: customDescription,
        website: websiteUrl,
        twitter: twitterUrl,
        telegram: telegramUrl,
        imageUri,
        quoteTokenAddress: pairAsset.address,
        quoteTokenSymbol: pairAsset.symbol,
        tradingFeePct,
        omnichainMode,
        initialBuyAmountEth: initialBuyEth,
        indexingMode: indexingChoice.mode,
      })
    );

    await finalizeAndReplyLaunch({
      conversation,
      ctx,
      userId,
      creatorAddress: user.wallet.address as Address,
      platform: "pangea",
      hookProfile: HookProfile.OMNICHAIN_OFT_V4,
      tokenName,
      tokenSymbol,
      description: customDescription,
      imageUri,
      quoteTokenSymbol: pairAsset.symbol,
      quoteAddress: pairAsset.address,
      initialBuyEth,
      disperseWalletsCount: 0,
      extraDetails: `${omnichainLabel} • Fee: ${tradingFeePct} (80% Creator / 20% $PANGEA Burn)`,
      omnichainMode,
      result,
    });
    return;
  }

  // =========================================================================
  // STEP 6A: STOCKEREUM.COM (TRADE FEE 1%/2%/3% + HOLDER REWARDS + FIRST BUY)
  // =========================================================================
  if (platform === "stokerium") {
    const stkFeeKb = new InlineKeyboard()
      .text("💼 1% Trade Fee (0.5% Creator / 0.5% Platform)", "stk_fee_1_creator")
      .row()
      .text("💼 2% Trade Fee (1.0% Creator / 1.0% Platform)", "stk_fee_2_creator")
      .row()
      .text("💼 3% Trade Fee (2.0% Creator / 1.0% Platform)", "stk_fee_3_creator")
      .row()
      .text("🏅 1% Fee + 100% Holder Rewards Badge", "stk_fee_1_holders")
      .row()
      .text("🏅 2% Fee + 100% Holder Rewards Badge", "stk_fee_2_holders")
      .row()
      .text("🏅 3% Fee + 100% Holder Rewards Badge", "stk_fee_3_holders")
      .row()
      .text("✕ Cancel", "cancel_launch");

    await ctx.reply(
      `🏛️ <b>STOCKEREUM LAUNCHPAD</b>\n` +
        `Step 6 of ${totalSteps} • Trade Fee Tier &amp; Holder Rewards\n\n` +
        `Choose your permanent Uniswap V4 pool Trade Fee (<b>1%</b>, <b>2%</b>, or <b>3%</b>) and whether creator fees go to your <b>Creator Vault</b> or to <b>Token Holders (Holder Rewards Badge)</b>:`,
      { parse_mode: "HTML", reply_markup: stkFeeKb }
    );

    let tradeFeePct = "1%";
    let holderRewards = false;

    while (true) {
      const q = await conversation.waitFor("callback_query:data");
      await q.answerCallbackQuery().catch(() => {});
      const data = q.callbackQuery.data;
      if (data === "cancel_launch") {
        await ctx.reply("🚫 Token launch cancelled.");
        return;
      }
      if (await handleExternalNavigation(q, data)) return;
      if (data.startsWith("stk_fee_")) {
        const parts = data.replace("stk_fee_", "").split("_");
        tradeFeePct = `${parts[0]}%`;
        holderRewards = parts[1] === "holders";
        break;
      }
    }

    const initialBuyEth = await promptFirstBuyEth(
      conversation,
      ctx,
      spec.name,
      tokenSymbol,
      "Step 6b of 6"
    );
    if (initialBuyEth === null) return;

    const indexingChoice = await promptLaunchIndexingMode(
      conversation,
      ctx,
      platform,
      spec.shortName,
      tokenSymbol,
      initialBuyEth,
      user.wallet!.address as Address
    );
    if (!indexingChoice) return;

    const freshBalances = await conversation.external(() =>
      walletService.getBalances(user.wallet!.address as Address, true)
    );

    const reviewKb = new InlineKeyboard()
      .text("🚀 Confirm & Broadcast Deployment", "confirm_launch")
      .row()
      .text("✕ Cancel", "cancel_launch");

    await ctx.reply(
      `┌───「 📋 <b>STOCKEREUM DEPLOYMENT REVIEW</b> 」───\n` +
        `│ 🌐 Ethereum Mainnet (Chain ID: 1)\n` +
        `│ 🏛️ Fixed Supply: 1,000,000,000 · Locked V4 Pool\n` +
        `└────────────────────────────────────────\n\n` +
        `🎯 <b>PARAMETERS:</b>\n` +
        `├─ Protocol       : <b>🏛️ Stockereum ($STOCKER)</b>\n` +
        `├─ Deployment Mode: <b>${escapeHtml(indexingChoice.modeLabel)}</b>\n` +
        `├─ Token Name     : <b>${escapeHtml(tokenName)}</b>\n` +
        `├─ Ticker Symbol  : <code>$${escapeHtml(tokenSymbol)}</code>\n` +
        `├─ Liquidity Pair : <b>${escapeHtml(pairAsset.symbol)}</b> (${escapeHtml(pairAsset.name)})\n` +
        `├─ Trade Fee Tier : <b>${tradeFeePct}</b>\n` +
        `├─ Fee Recipient  : <b>${holderRewards ? "🏅 Token Holders (Holder Rewards)" : "💼 Creator Dev Vault"}</b>\n` +
        `├─ First Buy      : <b>${initialBuyEth} ETH</b>\n` +
        `├─ Est. Total Cost: <b>~${indexingChoice.estimatedTotalEth} ETH</b>\n` +
        `└─ Dev Vault Bal  : <b>${formatEth(freshBalances.eth)} ETH</b>\n\n` +
        `<i>Confirm below to broadcast your transaction to Ethereum Mainnet.</i>`,
      { parse_mode: "HTML", reply_markup: reviewKb }
    );

    const confirmQ = await conversation.waitFor("callback_query:data");
    await confirmQ.answerCallbackQuery().catch(() => {});
    if (await handleExternalNavigation(confirmQ, confirmQ.callbackQuery.data)) return;
    if (confirmQ.callbackQuery.data !== "confirm_launch") {
      await ctx.reply("🚫 Token launch cancelled.");
      return;
    }

    await ctx.reply(
      "⏳ <b>Broadcasting Stockereum deployment to Ethereum Mainnet...</b>",
      { parse_mode: "HTML" }
    );

    const privateKey = CryptoService.decryptPrivateKey(
      user.wallet.encryptedKey
    ) as `0x${string}`;

    const result = await conversation.external(() =>
      blockchainService.launchStokeriumToken({
        userPrivateKey: privateKey,
        name: tokenName,
        symbol: tokenSymbol,
        description: customDescription,
        website: websiteUrl,
        twitter: twitterUrl,
        telegram: telegramUrl,
        imageUri,
        quoteTokenAddress: pairAsset.address,
        quoteTokenSymbol: pairAsset.symbol,
        curvePresetId: "LINEAR_RWA",
        tradeFeePct,
        holderRewards,
        initialTick: pairAsset.initialTick,
        initialBuyAmountEth: initialBuyEth,
        indexingMode: indexingChoice.mode,
      })
    );

    await finalizeAndReplyLaunch({
      conversation,
      ctx,
      userId,
      creatorAddress: user.wallet.address as Address,
      platform: "stokerium",
      hookProfile: HookProfile.SYNTHETIC_RWA_CURVE,
      tokenName,
      tokenSymbol,
      description: customDescription,
      imageUri,
      quoteTokenSymbol: pairAsset.symbol,
      quoteAddress: pairAsset.address,
      initialBuyEth,
      disperseWalletsCount: 0,
      extraDetails: `Trade Fee: ${tradeFeePct} (${holderRewards ? "Holder Rewards" : "Creator Vault"})`,
      result,
    });
    return;
  }

  // =========================================================================
  // STEP 6B: SENDER.FAMILY (FIRST BUY + 70% CREATOR FEE + OPTIONAL DISPERSE)
  // =========================================================================
  if (platform === "sender") {
    const initialBuyEth = await promptFirstBuyEth(
      conversation,
      ctx,
      spec.name,
      tokenSymbol,
      `Step 6 of ${totalSteps}`
    );
    if (initialBuyEth === null) return;

    const disperseKb = new InlineKeyboard()
      .text("⏭️ Keep 100% in Dev Vault (Standard Sender Launch)", "snd_disperse_skip")
      .row()
      .text("✕ Cancel", "cancel_launch");

    await ctx.reply(
      `📡 <b>SENDER.FAMILY LAUNCHPAD</b>\n` +
        `Step 6b of 6 • Multi-Wallet Distribution (Optional)\n\n` +
        `• <b>Fee Structure:</b> 70% Creator Fee (in ${escapeHtml(pairAsset.symbol)}) / 30% Protocol &amp; <code>$SEND</code> Buy-and-Burn.\n` +
        `• Paste Ethereum addresses (one per line, or <code>0xAddress,percent</code>) to distribute tokens across multiple wallets at launch, or tap <b>Keep 100% in Dev Vault</b>:`,
      { parse_mode: "HTML", reply_markup: disperseKb }
    );

    const disperseEntries: SenderDisperseEntry[] = [];
    while (true) {
      const upd = await conversation.waitFor(["message:text", "callback_query:data"]);
      if (upd.callbackQuery) {
        await upd.answerCallbackQuery().catch(() => {});
        const data = upd.callbackQuery.data;
        if (data === "cancel_launch") {
          await ctx.reply("🚫 Token launch cancelled.");
          return;
        }
        if (data === "snd_disperse_skip") {
          break;
        }
        if (await handleExternalNavigation(upd, data)) return;
        continue;
      }

      const rawText = upd.message!.text!.trim();
      if (rawText.startsWith("/")) {
        await ctx.reply("🚫 Token launch cancelled.");
        return;
      }

      const lines = rawText
        .split(/[\n;]+/)
        .map((l) => l.trim())
        .filter(Boolean);

      const parsedEntries: SenderDisperseEntry[] = [];
      let valid = true;

      for (const line of lines) {
        const parts = line.split(/[,\s]+/).filter(Boolean);
        const addrCandidate = parts[0];
        if (!addrCandidate || !isAddress(addrCandidate, { strict: false })) {
          valid = false;
          break;
        }
        const pct = parts[1] ? parseFloat(parts[1]) : Math.floor(20 / lines.length) || 1;
        const bps = BigInt(Math.max(10, Math.min(2500, Math.round(pct * 100))));
        parsedEntries.push({
          address: getAddress(addrCandidate),
          bps,
        });
      }

      if (!valid || parsedEntries.length === 0 || parsedEntries.length > 25) {
        await ctx.reply(
          "⚠️ Please provide 1 to 25 valid Ethereum <code>0x...</code> addresses (one per line), or tap <b>Keep 100% in Dev Vault</b>:",
          { parse_mode: "HTML", reply_markup: disperseKb }
        );
        continue;
      }

      disperseEntries.push(...parsedEntries);
      break;
    }

    const indexingChoice = await promptLaunchIndexingMode(
      conversation,
      ctx,
      platform,
      spec.shortName,
      tokenSymbol,
      initialBuyEth,
      user.wallet!.address as Address
    );
    if (!indexingChoice) return;

    const freshBalances = await conversation.external(() =>
      walletService.getBalances(user.wallet!.address as Address, true)
    );

    const reviewKb = new InlineKeyboard()
      .text("🚀 Confirm & Broadcast Deployment", "confirm_launch")
      .row()
      .text("✕ Cancel", "cancel_launch");

    await ctx.reply(
      `┌───「 📋 <b>SENDER.FAMILY DEPLOYMENT REVIEW</b> 」───\n` +
        `│ 🌐 Ethereum Mainnet (Chain ID: 1)\n` +
        `│ 📡 Fixed Supply: 1,000,000,000 · Locked V4 Pool\n` +
        `└──────────────────────────────────────────\n\n` +
        `🎯 <b>PARAMETERS:</b>\n` +
        `├─ Protocol          : <b>📡 Sender ($SEND)</b>\n` +
        `├─ Deployment Mode   : <b>${escapeHtml(indexingChoice.modeLabel)}</b>\n` +
        `├─ Token Name        : <b>${escapeHtml(tokenName)}</b>\n` +
        `├─ Ticker Symbol     : <code>$${escapeHtml(tokenSymbol)}</code>\n` +
        `├─ Liquidity Pair    : <b>${escapeHtml(pairAsset.symbol)}</b> (${escapeHtml(pairAsset.name)})\n` +
        `├─ Trading Fee Split : <b>70% Creator / 30% $SEND Buy-and-Burn</b>\n` +
        `├─ First Buy         : <b>${initialBuyEth} ETH</b>\n` +
        `├─ Disperse Wallets  : <b>${disperseEntries.length} Recipients</b>\n` +
        `├─ Est. Total Cost   : <b>~${indexingChoice.estimatedTotalEth} ETH</b>\n` +
        `└─ Dev Vault Bal     : <b>${formatEth(freshBalances.eth)} ETH</b>\n\n` +
        `<i>Confirm below to broadcast your token launch to Ethereum Mainnet.</i>`,
      { parse_mode: "HTML", reply_markup: reviewKb }
    );

    const confirmQ = await conversation.waitFor("callback_query:data");
    await confirmQ.answerCallbackQuery().catch(() => {});
    if (await handleExternalNavigation(confirmQ, confirmQ.callbackQuery.data)) return;
    if (confirmQ.callbackQuery.data !== "confirm_launch") {
      await ctx.reply("🚫 Token launch cancelled.");
      return;
    }

    await ctx.reply(
      "⏳ <b>Broadcasting Sender.family deployment to Ethereum Mainnet...</b>",
      { parse_mode: "HTML" }
    );

    const privateKey = CryptoService.decryptPrivateKey(
      user.wallet.encryptedKey
    ) as `0x${string}`;

    const result = await conversation.external(() =>
      blockchainService.launchSenderToken({
        userPrivateKey: privateKey,
        name: tokenName,
        symbol: tokenSymbol,
        description: customDescription,
        website: websiteUrl,
        twitter: twitterUrl,
        telegram: telegramUrl,
        imageUri,
        quoteTokenAddress: pairAsset.address,
        quoteTokenSymbol: pairAsset.symbol,
        initialBuyAmountEth: initialBuyEth,
        disperseEntries,
        indexingMode: indexingChoice.mode,
      })
    );

    await finalizeAndReplyLaunch({
      conversation,
      ctx,
      userId,
      creatorAddress: user.wallet.address as Address,
      platform: "sender",
      hookProfile: HookProfile.MULTI_WALLET_DISPERSE,
      tokenName,
      tokenSymbol,
      description: customDescription,
      imageUri,
      quoteTokenSymbol: pairAsset.symbol,
      quoteAddress: pairAsset.address,
      initialBuyEth,
      disperseWalletsCount: disperseEntries.length,
      extraDetails: "70% Creator Fee / 30% $SEND Buy-and-Burn",
      result,
    });
    return;
  }

  // =========================================================================
  // STEP 6C: PROGRAMMABLE.MARKET ($V4) — MODULE MODE / CLASSIC MODE + CREATOR FEE % + FIRST BUY
  // =========================================================================
  const hookKb = new InlineKeyboard()
    .text("🧩 Module Mode: Auto Buyback & Burn Hook (1% Creator Fee)", "v4_mod_CREATOR_FEE_SPLIT_1%")
    .row()
    .text("🧩 Module Mode: Holder Rewards & Fee Stream (2% Creator Fee)", "v4_mod_CREATOR_FEE_SPLIT_2%")
    .row()
    .text("⚡ Module Mode: Dynamic Volatility Fee Hook (1%–3% Auto)", "v4_mod_DYNAMIC_SWAP_FEE_2%")
    .row()
    .text("🏛️ Classic Mode: Fixed-Supply Locked V4 Pool (0.90% Creator)", "v4_mod_PERMANENT_LP_LOCK_1%")
    .row()
    .text("✕ Cancel", "cancel_launch");

  await ctx.reply(
    `🦄 <b>PROGRAMMABLE.MARKET ($V4)</b>\n` +
      `Step 6 of ${totalSteps} • Launch Mode, Hook Module &amp; Creator Fee %\n\n` +
      `Select the Programmable Uniswap V4 launch configuration for <code>$${escapeHtml(
        tokenSymbol
      )}</code>:\n\n` +
      `• <b>Module Mode (Auto Buyback &amp; Burn):</b> Routes module fee share to automated token buybacks and burns.\n` +
      `• <b>Module Mode (Holder Rewards &amp; Fee Stream):</b> Streams swap fees in ${escapeHtml(
        pairAsset.symbol
      )} to your Dev Vault &amp; holders.\n` +
      `• <b>Module Mode (Dynamic Volatility Fee):</b> Adjusts buy/sell fees dynamically during volatility.\n` +
      `• <b>Classic Mode:</b> Fixed-supply locked Uniswap V4 pool (0.90% Creator / 0.10% Platform).`,
    { parse_mode: "HTML", reply_markup: hookKb }
  );

  let selectedHookId: "DYNAMIC_SWAP_FEE" | "PERMANENT_LP_LOCK" | "CREATOR_FEE_SPLIT" =
    "CREATOR_FEE_SPLIT";
  let creatorFeePct = "1%";

  while (true) {
    const q = await conversation.waitFor("callback_query:data");
    await q.answerCallbackQuery().catch(() => {});
    const data = q.callbackQuery.data;
    if (data === "cancel_launch") {
      await ctx.reply("🚫 Token launch cancelled.");
      return;
    }
    if (await handleExternalNavigation(q, data)) return;
    if (data.startsWith("v4_mod_")) {
      const raw = data.replace("v4_mod_", "");
      const lastUnderscore = raw.lastIndexOf("_");
      selectedHookId = raw.slice(0, lastUnderscore) as typeof selectedHookId;
      creatorFeePct = raw.slice(lastUnderscore + 1);
      break;
    }
  }

  const hookSpec = UNISWAP_V4_HOOK_PROFILES[selectedHookId];

  const initialBuyEth = await promptFirstBuyEth(
    conversation,
    ctx,
    spec.name,
    tokenSymbol,
    "Step 6b of 6"
  );
  if (initialBuyEth === null) return;

  const indexingChoice = await promptLaunchIndexingMode(
    conversation,
    ctx,
    platform,
    spec.shortName,
    tokenSymbol,
    initialBuyEth,
    user.wallet!.address as Address
  );
  if (!indexingChoice) return;

  const freshBalances = await conversation.external(() =>
    walletService.getBalances(user.wallet!.address as Address, true)
  );

  const reviewKb = new InlineKeyboard()
    .text("🚀 Confirm & Broadcast Deployment", "confirm_launch")
    .row()
    .text("✕ Cancel", "cancel_launch");

  await ctx.reply(
    `┌───「 📋 <b>PROGRAMMABLE ($V4) DEPLOYMENT REVIEW</b> 」───\n` +
      `│ 🌐 Ethereum Mainnet (Chain ID: 1)\n` +
      `│ 🦄 Fixed Supply: 1,000,000,000 · Uniswap V4 Pool\n` +
      `└──────────────────────────────────────────────\n\n` +
      `🎯 <b>PARAMETERS:</b>\n` +
      `├─ Protocol       : <b>🦄 Programmable ($V4)</b>\n` +
      `├─ Deployment Mode: <b>${escapeHtml(indexingChoice.modeLabel)}</b>\n` +
      `├─ Token Name     : <b>${escapeHtml(tokenName)}</b>\n` +
      `├─ Ticker Symbol  : <code>$${escapeHtml(tokenSymbol)}</code>\n` +
      `├─ Liquidity Pair : <b>${escapeHtml(pairAsset.symbol)}</b> (${escapeHtml(pairAsset.name)})\n` +
      `├─ Hook / Mode    : <b>${escapeHtml(hookSpec.name)}</b>\n` +
      `├─ Creator Fee %  : <b>${creatorFeePct}</b> (accrues in ${escapeHtml(pairAsset.symbol)})\n` +
      `├─ First Buy      : <b>${initialBuyEth} ETH</b>\n` +
      `├─ Est. Total Cost: <b>~${indexingChoice.estimatedTotalEth} ETH</b>\n` +
      `└─ Dev Vault Bal  : <b>${formatEth(freshBalances.eth)} ETH</b>\n\n` +
      `<i>Confirm below to initialize the token and Uniswap V4 pool on Ethereum Mainnet.</i>`,
    { parse_mode: "HTML", reply_markup: reviewKb }
  );

  const confirmQ = await conversation.waitFor("callback_query:data");
  await confirmQ.answerCallbackQuery().catch(() => {});
  if (await handleExternalNavigation(confirmQ, confirmQ.callbackQuery.data)) return;
  if (confirmQ.callbackQuery.data !== "confirm_launch") {
    await ctx.reply("🚫 Token launch cancelled.");
    return;
  }

  await ctx.reply(
    "⏳ <b>Broadcasting Programmable ($V4) Pool deployment to Ethereum Mainnet...</b>",
    { parse_mode: "HTML" }
  );

  const privateKey = CryptoService.decryptPrivateKey(
    user.wallet.encryptedKey
  ) as `0x${string}`;

  const result = await conversation.external(() =>
    blockchainService.launchProgrammableV4Token({
      userPrivateKey: privateKey,
      name: tokenName,
      symbol: tokenSymbol,
      description: customDescription,
      website: websiteUrl,
      twitter: twitterUrl,
      telegram: telegramUrl,
      imageUri,
      quoteTokenAddress: pairAsset.address,
      quoteTokenSymbol: pairAsset.symbol,
      hookProfileId: selectedHookId,
      creatorFeePct,
      initialBuyAmountEth: initialBuyEth,
      indexingMode: indexingChoice.mode,
    })
  );

  await finalizeAndReplyLaunch({
    conversation,
    ctx,
    userId,
    creatorAddress: user.wallet.address as Address,
    platform: "programmable",
    hookProfile: selectedHookId as HookProfile,
    tokenName,
    tokenSymbol,
    description: customDescription,
    imageUri,
    quoteTokenSymbol: pairAsset.symbol,
    quoteAddress: pairAsset.address,
    initialBuyEth,
    disperseWalletsCount: 0,
    extraDetails: `${hookSpec.name} • Creator Fee: ${creatorFeePct}`,
    result,
  });
}

/**
 * Persists the completed token launch to PostgreSQL, invalidates caches so `/api/launches`
 * updates immediately for the companion website, and renders the confirmation card.
 */
async function finalizeAndReplyLaunch(params: {
  conversation: BotConversation;
  ctx: Context;
  userId: bigint;
  creatorAddress: Address;
  platform: "pangea" | "stokerium" | "sender" | "programmable";
  hookProfile: HookProfile;
  tokenName: string;
  tokenSymbol: string;
  description?: string;
  imageUri: string;
  quoteTokenSymbol: string;
  quoteAddress: Address;
  initialBuyEth: string;
  disperseWalletsCount: number;
  extraDetails?: string;
  omnichainMode?: string;
  result: Awaited<ReturnType<typeof blockchainService.launchStokeriumToken>>;
}) {
  const {
    conversation,
    ctx,
    userId,
    creatorAddress,
    platform,
    hookProfile,
    tokenName,
    tokenSymbol,
    description,
    imageUri,
    quoteTokenSymbol,
    quoteAddress,
    initialBuyEth,
    disperseWalletsCount,
    extraDetails,
    omnichainMode,
    result,
  } = params;

  const spec = PLATFORM_SPECS[platform];

  if (result.success && result.tokenAddress && result.txHash) {
    const tokenCa = result.tokenAddress;
    const poolId =
      result.poolAddress ||
      "0x0000000000000000000000000000000000000000000000000000000000000000";

    await conversation.external(async () => {
      await prisma.tokenLaunch.create({
        data: {
          userId,
          tokenAddress: tokenCa,
          poolAddress: poolId,
          platform: platform as LaunchpadPlatform,
          hookProfile,
          name: tokenName,
          symbol: tokenSymbol,
          description:
            description || `${tokenName} ($${tokenSymbol}) on ${spec.name}`,
          imageUrl: imageUri ? imageUri.substring(0, 500) : "",
          quoteTokenSymbol,
          quoteAddress,
          initialBuyEth,
          disperseWalletsCount,
          creatorAddress,
          txHash: result.txHash!,
          blockNumber: result.blockNumber ? BigInt(result.blockNumber.toString()) : 0n,
        },
      });
      IndexerService.invalidateCache();
      return true;
    });

    const updatedBalances = await conversation.external(async () => {
      walletService.invalidateCache(creatorAddress);
      walletService.invalidateUserCache(userId);
      CoinsHandler.invalidateCoinsCache(userId);
      return walletService.getBalances(creatorAddress, true);
    });

    const launchpadUrl = spec.getExplorerUrl(tokenCa, poolId);
    const uniswapUrl = `https://app.uniswap.org/swap?chain=mainnet&outputCurrency=${tokenCa}`;
    const etherscanTokenUrl = `https://etherscan.io/token/${tokenCa}`;
    const etherscanTxUrl = `https://etherscan.io/tx/${result.txHash}`;

    const pangeaCas =
      platform === "pangea"
        ? formatPangeaMultichainCas(
            tokenCa,
            omnichainMode || "FIVE_CHAIN_OFT",
            result.perChainAddresses
          )
        : null;

    const uLabel = ctx.from?.username
      ? `@${ctx.from.username} (${ctx.from.id})`
      : `${ctx.from?.first_name || "User"} (${userId})`;

    logger.launchReceipt({
      user: uLabel,
      platform: spec.shortName,
      tokenName,
      tokenSymbol,
      pairSymbol: quoteTokenSymbol,
      modeLabel: extraDetails,
      evmCa: tokenCa,
      solanaMint: pangeaCas?.solanaMint,
      txHash: result.txHash,
      initialBuyEth,
    });

    AdminHandler.notifyAdminLaunch(ctx.api, {
      userId,
      username: ctx.from?.username,
      tokenName,
      tokenSymbol,
      evmCa: tokenCa,
      solanaCa: pangeaCas?.solanaMint,
      txHash: result.txHash,
      initialBuyEth,
    }).catch(() => {});

    const successKeyboard = new InlineKeyboard()
      .url(`Open on ${spec.shortName}`, launchpadUrl)
      .url("🦄 Uniswap V4 Pool", uniswapUrl)
      .row()
      .url("🔍 Etherscan Token", etherscanTokenUrl)
      .url("📄 Etherscan Tx", etherscanTxUrl);

    if (pangeaCas) {
      successKeyboard
        .row()
        .url("🔵 Basescan", `https://basescan.org/token/${pangeaCas.baseCa}`)
        .url("🟡 BscScan", `https://bscscan.com/token/${pangeaCas.bscCa}`)
        .url("🟣 Solscan", `https://solscan.io/token/${pangeaCas.solanaMint}`);
    }

    successKeyboard
      .row()
      .text("🌕 My Coins", "action_coins")
      .text("🏠 Main Menu", "action_back_main");

    const caSection = pangeaCas
      ? `📋 <b>PRIMARY EVM OMNICHAIN CA:</b>\n<code>${tokenCa}</code>\n\n` +
        `${pangeaCas.htmlBlock}\n\n`
      : `📋 <b>CONTRACT ADDRESS (CA):</b>\n<code>${tokenCa}</code>\n\n`;

    const headerTitle =
      platform === "pangea"
        ? "🌍 <b>OMNICHAIN TOKEN DEPLOYED (PANGEA V4)</b>"
        : "🚀 <b>TOKEN DEPLOYED ON ETHEREUM</b>";

    await ctx.reply(
      `┌───「 ${headerTitle} 」───\n` +
        `│ 🌐 ${platform === "pangea" ? "5-Chain Omnichain OFT" : "Ethereum Mainnet (1)"} · <b>${spec.badge}</b>\n` +
        `└──────────────────────────────────────────\n\n` +
        `🏷️ <b>Token Name</b>    : <b>${escapeHtml(tokenName)}</b>\n` +
        `🏷️ <b>Ticker Symbol</b> : <code>$${escapeHtml(tokenSymbol)}</code>\n` +
        `🪙 <b>Pairing Asset</b> : <b>${escapeHtml(quoteTokenSymbol)}</b>\n` +
        (extraDetails ? `⚙️ <b>Pool Config</b>   : <b>${escapeHtml(extraDetails)}</b>\n\n` : `\n`) +
        caSection +
        `🦄 <b>UNISWAP V4 POOL ID:</b>\n` +
        `<code>${poolId}</code>\n\n` +
        `🧾 <b>EXECUTION RECEIPT:</b>\n` +
        `├─ First Buy         : <b>${initialBuyEth} ETH</b>\n` +
        `├─ Network Gas Used  : <b>${result.gasCostEth || "~0.0018"} ETH</b>\n` +
        `└─ Remaining Balance : <b>${formatEth(updatedBalances.eth)} ETH</b>\n\n` +
        `🔗 <b>OFFICIAL LINKS:</b>\n` +
        `• <b>${escapeHtml(spec.shortName)}</b>: <a href="${launchpadUrl}">${launchpadUrl}</a>\n` +
        `• <b>Uniswap V4</b>: <a href="${uniswapUrl}">Explore Pool</a>\n` +
        `• <b>Etherscan</b>: <a href="${etherscanTxUrl}">View Transaction</a>`,
      {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: successKeyboard,
      }
    );
  } else {
    const cleanError = (
      result.error || "Transaction reverted on Ethereum Mainnet."
    ).slice(0, 320);
    const uLabel = ctx.from?.username
      ? `@${ctx.from.username} (${ctx.from.id})`
      : `${ctx.from?.first_name || "User"} (${userId})`;
    logger.warn(
      `[LAUNCH NOTICE] ${uLabel} | ${spec.shortName} ($${tokenSymbol}) | Reason: ${cleanError}`
    );
    await ctx.reply(
      `❌ <b>Deployment Notice (${escapeHtml(spec.shortName)}):</b>\n\n${escapeHtml(
        cleanError
      )}\n\nCheck your ETH balance via 👛 Wallet and try again.`,
      { parse_mode: "HTML" }
    );
  }
}
