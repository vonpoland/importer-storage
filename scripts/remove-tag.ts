import { Storage } from "../src";

const storage = new Storage.S3Storage();

await storage.removeTag("images/1234", ["delete:60d"]);
