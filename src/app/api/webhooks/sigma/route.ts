import { NextResponse } from 'next/server';
import { verifySigmaWebhook } from '@/lib/sigma/webhook';
import { WebhookEnvelope } from '@/lib/sigma/types';

/**
 * Next.js App Router POST handler for Sigma Reseller API Webhooks.
 * Header: X-Sigma-Signature: t=<timestamp>,v1=<hex>
 * Body: Raw JSON payload
 */
export async function POST(req: Request) {
  const secret = process.env.SIGMA_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Sigma Webhook] SIGMA_WEBHOOK_SECRET is not configured in server environment.');
    return NextResponse.json({ error: 'webhook_secret_not_configured' }, { status: 500 });
  }

  const signatureHeader = req.headers.get('x-sigma-signature');
  const rawBody = await req.text();

  const isValid = verifySigmaWebhook(rawBody, signatureHeader, secret);
  if (!isValid) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let envelope: WebhookEnvelope;
  try {
    envelope = JSON.parse(rawBody) as WebhookEnvelope;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // Log receipt with event ID for idempotency/debugging
  console.log(`[Sigma Webhook] Received event "${envelope.event}" with ID "${envelope.id}" at ${envelope.occurred_at}`);

  // Extensibility hook: downstream applications can subscribe/process specific events here
  // (e.g. customer.created, customer.renewed, customer.expired, credits.recharged)

  return NextResponse.json(
    {
      received: true,
      id: envelope.id,
      event: envelope.event,
    },
    { status: 200 }
  );
}
