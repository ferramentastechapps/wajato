import {
  SigmaApiError,
  TokenForbiddenError,
  TokenForbiddenCode,
  RateLimitError,
  ValidationError,
} from './errors';
import {
  Me,
  OwnDnsEntry,
  OwnDnsUpdated,
  Package,
  Server,
  Coupon,
  CouponCreate,
  Customer,
  CustomerCreate,
  CustomerUpdate,
  CustomerListParams,
  Reseller,
  ResellerCreate,
  ResellerUpdate,
  ResellerDnsEntry,
  DnsUpdate,
  DnsReplace,
  DnsApply,
  DnsHistoryEntry,
  DnsMutation,
  DnsRevertResult,
  CountReport,
  GenericReportItem,
  MembershipReport,
  PaginatedResponse,
  PaginationParams,
  SingleResponse,
  TokenForbiddenResponse,
  ValidationErrorResponse,
  SigmaErrorResponse,
} from './types';

export interface SigmaClientOptions {
  baseUrl?: string;
  token?: string;
  fetch?: typeof fetch;
}

export class SigmaClient {
  private baseUrl: string;
  private token: string;
  private fetchFn: typeof fetch;

  public lastRateLimit?: {
    limit?: number;
    remaining?: number;
    resetAt?: number;
  };

  constructor(options?: SigmaClientOptions) {
    this.baseUrl = (
      options?.baseUrl ||
      process.env.SIGMA_API_BASE_URL ||
      'https://smartplaypainel.site/api/reseller-api/v1'
    ).replace(/\/+$/, '');
    this.token = options?.token || process.env.SIGMA_API_TOKEN || '';
    this.fetchFn = options?.fetch || globalThis.fetch;
  }

  private async request<T>(
    method: string,
    path: string,
    options?: {
      query?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
    }
  ): Promise<T> {
    if (!this.token) {
      this.token = process.env.SIGMA_API_TOKEN || '';
    }
    if (!this.baseUrl || this.baseUrl === 'https://smartplaypainel.site/api/reseller-api/v1') {
      this.baseUrl = (process.env.SIGMA_API_BASE_URL || this.baseUrl || 'https://smartplaypainel.site/api/reseller-api/v1').replace(/\/+$/, '');
    }

    if (!this.token) {
      throw new SigmaApiError(
        'Sigma API token is not configured. Set SIGMA_API_TOKEN in environment or pass to constructor.',
        401
      );
    }

    let url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    if (options?.query) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
    };

    let bodyPayload: string | undefined;
    if (options?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      bodyPayload = JSON.stringify(options.body);
    }

    const response = await this.fetchFn(url, {
      method,
      headers,
      body: bodyPayload,
    });

    const limitHeader = response.headers.get('x-ratelimit-limit');
    const remainingHeader = response.headers.get('x-ratelimit-remaining');
    const resetHeader = response.headers.get('x-ratelimit-reset');
    const retryAfterHeader = response.headers.get('retry-after');

    const limit = limitHeader ? parseInt(limitHeader, 10) : undefined;
    const remaining = remainingHeader ? parseInt(remainingHeader, 10) : undefined;
    const resetAt = resetHeader ? parseInt(resetHeader, 10) : undefined;
    const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

    this.lastRateLimit = { limit, remaining, resetAt };

    if (!response.ok) {
      let errorData: any = null;
      try {
        errorData = await response.json();
      } catch {
        // Body is not JSON
      }

      if (response.status === 429) {
        throw new RateLimitError(
          (errorData as SigmaErrorResponse)?.message || 'Rate limit exceeded. Check retryAfter.',
          { limit, remaining, retryAfter, resetAt },
          errorData
        );
      }

      if (response.status === 403) {
        const forbidden = errorData as TokenForbiddenResponse | undefined;
        const code = (forbidden?.error as TokenForbiddenCode) || 'permission_denied';
        const msg = forbidden?.message || 'Access forbidden: insufficient scope or permission.';
        throw new TokenForbiddenError(msg, code, errorData);
      }

      if (response.status === 422) {
        const valError = errorData as ValidationErrorResponse | undefined;
        throw new ValidationError(
          valError?.message || 'Validation error in request payload.',
          valError?.errors,
          errorData
        );
      }

      const msg =
        (errorData as SigmaErrorResponse)?.message ||
        `Sigma API request failed with status ${response.status}`;
      throw new SigmaApiError(msg, response.status, errorData);
    }

    if (response.status === 204) {
      return undefined as unknown as T;
    }

    const json = await response.json();
    if (json && typeof json === 'object' && 'data' in json && !('meta' in json) && !('pagination' in json)) {
      return json.data as T;
    }

    return json as T;
  }

  // --- /me ---
  public readonly me = {
    get: (): Promise<Me> => {
      return this.request<Me>('GET', '/me');
    },
    getDns: (): Promise<OwnDnsEntry[]> => {
      return this.request<OwnDnsEntry[]>('GET', '/me/dns');
    },
    updateDns: (data: DnsUpdate): Promise<OwnDnsUpdated> => {
      return this.request<OwnDnsUpdated>('PUT', '/me/dns', { body: data });
    },
  };

  // --- /packages ---
  public readonly packages = {
    list: (params?: PaginationParams): Promise<PaginatedResponse<Package>> => {
      return this.request<PaginatedResponse<Package>>('GET', '/packages', {
        query: params as Record<string, string | number | boolean | undefined>,
      });
    },
  };

  // --- /servers ---
  public readonly servers = {
    list: (params?: PaginationParams): Promise<PaginatedResponse<Server>> => {
      return this.request<PaginatedResponse<Server>>('GET', '/servers', {
        query: params as Record<string, string | number | boolean | undefined>,
      });
    },
  };

  // --- /coupons ---
  public readonly coupons = {
    list: (params?: PaginationParams): Promise<PaginatedResponse<Coupon>> => {
      return this.request<PaginatedResponse<Coupon>>('GET', '/coupons', {
        query: params as Record<string, string | number | boolean | undefined>,
      });
    },
    get: (couponId: string): Promise<Coupon> => {
      return this.request<Coupon>('GET', `/coupons/${encodeURIComponent(couponId)}`);
    },
    create: (data: CouponCreate): Promise<Coupon> => {
      return this.request<Coupon>('POST', '/coupons', { body: data });
    },
    delete: (couponId: string): Promise<{ message?: string }> => {
      return this.request<{ message?: string }>('DELETE', `/coupons/${encodeURIComponent(couponId)}`);
    },
  };

  // --- /customers ---
  public readonly customers = {
    list: (params?: CustomerListParams): Promise<PaginatedResponse<Customer>> => {
      return this.request<PaginatedResponse<Customer>>('GET', '/customers', {
        query: params as Record<string, string | number | boolean | undefined>,
      });
    },
    create: (data: CustomerCreate): Promise<Customer> => {
      return this.request<Customer>('POST', '/customers', { body: data });
    },
    getByUsername: (username: string): Promise<Customer> => {
      return this.request<Customer>(
        'GET',
        `/customers/by-username/${encodeURIComponent(username)}`
      );
    },
    get: (customerId: string): Promise<Customer> => {
      return this.request<Customer>('GET', `/customers/${encodeURIComponent(customerId)}`);
    },
    update: (customerId: string, data: CustomerUpdate): Promise<Customer> => {
      return this.request<Customer>('PUT', `/customers/${encodeURIComponent(customerId)}`, {
        body: data,
      });
    },
    delete: (customerId: string): Promise<{ message?: string }> => {
      return this.request<{ message?: string }>(
        'DELETE',
        `/customers/${encodeURIComponent(customerId)}`
      );
    },
    renew: (
      customerId: string,
      data?: { package_id?: string; connections?: number }
    ): Promise<Customer> => {
      return this.request<Customer>('POST', `/customers/${encodeURIComponent(customerId)}/renew`, {
        body: data || {},
      });
    },
    changeConnections: (customerId: string, connections: number): Promise<Customer> => {
      return this.request<Customer>(
        'PUT',
        `/customers/${encodeURIComponent(customerId)}/connections`,
        {
          body: { connections },
        }
      );
    },
    addCourtesyDays: (customerId: string, days: number): Promise<Customer> => {
      return this.request<Customer>(
        'POST',
        `/customers/${encodeURIComponent(customerId)}/courtesy-days`,
        {
          body: { days },
        }
      );
    },
    changePackage: (customerId: string, packageId: string): Promise<Customer> => {
      return this.request<Customer>(
        'PUT',
        `/customers/${encodeURIComponent(customerId)}/package`,
        {
          body: { package_id: packageId },
        }
      );
    },
    migrateServer: (
      customerId: string,
      data: { server_id: string; package_id: string }
    ): Promise<Customer> => {
      return this.request<Customer>(
        'PUT',
        `/customers/${encodeURIComponent(customerId)}/server-migration`,
        {
          body: data,
        }
      );
    },
    resync: (customerId: string): Promise<Customer> => {
      return this.request<Customer>(
        'POST',
        `/customers/${encodeURIComponent(customerId)}/resync`
      );
    },
  };

  // --- /resellers ---
  public readonly resellers = {
    list: (params?: PaginationParams): Promise<PaginatedResponse<Reseller>> => {
      return this.request<PaginatedResponse<Reseller>>('GET', '/resellers', {
        query: params as Record<string, string | number | boolean | undefined>,
      });
    },
    create: (data: ResellerCreate): Promise<Reseller> => {
      return this.request<Reseller>('POST', '/resellers', { body: data });
    },
    get: (resellerId: string): Promise<Reseller> => {
      return this.request<Reseller>('GET', `/resellers/${encodeURIComponent(resellerId)}`);
    },
    update: (resellerId: string, data: ResellerUpdate): Promise<Reseller> => {
      return this.request<Reseller>('PUT', `/resellers/${encodeURIComponent(resellerId)}`, {
        body: data,
      });
    },
    addCredits: (resellerId: string, credits: number): Promise<Reseller> => {
      return this.request<Reseller>(
        'POST',
        `/resellers/${encodeURIComponent(resellerId)}/credits/add`,
        {
          body: { credits },
        }
      );
    },
    removeCredits: (resellerId: string, credits: number): Promise<Reseller> => {
      return this.request<Reseller>(
        'POST',
        `/resellers/${encodeURIComponent(resellerId)}/credits/remove`,
        {
          body: { credits },
        }
      );
    },
    rechargeCredits: (resellerId: string, credits: number): Promise<Reseller> => {
      return this.request<Reseller>(
        'POST',
        `/resellers/${encodeURIComponent(resellerId)}/credits/recharge`,
        {
          body: { credits },
        }
      );
    },
    dns: {
      list: (params?: PaginationParams): Promise<PaginatedResponse<ResellerDnsEntry>> => {
        return this.request<PaginatedResponse<ResellerDnsEntry>>('GET', '/resellers/dns', {
          query: params as Record<string, string | number | boolean | undefined>,
        });
      },
      update: (resellerId: string, data: DnsUpdate): Promise<ResellerDnsEntry> => {
        return this.request<ResellerDnsEntry>(
          'PUT',
          `/resellers/${encodeURIComponent(resellerId)}/dns`,
          {
            body: data,
          }
        );
      },
      replace: (data: DnsReplace): Promise<DnsMutation> => {
        return this.request<DnsMutation>('POST', '/resellers/dns/replace', { body: data });
      },
      apply: (data: DnsApply): Promise<DnsMutation> => {
        return this.request<DnsMutation>('POST', '/resellers/dns/apply', { body: data });
      },
      history: (params?: PaginationParams): Promise<PaginatedResponse<DnsHistoryEntry>> => {
        return this.request<PaginatedResponse<DnsHistoryEntry>>('GET', '/resellers/dns/history', {
          query: params as Record<string, string | number | boolean | undefined>,
        });
      },
      revert: (batchId: string): Promise<DnsRevertResult> => {
        return this.request<DnsRevertResult>(
          'POST',
          `/resellers/dns/history/${encodeURIComponent(batchId)}/revert`
        );
      },
    },
  };

  // --- /reports ---
  public readonly reports = {
    customersCount: (): Promise<CountReport> => {
      return this.request<CountReport>('GET', '/reports/customers-count');
    },
    resellersCount: (): Promise<CountReport> => {
      return this.request<CountReport>('GET', '/reports/resellers-count');
    },
    membership: (params?: PaginationParams): Promise<MembershipReport> => {
      return this.request<MembershipReport>('GET', '/reports/membership', {
        query: params as Record<string, string | number | boolean | undefined>,
      });
    },
    lowCredits: (params?: PaginationParams): Promise<PaginatedResponse<GenericReportItem>> => {
      return this.request<PaginatedResponse<GenericReportItem>>('GET', '/reports/low-credits', {
        query: params as Record<string, string | number | boolean | undefined>,
      });
    },
    newResellers: (params?: PaginationParams): Promise<PaginatedResponse<GenericReportItem>> => {
      return this.request<PaginatedResponse<GenericReportItem>>('GET', '/reports/new-resellers', {
        query: params as Record<string, string | number | boolean | undefined>,
      });
    },
    expiring: (params?: PaginationParams): Promise<PaginatedResponse<GenericReportItem>> => {
      return this.request<PaginatedResponse<GenericReportItem>>('GET', '/reports/expiring', {
        query: params as Record<string, string | number | boolean | undefined>,
      });
    },
  };
}
