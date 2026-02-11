import { StorageTag } from "./tags.js";

export interface IStorage {
  saveFiles(
    keys: Array<{ key: string; filePath: string }>,
    options: {
      tags: Array<StorageTag>;
      savePath: string;
      headers?: Record<string, string>;
      logging?: boolean;
      proxyUrl?: string;
    },
  ): Promise<{
    errored: Array<{ key: string; filePath: string; message: string }>;
    result: Array<{ key: string; filePath: string; uploadUrl: string }>;
  }>;

  removeTag(
    savePath: string,
    tags: Array<StorageTag>,
    options?: {
      bucketName: string;
    },
  ): Promise<boolean>;

  addTag(
    savePath: string,
    tags: Array<StorageTag>,
    options?: {
      bucketName: string;
    },
  ): Promise<boolean>;
}
