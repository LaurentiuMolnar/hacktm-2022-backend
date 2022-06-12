import { hashSync } from 'bcryptjs';
import {
  EntityType,
  makeUserAuthSK,
  makeUserPK,
  makeUserProfileSK,
} from '../lib';

export type CreateUserPayload = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
};

export type DynamoUserProfile = {
  Email: { S: string };
  FirstName: { S: string };
  LastName: { S: string };
  Phone: { S: string };
  CreatedAt: { S: string };
  EntityType: { S: EntityType.UserProfile };
  PK: { S: string };
  SK: { S: string };
};

export type HttpUserProfile = {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
};

export type DynamoUserAuth = {
  Email: { S: string };
  PasswordHash: { S: string };
  EntityType: { S: EntityType.UserAuth };
  PK: { S: string };
  SK: { S: string };
};

export function payloadToDynamoUserProfile(
  payload: CreateUserPayload
): DynamoUserProfile {
  return {
    Email: { S: payload.email },
    PK: { S: makeUserPK(payload.email) },
    SK: { S: makeUserProfileSK(payload.email) },
    FirstName: { S: payload.firstName },
    LastName: { S: payload.lastName },
    Phone: { S: payload.phone },
    CreatedAt: { S: new Date().toISOString() },
    EntityType: { S: EntityType.UserProfile },
  };
}

export function payloadToDynamoUserAuth(
  payload: CreateUserPayload
): DynamoUserAuth {
  const passwordHash = hashSync(payload.password);

  return {
    PK: { S: makeUserPK(payload.email) },
    SK: { S: makeUserAuthSK(payload.email) },
    EntityType: { S: EntityType.UserAuth },
    Email: { S: payload.email },
    PasswordHash: { S: passwordHash },
  };
}

export function dynamoProfileToHttpResponse(
  payload: DynamoUserProfile
): HttpUserProfile {
  return {
    email: payload.Email.S,
    firstName: payload.FirstName.S,
    lastName: payload.LastName.S,
    phone: payload.Phone.S,
  };
}
