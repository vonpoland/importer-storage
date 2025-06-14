import { Storage } from "../src/index.js";

const storage = new Storage.S3Storage();

const result = await storage.saveFiles(
  [
    {
      filePath: "https://example.test/.com",
      key: "84039101_hd.jpg",
    },
  ],
  {
    tags: ["delete:1d"],
    savePath: "test/mk",
    logging: true,
  },
);

console.info(`Results ${JSON.stringify(result, null, 2)}`);
