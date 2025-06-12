import { Duration, Stack, StackProps, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "path";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { Bucket, EventType, BlockPublicAccess } from "aws-cdk-lib/aws-s3";
import { S3EventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { aws_iam } from "aws-cdk-lib";

export class ScrapperStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
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
        runtime: Runtime.NODEJS_20_X,
        memorySize: 256,
        timeout: Duration.seconds(120),
        environment: {
          AWS_BUCKET_NAME: bucket.bucketName,
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
