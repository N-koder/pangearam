import { InlineKeyboard } from "grammy";
import { BotContext } from "../types";
import { ENV } from "../../config/env";
import prisma from "../../db/client";
import { logger } from "../../utils/logger";
import { escapeHtml } from "../../utils/formatters";
import { BlockService } from "../../services/block.service";
import { PLATFORM_SPECS, LaunchPlatform } from "../../services/platform.service";

export class AdminHandler {
  /**
   * Checks whether the given user is authorized as the Admin/Owner
   * (Resilient even if ADMIN_TELEGRAM_ID and ADMIN_USERNAME are swapped in .env)
   */
  public static isAuthorizedAdmin(userId: bigint, username?: string): boolean {
    const rawA = ENV.ADMIN_TELEGRAM_ID.trim().replace(/^@/, "");
    const rawB = ENV.ADMIN_USERNAME.trim().replace(/^@/, "");

    if (!rawA && !rawB) {
      return false;
    }

    const candidates = [rawA, rawB].filter(Boolean);
    const idStr = userId.toString();
    const cleanUser = username ? username.toLowerCase().replace(/^@/, "") : "";

    for (const c of candidates) {
      if (/^\d+$/.test(c) && c === idStr) {
        return true;
      }
      if (cleanUser && c.toLowerCase() === cleanUser) {
        return true;
      }
    }

    return false;
  }

  public static async handleMyId(ctx: BotContext) {
    const from = ctx.from;
    if (!from) return;

    const uName = from.username ? `@${escapeHtml(from.username)}` : "<i>No username set</i>";
    const fullName = escapeHtml([from.first_name, from.last_name].filter(Boolean).join(" ") || "User");

    await ctx.reply(
      `🆔 <b>Your Telegram Information:</b>\n\n` +
        `• <b>User ID:</b> <code>${from.id}</code>\n` +
        `• <b>Username:</b> ${uName}\n` +
        `• <b>Name:</b> ${fullName}`,
      { parse_mode: "HTML" }
    );
  }

  /**
   * Private owner-only user directory and analytics
   */
  public static async handleUsersList(ctx: BotContext, page: number = 1, edit: boolean = false) {
    const from = ctx.from;
    if (!from) return;

    const userId = BigInt(from.id);
    const username = from.username;

    if (!AdminHandler.isAuthorizedAdmin(userId, username)) {
      return; // Silently ignore unauthorized requests
    }

    try {
      const users = await prisma.user.findMany({
        include: {
          wallet: true,
          launches: {
            select: {
              id: true,
              name: true,
              symbol: true,
              tokenAddress: true,
              platform: true,
              quoteTokenSymbol: true,
              initialBuyEth: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const totalUsers = users.length;
      const totalLaunches = users.reduce((acc, u) => acc + u.launches.length, 0);

      if (totalUsers === 0) {
        await ctx.reply("📊 No users found in database yet.");
        return;
      }

      const pageSize = 4;
      const totalPages = Math.ceil(totalUsers / pageSize) || 1;
      const currentPage = Math.max(1, Math.min(page, totalPages));
      const startIndex = (currentPage - 1) * pageSize;
      const pageUsers = users.slice(startIndex, startIndex + pageSize);

      // Auto-backfill missing @username / firstName directly from Telegram API for existing DB users
      await Promise.all(
        pageUsers.map(async (u) => {
          if (!u.username && !u.firstName) {
            try {
              const chat: any = await ctx.api.getChat(Number(u.id));
              const fetchedUsername = chat?.username || null;
              const fetchedFirstName =
                [chat?.first_name, chat?.last_name].filter(Boolean).join(" ") ||
                chat?.title ||
                null;
              if (fetchedUsername || fetchedFirstName) {
                u.username = fetchedUsername;
                u.firstName = fetchedFirstName;
                await prisma.user.update({
                  where: { id: u.id },
                  data: {
                    username: fetchedUsername,
                    firstName: fetchedFirstName,
                  },
                });
              }
            } catch {
              // User chat unreachable or privacy restricted
            }
          }
        })
      );

      logger.admin(
        `Owner @${username || userId} opened /admin directory (Page ${currentPage}/${totalPages}, Total Users: ${totalUsers}, Launches: ${totalLaunches})`
      );

      let text =
        `┌───「 📊 <b>PANGEA OWNER PANEL</b> 」───\n` +
        `│ 🌐 Ethereum Mainnet (1) · 🟢 <b>Online</b>\n` +
        `└────────────────────────────────────────\n\n` +
        `📈 <b>OVERVIEW:</b>\n` +
        `├─ 👥 <b>Users</b>    : <b>${totalUsers}</b>\n` +
        `└─ 🚀 <b>Launches</b> : <b>${totalLaunches}</b>\n\n` +
        `📋 <b>DIRECTORY</b> (Page ${currentPage} of ${totalPages}):\n\n`;

      for (let i = 0; i < pageUsers.length; i++) {
        const u = pageUsers[i];
        const globalIndex = startIndex + i + 1;
        const fullName = escapeHtml(u.firstName || "Telegram User");
        const uName = u.username
          ? `@${escapeHtml(u.username)}`
          : `<a href="tg://user?id=${u.id.toString()}">${fullName}</a>`;
        const walletAddr = u.wallet?.address || "No Wallet";
        const isUserBlocked = BlockService.isBlocked(u.id);
        const accessBadge = isUserBlocked ? "🔴 BLOCKED" : "🟢 ACTIVE";
        const actionCmd = isUserBlocked ? `/unblock_${u.id}` : `/block_${u.id}`;

        text +=
          `┌─ <b>[#${globalIndex.toString().padStart(2, "0")}]</b> ${uName} (${fullName})\n` +
          `│  ├─ 🆔 <b>ID</b>       : <code>${u.id.toString()}</code>\n` +
          `│  ├─ 💳 <b>Wallet</b>   : <code>${walletAddr}</code>\n` +
          `│  ├─ 🏷️ <b>Platform</b> : ${u.platform}\n` +
          `│  ├─ 🛡️ <b>Status</b>   : <b>${accessBadge}</b> (${actionCmd})\n`;

        if (u.launches.length > 0) {
          const tokenList = u.launches
            .map((l) => {
              const caShort = l.tokenAddress.slice(0, 6) + "..." + l.tokenAddress.slice(-4);
              const spec = PLATFORM_SPECS[(l.platform || "stokerium") as LaunchPlatform];
              const link = spec.getExplorerUrl(l.tokenAddress);
              return `<a href="${link}">$${escapeHtml(l.symbol)}</a> (<code>${caShort}</code>)`;
            })
            .join(", ");
          text += `│  └─ 🚀 <b>Tokens (${u.launches.length})</b>: ${tokenList}\n\n`;
        } else {
          text += `│  └─ 🚀 <b>Tokens</b>   : 0\n\n`;
        }
      }

      const keyboard = new InlineKeyboard();
      if (totalPages > 1) {
        if (currentPage > 1) {
          keyboard.text("◀️ Prev", `admin_page_${currentPage - 1}`);
        }
        keyboard.text(`📄 ${currentPage} / ${totalPages}`, `admin_page_${currentPage}`);
        if (currentPage < totalPages) {
          keyboard.text("Next ▶️", `admin_page_${currentPage + 1}`);
        }
        keyboard.row();
      }

      keyboard
        .text("🔄 Refresh", `admin_page_${currentPage}`)
        .text("❌ Close", "action_dismiss_msg");

      if (edit && ctx.callbackQuery) {
        try {
          await ctx.editMessageText(text, {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
            reply_markup: keyboard,
          });
          return;
        } catch {
          return;
        }
      }

      await ctx.reply(text, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: keyboard,
      });
    } catch (err: unknown) {
      logger.error(`Error querying users for admin: ${(err as Error).message}`);
    }
  }

  /**
   * Real-time Telegram alert to ADMIN_TELEGRAM_ID on new user registration
   */
  public static async notifyAdminNewUser(
    api: any,
    user: {
      id: bigint;
      username?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      walletAddress?: string;
      isNew?: boolean;
    }
  ) {
    const rawA = ENV.ADMIN_TELEGRAM_ID.trim();
    const rawB = ENV.ADMIN_USERNAME.trim();
    const adminIdStr = /^\d+$/.test(rawA) ? rawA : /^\d+$/.test(rawB) ? rawB : "";
    if (!adminIdStr || user.id.toString() === adminIdStr) return;

    try {
      const uName = user.username ? `@${escapeHtml(user.username)}` : "<i>No @username</i>";
      const name = escapeHtml([user.firstName, user.lastName].filter(Boolean).join(" ") || "User");

      const message =
        `┌───「 🆕 <b>NEW USER REGISTERED</b> 」───\n` +
        `│ 🌐 Teleth • Ethereum Mainnet\n` +
        `└───────────────────────────────\n\n` +
        `👤 <b>User</b>        : ${uName} (${name})\n` +
        `🆔 <b>Telegram ID</b> : <code>${user.id.toString()}</code>\n` +
        `💳 <b>Dev Vault</b>   : <code>${user.walletAddress || "Generated"}</code>\n` +
        `⏱️ <b>Timestamp</b>   : ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC`;

      await api.sendMessage(Number(adminIdStr), message, {
        parse_mode: "HTML",
      });
    } catch (err: unknown) {
      logger.warn(`Could not send admin alert: ${(err as Error).message}`);
    }
  }

  public static async notifyAdminLaunch(
    api: any,
    info: {
      userId: bigint;
      username?: string | null;
      tokenName: string;
      tokenSymbol: string;
      evmCa: string;
      solanaCa?: string;
      txHash: string;
      initialBuyEth: string;
    }
  ) {
    const rawA = ENV.ADMIN_TELEGRAM_ID.trim();
    const rawB = ENV.ADMIN_USERNAME.trim();
    const adminIdStr = /^\d+$/.test(rawA) ? rawA : /^\d+$/.test(rawB) ? rawB : "";
    if (!adminIdStr) return;

    try {
      const uName = info.username ? `@${escapeHtml(info.username)}` : `User [${info.userId}]`;
      const message =
        `🚀 <b>LIVE TOKEN DEPLOYED ON PANGEA</b>\n\n` +
        `👤 <b>Creator:</b> ${uName}\n` +
        `🏷️ <b>Token:</b> ${escapeHtml(info.tokenName)} ($${escapeHtml(info.tokenSymbol)})\n` +
        `🔷 <b>EVM CA:</b> <code>${info.evmCa}</code>\n` +
        (info.solanaCa ? `🟣 <b>Solana OFT:</b> <code>${info.solanaCa}</code>\n` : "") +
        `💰 <b>First Buy:</b> ${info.initialBuyEth} ETH\n` +
        `🔗 <b>Tx Hash:</b> <a href="https://etherscan.io/tx/${info.txHash}">View Etherscan</a>\n` +
        `🌐 <b>Pangea Link:</b> https://www.pangea.trade/app/t/${info.evmCa}`;

      await api.sendMessage(Number(adminIdStr), message, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    } catch {}
  }

  /**
   * Handles /block <userId> or /block_<userId>
   */
  public static async handleBlockCommand(ctx: BotContext) {
    const from = ctx.from;
    if (!from || !AdminHandler.isAuthorizedAdmin(BigInt(from.id), from.username)) {
      return;
    }

    const text = ctx.message?.text?.trim() || "";
    const match = text.match(/^\/(?:block|ban)(?:_|\s+)(\d+)$/);
    if (!match) {
      await ctx.reply(
        `ℹ️ <b>Usage:</b> <code>/block &lt;userId&gt;</code>`,
        { parse_mode: "HTML" }
      );
      return;
    }

    const targetId = match[1];
    if (targetId === from.id.toString()) {
      await ctx.reply("⚠️ You cannot block yourself.");
      return;
    }

    await BlockService.blockUser(targetId);
    await ctx.reply(
      `🚫 <b>USER BLOCKED</b>\n\n• <b>Telegram ID:</b> <code>${targetId}</code>\n• Unblock anytime: <code>/unblock ${targetId}</code>`,
      { parse_mode: "HTML" }
    );
  }

  /**
   * Handles /unblock <userId> or /unblock_<userId>
   */
  public static async handleUnblockCommand(ctx: BotContext) {
    const from = ctx.from;
    if (!from || !AdminHandler.isAuthorizedAdmin(BigInt(from.id), from.username)) {
      return;
    }

    const text = ctx.message?.text?.trim() || "";
    const match = text.match(/^\/(?:unblock|unban)(?:_|\s+)(\d+)$/);
    if (!match) {
      await ctx.reply(
        `ℹ️ <b>Usage:</b> <code>/unblock &lt;userId&gt;</code>`,
        { parse_mode: "HTML" }
      );
      return;
    }

    const targetId = match[1];
    await BlockService.unblockUser(targetId);
    await ctx.reply(
      `🟢 <b>USER UNBLOCKED</b>\n\n• <b>Telegram ID:</b> <code>${targetId}</code>`,
      { parse_mode: "HTML" }
    );
  }
}
