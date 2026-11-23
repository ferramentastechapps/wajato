# Design Document: Integração Sigma Reseller API

**Data:** 2026-11-22  
**Status:** Em Revisão  
**Autor:** Antigravity / Claude Code  
**Escopo:** `src/lib/sigma/`, `src/app/api/webhooks/sigma/route.ts`, `.env.example`

---

## 1. Contexto e Motivação

O WaJato necessita de integração completa com o painel Sigma via sua Reseller API v1 (`https://smartplaypainel.site/api/reseller-api/v1`).
A API oferece gerenciamento de revendedores, clientes, pacotes, servidores, cupons de desconto, relatórios e DNS, além de notificações assíncronas via Webhooks assinados com HMAC-SHA256.

A documentação canônica é definida estritamente em:
- `https://smartplaypainel.site/api/reseller-api/v1/llms.txt`
- `https://smartplaypainel.site/api/reseller-api/v1/openapi.json`

---

## 2. Objetivos e Não-Objetivos

### 2.1 Objetivos
- Criar cliente TypeScript tipado em `src/lib/sigma/` cobrindo 100% das operações documentadas da Reseller API.
- Implementar tratamento de autenticação `Authorization: Bearer <SIGMA_API_TOKEN>`.
- Implementar controle de taxa e tolerância a throttling: quota compartilhada de 120 req/min por usuário/tenant, leitura de `X-RateLimit-Limit`, `X-RateLimit-Remaining`, e tratamento de `429 Too Many Requests` respeitando o header `Retry-After`.
- Implementar função de verificação de assinatura de webhooks (`verifySigmaWebhook`) com HMAC-SHA256 e comparação em tempo constante (`timingSafeEqual`), respeitando a especificação `x-hmac-verification` (tolerância padrão de 300 segundos, timestamp `t` e assinatura hex `v1`).
- Criar rota Next.js App Router `src/app/api/webhooks/sigma/route.ts` para receber eventos enviados pelo painel.
- Documentar variáveis de ambiente necessárias em `.env.example`.
- Adicionar testes automatizados cobrindo cliente, rate limit backoff e validação de assinatura de webhooks.

### 2.2 Não-Objetivos e Anti-Objetivos (O que NÃO fazer)
- **NÃO** inventar rotas, parâmetros, campos ou endpoints não existentes na especificação OpenAPI v1.
- **NÃO** implementar gestão de endpoints `/me/webhooks*` com token de revenda: a documentação e o usuário estabelecem que o gerenciamento de webhooks é exclusivo de sessão autenticada no painel web e recusa tokens da Reseller API.
- **NÃO** solicitar ou armazenar tokens reais em código ou commits; usar apenas variáveis de ambiente (`SIGMA_API_TOKEN`, `SIGMA_WEBHOOK_SECRET`, `SIGMA_API_BASE_URL`).

---

## 3. Arquitetura da Solução

### 3.1 Estrutura de Arquivos
```
src/
├── lib/
│   └── sigma/
│       ├── types.ts          # Interfaces e tipos TypeScript 1:1 com OpenAPI schemas
│       ├── client.ts         # Cliente HTTP (fetch nativo, auth Bearer, headers, rate-limiting)
│       ├── webhook.ts        # Verificação criptográfica de assinatura de webhook (HMAC-SHA256)
│       ├── index.ts          # Exports públicos da biblioteca
│       └── __tests__/
│           └── sigma.test.ts # Testes unitários do cliente e verificador de webhooks
└── app/
    └── api/
        └── webhooks/
            └── sigma/
                └── route.ts  # Endpoint Next.js App Router para recebimento de webhooks
```

### 3.2 Módulos e Operações Cobertas

#### A. Tipos (`src/lib/sigma/types.ts`)
Modelagem direta dos schemas do OpenAPI:
- `Me`, `OwnDnsEntry`, `OwnDnsUpdated`
- `Package`, `Server`, `Coupon`, `CouponCreate`
- `Customer`, `CustomerCreate`, `CustomerUpdate`
- `Reseller`, `ResellerCreate`, `ResellerUpdate`, `CreditsBody`
- `ResellerDnsEntry`, `DnsUpdate`, `DnsApply`, `DnsReplace`, `DnsHistoryEntry`, `DnsMutation`, `DnsRevertResult`
- `PaginationMeta`
- Relatórios: `CountReport`, `GenericReport`, `MembershipReport`
- Webhooks: `WebhookEnvelope`, `WebhookEvent`

#### B. Cliente HTTP (`src/lib/sigma/client.ts`)
- URL Base padrão: `https://smartplaypainel.site/api/reseller-api/v1` (sobrescrevível via `SIGMA_API_BASE_URL`).
- Autenticação: Header `Authorization: Bearer <SIGMA_API_TOKEN>`.
- Leitura dos cabeçalhos: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`, `X-RateLimit-Reset`.
- Em caso de HTTP 429, aguardar `Retry-After` segundos antes de retry com backoff limitado (máximo 2 tentativas em operações GET idempotentes; nunca retentar mutations cegamente).
- Tratamento estruturado de erros da API:
  - `401 Unauthorized`
  - `403 TokenForbidden` (`ip_not_allowed`, `insufficient_scope`, `permission_denied`)
  - `404 NotFound`
  - `422 ValidationError` com detalhes do dicionário `errors`
  - `429 RateLimited`

Grupos de métodos:
1. `me`:
   - `get()` -> `GET /me`
   - `getDns()` -> `GET /me/dns`
   - `updateDns(data)` -> `PUT /me/dns`
2. `packages`:
   - `list(params)` -> `GET /packages`
3. `servers`:
   - `list(params)` -> `GET /servers`
4. `coupons`:
   - `list(params)` -> `GET /coupons`
   - `create(data)` -> `POST /coupons`
   - `get(couponId)` -> `GET /coupons/{coupon}`
   - `delete(couponId)` -> `DELETE /coupons/{coupon}`
5. `customers`:
   - `list(params)` -> `GET /customers`
   - `create(data)` -> `POST /customers`
   - `getByUsername(username)` -> `GET /customers/by-username/{username}`
   - `get(customerId)` -> `GET /customers/{customer}`
   - `update(customerId, data)` -> `PUT /customers/{customer}`
   - `delete(customerId)` -> `DELETE /customers/{customer}`
   - `renew(customerId, data)` -> `POST /customers/{customer}/renew`
   - `changeConnections(customerId, connections)` -> `PUT /customers/{customer}/connections`
   - `addCourtesyDays(customerId, days)` -> `POST /customers/{customer}/courtesy-days`
   - `changePackage(customerId, packageId)` -> `PUT /customers/{customer}/package`
   - `migrateServer(customerId, data)` -> `PUT /customers/{customer}/server-migration`
   - `resync(customerId)` -> `POST /customers/{customer}/resync`
6. `resellers`:
   - `list(params)` -> `GET /resellers`
   - `create(data)` -> `POST /resellers`
   - `get(resellerId)` -> `GET /resellers/{reseller}`
   - `update(resellerId, data)` -> `PUT /resellers/{reseller}`
   - `addCredits(resellerId, credits)` -> `POST /resellers/{reseller}/credits/add`
   - `removeCredits(resellerId, credits)` -> `POST /resellers/{reseller}/credits/remove`
   - `rechargeCredits(resellerId, credits)` -> `POST /resellers/{reseller}/credits/recharge`
   - `dns.list(params)` -> `GET /resellers/dns`
   - `dns.update(resellerId, data)` -> `PUT /resellers/{reseller}/dns`
   - `dns.replace(data)` -> `POST /resellers/dns/replace`
   - `dns.apply(data)` -> `POST /resellers/dns/apply`
   - `dns.history(params)` -> `GET /resellers/dns/history`
   - `dns.revert(batchId)` -> `POST /resellers/dns/history/{batch}/revert`
7. `reports`:
   - `customersCount()` -> `GET /reports/customers-count`
   - `resellersCount()` -> `GET /reports/resellers-count`
   - `membership(params)` -> `GET /reports/membership`
   - `lowCredits(params)` -> `GET /reports/low-credits`
   - `newResellers(params)` -> `GET /reports/new-resellers`
   - `expiring(params)` -> `GET /reports/expiring`

#### C. Validador de Webhook (`src/lib/sigma/webhook.ts`)
Conforme documentação oficial (`x-hmac-verification`):
- Header esperado: `X-Sigma-Signature: t=<unix_timestamp>,v1=<hex>`.
- Extração de `t` e `v1`.
- Validação se `t` está dentro da janela de tolerância de 300 segundos em relação ao relógio local.
- Cálculo de HMAC SHA-256 da string `${t}.${rawBody}` com a chave secreta `SIGMA_WEBHOOK_SECRET`.
- Comparação segura com `crypto.timingSafeEqual`.

#### D. Handler de Webhook (`src/app/api/webhooks/sigma/route.ts`)
- Método: `POST`.
- Leitura do corpo bruto (`await req.text()`).
- Leitura do header `x-sigma-signature`.
- Chamada de `verifySigmaWebhook(...)`.
- Retorno `401 Unauthorized` se a assinatura for inválida.
- Parse do JSON (`WebhookEnvelope`), extração do evento e ID para deduplicação.
- Ponto de extensão para processamento dos eventos documentados (`customer.created`, `customer.renewed`, etc.).
- Retorno `200 OK` para confirmar recebimento.

---

## 4. Segurança e Variáveis de Ambiente

No arquivo `.env.example`:
```env
# --- Sigma Reseller API ---
SIGMA_API_BASE_URL=https://smartplaypainel.site/api/reseller-api/v1
SIGMA_API_TOKEN=seu_token_aqui
SIGMA_WEBHOOK_SECRET=seu_webhook_secret_aqui
```

---

## 5. Plano de Validação e Testes
- Testes unitários com Vitest:
  1. Verificação de HMAC com payloads válidos, assinaturas incorretas e timestamps expirados (>300s).
  2. Mocks de chamadas do cliente HTTP garantindo headers de autorização corretos (`Bearer ...`), query strings de paginação e parsing de erros (403, 422, 429).
  3. Comportamento sob rate-limiting (429) e leitura de headers.
