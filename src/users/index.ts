import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { hashSync } from 'bcryptjs';

type CreateUserPayload = {
  email: string;
  password: string;
};

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const { email, password }: CreateUserPayload = JSON.parse(
      event?.body ?? ''
    );

    const passwordHash = hashSync(password);

    return {
      statusCode: 201,
      body: JSON.stringify({
        email,
        passwordHash,
      }),
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid body' }),
    };
  }
}
