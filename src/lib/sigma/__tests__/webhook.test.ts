import crypto from 'node:crypto';
import assert from 'node:assert';
import { verifySigmaWebhook } from '../webhook';

function createSignature(rawBody: string, timestamp: number, secret: string): string {
  const payload = `${timestamp}.${rawBody}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `t=${timestamp},v1=${hmac}`;
}

export function runWebhookVerifierTests() {
  const secret = 'super-secret-key-12345';
  const body = JSON.stringify({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', event: 'customer.created' });
  const now = Math.floor(Date.now() / 1000);

  // 1. Valid signature
  const validHeader = createSignature(body, now, secret);
  assert.strictEqual(
    verifySigmaWebhook(body, validHeader, secret),
    true,
    'Valid signature should return true'
  );

  // 2. Tampered body
  assert.strictEqual(
    verifySigmaWebhook(body + ' ', validHeader, secret),
    false,
    'Tampered body should return false'
  );

  // 3. Replay attack: timestamp older than 300s
  const oldHeader = createSignature(body, now - 301, secret);
  assert.strictEqual(
    verifySigmaWebhook(body, oldHeader, secret, 300),
    false,
    'Timestamp older than tolerance should return false'
  );

  // 4. Future timestamp beyond tolerance
  const futureHeader = createSignature(body, now + 305, secret);
  assert.strictEqual(
    verifySigmaWebhook(body, futureHeader, secret, 300),
    false,
    'Future timestamp beyond tolerance should return false'
  );

  // 5. Missing or invalid headers
  assert.strictEqual(verifySigmaWebhook(body, '', secret), false);
  assert.strictEqual(verifySigmaWebhook(body, null, secret), false);
  assert.strictEqual(verifySigmaWebhook(body, 'invalid_header', secret), false);
  assert.strictEqual(verifySigmaWebhook(body, 't=abc,v1=123', secret), false);

  // 6. Header with extra fields and random order
  const customHeader = `foo=bar, v1=${crypto.createHmac('sha256', secret).update(`${now}.${body}`).digest('hex')}, t=${now}, test=123`;
  assert.strictEqual(
    verifySigmaWebhook(body, customHeader, secret),
    true,
    'Header with extra fields and varied order should parse correctly'
  );
}

runWebhookVerifierTests();
