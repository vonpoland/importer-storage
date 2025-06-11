import { App } from "aws-cdk-lib";
import { ScrapperStack } from "../lib/scrapper.stack";
import { config } from "dotenv";

config();

const app = new App();

new ScrapperStack(app, "ScrapperUploadStack");
