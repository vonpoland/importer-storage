import { Storage } from "../src/index.js";

const storage = new Storage.S3Storage();

const result = await storage.saveFiles(
  [
    {
      filePath:
        "https://cdn.autobid.de/data/cars/30905/3090456/84039101_hd.jpg",

      key: "84039101_hd.jpg",
    },
  ],
  {
    tags: ["delete:1d"],
    savePath: "test/mk",
    logging: true,
    proxyUrl: "http://zipemgwh:a4gp059njzh1@138.128.148.73:6633",
  },
);

console.info(`Results ${JSON.stringify(result, null, 2)}`);
