import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiErrorBody } from '@pei/shared';
import { firstValueFrom, type Observable } from 'rxjs';
import { APP_CONFIG } from './config';

/** Erro da API já traduzido para mensagem exibível. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: ApiErrorBody['issues'] = [],
  ) {
    super(message);
  }
}

/**
 * Cliente da API para escritas (POST/PATCH/PUT/DELETE) e downloads.
 * Leituras nos componentes usam `httpResource(() => api.url(...))`.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(APP_CONFIG).apiUrl.replace(/\/$/, '');

  url(path: string): string {
    return `${this.base}${path}`;
  }

  get<T>(path: string): Promise<T> {
    return this.run(this.http.get<T>(this.url(path)));
  }
  post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.run(this.http.post<T>(this.url(path), body));
  }
  patch<T>(path: string, body: unknown): Promise<T> {
    return this.run(this.http.patch<T>(this.url(path), body));
  }
  put<T>(path: string, body: unknown = {}): Promise<T> {
    return this.run(this.http.put<T>(this.url(path), body));
  }
  delete(path: string): Promise<void> {
    return this.run(this.http.delete<void>(this.url(path)));
  }
  /** Para casos fora do padrão, ex.: DELETE que devolve o recurso atualizado. */
  request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    return this.run(this.http.request<T>(method, this.url(path), { body }));
  }

  /** Baixa um arquivo (ex.: PDF do PEI) e dispara o "salvar como" do navegador. */
  async download(path: string, fallbackName: string): Promise<void> {
    const res = await this.run(
      this.http.get(this.url(path), { responseType: 'blob', observe: 'response' }),
    );
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
    const href = URL.createObjectURL(res.body!);
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  private async run<T>(obs: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(obs);
    } catch (e) {
      throw toApiError(e);
    }
  }
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0)
      return new ApiError(0, 'Sem conexão com o servidor. Verifique sua internet.');
    const body = e.error as Partial<ApiErrorBody> | null;
    return new ApiError(e.status, body?.message ?? 'Erro inesperado', body?.issues ?? []);
  }
  return new ApiError(500, e instanceof Error ? e.message : 'Erro inesperado');
}
