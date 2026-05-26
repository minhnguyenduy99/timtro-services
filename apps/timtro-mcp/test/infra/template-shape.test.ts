import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const template = readFileSync(new URL('../../template.yaml', import.meta.url), 'utf8');

describe('SAM template shape', () => {
  it('defines HTTP API and Lambda function without creating DynamoDB tables', () => {
    expect(template).toContain('McpHttpApi:');
    expect(template).toContain('McpFunction:');
    expect(template).toContain('Type: AWS::Serverless::HttpApi');
    expect(template).toContain('Type: AWS::Serverless::Function');
    expect(template).not.toContain('Type: AWS::DynamoDB::Table');
  });

  it('routes GET, POST, and DELETE on /mcp via HTTP API events', () => {
    expect(template).toContain('Type: HttpApi');
    expect(template).toContain('Path: /mcp');
    expect(template).toContain('Method: GET');
    expect(template).toContain('Method: POST');
    expect(template).toContain('Method: DELETE');
    expect(template).toContain('PayloadFormatVersion: "2.0"');
  });

  it('does not contain Vercel OIDC trust policy or IAM read role', () => {
    expect(template).not.toContain('McpDynamoDbReadRole');
    expect(template).not.toContain('oidc-provider/oidc.vercel.com/');
    expect(template).not.toContain('VercelTeamSlug');
    expect(template).not.toContain('VercelProjectName');
  });

  it('bundles Lambda code from dist/ with SkipBuild enabled', () => {
    expect(template).toContain('Handler: lambda.handler');
    expect(template).toContain('CodeUri: dist/');
    expect(template).toContain('SkipBuild: true');
  });

  it('grants DynamoDB read access on the rental info table and keeps McpApiKey secret', () => {
    expect(template).toContain('DynamoDBReadPolicy');
    expect(template).toContain('timtro-rental-info-v2-${EnvironmentName}');
    expect(template).toContain('McpApiKey:');
    expect(template).toContain('NoEcho: true');
  });

  it('parameterizes environment and exports API URL', () => {
    for (const parameter of [
      'EnvironmentName',
      'RentalInfoTableName',
      'McpApiKey',
      'Auth0Domain',
      'McpServerUrl',
      'Auth0Audience'
    ]) {
      expect(template).toContain(`${parameter}:`);
    }

    expect(template).toContain('McpApiUrl:');
    expect(template).toContain('McpFunctionArn:');
  });

  it('wires Auth0 env vars and well-known metadata routes', () => {
    expect(template).toContain('AUTH0_DOMAIN: !Ref Auth0Domain');
    expect(template).toContain('AUTH0_AUDIENCE: !Ref Auth0Audience');
    expect(template).toContain('MCP_SERVER_URL: !Ref McpServerUrl');
    expect(template).toContain('Path: /.well-known/oauth-protected-resource/mcp');
    expect(template).toContain('Path: /.well-known/oauth-protected-resource');
  });
});
