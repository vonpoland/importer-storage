import {
  S3Client,
  PutObjectCommand,
  GetObjectTaggingCommand,
  PutObjectTaggingCommand,
  ListObjectsCommand,
} from "@aws-sdk/client-s3";
import { createReadStream } from "fs";

import { config } from "dotenv";
import axios from "axios";
import { IStorage } from "../models/storage/storage.js";
import { StorageTag } from "../models/storage/tags.js";
import { ReadStream } from "node:fs";
import { Jimp } from "jimp";
import { HttpsProxyAgent } from "https-proxy-agent";
import { performance } from "perf_hooks";

config();

if (!process.env.AWS_EXECUTION_ENV && !process.env.AWS_ACCESS_KEY_ID) {
  throw new Error("'AWS_ACCESS_KEY_ID' not set");
}

if (!process.env.AWS_EXECUTION_ENV && !process.env.AWS_ACCESS_KEY) {
  throw new Error("'AWS_ACCESS_KEY' not set");
}

function extractFileInfo(filePath: string) {
  const parts = filePath.split("/");
  const key = parts[parts.length - 1];
  const extMatch = key.match(/\.([^.]+)$/);
  const extension = extMatch ? extMatch[1].toLowerCase() : null;

  return { key, extension: extension || "jpg" };
}

const s3 = new S3Client(
  !process.env.AWS_EXECUTION_ENV &&
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_ACCESS_KEY &&
  process.env.AWS_REGION
    ? {
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_ACCESS_KEY!,
        },
      }
    : {},
);
const BUCKET_NAME = process.env.AWS_BUCKET_NAME as string;

if (!BUCKET_NAME) {
  throw new Error("'AWS_BUCKET_NAME' name not set");
}
function isHttp(url: string) {
  return url.startsWith("http://") || url.startsWith("https://");
}
export class S3Storage implements IStorage {
  async saveFiles(
    keys: Array<{ key: string; filePath: string }>,
    options: {
      tags: Array<StorageTag>;
      savePath: string;
      headers?: Record<string, string>;
      logging?: boolean;
      proxyUrl?: string;
    },
  ) {
    const result: Array<{ key: string; filePath: string; uploadUrl: string }> =
      [];
    const errored: Array<{ key: string; filePath: string; message: string }> =
      [];
    const proxyAgent =
      options?.proxyUrl && new HttpsProxyAgent(options?.proxyUrl);

    if (options.logging) {
      console.info(`[SaveFiles] Start saving ${keys.length} file(s)`);
      console.time(`[SaveFiles] Total time`);
    }

    for (const { key, filePath } of keys) {
      const start = performance.now();

      if (options.logging) {
        console.info(`\n[Processing Start] key=${key}, filePath=${filePath}`);
      }

      try {
        const s3Key = `${options.savePath}/${key}`;
        if (options.logging) {
          console.info(`[S3 Key] ${s3Key}`);
        }

        let stream: ReadStream | undefined = undefined;
        let buffer: Buffer | undefined = undefined;

        if (isHttp(filePath)) {
          if (options.logging) {
            console.info(`[Download Start] ${filePath}`);
          }

          const axiosResponse = await axios.get(filePath, {
            responseType: "arraybuffer",
            headers: options.headers,
            httpsAgent: proxyAgent,
          });

          if (options.logging) {
            console.info(`[Download Success] ${filePath}`);
          }

          buffer = Buffer.from(axiosResponse.data);
        } else {
          if (options.logging) {
            console.info(`[Read from FS] ${filePath}`);
          }

          stream = createReadStream(filePath);
        }

        const tagString = options.tags
          .map(
            (tag) =>
              `${encodeURIComponent(tag.split(":")[0])}=${encodeURIComponent(tag.split(":")[1])}`,
          )
          .join("&");

        if (!stream && !buffer) {
          if (options.logging) {
            console.warn(`[Error] Neither stream nor buffer is set for ${key}`);
          }
          throw new Error("buffer or stream not set");
        }

        if (options.logging) {
          console.info(`[Image Processing Start] ${key}`);
        }

        const image = buffer
          ? await Jimp.fromBuffer(buffer)
          : await Jimp.read(filePath);

        if (options.logging) {
          console.info(
            `[Image Loaded] key=${key}, width=${image.width}, height=${image.height}`,
          );
        }

        const command = new PutObjectCommand({
          Body: buffer || stream,
          Bucket: BUCKET_NAME,
          Key: s3Key,
          Tagging: tagString || undefined,
          ContentType: `image/${extractFileInfo(key).extension}`,
          ContentDisposition: "inline",
          Metadata: {
            "img-width": image.width.toString(),
            "img-height": image.height.toString(),
          },
        });

        result.push({
          key,
          filePath,
          uploadUrl: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`,
        });

        if (options.logging) {
          console.info(`[Uploading] ${key} to S3...`);
        }

        await s3.send(command);

        if (options.logging) {
          console.info(`[Upload Success] ${key}`);
        }
      } catch (e) {
        const error = e as { message: string };

        if (options.logging) {
          console.error(`[Upload Error] key=${key}, error=${error.message}`);
        }

        errored.push({
          key,
          filePath,
          message: error.message,
        });
      }

      const end = performance.now();
      if (options.logging) {
        console.info(
          `[Processing End] key=${key}, duration=${(end - start).toFixed(0)}ms`,
        );
      }
    }

    if (options.logging) {
      console.timeEnd(`[SaveFiles] Total time`);
      console.info(
        `[SaveFiles] Completed. Success: ${result.length}, Failed: ${errored.length}`,
      );
    }

    return { result, errored };
  }

  async removeTag(savePath: string, tags: Array<StorageTag>): Promise<void> {
    const list = await s3.send(
      new ListObjectsCommand({
        Bucket: BUCKET_NAME,
        Prefix: savePath + "/",
        MaxKeys: 1000,
      }),
    );

    if (!list.Contents) return;

    for (const obj of list.Contents) {
      if (!obj.Key) continue;

      const currentTags = await s3.send(
        new GetObjectTaggingCommand({
          Bucket: BUCKET_NAME,
          Key: obj.Key,
        }),
      );

      const filteredTags =
        currentTags.TagSet?.filter(
          (t) => !tags.includes(`${t.Key}:${t.Value}` as StorageTag),
        ) || [];

      await s3.send(
        new PutObjectTaggingCommand({
          Bucket: BUCKET_NAME,
          Key: obj.Key,
          Tagging: { TagSet: filteredTags },
        }),
      );
    }
  }
}
