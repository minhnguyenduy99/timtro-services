import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const template = readFileSync(new URL("../../template.yaml", import.meta.url), "utf8");

describe("SAM template shape", () => {
  it("defines the Vercel OIDC read role without creating DynamoDB tables", () => {
    expect(template).toContain("McpDynamoDbReadRole:");
    expect(template).toContain("Type: AWS::IAM::Role");
    expect(template).not.toContain("Type: AWS::DynamoDB::Table");
    expect(template).not.toContain("Type: AWS::Serverless::Function");
  });

  it("trusts Vercel OIDC web identity with aud and sub conditions", () => {
    expect(template).toContain("sts:AssumeRoleWithWebIdentity");
    expect(template).toContain("oidc-provider/oidc.vercel.com/");
    expect(template).toContain("VercelTeamSlug");
    expect(template).toContain("VercelProjectName");
    expect(template).toContain("environment:production");
  });

  it("grants read-only DynamoDB Query on the rental info table and indexes", () => {
    expect(template).toContain("dynamodb:Query");
    expect(template).toContain("dynamodb:DescribeTable");
    expect(template).toContain("/index/*");
    expect(template).toContain("timtro-rental-info-v2-${EnvironmentName}");
    expect(template).toContain("dynamodb:PutItem");
    expect(template).toContain("Effect: Deny");
  });

  it("parameterizes environment and Vercel project metadata", () => {
    for (const parameter of [
      "EnvironmentName",
      "RentalInfoTableName",
      "VercelTeamSlug",
      "VercelProjectName"
    ]) {
      expect(template).toContain(`${parameter}:`);
    }
  });

  it("exports role ARN and resolved table name", () => {
    expect(template).toContain("McpReadRoleArn:");
    expect(template).toContain("RentalInfoTableName:");
  });
});
