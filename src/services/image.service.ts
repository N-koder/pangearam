import sharp from "sharp";
import axios from "axios";
import { Readable } from "stream";
import { logger } from "../utils/logger";

// Render Free Tier 512MB RAM Protection: disable Sharp internal cache & limit concurrency
sharp.cache(false);
sharp.concurrency(1);

export interface MetadataParams {
  description: string;
  imageUri: string;
  platform?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}

export interface ProcessedImageResult {
  buffer: Buffer;
  previewUri: string;
}

export class ImageService {
  /**
   * Streams a user photo from Telegram into Sharp, resizes it to 384x384,
   * compresses it to compact WebP (<18KB), and returns the buffer and preview data URI
   * without spiking heap memory on Render's 512MB free tier.
   */
  public static async processTelegramImage(
    fileUrl: string
  ): Promise<ProcessedImageResult> {
    try {
      const startTime = Date.now();
      const response = await axios.get<Readable>(fileUrl, {
        responseType: "stream",
        timeout: 10000,
      });

      const transformer = sharp({ sequentialRead: true })
        .resize(384, 384, {
          fit: "cover",
          position: "center",
        })
        .webp({ quality: 62, effort: 4 });

      const processedBuffer = await response.data.pipe(transformer).toBuffer();

      const elapsedMs = Date.now() - startTime;
      logger.info(
        `Logo processed via streaming pipeline in ${elapsedMs}ms (${(processedBuffer.length / 1024).toFixed(2)} KB WebP)`
      );

      const base64 = processedBuffer.toString("base64");
      return {
        buffer: processedBuffer,
        previewUri: `data:image/webp;base64,${base64}`,
      };
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Error processing logo stream: ${err.message}`);
      throw new Error(`Failed to process image: ${err.message}`);
    }
  }

  /**
   * Builds canonical JSON metadata URI (<= 2048 bytes) for Ethereum launchpad factories.
   */
  public static buildMetadataURI(params: MetadataParams): string {
    const metadata: Record<string, unknown> = {
      v: 1,
      description: params.description || "",
      image: params.imageUri,
    };

    if (params.platform) metadata.platform = params.platform;
    if (params.website) metadata.external_url = params.website;
    if (params.twitter) metadata.twitter = params.twitter;
    if (params.telegram) metadata.telegram = params.telegram;

    const jsonString = JSON.stringify(metadata);
    const base64 = Buffer.from(jsonString).toString("base64");
    let result = `data:application/json;base64,${base64}`;

    if (result.length > 2048) {
      metadata.description = (params.description || "").substring(0, 80);
      metadata.image = params.imageUri.startsWith("data:")
        ? "https://ethereum.org/favicon.ico"
        : params.imageUri;
      result = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`;
    }

    return result;
  }
}
