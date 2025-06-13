import { App } from "aws-cdk-lib";
import { ScrapperStack } from "../lib/scrapper.stack";
import { config } from "dotenv";

config();

const app = new App();

console.info(
  `Params stack name ${process.env.STACK_NAME} cors path: ${process.env.CORS_PATH}`,
);

new ScrapperStack(
  app,
  process.env.STACK_NAME || "ScrapperUploadStack",
  undefined,
  process.env.CORS_PATH ? [process.env.CORS_PATH] : [],
);
