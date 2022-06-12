import cuid from 'cuid';

import { EntityType, makePostGSI1PK, makePostGSI1SK, makePostPK } from '../lib';

export type CreatePostPayload = {
  name: string;
  description: string;
  location: {
    lat: number;
    long: number;
  };
  imageUrls: string[];
  transportDetails: string;
};

export type FullCreatePostPayload = CreatePostPayload & {
  authorEmail: string;
  authorName: string;
};

export type HttpPost = {
  postId: string;
  name: string;
  authorName: string;
  createdAt: string;
  description: string;
  transportDetails: string;
  location: {
    lat: number;
    long: number;
  };
  coverUrl: string | null;
  imageUrls: string[];
};

export type HttpPostWithComments = HttpPost & {
  comments: [];
};

export type DynamoPost = {
  PK: { S: string };
  SK: { S: string };
  GSI1_PK: { S: string };
  GSI1_SK: { S: string };
  PostId: { S: string };
  ItemName: { S: string };
  Description: { S: string };
  TransportDetails: { S: string };
  AuthorName: { S: string };
  LocationLat: { N: string };
  LocationLng: { N: string };
  SearchText: { S: string };
  CreatedAt: { S: string };
  CoverUrl?: { S: string };
  ImageUrls: { L: Array<{ S: string }> };
  EntityType: { S: EntityType.Post };
};

export function payloadToDynamoPost(
  payload: FullCreatePostPayload
): DynamoPost {
  const createdAt = new Date().toISOString();
  const postId = cuid.slug();

  const [coverUrl, ...imageUrls] = payload.imageUrls;

  return {
    PK: { S: makePostPK(postId) },
    SK: { S: makePostPK(postId) },
    GSI1_PK: { S: makePostGSI1PK(payload.authorEmail) },
    GSI1_SK: { S: makePostGSI1SK(createdAt) },
    PostId: { S: postId },
    AuthorName: { S: payload.authorName },
    ...(coverUrl && { CoverUrl: { S: coverUrl } }),
    ImageUrls: { L: imageUrls.map((url) => ({ S: url })) },
    CreatedAt: { S: createdAt },
    Description: { S: payload.description },
    ItemName: { S: payload.name },
    TransportDetails: { S: payload.transportDetails },
    SearchText: { S: `${payload.name}${payload.description}`.toLowerCase() },
    LocationLat: { N: `${payload.location.lat}` },
    LocationLng: { N: `${payload.location.long}` },
    EntityType: { S: EntityType.Post },
  };
}

export function dynamoToHttpPost(payload: DynamoPost): HttpPost {
  return {
    postId: payload.PostId.S,
    authorName: payload.AuthorName.S,
    coverUrl: payload.CoverUrl?.S ?? null,
    createdAt: payload.CreatedAt.S,
    description: payload.Description.S,
    imageUrls: payload.ImageUrls.L.map((url) => url.S),
    location: {
      lat: Number.parseFloat(payload.LocationLat.N),
      long: Number.parseFloat(payload.LocationLng.N),
    },
    name: payload.ItemName.S,
    transportDetails: payload.TransportDetails.S,
  };
}
