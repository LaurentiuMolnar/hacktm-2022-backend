import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { EmailValidator } from 'commons-validator-js';
import { DynamoDB } from 'aws-sdk';

import {
  makePostGSI1PK,
  makeUserAuthSK,
  makeUserPK,
  makeUserProfileSK,
} from '../lib';
import {
  CreateUserPayload,
  dynamoProfileToHttpResponse,
  DynamoUserProfile,
  payloadToDynamoUserAuth,
  payloadToDynamoUserProfile,
  HttpUserProfile,
} from './mappers';
import { DynamoPost, dynamoToHttpPost, HttpPost } from '../posts/mappers';

const validator = new EmailValidator();
const dynamodb = new DynamoDB({ region: 'eu-central-1' });

async function getProfileByEmail(
  email: string
): Promise<HttpUserProfile | null> {
  const result = await dynamodb
    .query({
      TableName: process.env.TABLE_NAME ?? '',
      KeyConditions: {
        PK: {
          AttributeValueList: [{ S: makeUserPK(email) }],
          ComparisonOperator: 'EQ',
        },
        SK: {
          ComparisonOperator: 'EQ',
          AttributeValueList: [{ S: makeUserProfileSK(email) }],
        },
      },
    })
    .promise();

  if (!result.Count || !result.Items?.length) {
    return null;
  }

  return dynamoProfileToHttpResponse(result.Items[0] as DynamoUserProfile);
}

async function existingUser(email: string): Promise<boolean> {
  const result = await dynamodb
    .query({
      TableName: process.env.TABLE_NAME ?? '',
      KeyConditions: {
        PK: {
          AttributeValueList: [{ S: makeUserPK(email) }],
          ComparisonOperator: 'EQ',
        },
        SK: {
          ComparisonOperator: 'EQ',
          AttributeValueList: [{ S: makeUserAuthSK(email) }],
        },
      },
    })
    .promise();

  return (result.Count ?? 0) > 0;
}

async function createUserHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    if (!process.env.TABLE_NAME) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Missing TABLE_NAME' }),
      };
    }

    const payload: CreateUserPayload = JSON.parse(event?.body ?? '');

    const isEmailValid = validator.isValid(payload.email);

    if (!isEmailValid) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Email is invalid' }),
      };
    }

    if (await existingUser(payload.email)) {
      return {
        statusCode: 409,
        body: JSON.stringify({ message: 'Email is already in use' }),
      };
    }

    const profile = payloadToDynamoUserProfile(payload);
    const auth = payloadToDynamoUserAuth(payload);

    await dynamodb
      .batchWriteItem({
        RequestItems: {
          [process.env.TABLE_NAME]: [
            { PutRequest: { Item: profile } },
            { PutRequest: { Item: auth } },
          ],
        },
      })
      .promise();

    return {
      statusCode: 201,
      body: JSON.stringify({
        email: payload.email,
        firstName: payload.firstName,
        lastName: payload.lastName,
        phone: payload.phone,
      }),
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid body' }),
    };
  }
}

async function getAuthUserHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const email = event?.requestContext?.authorizer?.['email'] ?? '';

  const user = await getProfileByEmail(email);

  if (!user) {
    return {
      statusCode: 404,
      body: JSON.stringify({ message: 'No profile found for this user' }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify(user),
  };
}

async function getUserPosts(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const email = event?.requestContext?.authorizer?.['email'] ?? '';

  if (!process.env.TABLE_NAME) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Missing TABLE_NAME' }),
    };
  }

  const result = await dynamodb
    .query({
      TableName: process.env.TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: '#email = :email',
      ExpressionAttributeNames: {
        '#email': 'GSI1_PK',
      },
      ExpressionAttributeValues: {
        ':email': { S: makePostGSI1PK(email) },
      },
      ScanIndexForward: false,
      ProjectionExpression:
        'PostId, AuthorName, ItemName, Description, LocationLat, LocationLng, CoverUrl, ImageUrls, TransportDetails, CreatedAt',
    })
    .promise();

  return {
    statusCode: 200,
    body: JSON.stringify(
      (result.Items as DynamoPost[])?.map(
        (postData: DynamoPost): HttpPost => dynamoToHttpPost(postData)
      ) ?? []
    ),
  };
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log({ event });

  const method = event.httpMethod.toLowerCase();

  if (method === 'post') {
    return await createUserHandler(event);
  }

  if (method === 'get') {
    if (event.path.endsWith('/me')) {
      return await getAuthUserHandler(event);
    }

    if (event.path.endsWith('/posts')) {
      return await getUserPosts(event);
    }

    return {
      statusCode: 403,
      body: JSON.stringify({ message: 'Forbidden' }),
    };
  }

  return {
    statusCode: 405,
    body: JSON.stringify({ message: 'Method not allowed' }),
  };
}
