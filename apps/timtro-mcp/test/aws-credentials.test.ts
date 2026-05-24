import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_AWS_REGION, resolveAwsClientConfig, resolveAwsRegion } from '../src/aws/credentials.js';
import { resetDocumentClientForTests } from '../src/services/rental-info.repository.js';

describe('resolveAwsClientConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    resetDocumentClientForTests();
  });

  it('returns region-only config for the default Lambda credential chain', () => {
    process.env.AWS_REGION = 'ap-southeast-1';

    const config = resolveAwsClientConfig();

    expect(config).toEqual({ region: 'ap-southeast-1' });
    expect(config.credentials).toBeUndefined();
  });

  it('defaults AWS region to ap-southeast-1', () => {
    delete process.env.AWS_REGION;

    expect(resolveAwsRegion()).toBe(DEFAULT_AWS_REGION);
  });
});
