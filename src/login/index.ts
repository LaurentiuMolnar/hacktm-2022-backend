import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { compare } from 'bcryptjs';
import { sign } from 'jsonwebtoken';

import { makeUserPK } from '../lib';

const JWT_SECRET = 'classified';
const JWT_EXPIRY = '30d';

type LoginPayload = {
  email: string;
  password: string;
};

type QueryResult = [
  { PasswordHash: { S: string } },
  { FirstName: { S: string }; LastName: { S: string } }
];

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
      .query({
        TableName: process.env.TABLE_NAME,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': { S: makeUserPK(email) },
        },
        ProjectionExpression: 'PasswordHash, FirstName, LastName',
      })
      .promise();

    if (!result?.Items?.length) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Invalid credentials' }),
      };
    }

    const [
      {
        PasswordHash: { S: passwordHash },
      },
      {
        FirstName: { S: firstName },
        LastName: { S: lastName },
      },
    ] = result.Items as QueryResult;

    if (!(await compare(password, passwordHash))) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Invalid credentials' }),
      };
    }

    const accessToken = sign(
      { email, fullName: `${firstName} ${lastName}` },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

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
