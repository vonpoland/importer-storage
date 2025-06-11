import {
  GetObjectTaggingCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { S3Event } from "aws-lambda";
import axios from "axios";
import { Jimp, JimpMime } from "jimp";

export const handler = async (event: S3Event) => {
  const BUCKET_NAME = process.env.AWS_BUCKET_NAME as string;

  if (!BUCKET_NAME) {
    throw new Error("'AWS_BUCKET_NAME' name not set");
  }

  const s3 = new S3Client({});

  for (const record of event.Records) {
    const key = record.s3.object.key;

    if (key.includes("mini_")) {
      console.log(`Skip file: ${key}`);
      continue;
    }

    const originalUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    console.info(`Processing ${originalUrl} ${JSON.stringify(record)}`);
    const axiosResponse = await axios.get(originalUrl, {
      responseType: "arraybuffer",
    });
    const buffer = Buffer.from(axiosResponse.data);
    const image = await Jimp.fromBuffer(buffer);

    const resizedImage = await image
      .resize({
        w: 110,
      })
      .getBuffer(JimpMime.jpeg);

    const miniKey = key.replace(/([^/]+)$/, "mini_$1");
    const taggingRes = await s3.send(
      new GetObjectTaggingCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      }),
    );

    const tags = taggingRes.TagSet;

    console.log(`Saving thumbnail with key: ${miniKey}`);
    const tagString =
      tags
        ?.map(
          (tag) =>
            `${encodeURIComponent(tag.Key!)}=${encodeURIComponent(tag.Value!)}`,
        )
        .join("&") || undefined;

    console.log(`Save with tag ${tagString}`);

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: miniKey,
        Body: resizedImage,
        ContentType: JimpMime.jpeg,
        Tagging: tagString,
      }),
    );

    console.log(`Thumbnail: ${miniKey} upload success.`);
  }
};
