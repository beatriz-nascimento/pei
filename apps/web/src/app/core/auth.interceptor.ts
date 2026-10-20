import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { APP_CONFIG } from './config';

/** Anexa o access token às chamadas para a nossa API e trata sessão expirada. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const config = inject(APP_CONFIG);
  if (!req.url.startsWith(config.apiUrl) || req.url.startsWith(`${config.apiUrl}/public/`)) {
    return next(req);
  }
  const auth = inject(AuthService);
  const router = inject(Router);

  return from(auth.accessToken()).pipe(
    switchMap((token) =>
      next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req),
    ),
    catchError((err: { status?: number }) => {
      if (err.status === 401) {
        void auth
          .signOut()
          .then(() => router.navigate(['/entrar'], { queryParams: { returnUrl: router.url } }));
      }
      return throwError(() => err);
    }),
  );
};
