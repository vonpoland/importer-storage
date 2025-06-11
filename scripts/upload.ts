import { Storage } from "../src";

const storage = new Storage.S3Storage();

const result = await storage.saveFiles(
  [
    {
      key: "test.png",
      filePath: "scripts/test.png",
    },
    // {
    //   key: "urlfile.png",
    //   filePath:
    //     "https://file-examples.com/wp-content/storage/2017/10/file_example_PNG_500kB.png",
    // },
  ],
  {
    savePath: "images/1234",
    tags: ["delete:60d"],
  },
);

console.info(`Results ${JSON.stringify(result, null, 2)}`);
