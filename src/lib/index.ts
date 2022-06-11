export enum EntityType {
  UserProfile = 'PROFILE',
  UserAuth = 'AUTH',
  User = 'USER',
}

export function makeUserPK(email: string): string {
  return `${EntityType.User}#${email}`;
}

export function makeUserAuthSK(email: string): string {
  return `${EntityType.UserAuth}#${email}`;
}
