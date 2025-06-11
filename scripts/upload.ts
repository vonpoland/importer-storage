import { Storage } from "../src/index.js";

const storage = new Storage.S3Storage();

const result = await storage.saveFiles(
  [
    // {
    //   key: "test.png",
    //   filePath: "scripts/test.png",
    // },
    {
      key: "wooto.png",
      filePath:
        "https://wooto-s3.s3.eu-central-003.backblazeb2.com/images/3c8bedcc-845e-4849-a4bd-1e8289b47400/6e64176f-ecbd-4dfe-9814-10f8b157aaa5/w_1920_h_1440_47617adf-112b-4338-856d-aa8b89f62fd5.jpeg",
    },
  ],
  {
    savePath: "images/1234",
    tags: ["delete:60d"],
  },
);

console.info(`Results ${JSON.stringify(result, null, 2)}`);
