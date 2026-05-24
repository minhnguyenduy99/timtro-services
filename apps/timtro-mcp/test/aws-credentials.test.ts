import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_AWS_REGION, resolveAwsClientConfig, resolveAwsRegion } from "../src/aws/credentials.js";
import { resetDocumentClientForTests } from "../src/services/rental-info.repository.js";

const { awsCredentialsProviderMock } = vi.hoisted(() => ({
  awsCredentialsProviderMock: vi.fn(() => ({ accessKeyId: "test", secretAccessKey: "test" }))
}));

vi.mock("@vercel/oidc-aws-credentials-provider", () => ({
  awsCredentialsProvider: awsCredentialsProviderMock
}));

describe("resolveAwsClientConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    resetDocumentClientForTests();
    awsCredentialsProviderMock.mockClear();
  });

  it("uses Vercel OIDC credentials when AWS_ROLE_ARN is set", () => {
    process.env.AWS_ROLE_ARN = "arn:aws:iam::123456789012:role/timtro-mcp-read-dev";
    process.env.AWS_REGION = "ap-southeast-1";

    const config = resolveAwsClientConfig();

    expect(config.region).toBe("ap-southeast-1");
    expect(awsCredentialsProviderMock).toHaveBeenCalledWith({
      roleArn: "arn:aws:iam::123456789012:role/timtro-mcp-read-dev"
    });
    expect(config.credentials).toEqual({ accessKeyId: "test", secretAccessKey: "test" });
  });

  it("falls back to default credential chain locally when AWS_ROLE_ARN is unset", () => {
    delete process.env.AWS_ROLE_ARN;

    const config = resolveAwsClientConfig();

    expect(config.region).toBe(DEFAULT_AWS_REGION);
    expect(config.credentials).toBeUndefined();
    expect(awsCredentialsProviderMock).not.toHaveBeenCalled();
  });

  it("defaults AWS region to ap-southeast-1", () => {
    delete process.env.AWS_REGION;

    expect(resolveAwsRegion()).toBe(DEFAULT_AWS_REGION);
  });
});
