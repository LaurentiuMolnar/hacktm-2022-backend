import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { compare } from 'bcryptjs';
import { sign } from 'jsonwebtoken';

import { makeUserAuthSK, makeUserPK } from '../lib';

const JWT_SECRET = 'classified';
const JWT_EXPIRY = '30d';

type LoginPayload = {
  email: string;
  password: string;
};

const dynamodb = new DynamoDB({ region: 'eu-central-1' });

export async function handler(
  event: APIGatewayEvent
): Promise<APIGatewayProxyResult> {
  if (!process.env.TABLE_NAME) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Missing TABLE_NAME' }),
    };
  }

  try {
    const { email, password }: LoginPayload = JSON.parse(event?.body ?? '');

    const result = await dynamodb
      .getItem({
        TableName: process.env.TABLE_NAME,
        Key: { PK: { S: makeUserPK(email) }, SK: { S: makeUserAuthSK(email) } },
        AttributesToGet: ['PasswordHash'],
      })
      .promise();

    if (!result?.Item) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Invalid credentials' }),
      };
    }

    if (!(await compare(password, result.Item?.PasswordHash?.S ?? ''))) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Invalid credentials' }),
      };
    }

    const accessToken = sign({ email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

    return {
      statusCode: 200,
      body: JSON.stringify({ accessToken }),
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid body' }),
    };
  }
}
