import crypto from 'node:crypto';

/**
 * Verifies Sigma Reseller API webhook HMAC-SHA256 signature.
 * Header format: X-Sigma-Signature: t=<unix_timestamp>,v1=<hex>
 * Signed string: `${timestamp}.${rawBody}`
 *
 * @param rawBody - Exact raw body string or Buffer received in the request.
 * @param signatureHeader - Value of the X-Sigma-Signature header.
 * @param secret - Webhook signing secret (SIGMA_WEBHOOK_SECRET).
 * @param toleranceSeconds - Maximum allowed age of the signature in seconds (default 300).
 */
export function verifySigmaWebhook(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string,
  toleranceSeconds: number = 300
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const fields: Record<string, string> = {};
  for (const pair of signatureHeader.split(',')) {
    const index = pair.indexOf('=');
    if (index > 0) {
      fields[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
    }
  }

  const timestamp = fields.t ?? '';
  const signature = fields.v1 ?? '';

  if (!/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (Math.abs(now - ts) > toleranceSeconds) {
    return false;
  }

  const payload = `${timestamp}.${typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8')}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();

  try {
    const signatureBuffer = Buffer.from(signature, 'hex');
    if (signatureBuffer.length !== expected.length) {
      return false;
    }
    return crypto.timingSafeEqual(expected, signatureBuffer);
  } catch {
    return false;
  }
}
