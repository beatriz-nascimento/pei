import {
  HttpErrorResponse,
  HttpHeaders,
  type HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { of, switchMap, throwError, timer } from 'rxjs';
import { APP_CONFIG } from '../core/config';
import { handleMockRequest } from './api';
import { MockDb } from './db';

/** Atraso artificial, para os estados de carregamento aparecerem como na vida real. */
const LATENCY_MS = 300;

/** Responde às chamadas para a API com o servidor simulado; o resto segue para a rede. */
export const mockApiInterceptor: HttpInterceptorFn = (req, next) => {
  const base = inject(APP_CONFIG).apiUrl.replace(/\/$/, '');
  if (!req.url.startsWith(base)) return next(req);
  const db = inject(MockDb);

  const [path = '/', qs = ''] = req.urlWithParams.slice(base.length).split('?');
  const auth = req.headers.get('Authorization') ?? '';
  const userId = auth.startsWith('Bearer mock.') ? auth.slice('Bearer mock.'.length) : null;

  return timer(LATENCY_MS).pipe(
    switchMap(() => {
      const res = handleMockRequest(db, {
        method: req.method,
        path,
        query: new URLSearchParams(qs),
        body: req.body,
        userId,
      });
      // eslint-disable-next-line no-console -- log de desenvolvimento, só no modo demonstração
      console.debug(`[mock] ${req.method} ${path} → ${res.status}`, res.body ?? '');
      if (res.status >= 400) {
        return throwError(
          () => new HttpErrorResponse({ status: res.status, error: res.body, url: req.url }),
        );
      }
      return of(
        new HttpResponse({
          status: res.status,
          body: res.body ?? null,
          headers: new HttpHeaders(res.headers ?? {}),
          url: req.url,
        }),
      );
    }),
  );
};
