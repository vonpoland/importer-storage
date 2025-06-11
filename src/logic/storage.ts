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

config();

if (!process.env.AWS_ACCESS_KEY_ID) {
  throw new Error("'AWS_ACCESS_KEY_ID' not set");
}

if (!process.env.AWS_ACCESS_KEY) {
  throw new Error("'AWS_ACCESS_KEY' not set");
}

function extractFileInfo(filePath: string) {
  const parts = filePath.split("/");
  const key = parts[parts.length - 1];
  const extMatch = key.match(/\.([^.]+)$/);
  const extension = extMatch ? extMatch[1].toLowerCase() : null;

  return { key, extension: extension || "jpg" };
}

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_ACCESS_KEY,
  },
});
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
    },
  ): Promise<{ urls: string }> {
    const urls: string[] = [];

    for (const { key, filePath } of keys) {
      const s3Key = `${options.savePath}/${key}`;

      let stream: ReadStream;

      if (isHttp(filePath)) {
        stream = await axios.get(filePath, {
          responseType: "stream",
        });
      }

      stream = createReadStream(filePath);
      const tagString = options.tags
        .map(
          (tag) =>
            `${encodeURIComponent(tag.split(":")[0])}=${encodeURIComponent(tag.split(":")[1])}`,
        )
        .join("&");

      const command = new PutObjectCommand({
        Body: stream,
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Tagging: tagString || undefined,
        ContentType: `image/${extractFileInfo(key).extension}`,
        ContentDisposition: "inline",
      });

      await s3.send(command);

      urls.push(
        `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`,
      );
    }

    return { urls: urls.join(",") };
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
