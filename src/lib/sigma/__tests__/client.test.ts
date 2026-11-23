import assert from 'node:assert';
import { SigmaClient } from '../client';
import {
  RateLimitError,
  TokenForbiddenError,
  ValidationError,
  SigmaApiError,
} from '../errors';

export async function runClientTests() {
  // 1. Bearer Token presence and headers
  let interceptedUrl = '';
  let interceptedHeaders: any = {};
  let interceptedMethod = '';
  let interceptedBody: any = null;

  const mockFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    interceptedUrl = url.toString();
    interceptedHeaders = init?.headers || {};
    interceptedMethod = init?.method || 'GET';
    interceptedBody = init?.body ? JSON.parse(init.body.toString()) : null;

    const headers = new Headers({
      'Content-Type': 'application/json',
      'x-ratelimit-limit': '120',
      'x-ratelimit-remaining': '115',
    });

    return new Response(JSON.stringify({ id: 'cust_123', username: 'testuser' }), {
      status: 200,
      headers,
    });
  };

  const client = new SigmaClient({
    baseUrl: 'https://smartplaypainel.site/api/reseller-api/v1',
    token: 'test-token-xyz',
    fetch: mockFetch as any,
  });

  const meResult = await client.me.get();
  assert.strictEqual(meResult.id, 'cust_123');
  assert.strictEqual(interceptedUrl, 'https://smartplaypainel.site/api/reseller-api/v1/me');
  assert.strictEqual(interceptedHeaders['Authorization'], 'Bearer test-token-xyz');
  assert.strictEqual(client.lastRateLimit?.remaining, 115);

  // 2. Customers operations: renew
  await client.customers.renew('cust_123', { package_id: 'pkg_456', connections: 2 });
  assert.strictEqual(interceptedMethod, 'POST');
  assert.strictEqual(
    interceptedUrl,
    'https://smartplaypainel.site/api/reseller-api/v1/customers/cust_123/renew'
  );
  assert.deepStrictEqual(interceptedBody, { package_id: 'pkg_456', connections: 2 });

  // 3. Customers operations: changeConnections (PUT)
  await client.customers.changeConnections('cust_123', 3);
  assert.strictEqual(interceptedMethod, 'PUT');
  assert.strictEqual(
    interceptedUrl,
    'https://smartplaypainel.site/api/reseller-api/v1/customers/cust_123/connections'
  );
  assert.deepStrictEqual(interceptedBody, { connections: 3 });

  // 4. RateLimitError parsing
  const rateLimitFetch = async (): Promise<Response> => {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'x-ratelimit-limit': '120',
      'x-ratelimit-remaining': '0',
      'retry-after': '45',
      'x-ratelimit-reset': '1700000045',
    });
    return new Response(JSON.stringify({ message: 'Too many requests' }), {
      status: 429,
      headers,
    });
  };

  const rateLimitClient = new SigmaClient({
    token: 'test-token',
    fetch: rateLimitFetch as any,
  });

  try {
    await rateLimitClient.me.get();
    assert.fail('Should have thrown RateLimitError');
  } catch (err: any) {
    assert.ok(err instanceof RateLimitError);
    assert.strictEqual(err.status, 429);
    assert.strictEqual(err.retryAfter, 45);
    assert.strictEqual(err.remaining, 0);
  }

  // 5. TokenForbiddenError parsing
  const forbiddenFetch = async (): Promise<Response> => {
    return new Response(
      JSON.stringify({
        error: 'insufficient_scope',
        message: 'Token lacks required scope: customers.create',
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const forbiddenClient = new SigmaClient({
    token: 'test-token',
    fetch: forbiddenFetch as any,
  });

  try {
    await forbiddenClient.customers.create({ server_id: 'srv_1', package_id: 'pkg_1' });
    assert.fail('Should have thrown TokenForbiddenError');
  } catch (err: any) {
    assert.ok(err instanceof TokenForbiddenError);
    assert.strictEqual(err.code, 'insufficient_scope');
    assert.strictEqual(err.status, 403);
  }

  // 6. ValidationError parsing
  const validationFetch = async (): Promise<Response> => {
    return new Response(
      JSON.stringify({
        message: 'Validation failed',
        errors: { username: ['Username already taken'] },
      }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const validationClient = new SigmaClient({
    token: 'test-token',
    fetch: validationFetch as any,
  });

  try {
    await validationClient.customers.create({ server_id: 'srv_1', package_id: 'pkg_1' });
    assert.fail('Should have thrown ValidationError');
  } catch (err: any) {
    assert.ok(err instanceof ValidationError);
    assert.strictEqual(err.status, 422);
    assert.deepStrictEqual(err.errors, { username: ['Username already taken'] });
  }

  // 7. Missing token error
  const noTokenClient = new SigmaClient({ token: '' });
  try {
    await noTokenClient.me.get();
    assert.fail('Should have thrown missing token SigmaApiError');
  } catch (err: any) {
    assert.ok(err instanceof SigmaApiError);
    assert.strictEqual(err.status, 401);
  }
}

runClientTests();
