import { StorageTag } from "./tags.js";

export interface IStorage {
  saveFiles(
    keys: Array<{ key: string; filePath: string }>,
    options: {
      tags: Array<StorageTag>;
      savePath: string;
    },
  ): Promise<{ urls: string }>;

  removeTag(savePath: string, tags: Array<StorageTag>): Promise<void>;
}
