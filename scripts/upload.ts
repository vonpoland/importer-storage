import { Storage } from "../src/index.js";

const storage = new Storage.S3Storage();

const result = await storage.saveFiles(
  [
    {
      filePath:
        "https://app.bestcarprice.ch/api/v2/blobs/feb5550c-20ba-4b9e-96c6-4564ffeac0a6?var=2016x2016",
      key: "84039101_hd.jpg",
    },
    {
      filePath:
        "https://app.bestcarprice.ch/api/v2/blobs/feb5550c-20ba-4b9e-96c6-4564ffeac0a6?var=2016x2016",
      key: "84039101_hd.jpg",
    },
    {
      filePath:
        "https://app.bestcarprice.ch/api/v2/blobs/d19c5ab2-456a-40c2-8ad3-2c2407e02c70?var=2016x2016",
      key: "84039101_hd.jpg",
    },
  ],
  {
    tags: ["delete:1d"],
    savePath: "test/mk",
    logging: true,
    parallelLimit: 3,
  },
);

console.info(`Results ${JSON.stringify(result, null, 2)}`);
