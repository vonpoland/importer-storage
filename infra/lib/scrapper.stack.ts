import {
  aws_iam,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "path";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import {
  BlockPublicAccess,
  Bucket,
  EventType,
  HttpMethods,
} from "aws-cdk-lib/aws-s3";
import { S3EventSource } from "aws-cdk-lib/aws-lambda-event-sources";

export class ScrapperStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props?: StackProps,
    corsPaths: Array<string> = [],
  ) {
    super(scope, id, props);

    const bucket = new Bucket(this, "cdn", {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: new BlockPublicAccess({
        blockPublicAcls: false,
        ignorePublicAcls: false,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      }),
      cors:
        corsPaths.length > 0
          ? [
              {
                allowedMethods: [HttpMethods.GET, HttpMethods.HEAD],
                allowedOrigins: corsPaths,
                allowedHeaders: ["*"],
                exposedHeaders: [],
                maxAge: 3000,
              },
            ]
          : undefined,
    });

    bucket.addLifecycleRule({
      tagFilters: { delete: "60d" },
      expiration: Duration.days(60),
    });

    bucket.addLifecycleRule({
      tagFilters: { delete: "1d" },
      expiration: Duration.days(1),
    });

    bucket.addToResourcePolicy(
      new aws_iam.PolicyStatement({
        effect: aws_iam.Effect.ALLOW,
        principals: [new aws_iam.AnyPrincipal()],
        actions: ["s3:GetObject"],
        resources: [`${bucket.bucketArn}/*`],
      }),
    );

    const createThumbnailFunction = new NodejsFunction(
      this,
      "CreateThumbnail",
      {
        entry: path.join(__dirname, "../", "lambda", "create-thumbnail.ts"),
        runtime: Runtime.NODEJS_22_X,
        memorySize: Number(process.env.MEMORY_SIZE) || 256,
        timeout: Duration.seconds(120),
        environment: {
          AWS_BUCKET_NAME: bucket.bucketName,
          AWS_THUMBNAIL_WIDTH: process.env.AWS_THUMBNAIL_WIDTH || "110",
        },
      },
    );

    createThumbnailFunction.addEventSource(
      new S3EventSource(bucket, {
        events: [EventType.OBJECT_CREATED],
      }),
    );

    bucket.grantReadWrite(createThumbnailFunction);
  }
}
