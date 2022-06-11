import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { hashSync } from 'bcryptjs';
import { EmailValidator } from 'commons-validator-js';
import { DynamoDB } from 'aws-sdk';

import { EntityType, makeUserAuthSK, makeUserPK } from '../lib';

type CreateUserPayload = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
};

type DynamoUserProfile = {
  Email: { S: string };
  FirstName: { S: string };
  LastName: { S: string };
  Phone: { S: string };
  CreatedAt: { S: string };
  EntityType: { S: EntityType.UserProfile };
  PK: { S: string };
  SK: { S: string };
};

type DynamoUserAuth = {
  Email: { S: string };
  PasswordHash: { S: string };
  EntityType: { S: EntityType.UserAuth };
  PK: { S: string };
  SK: { S: string };
};

function payloadToDynamoUserProfile(
  payload: CreateUserPayload
): DynamoUserProfile {
  return {
    Email: { S: payload.email },
    PK: { S: makeUserPK(payload.email) },
    SK: { S: makeUserPK(payload.email) },
    FirstName: { S: payload.firstName },
    LastName: { S: payload.lastName },
    Phone: { S: payload.phone },
    CreatedAt: { S: new Date().toISOString() },
    EntityType: { S: EntityType.UserProfile },
  };
}

function payloadToDynamoUserAuth(payload: CreateUserPayload): DynamoUserAuth {
  const passwordHash = hashSync(payload.password);

  return {
    PK: { S: makeUserPK(payload.email) },
    SK: { S: makeUserAuthSK(payload.email) },
    EntityType: { S: EntityType.UserAuth },
    Email: { S: payload.email },
    PasswordHash: { S: passwordHash },
  };
}

const validator = new EmailValidator();
const dynamodb = new DynamoDB({ region: 'eu-central-1' });

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

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod.toLowerCase() === 'post') {
    return await createUserHandler(event);
  }

  return {
    statusCode: 405,
    body: JSON.stringify({ message: 'Method not allowed' }),
  };
}
