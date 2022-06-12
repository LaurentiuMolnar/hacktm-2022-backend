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

const coverUrls = [
  'https://www.videt.ro/imagesCdn/2400/2787-800x600.jpg',
  'https://cdn.notonthehighstreet.com/system/product_images/images/000/247/267/original_KBJ_coffi3.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/4/4b/Desk_chair.jpg',
  'https://www.theteakline.com/wp-content/uploads/2020/12/CE9A617B-7867-4B2D-B07D-2A6C06894BA9-1536x1536.jpeg',
  'https://s3-production.bobvila.com/slides/16314/original/pots-and-pans-storage.jpg?1501001417',
];

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

    const keyword = event.queryStringParameters?.['keyword'];
    const qLat = event.queryStringParameters?.['lat'];
    const qLong = event.queryStringParameters?.['long'];
    const long = qLong ? Number.parseFloat(qLong) : undefined;
    const lat = qLat ? Number.parseFloat(qLat) : undefined;

    return await getAllPosts({ keyword, lat, long });
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

    const randomIndex = Math.floor(Math.random() * coverUrls.length);

    const dynamoItem = payloadToDynamoPost({
      ...payload,
      authorEmail: email,
      authorName: fullName,
      imageUrls: coverUrls[randomIndex]
        ? [coverUrls[randomIndex]]
        : ([] as any),
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
        coverUrl: coverUrls?.[randomIndex] ?? null,
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

async function getAllPosts({
  keyword,
  lat,
  long: lng,
}: {
  keyword?: string | undefined;
  lat?: number | undefined;
  long?: number | undefined;
}): Promise<APIGatewayProxyResult> {
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
          'PostId, AuthorName, ItemName, Description, LocationLat, LocationLng, CoverUrl, ImageUrls, TransportDetails, CreatedAt, SearchText',
      })
      .promise();

    if (!result.Items?.length) {
      return {
        statusCode: 200,
        body: JSON.stringify([]),
      };
    }

    let posts = result.Items.map((item) => ({
      ...dynamoToHttpPost(item as any),
      searchText: item.SearchText?.S ?? '',
    }));

    if (keyword) {
      posts = posts.filter((post) => post.searchText.includes(keyword));
    }

    if (lat !== undefined && lng !== undefined) {
      posts.sort((p1, p2) => {
        const d1 = Math.sqrt(
          (lat - p1.location.lat) * (lat - p1.location.lat) +
            (lng - p1.location.long) * (lng - p1.location.long)
        );
        const d2 = Math.sqrt(
          (lat - p2.location.lat) * (lat - p2.location.lat) +
            (lng - p2.location.long) * (lng - p2.location.long)
        );

        if (d1 < d2) return -1;
        if (d1 > d2) return 1;
        return 0;
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify(
        posts.map(({ searchText, ...rest }) => ({ ...rest }))
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
