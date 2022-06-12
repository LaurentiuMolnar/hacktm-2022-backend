import {
  APIGatewayAuthorizerEvent,
  PolicyDocument,
  APIGatewayAuthorizerResult,
} from 'aws-lambda';
import { decode, verify } from 'jsonwebtoken';

const JWT_SECRET = 'classified';

function makePolicy(effect: 'Allow' | 'Deny'): PolicyDocument {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'execute-api:Invoke',
        Effect: effect,
        Resource: '*',
      },
    ],
  };
}

export async function handler(
  event: APIGatewayAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> {
  console.log({ event });

  if (event.type !== 'TOKEN') {
    throw new Error('event.type must be TOKEN');
  }

  const authorizationHeader = event.authorizationToken;

  if (!authorizationHeader) {
    return {
      principalId: 'user',
      policyDocument: makePolicy('Deny'),
    };
  }

  const [, token] = authorizationHeader.split('Bearer ');

  if (!token || !verify(token, JWT_SECRET)) {
    console.log(`Invalid token: ${token === '' ? '<empty string>' : token}`);
    return {
      principalId: 'user',
      policyDocument: makePolicy('Deny'),
    };
  }

  const { email, fullName } = decode(token, { json: true }) as Record<
    'email' | 'fullName',
    string
  >;

  return {
    principalId: 'user',
    policyDocument: makePolicy('Allow'),
    context: {
      email,
      fullName,
    },
  };
}
