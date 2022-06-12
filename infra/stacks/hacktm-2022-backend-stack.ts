import * as path from 'path';
import * as fs from 'fs';

import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';

const authorizerDir = 'auth';

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
    table.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'EntityType', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'CreatedAt', type: dynamodb.AttributeType.STRING },
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
    const authorizer = new apigw.TokenAuthorizer(this, 'Authorizer', {
      handler: new lambda.Function(this, 'custom-authorizer', {
        memorySize: 512,
        code: lambda.Code.fromAsset(path.resolve('dist', authorizerDir)),
        runtime: lambda.Runtime.NODEJS_16_X,
        handler: 'index.handler',
        functionName: 'authorizer-fn',
      }),
      authorizerName: 'authorizer',
    });
    const api = new apigw.RestApi(this, 'usersApi', {
      restApiName: 'reusy-api',
      deploy: true,
      deployOptions: {
        stageName: 'api',
      },
    });

    const usersLambda = new lambda.Function(this, `users-endpoint`, {
      ...commonLambdaProps,
      functionName: `usersFn`,
      code: lambda.Code.fromAsset(path.resolve(`dist/users`)),
    });
    const usersIntegration = new apigw.LambdaIntegration(usersLambda);
    const usersResource = api.root.addResource('users');
    usersResource.addMethod('POST', usersIntegration);

    usersResource
      .addResource('me')
      .addMethod('GET', usersIntegration, { authorizer });

    usersResource
      .addResource('posts')
      .addMethod('GET', usersIntegration, { authorizer });

    const loginLambda = new lambda.Function(this, `login-endpoint`, {
      ...commonLambdaProps,
      functionName: `loginFn`,
      code: lambda.Code.fromAsset(path.resolve(`dist/login`)),
    });
    const loginIntegration = new apigw.LambdaIntegration(loginLambda);
    const loginResource = api.root.addResource('login');
    loginResource.addMethod('POST', loginIntegration);

    const postsLambda = new lambda.Function(this, `posts-endpoint`, {
      ...commonLambdaProps,
      functionName: `postsFn`,
      code: lambda.Code.fromAsset(path.resolve(`dist/posts`)),
    });
    const postsIntegration = new apigw.LambdaIntegration(postsLambda);
    const postsResource = api.root.addResource('posts');
    postsResource.addMethod('GET', postsIntegration, { authorizer });
    postsResource.addMethod('POST', postsIntegration, { authorizer });
    postsResource
      .addResource('{postId}')
      .addMethod('GET', postsIntegration, { authorizer });

    [usersLambda, loginLambda, postsLambda].forEach((fn) =>
      table.grantFullAccess(fn)
    );
  }
}
