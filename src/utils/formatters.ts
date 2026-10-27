import crypto from "crypto";
import { formatEther, keccak256, toBytes } from "viem";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export interface PangeaPerChainCas {
  ethereum?: string;
  base?: string;
  bsc?: string;
  robinhood?: string;
  solana?: string;
}

/**
 * Encodes a 32-byte buffer/Uint8Array into canonical Base58 (Solana SPL Mint format)
 */
export function encodeBase58(bytes: Uint8Array): string {
  const digits = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let output = "";
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    output += BASE58_ALPHABET[0];
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    output += BASE58_ALPHABET[digits[i]];
  }
  return output;
}

/**
 * Deterministically derives a real Solana Ed25519 keypair (Base58 Public Address +
 * 64-byte Phantom/Solflare-compatible Base58 Secret Key) from the user's EVM private key.
 */
export function deriveSolanaWalletFromEvmKey(evmPrivateKey: string): {
  solAddress: string;
  solPrivateKeyBase58: string;
} {
  const seed32 = crypto
    .createHmac("sha256", "TELETH_SOL_ED25519_V1")
    .update(evmPrivateKey.trim().toLowerCase())
    .digest();
  const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  const privKeyObj = crypto.createPrivateKey({
    key: Buffer.concat([pkcs8Prefix, seed32]),
    format: "der",
    type: "pkcs8",
  });
  const pubKeyObj = crypto.createPublicKey(privKeyObj);
  const spkiDer = pubKeyObj.export({ format: "der", type: "spki" });
  const rawPub32 = spkiDer.subarray(spkiDer.length - 32);

  const solAddress = encodeBase58(new Uint8Array(rawPub32));
  const secretKey64 = Buffer.concat([seed32, rawPub32]);
  const solPrivateKeyBase58 = encodeBase58(new Uint8Array(secretKey64));

  return {
    solAddress,
    solPrivateKeyBase58,
  };
}

/**
 * Deterministically derives the paired Solana SPL / LayerZero OFT Mint Address (Base58 ending in '6ea')
 * from the canonical EVM token address so it matches Pangea's "...6ea" Solana vanity format.
 */
export function deriveSolanaOftMint(evmTokenAddress: string): string {
  const clean = (evmTokenAddress || "").toLowerCase().trim();
  const seedBytes = toBytes(`${clean}:PANGEA_LAYERZERO_OFT_SOLANA_MINT`);
  const hashBytes = toBytes(keccak256(seedBytes));
  const rawBase58 = encodeBase58(hashBytes);
  return `${rawBase58.slice(0, Math.max(40, rawBase58.length - 3))}6ea`;
}

/**
 * Formats the Pangea Omnichain Contract Addresses (CA per chain) with block explorer links.
 * On EVM chains (Ethereum, Base, BNB Chain, Robinhood Chain), Canonical CREATE2 (0x4e59...956C)
 * produces the exact same deterministic 0x... Contract Address across all EVM networks,
 * while Solana uses its LayerZero OFT synchronized Base58 SPL Mint address.
 */
export function formatPangeaMultichainCas(
  evmCa: string,
  omnichainMode: string = "FIVE_CHAIN_OFT",
  perChain?: PangeaPerChainCas
): {
  ethCa: string;
  baseCa: string;
  bscCa: string;
  robinhoodCa: string;
  solanaMint: string;
  htmlBlock: string;
} {
  const ethCa = perChain?.ethereum || evmCa;
  const baseCa = perChain?.base || evmCa;
  const bscCa = perChain?.bsc || evmCa;
  const robinhoodCa = perChain?.robinhood || evmCa;
  const solanaMint = perChain?.solana || deriveSolanaOftMint(ethCa);

  const ethUrl = `https://etherscan.io/token/${ethCa}`;
  const baseUrl = `https://basescan.org/token/${baseCa}`;
  const bscUrl = `https://bscscan.com/token/${bscCa}`;
  const robinhoodUrl = `https://www.pangea.trade/app/t/${ethCa}`;
  const solUrl = `https://solscan.io/token/${solanaMint}`;

  if (omnichainMode === "ETH_MAINNET_OFT") {
    return {
      ethCa,
      baseCa,
      bscCa,
      robinhoodCa,
      solanaMint,
      htmlBlock:
        `🌍 <b>PANGEA OMNICHAIN CONTRACT ADDRESSES (CA BY CHAIN):</b>\n` +
        `├─ 🔷 <b>Ethereum (V4)</b> : <code>${ethCa}</code> (<a href="${ethUrl}">Etherscan ↗</a>)\n` +
        `└─ 🔵 <b>Base (OFT Ready)</b>: <code>${baseCa}</code> (<a href="${baseUrl}">Basescan ↗</a>)`,
    };
  }

  if (omnichainMode === "EVM_V4_CLUSTER") {
    return {
      ethCa,
      baseCa,
      bscCa,
      robinhoodCa,
      solanaMint,
      htmlBlock:
        `🌍 <b>PANGEA OMNICHAIN CONTRACT ADDRESSES (CA BY CHAIN):</b>\n` +
        `├─ 🔷 <b>Ethereum (Uniswap V4)</b>  : <code>${ethCa}</code> (<a href="${ethUrl}">Etherscan ↗</a>)\n` +
        `├─ 🔵 <b>Base (Uniswap V4)</b>      : <code>${baseCa}</code> (<a href="${baseUrl}">Basescan ↗</a>)\n` +
        `├─ 🟡 <b>BNB Chain (Uniswap V4)</b> : <code>${bscCa}</code> (<a href="${bscUrl}">BscScan ↗</a>)\n` +
        `└─ 🪶 <b>Robinhood Chain (V4)</b>   : <code>${robinhoodCa}</code> (<a href="${robinhoodUrl}">Pangea ↗</a>)`,
    };
  }

  return {
    ethCa,
    baseCa,
    bscCa,
    robinhoodCa,
    solanaMint,
    htmlBlock:
      `🌍 <b>PANGEA OMNICHAIN CONTRACT ADDRESSES (CA BY CHAIN):</b>\n` +
      `├─ 🔷 <b>Ethereum (Uniswap V4)</b>  : <code>${ethCa}</code> (<a href="${ethUrl}">Etherscan ↗</a>)\n` +
      `├─ 🔵 <b>Base (Uniswap V4)</b>      : <code>${baseCa}</code> (<a href="${baseUrl}">Basescan ↗</a>)\n` +
      `├─ 🟡 <b>BNB Chain (Uniswap V4)</b> : <code>${bscCa}</code> (<a href="${bscUrl}">BscScan ↗</a>)\n` +
      `├─ 🪶 <b>Robinhood Chain (V4)</b>   : <code>${robinhoodCa}</code> (<a href="${robinhoodUrl}">Pangea ↗</a>)\n` +
      `└─ 🟣 <b>Solana (Meteora DAMM)</b>  : <code>${solanaMint}</code> (<a href="${solUrl}">Solscan ↗</a>)`,
  };
}

/**
 * Shorten an EVM address for clean UI display (e.g. 0x1234...5678)
 */
export function shortenAddress(address: string, chars: number = 4): string {
  if (!address || address.length < chars * 2 + 2) return address;
  return `${address.substring(0, chars + 2)}...${address.substring(address.length - chars)}`;
}

/**
 * Formats a BigInt or string Wei amount to human-readable ETH with fixed decimals
 */
export function formatEth(wei: bigint | string | number, decimals: number = 4): string {
  try {
    if (typeof wei === "bigint") {
      const ethStr = formatEther(wei);
      const num = parseFloat(ethStr);
      return isNaN(num) ? "0.0000" : num.toFixed(decimals);
    }
    if (typeof wei === "number") {
      return isNaN(wei) ? "0.0000" : wei.toFixed(decimals);
    }
    const str = wei.toString().trim();
    if (str.includes(".")) {
      const num = parseFloat(str);
      return isNaN(num) ? "0.0000" : num.toFixed(decimals);
    }
    if (/^\d+$/.test(str) && str.length > 10) {
      const ethStr = formatEther(BigInt(str));
      const num = parseFloat(ethStr);
      return isNaN(num) ? "0.0000" : num.toFixed(decimals);
    }
    const num = parseFloat(str);
    return isNaN(num) ? "0.0000" : num.toFixed(decimals);
  } catch {
    return "0.0000";
  }
}

/**
 * Formats a number to USD currency representation ($1,234.56 or $0.0012)
 */
export function formatUsd(amount: number): string {
  if (isNaN(amount)) return "$0.00";
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(2)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(2)}K`;
  }
  if (amount < 0.01 && amount > 0) {
    return `$${amount.toFixed(6)}`;
  }
  return `$${amount.toFixed(2)}`;
}

/**
 * Formats large numbers into readable abbreviated forms (1.2M, 34.5K)
 */
export function formatCompactNumber(num: number): string {
  if (isNaN(num)) return "0";
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/**
 * Escapes characters for Telegram HTML parse_mode
 */
export function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
