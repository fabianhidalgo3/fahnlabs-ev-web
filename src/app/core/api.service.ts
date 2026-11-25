import { Injectable } from '@angular/core';

/** Error answered by the BFF as RFC 9457 problem details. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

/** Client of the BFF REST API (/api/v1). */
@Injectable({ providedIn: 'root' })
export class Api {
  static readonly BASE = '/api/v1';

  async request<T>(method: string, url: string, body?: unknown, query?: Record<string, unknown>): Promise<T> {
    let full = `${Api.BASE}${url}`;
    if (query) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
      const s = q.toString();
      if (s) full += `?${s}`;
    }
    let res: Response;
    try {
      res = await fetch(full, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, 'error.network');
    }
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const p = data as { detail?: string; title?: string; fields?: Record<string, string> };
      throw new ApiError(res.status, p.detail || p.title || res.statusText, p.fields);
    }
    return data as T;
  }

  get<T>(url: string, query?: Record<string, unknown>) {
    return this.request<T>('GET', url, undefined, query);
  }
  post<T>(url: string, body: unknown = {}) {
    return this.request<T>('POST', url, body);
  }
  put<T>(url: string, body: unknown) {
    return this.request<T>('PUT', url, body);
  }
  del<T = void>(url: string) {
    return this.request<T>('DELETE', url);
  }
}
