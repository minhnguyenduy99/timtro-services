import type { DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';

export const DEFAULT_AWS_REGION = 'ap-southeast-1';

export function resolveAwsRegion(): string {
  return process.env.AWS_REGION?.trim() || DEFAULT_AWS_REGION;
}

export function resolveAwsClientConfig(): DynamoDBClientConfig {
  return { region: resolveAwsRegion() };
}
