export class SigmaApiError extends Error {
  public status: number;
  public data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'SigmaApiError';
    this.status = status;
    this.data = data;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type TokenForbiddenCode = 'ip_not_allowed' | 'insufficient_scope' | 'permission_denied';

export class TokenForbiddenError extends SigmaApiError {
  public code: TokenForbiddenCode;

  constructor(message: string, code: TokenForbiddenCode, data?: unknown) {
    super(message, 403, data);
    this.name = 'TokenForbiddenError';
    this.code = code;
  }
}

export class RateLimitError extends SigmaApiError {
  public limit?: number;
  public remaining?: number;
  public retryAfter?: number;
  public resetAt?: number;

  constructor(
    message: string,
    meta?: {
      limit?: number;
      remaining?: number;
      retryAfter?: number;
      resetAt?: number;
    },
    data?: unknown
  ) {
    super(message, 429, data);
    this.name = 'RateLimitError';
    this.limit = meta?.limit;
    this.remaining = meta?.remaining;
    this.retryAfter = meta?.retryAfter;
    this.resetAt = meta?.resetAt;
  }
}

export class ValidationError extends SigmaApiError {
  public errors?: Record<string, string[]>;

  constructor(message: string, errors?: Record<string, string[]>, data?: unknown) {
    super(message, 422, data);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}
