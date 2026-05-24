import type { DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';

export const DEFAULT_AWS_REGION = 'ap-southeast-1';

export function resolveAwsRegion(): string {
  return process.env.AWS_REGION?.trim() || DEFAULT_AWS_REGION;
}

export function resolveAwsClientConfig(): DynamoDBClientConfig {
  const region = resolveAwsRegion();
  const roleArn = process.env.AWS_ROLE_ARN?.trim();

  if (roleArn) {
    return {
      region,
      credentials: awsCredentialsProvider({ roleArn })
    };
  }

  return { region };
}
