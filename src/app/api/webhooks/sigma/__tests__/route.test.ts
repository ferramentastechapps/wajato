import assert from 'node:assert';
import crypto from 'node:crypto';
import { POST } from '../route';

export async function runRouteTests() {
  const secret = 'webhook-test-secret-999';
  process.env.SIGMA_WEBHOOK_SECRET = secret;

  const validPayload = JSON.stringify({
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    event: 'customer.created',
    occurred_at: '2026-11-22T19:00:00Z',
    data: { username: 'testuser' },
  });

  const now = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${now}.${validPayload}`)
    .digest('hex');
  const validHeader = `t=${now},v1=${signature}`;

  // 1. Missing signature header -> 401
  const reqNoHeader = new Request('http://localhost:3000/api/webhooks/sigma', {
    method: 'POST',
    body: validPayload,
  });
  const resNoHeader = await POST(reqNoHeader);
  assert.strictEqual(resNoHeader.status, 401);

  // 2. Invalid signature header -> 401
  const reqInvalidSig = new Request('http://localhost:3000/api/webhooks/sigma', {
    method: 'POST',
    headers: { 'x-sigma-signature': 't=123,v1=abcdef' },
    body: validPayload,
  });
  const resInvalidSig = await POST(reqInvalidSig);
  assert.strictEqual(resInvalidSig.status, 401);

  // 3. Valid signature -> 200
  const reqValid = new Request('http://localhost:3000/api/webhooks/sigma', {
    method: 'POST',
    headers: { 'x-sigma-signature': validHeader },
    body: validPayload,
  });
  const resValid = await POST(reqValid);
  assert.strictEqual(resValid.status, 200);
  const resJson = await resValid.json();
  assert.strictEqual(resJson.received, true);
  assert.strictEqual(resJson.id, '01ARZ3NDEKTSV4RRFFQ69G5FAV');
}

runRouteTests();
