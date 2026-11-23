/**
 * Types strictly generated from Sigma Reseller API OpenAPI v1 Specification
 * Base URL: https://smartplaypainel.site/api/reseller-api/v1
 */

export interface PaginationMeta {
  current_page?: number;
  last_page?: number;
  per_page?: number;
  total?: number;
  from?: number;
  to?: number;
}

export interface PaginationParams {
  page?: number;
  per_page?: number;
}

export interface Me {
  id: string;
  username: string;
  creditsBalance?: number;
  credits?: number;
  integrationStatus?: Array<{
    key?: string;
    status?: string;
    expiresAt?: string | null;
  }>;
  membership?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SingleResponse<T> {
  data: T;
}

export interface OwnDnsEntry {
  id?: string;
  domain?: string;
  status?: string;
  dns_1?: string;
  dns_2?: string;
  [key: string]: unknown;
}

export interface OwnDnsUpdated {
  message?: string;
  dns?: OwnDnsEntry;
  [key: string]: unknown;
}

export interface Package {
  id: string;
  name: string;
  server_id: string;
  connections: number;
  duration_days: number;
  is_trial: boolean;
  credit_cost?: number;
  [key: string]: unknown;
}

export interface Server {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  [key: string]: unknown;
}

export interface Coupon {
  id: string;
  code: string;
  discount_percentage?: number;
  discount_fixed?: number;
  expires_at?: string;
  max_uses?: number;
  uses_count?: number;
  status?: string;
  [key: string]: unknown;
}

export interface CouponCreate {
  code: string;
  discount_percentage?: number;
  discount_fixed?: number;
  expires_at?: string;
  max_uses?: number;
  [key: string]: unknown;
}

export interface Customer {
  id: string;
  username: string;
  password?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
  is_trial: boolean;
  expires_at: string;
  connections: number;
  package_id: string;
  server_id: string;
  created_at?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface CustomerCreate {
  username?: string;
  password?: string;
  server_id: string;
  package_id: string;
  connections?: number;
  notes?: string;
  [key: string]: unknown;
}

export interface CustomerUpdate {
  password?: string;
  notes?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  [key: string]: unknown;
}

export interface CustomerListParams extends PaginationParams {
  username?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
  is_trial?: 'YES' | 'NO';
}

export interface Reseller {
  id: string;
  username: string;
  email?: string;
  credits: number;
  status: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface ResellerCreate {
  username: string;
  password?: string;
  email?: string;
  credits?: number;
  [key: string]: unknown;
}

export interface ResellerUpdate {
  email?: string;
  password?: string;
  status?: string;
  [key: string]: unknown;
}

export interface CreditsBody {
  credits: number;
}

export interface ResellerDnsEntry {
  id?: string;
  reseller_id?: string;
  domain?: string;
  dns_1?: string;
  dns_2?: string;
  [key: string]: unknown;
}

export interface DnsUpdate {
  dns_1?: string;
  dns_2?: string;
  [key: string]: unknown;
}

export interface DnsReplace {
  old_dns: string;
  new_dns: string;
  [key: string]: unknown;
}

export interface DnsApply {
  dns: string;
  reseller_ids?: string[];
  [key: string]: unknown;
}

export interface DnsHistoryEntry {
  id: string;
  batch_id: string;
  applied_at: string;
  reverted_at?: string;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DnsMutation {
  message?: string;
  batch_id?: string;
  affected_count?: number;
  [key: string]: unknown;
}

export interface DnsRevertResult {
  message?: string;
  reverted_count?: number;
  [key: string]: unknown;
}

export interface CountReport {
  total: number;
  active?: number;
  inactive?: number;
  expired?: number;
  [key: string]: unknown;
}

export interface GenericReportItem {
  id?: string;
  username?: string;
  credits?: number;
  expires_at?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface MembershipAmount {
  plan?: string;
  amount?: number;
  [key: string]: unknown;
}

export interface MembershipReport {
  data?: MembershipAmount[];
  pagination?: PaginationMeta;
  [key: string]: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta?: PaginationMeta;
  pagination?: PaginationMeta;
}

export type WebhookEvent =
  | 'customer.created'
  | 'customer.updated'
  | 'customer.deleted'
  | 'customer.renewed'
  | 'customer.expired'
  | 'customer_order.created'
  | 'customer_order.paid'
  | 'reseller.created'
  | 'reseller.updated'
  | 'reseller.deleted'
  | 'credits.added'
  | 'credits.removed'
  | 'credits.recharged'
  | 'credit_order.created'
  | 'credit_order.paid';

export interface WebhookEnvelope {
  id: string;
  event: WebhookEvent | 'webhook.test';
  occurred_at: string;
  data: Record<string, unknown>;
}

export interface TokenForbiddenResponse {
  error: 'ip_not_allowed' | 'insufficient_scope' | 'permission_denied';
  message: string;
}

export interface ValidationErrorResponse {
  message: string;
  errors?: Record<string, string[]>;
}

export interface SigmaErrorResponse {
  message: string;
  error?: string;
}
