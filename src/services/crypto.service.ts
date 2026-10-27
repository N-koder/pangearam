import crypto from "crypto";
import { ENV } from "../config/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit standard recommended for AES-GCM

export class CryptoService {
  private static getMasterKeyBuffer(): Buffer {
    const keyHex = ENV.ENCRYPTION_MASTER_KEY;
    if (!keyHex || keyHex.length !== 64) {
      throw new Error("Invalid ENCRYPTION_MASTER_KEY: must be a 32-byte (64 character) hex string");
    }
    return Buffer.from(keyHex, "hex");
  }

  /**
   * Encrypts a private key string using AES-256-GCM.
   * Packed format: `${ivHex}:${tagHex}:${ciphertextHex}`
   */
  public static encryptPrivateKey(privateKeyHex: string): string {
    const masterKey = CryptoService.getMasterKeyBuffer();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);

    let encrypted = cipher.update(privateKeyHex, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");

    return `${iv.toString("hex")}:${tag}:${encrypted}`;
  }

  /**
   * Decrypts an encrypted private key string.
   * Expects packed format: `${ivHex}:${tagHex}:${ciphertextHex}`
   */
  public static decryptPrivateKey(packedData: string): string {
    const [ivHex, tagHex, ciphertextHex] = packedData.split(":");
    if (!ivHex || !tagHex || !ciphertextHex) {
      throw new Error("Invalid encrypted payload format: expected iv:tag:ciphertext");
    }

    const masterKey = CryptoService.getMasterKeyBuffer();
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      masterKey,
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));

    let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }
}
