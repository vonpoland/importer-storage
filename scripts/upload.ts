import { Storage } from "../src/index.js";

const storage = new Storage.S3Storage();

const result = await storage.saveFiles(
  [
    {
      key: "5522295f-a510-4e57-9350-27fc2cce9737.jpg",
      filePath:
        "https://www.restwertboerse.ch/file/5463115/1749414872-5141923.jpg",
    },
  ],
  {
    tags: ["delete:1d"],
    savePath: "6849d994557780049ca304c3",
    headers: {
      cookie: "rwbsessionid=7cemeq3mt3o2go3psri3ehrkjf",
    },
  },
);

console.info(`Results ${JSON.stringify(result, null, 2)}`);
