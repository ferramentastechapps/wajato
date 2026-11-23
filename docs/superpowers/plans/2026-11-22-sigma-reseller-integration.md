# Sigma Reseller API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, type-safe integration for the Sigma Reseller API v1 in TypeScript/Next.js, covering all documented operations, rate limiting, and HMAC-SHA256 webhook reception.

**Architecture:** A lightweight client in `src/lib/sigma/` structured into types, cryptographic webhook verifier, and an HTTP client using native `fetch`. A dedicated Next.js App Router route at `src/app/api/webhooks/sigma/route.ts` handles inbound webhook payloads.

**Tech Stack:** TypeScript 5, Next.js 16 (App Router), Node.js native `crypto`, native `fetch`, Vitest.

**Spec:** [docs/superpowers/specs/2026-11-22-sigma-reseller-integration-design.md](docs/superpowers/specs/2026-11-22-sigma-reseller-integration-design.md)

## Global Constraints

- URL base: `process.env.SIGMA_API_BASE_URL || 'https://smartplaypainel.site/api/reseller-api/v1'`
- Authentication: `Authorization: Bearer <SIGMA_API_TOKEN>` via `process.env.SIGMA_API_TOKEN`
- Webhook management via Reseller API is forbidden: `/me/webhooks*` routes are panel-session only and must never be called with the Reseller API token.
- No invented endpoints or non-documented fields.
- Webhook signature header format: `X-Sigma-Signature: t=<unix_timestamp>,v1=<hex>`. Payload signed: `<t>.<raw_body>` via HMAC-SHA256 with `process.env.SIGMA_WEBHOOK_SECRET`. Maximum age tolerance: 300 seconds. Constant-time comparison using `crypto.timingSafeEqual`.

## Review Focus

1. **Webhook Replay Attack:** Delivery with valid signature but `t` older than 300 seconds must be rejected.
2. **Signature Header Parsing Robustness:** Headers with unordered `key=value` pairs, extra unknown keys, or malformed entries must be handled safely without unhandled exceptions.
3. **HTTP 429 Throttling:** Client must parse `Retry-After`, `X-RateLimit-Limit`, and `X-RateLimit-Remaining` headers, raising `RateLimitError` without blindly retrying mutations.
4. **HTTP 403 Forbidden Scopes:** Client must parse `TokenForbidden` responses (`ip_not_allowed`, `insufficient_scope`, `permission_denied`) into a typed `TokenForbiddenError`.
5. **Raw Body Integrity in Webhooks:** Webhook route handler must read raw body text directly (`await req.text()`) rather than re-stringifying parsed JSON.

---

### Task 1: Environment Configuration & Schema Types

**Files:**
- Modify: `.env.example`
- Create: `src/lib/sigma/types.ts`

**Interfaces:**
- Produces:
  - `PaginationMeta`, `Me`, `OwnDnsEntry`, `OwnDnsUpdated`
  - `Package`, `Server`, `Coupon`, `CouponCreate`
  - `Customer`, `CustomerCreate`, `CustomerUpdate`
  - `Reseller`, `ResellerCreate`, `ResellerUpdate`, `CreditsBody`
  - `ResellerDnsEntry`, `DnsUpdate`, `DnsApply`, `DnsReplace`, `DnsHistoryEntry`, `DnsMutation`, `DnsRevertResult`
  - `CountReport`, `GenericReport`, `MembershipReport`
  - `WebhookEnvelope`, `WebhookEvent`, `SigmaErrorResponse`, `TokenForbiddenResponse`, `ValidationErrorResponse`

- [ ] **Step 1: Update `.env.example` with Sigma configuration**

Add:
```env
# --- Sigma Reseller API ---
SIGMA_API_BASE_URL=https://smartplaypainel.site/api/reseller-api/v1
SIGMA_API_TOKEN=seu_token_aqui
SIGMA_WEBHOOK_SECRET=seu_webhook_secret_aqui
```

- [ ] **Step 2: Define all OpenAPI v1 types in `src/lib/sigma/types.ts`**

Define exact interfaces matching the OpenAPI schemas:
- `PaginationMeta`: `{ current_page?: number, last_page?: number, per_page?: number, total?: number, from?: number, to?: number }`
- `Me`: `{ id: string, username: string, credits: number, status: string, role?: string, email?: string, created_at?: string }`
- `Customer`: `{ id: string, username: string, password?: string, status: string, is_trial: boolean, expires_at: string, connections: number, package_id: string, server_id: string, created_at: string, notes?: string }`
- `Reseller`: `{ id: string, username: string, email?: string, credits: number, status: string, created_at: string }`
- `WebhookEnvelope`: `{ id: string, event: WebhookEvent | 'webhook.test', occurred_at: string, data: Record<string, unknown> }`
- `WebhookEvent`: `'customer.created' | 'customer.updated' | 'customer.deleted' | 'customer.renewed' | 'customer.expired' | 'customer_order.created' | 'customer_order.paid' | 'reseller.created' | 'reseller.updated' | 'reseller.deleted' | 'credits.added' | 'credits.removed' | 'credits.recharged' | 'credit_order.created' | 'credit_order.paid'`

- [ ] **Step 3: Verify TypeScript compilation of `types.ts`**

Ensure `src/lib/sigma/types.ts` exports all types without syntax or circular import issues.

---

### Task 2: Webhook HMAC-SHA256 Signature Verifier

**Files:**
- Create: `src/lib/sigma/webhook.ts`
- Create: `src/lib/sigma/__tests__/webhook.test.ts`

**Interfaces:**
- Produces: `verifySigmaWebhook(rawBody: string | Buffer, signatureHeader: string | null | undefined, secret: string, toleranceSeconds?: number): boolean`

- [ ] **Step 1: Write unit tests in `src/lib/sigma/__tests__/webhook.test.ts`**

Test cases:
- Valid signature within tolerance window returns `true`.
- Tampered body returns `false`.
- Expired timestamp (`t` older than 300s) returns `false` (Review Focus 1).
- Future timestamp beyond tolerance window returns `false`.
- Missing or malformed header returns `false` (Review Focus 2).
- Non-hex signature returns `false`.

- [ ] **Step 2: Implement `verifySigmaWebhook` in `src/lib/sigma/webhook.ts`**

Implementation requirements:
- Split header by comma into `key=value` pairs.
- Extract `timestamp = fields.t` and `signature = fields.v1`.
- Verify timestamp is numeric and within `toleranceSeconds` (default 300s) from `Math.floor(Date.now() / 1000)`.
- Compute HMAC-SHA256 of `${timestamp}.${rawBody}` with `secret`.
- Compare using `crypto.timingSafeEqual(expectedBuffer, Buffer.from(signature, 'hex'))`.

- [ ] **Step 3: Run webhook tests**

Ensure all test cases in `webhook.test.ts` pass.

---

### Task 3: Core HTTP Client & Error Handling (Me, Packages, Servers, Coupons)

**Files:**
- Create: `src/lib/sigma/errors.ts`
- Create: `src/lib/sigma/client.ts`
- Create: `src/lib/sigma/__tests__/client.test.ts`

**Interfaces:**
- Produces:
  - Error classes: `SigmaApiError`, `TokenForbiddenError`, `RateLimitError`, `ValidationError`
  - Class: `SigmaClient` with constructor options `{ baseUrl?: string, token?: string }`
  - Submodules:
    - `client.me.get()`
    - `client.me.getDns()`
    - `client.me.updateDns(data: { dns_1?: string, dns_2?: string })`
    - `client.packages.list(params?: { page?: number, per_page?: number })`
    - `client.servers.list(params?: { page?: number, per_page?: number })`
    - `client.coupons.list(params?: { page?: number, per_page?: number })`
    - `client.coupons.get(couponId: string)`
    - `client.coupons.create(data: CouponCreate)`
    - `client.coupons.delete(couponId: string)`

- [ ] **Step 1: Implement error classes in `src/lib/sigma/errors.ts`**

- `SigmaApiError`: base class with `status: number`, `message: string`.
- `TokenForbiddenError`: inherits `SigmaApiError`, with `code: 'ip_not_allowed' | 'insufficient_scope' | 'permission_denied'` (Review Focus 4).
- `RateLimitError`: inherits `SigmaApiError`, with `limit?: number`, `remaining?: number`, `retryAfter?: number`, `resetAt?: number` (Review Focus 3).
- `ValidationError`: inherits `SigmaApiError`, with `errors?: Record<string, string[]>`.

- [ ] **Step 2: Implement core request dispatcher in `src/lib/sigma/client.ts`**

- Reads `SIGMA_API_TOKEN` and `SIGMA_API_BASE_URL` by default.
- Sets `Authorization: Bearer <token>` and `Accept: application/json`.
- Parses response headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`, `X-RateLimit-Reset`.
- On 401: throws `SigmaApiError` (Unauthorized).
- On 403: throws `TokenForbiddenError`.
- On 422: throws `ValidationError`.
- On 429: throws `RateLimitError`.
- On other 4xx/5xx: throws `SigmaApiError`.

- [ ] **Step 3: Implement `me`, `packages`, `servers`, `coupons` methods on `SigmaClient`**

- [ ] **Step 4: Write tests for client authentication, headers, error parsing, and core methods**

Mock `fetch` to verify:
- Correct Bearer token in request headers.
- Query parameters serialization for pagination (`page`, `per_page`).
- Error mapping (403 -> TokenForbiddenError, 429 -> RateLimitError with retryAfter).

---

### Task 4: Customers Module Implementation

**Files:**
- Modify: `src/lib/sigma/client.ts`
- Modify: `src/lib/sigma/__tests__/client.test.ts`

**Interfaces:**
- Produces:
  - `client.customers.list(params?: { page?: number, per_page?: number, username?: string, status?: 'ACTIVE' | 'INACTIVE' | 'EXPIRED', is_trial?: 'YES' | 'NO' })`
  - `client.customers.create(data: CustomerCreate)` -> `POST /customers`
  - `client.customers.getByUsername(username: string)` -> `GET /customers/by-username/{username}`
  - `client.customers.get(customerId: string)` -> `GET /customers/{customer}`
  - `client.customers.update(customerId: string, data: CustomerUpdate)` -> `PUT /customers/{customer}`
  - `client.customers.delete(customerId: string)` -> `DELETE /customers/{customer}`
  - `client.customers.renew(customerId: string, data?: { package_id?: string, connections?: number })` -> `POST /customers/{customer}/renew`
  - `client.customers.changeConnections(customerId: string, connections: number)` -> `PUT /customers/{customer}/connections`
  - `client.customers.addCourtesyDays(customerId: string, days: number)` -> `POST /customers/{customer}/courtesy-days`
  - `client.customers.changePackage(customerId: string, packageId: string)` -> `PUT /customers/{customer}/package`
  - `client.customers.migrateServer(customerId: string, data: { server_id: string, package_id: string })` -> `PUT /customers/{customer}/server-migration`
  - `client.customers.resync(customerId: string)` -> `POST /customers/{customer}/resync`

- [ ] **Step 1: Implement `customers` submodule on `SigmaClient`**

Ensure HTTP methods strictly follow OpenAPI specification:
- `renew`: `POST`
- `changeConnections`: `PUT` (with body `{ connections }`)
- `addCourtesyDays`: `POST` (with body `{ days }`)
- `changePackage`: `PUT` (with body `{ package_id }`)
- `migrateServer`: `PUT` (with body `{ server_id, package_id }`)
- `resync`: `POST`

- [ ] **Step 2: Add customer tests in `src/lib/sigma/__tests__/client.test.ts`**

Verify customer endpoints call correct URLs and HTTP methods.

---

### Task 5: Resellers, Credits, DNS & Reports Modules

**Files:**
- Modify: `src/lib/sigma/client.ts`
- Modify: `src/lib/sigma/__tests__/client.test.ts`

**Interfaces:**
- Produces:
  - `client.resellers.list(params?: { page?: number, per_page?: number })` -> `GET /resellers`
  - `client.resellers.create(data: ResellerCreate)` -> `POST /resellers`
  - `client.resellers.get(resellerId: string)` -> `GET /resellers/{reseller}`
  - `client.resellers.update(resellerId: string, data: ResellerUpdate)` -> `PUT /resellers/{reseller}`
  - `client.resellers.addCredits(resellerId: string, credits: number)` -> `POST /resellers/{reseller}/credits/add`
  - `client.resellers.removeCredits(resellerId: string, credits: number)` -> `POST /resellers/{reseller}/credits/remove`
  - `client.resellers.rechargeCredits(resellerId: string, credits: number)` -> `POST /resellers/{reseller}/credits/recharge`
  - `client.resellers.dns.list(params?: { page?: number, per_page?: number })` -> `GET /resellers/dns`
  - `client.resellers.dns.update(resellerId: string, data: DnsUpdate)` -> `PUT /resellers/{reseller}/dns`
  - `client.resellers.dns.replace(data: DnsReplace)` -> `POST /resellers/dns/replace`
  - `client.resellers.dns.apply(data: DnsApply)` -> `POST /resellers/dns/apply`
  - `client.resellers.dns.history(params?: { page?: number, per_page?: number })` -> `GET /resellers/dns/history`
  - `client.resellers.dns.revert(batchId: string)` -> `POST /resellers/dns/history/{batch}/revert`
  - `client.reports.customersCount()` -> `GET /reports/customers-count`
  - `client.reports.resellersCount()` -> `GET /reports/resellers-count`
  - `client.reports.membership(params?: { page?: number, per_page?: number })` -> `GET /reports/membership`
  - `client.reports.lowCredits(params?: { page?: number, per_page?: number })` -> `GET /reports/low-credits`
  - `client.reports.newResellers(params?: { page?: number, per_page?: number })` -> `GET /reports/new-resellers`
  - `client.reports.expiring(params?: { page?: number, per_page?: number })` -> `GET /reports/expiring`

- [ ] **Step 1: Implement `resellers`, `resellers.dns`, and `reports` submodules**

- [ ] **Step 2: Add tests for credits, DNS mutation/revert, and report calls**

---

### Task 6: Library Entrypoint & Next.js Webhook Route Handler

**Files:**
- Create: `src/lib/sigma/index.ts`
- Create: `src/app/api/webhooks/sigma/route.ts`
- Create: `src/app/api/webhooks/sigma/__tests__/route.test.ts`

**Interfaces:**
- Produces:
  - Export all types, errors, `verifySigmaWebhook`, `SigmaClient`, and default singleton instance `sigma` from `src/lib/sigma/index.ts`.
  - Next.js Route Handler `POST(req: Request)` at `src/app/api/webhooks/sigma/route.ts`.

- [ ] **Step 1: Create barrel export in `src/lib/sigma/index.ts`**

Export `SigmaClient`, default instance `sigma = new SigmaClient()`, `verifySigmaWebhook`, all error classes, and all types.

- [ ] **Step 2: Implement route handler in `src/app/api/webhooks/sigma/route.ts`**

Handler steps:
1. Extract `rawBody = await req.text()`.
2. Extract signature from `req.headers.get('x-sigma-signature')`.
3. Check `verifySigmaWebhook(rawBody, signature, process.env.SIGMA_WEBHOOK_SECRET || '')`.
4. If invalid, return `NextResponse.json({ error: 'invalid_signature' }, { status: 401 })`.
5. If valid, parse JSON payload as `WebhookEnvelope`.
6. Log event receipt and return `NextResponse.json({ received: true, id: envelope.id }, { status: 200 })`.

- [ ] **Step 3: Write route handler tests in `src/app/api/webhooks/sigma/__tests__/route.test.ts`**

Verify:
- Reject request missing signature (401).
- Reject request with invalid signature (401).
- Accept request with valid signature and return 200 with `{ received: true }`.
