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
import pLimit from "p-limit";

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

const getS3Client = (regionName?: string) => {
  if (regionName && regionName === process.env.AWS_REGION) {
    return s3;
  }

  return new S3Client(
    !process.env.AWS_EXECUTION_ENV &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_ACCESS_KEY &&
    regionName
      ? {
          region: regionName,
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_ACCESS_KEY!,
          },
        }
      : {},
  );
};
const BUCKET_NAME = process.env.AWS_BUCKET_NAME as string;

if (!BUCKET_NAME) {
  throw new Error("'AWS_BUCKET_NAME' name not set");
}
function isHttp(url: string) {
  return url.startsWith("http://") || url.startsWith("https://");
}

type Options = {
  tags: Array<StorageTag>;
  savePath: string;
  headers?: Record<string, string>;
  logging?: boolean;
  proxyUrl?: string;
  parallelLimit?: number;
};

const processRecord = async (
  {
    filePath,
    key,
  }: {
    key: string;
    filePath: string;
  },
  options: Options,
  proxyAgent?: HttpsProxyAgent<string>,
): Promise<{
  key: string;
  filePath: string;
  uploadUrl?: string;
  message?: string;
  error: boolean;
}> => {
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

    if (options.logging) {
      console.info(`[Uploading] ${key} to S3...`);
    }

    await s3.send(command);

    if (options.logging) {
      console.info(`[Upload Success] ${key}`);
    }

    return {
      error: false,
      key,
      filePath,
      uploadUrl: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`,
    };
  } catch (e) {
    const error = e as { message: string };

    if (options.logging) {
      console.error(`[Upload Error] key=${key}, error=${error.message}`);
    }

    return {
      error: true,
      key,
      filePath,
      message: error.message,
    };
  } finally {
    const end = performance.now();

    if (options.logging) {
      console.info(
        `[Processing End] key=${key}, duration=${(end - start).toFixed(0)}ms`,
      );
    }
  }
};

export class S3Storage implements IStorage {
  async saveFiles(
    keys: Array<{ key: string; filePath: string }>,
    options: Options,
  ) {
    const parallelLimit = options.parallelLimit || 2;

    const limit = pLimit(parallelLimit);
    const result: Array<{ key: string; filePath: string; uploadUrl: string }> =
      [];
    const errored: Array<{ key: string; filePath: string; message: string }> =
      [];
    const proxyAgent =
      options?.proxyUrl && new HttpsProxyAgent(options?.proxyUrl);

    if (options.logging) {
      console.info(`[SaveFiles] Start saving ${keys.length} file(s)`);
      console.time(`[SaveFiles] Total time ${parallelLimit}`);
    }

    // keys

    await Promise.all(
      keys.map((record, index) =>
        limit(async () => {
          if (options.logging) {
            console.info(
              `Running p-limit task ${index}, limit: ${parallelLimit}`,
            );
          }
          const processResult = await processRecord(
            record,
            options,
            proxyAgent || undefined,
          );

          if (processResult.message) {
            errored.push({
              key: processResult.key,
              filePath: processResult.filePath,
              message: processResult.message,
            });
          } else if (processResult.uploadUrl) {
            result.push({
              key: processResult.key,
              filePath: processResult.filePath,
              uploadUrl: processResult.uploadUrl,
            });
          }
        }),
      ),
    );

    if (options.logging) {
      console.timeEnd(`[SaveFiles] Total time ${parallelLimit}`);
      console.info(
        `[SaveFiles] Completed. Success: ${result.length}, Failed: ${errored.length}`,
      );
    }

    return { result, errored };
  }

  async removeTag(
    savePath: string,
    tags: Array<StorageTag>,
    options?: {
      bucketName: string;
      region: string;
    },
  ): Promise<boolean> {
    const Bucket = options?.bucketName || BUCKET_NAME;
    const s3Client = getS3Client(options?.region);

    console.info(`RemoveTag to bucket ${Bucket}`);
    const list = await s3Client.send(
      new ListObjectsCommand({
        Bucket,
        Prefix: savePath + "/",
        MaxKeys: 1000,
      }),
    );

    if (!list.Contents) {
      return false;
    }

    for (const obj of list.Contents) {
      if (!obj.Key) continue;

      const currentTags = await s3Client.send(
        new GetObjectTaggingCommand({
          Bucket,
          Key: obj.Key,
        }),
      );

      const filteredTags =
        currentTags.TagSet?.filter(
          (t) => !tags.includes(`${t.Key}:${t.Value}` as StorageTag),
        ) || [];

      await s3Client.send(
        new PutObjectTaggingCommand({
          Bucket,
          Key: obj.Key,
          Tagging: { TagSet: filteredTags },
        }),
      );
    }

    return true;
  }

  async addTag(
    savePath: string,
    tags: Array<StorageTag>,
    options?: {
      bucketName: string;
      region: string;
    },
  ): Promise<boolean> {
    if (!tags.length) {
      return false;
    }

    const s3Client = getS3Client(options?.region);

    const Bucket = options?.bucketName || BUCKET_NAME;
    console.info(`addTag to bucket ${Bucket}`);
    const list = await s3Client.send(
      new ListObjectsCommand({
        Bucket,
        Prefix: savePath + "/",
        MaxKeys: 1000,
      }),
    );

    if (!list.Contents) {
      return false;
    }

    const tagsToAdd = tags
      .map((tag) => {
        const [key, value] = tag.split(":");
        if (!key || value === undefined) return null;
        return { Key: key, Value: value };
      })
      .filter((t): t is { Key: string; Value: string } => t !== null);

    if (!tagsToAdd.length) {
      return false;
    }

    for (const obj of list.Contents) {
      if (!obj.Key) continue;

      const currentTags = await s3Client.send(
        new GetObjectTaggingCommand({
          Bucket,
          Key: obj.Key,
        }),
      );

      const existing = currentTags.TagSet ?? [];

      const tagMap = new Map<string, string>();
      for (const t of existing) {
        if (!t.Key || t.Value === undefined) continue;
        tagMap.set(t.Key, t.Value);
      }

      for (const t of tagsToAdd) {
        tagMap.set(t.Key, t.Value);
      }

      const mergedTags = Array.from(tagMap.entries()).map(([Key, Value]) => ({
        Key,
        Value,
      }));

      await s3Client.send(
        new PutObjectTaggingCommand({
          Bucket,
          Key: obj.Key,
          Tagging: { TagSet: mergedTags },
        }),
      );
    }

    return true;
  }
}
