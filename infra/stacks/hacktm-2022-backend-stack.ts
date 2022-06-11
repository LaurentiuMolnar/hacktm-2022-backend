import * as path from 'path';

import { Stack, StackProps, CfnOutput, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
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

    const usersLambda = new lambda.Function(this, 'users-endpoint', {
      memorySize: 512,
      timeout: Duration.seconds(30),
      runtime: lambda.Runtime.NODEJS_16_X,
      environment: {
        TABLE_NAME: table.tableName,
      },
      functionName: 'usersFn',
      code: lambda.Code.fromAsset(path.resolve('dist/users')),
      handler: 'index.handler',
    });

    const usersApi = new apigw.RestApi(this, 'usersApi', {
      restApiName: 'users-api',
      defaultIntegration: new apigw.LambdaIntegration(usersLambda),
      deploy: true,
      deployOptions: {
        stageName: 'api',
      },
    });

    usersApi.root.addResource('users').addMethod('POST');

    table.grantFullAccess(usersLambda);

    new CfnOutput(this, 'assetsBucketArn', {
      value: bucket.bucketArn,
      exportName: 'assetsBucketArn',
    });

    new CfnOutput(this, 'tableArn', {
      value: table.tableArn,
      exportName: 'tableArn',
    });

    new CfnOutput(this, 'usersApiEndpoint', {
      value: usersApi.url,
    });
  }
}
