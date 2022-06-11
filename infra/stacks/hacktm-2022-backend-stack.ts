import * as path from 'path';
import * as fs from 'fs';

import { Stack, StackProps, CfnOutput, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';

const srcDir = path.resolve('src');
const libDir = 'lib';

const srcDirs = (fs.readdirSync(srcDir) ?? []).filter((dir) => dir !== libDir);

export class Hacktm2022BackendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'AssetsBucket', {
      bucketName: 'hacktm-assets-bucket',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const table = new dynamodb.Table(this, 'HacktmTable', {
      tableName: 'hacktm-table',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
    });

    table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1_PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1_SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
      readCapacity: 1,
      writeCapacity: 1,
    });

    const commonLambdaProps = {
      memorySize: 1024,
      timeout: Duration.seconds(30),
      runtime: lambda.Runtime.NODEJS_16_X,
      environment: {
        TABLE_NAME: table.tableName,
      },
      handler: 'index.handler',
    };

    const api = new apigw.RestApi(this, 'usersApi', {
      restApiName: 'reusy-api',
      deploy: true,
      deployOptions: {
        stageName: 'api',
      },
    });

    for (const endpoint of srcDirs) {
      const fn = new lambda.Function(this, `${endpoint}-endpoint`, {
        ...commonLambdaProps,
        functionName: `${endpoint}Fn`,
        code: lambda.Code.fromAsset(path.resolve(`dist/${endpoint}`)),
      });

      api.root
        .addResource(endpoint)
        .addMethod('POST', new apigw.LambdaIntegration(fn));

      table.grantFullAccess(fn);
    }
  }
}
