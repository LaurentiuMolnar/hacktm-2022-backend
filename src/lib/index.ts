export enum EntityType {
  UserProfile = 'PROFILE',
  UserAuth = 'AUTH',
  User = 'USER',
  Post = 'POST',
}

export function makeUserPK(email: string): string {
  return `${EntityType.User}#${email}`;
}

export function makeUserAuthSK(email: string): string {
  return `${EntityType.UserAuth}#${email}`;
}

export function makeUserProfileSK(email: string): string {
  return `${EntityType.UserProfile}#${email}`;
}

export function makePostPK(postId: string): string {
  return `${EntityType.Post}#${postId}`;
}

export function makePostGSI1PK(email: string): string {
  return `${EntityType.User}#${email}`;
}

export function makePostGSI1SK(createdAt: string): string {
  return `${EntityType.Post}#${createdAt}`;
}
