import {
  GetObjectTaggingCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { S3Event } from "aws-lambda";
import axios from "axios";
import sharp from "sharp";

export const handler = async (event: S3Event) => {
  const BUCKET_NAME = process.env.AWS_BUCKET_NAME as string;

  if (!BUCKET_NAME) {
    throw new Error("'AWS_BUCKET_NAME' name not set");
  }
  // console.info(
  //   `Using sharp! processing record ${JSON.stringify(event.Records)}`,
  // );
  const s3 = new S3Client({});
  if (event.Records.length === 0) {
    // console.warn("empty records finish");
    return;
  }

  for (const record of event.Records) {
    const key = record.s3.object.key;

    if (key.includes("mini_")) {
      // console.log(`Skip file: ${key}`);
      continue;
    }

    const originalUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    // console.info(`Processing ${originalUrl} ${JSON.stringify(record)}`);
    const axiosResponse = await axios.get(originalUrl, {
      responseType: "arraybuffer",
    });
    const buffer = Buffer.from(axiosResponse.data);

    const resizedImage = await sharp(buffer)
      .resize({
        width: Number(process.env.AWS_THUMBNAIL_WIDTH),
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    const miniKey = key.replace(/([^/]+)$/, "mini_$1");
    const taggingRes = await s3.send(
      new GetObjectTaggingCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      }),
    );

    const tags = taggingRes.TagSet;

    // console.log(`Saving thumbnail with key: ${miniKey}`);
    const tagString =
      tags
        ?.map(
          (tag) =>
            `${encodeURIComponent(tag.Key!)}=${encodeURIComponent(tag.Value!)}`,
        )
        .join("&") || undefined;

    // console.log(`Save with tag ${tagString}`);

    const imageInfo = await sharp(resizedImage).metadata();

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: miniKey,
        Body: resizedImage,
        ContentType: "image/jpeg",
        Tagging: tagString,
        Metadata: {
          "img-width": imageInfo.width?.toString() || "0",
          "img-height": imageInfo.height?.toString() || "0",
        },
      }),
    );

    // console.log(`Thumbnail: ${miniKey} upload success.`);
  }
};
