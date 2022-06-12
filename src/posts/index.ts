import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { EntityType, makePostPK } from '../lib';
import {
  CreatePostPayload,
  DynamoPost,
  dynamoToHttpPost,
  HttpPostWithComments,
  payloadToDynamoPost,
} from './mappers';

const dynamodb = new DynamoDB({ region: 'eu-central-1' });

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log({ event });
  const method = event.httpMethod.toLowerCase();
  const email: string | undefined = event.requestContext.authorizer?.['email'];

  if (!email) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Unauthorized' }),
    };
  }

  if (method === 'post') {
    return await createPostHandler(event);
  }

  if (method === 'get') {
    if (event.pathParameters?.['postId']) return await getPostHandler(event);

    return await getAllPosts();
  }

  return {
    statusCode: 405,
    body: JSON.stringify({ message: 'Method not allowed' }),
  };
}

async function createPostHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  if (!process.env.TABLE_NAME) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Missing TABLE_NAME' }),
    };
  }
  try {
    const payload: CreatePostPayload = JSON.parse(event.body ?? '');
    const { email, fullName } = event.requestContext.authorizer as Record<
      'email' | 'fullName',
      string
    >;

    const dynamoItem = payloadToDynamoPost({
      ...payload,
      authorEmail: email,
      authorName: fullName,
    });

    await dynamodb
      .putItem({
        TableName: process.env.TABLE_NAME,
        Item: dynamoItem,
      })
      .promise();

    return {
      statusCode: 201,
      body: JSON.stringify({
        ...payload,
        postId: dynamoItem.PostId.S,
        createdAt: dynamoItem.CreatedAt.S,
      }),
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 400,
      body: JSON.stringify({ message: error }),
    };
  }
}

async function getPostHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const postId = event.pathParameters?.['postId'];

  if (!postId)
    return {
      statusCode: 404,
      body: JSON.stringify({ message: 'Post not found' }),
    };

  const post = await getPostById(postId);

  if (!post)
    return {
      statusCode: 404,
      body: JSON.stringify({ message: 'Post not found' }),
    };

  return {
    statusCode: 200,
    body: JSON.stringify(post),
  };
}

async function getPostById(
  postId: string
): Promise<HttpPostWithComments | null> {
  if (!process.env.TABLE_NAME) {
    return null;
  }
  try {
    const result = await dynamodb
      .query({
        TableName: process.env.TABLE_NAME,
        KeyConditionExpression: '#postId = :postId',
        ScanIndexForward: false,
        ExpressionAttributeNames: {
          '#postId': 'PK',
        },
        ExpressionAttributeValues: {
          ':postId': { S: makePostPK(postId) },
        },
        ProjectionExpression:
          'AuthorName, ItemName, Description, LocationLat, LocationLng, CoverUrl, ImageUrls, TransportDetails, CreatedAt',
      })
      .promise();

    if (!result.Items?.length) return null;

    const [postData] = result.Items as Array<Omit<DynamoPost, 'PostId'>>;

    if (!postData) return null;

    return {
      postId,
      authorName: postData.AuthorName.S,
      coverUrl: postData.CoverUrl?.S ?? null,
      createdAt: postData.CreatedAt.S,
      description: postData.Description.S,
      imageUrls: postData.ImageUrls.L.map((url) => url.S),
      location: {
        lat: Number.parseFloat(postData.LocationLat.N),
        long: Number.parseFloat(postData.LocationLng.N),
      },
      name: postData.ItemName.S,
      transportDetails: postData.TransportDetails.S,
      comments: [],
    };
  } catch (error) {
    console.log(error);
    return null;
  }
}

async function getAllPosts(): Promise<APIGatewayProxyResult> {
  if (!process.env.TABLE_NAME) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Missing TABLE_NAME' }),
    };
  }

  try {
    const result = await dynamodb
      .query({
        TableName: process.env.TABLE_NAME,
        IndexName: 'GSI2',
        KeyConditionExpression: '#entityType = :postEntity',
        ExpressionAttributeNames: {
          '#entityType': 'EntityType',
        },
        ExpressionAttributeValues: {
          ':postEntity': {
            S: EntityType.Post,
          },
        },
        ScanIndexForward: false,
        ProjectionExpression:
          'PostId, AuthorName, ItemName, Description, LocationLat, LocationLng, CoverUrl, ImageUrls, TransportDetails, CreatedAt',
      })
      .promise();

    if (!result.Items?.length) {
      return {
        statusCode: 200,
        body: JSON.stringify([]),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(
        result.Items.map((item) => dynamoToHttpPost(item as any))
      ),
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: error,
      }),
    };
  }
}
