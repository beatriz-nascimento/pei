import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import localePt from '@angular/common/locales/pt';
import {
  type ApplicationConfig,
  LOCALE_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { MAT_SNACK_BAR_DEFAULT_OPTIONS } from '@angular/material/snack-bar';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { APP_CONFIG, type AppConfig, type MockBackend } from './core/config';

registerLocaleData(localePt);

export function createAppConfig(config: AppConfig, mock?: MockBackend): ApplicationConfig {
  return {
    providers: [
      provideBrowserGlobalErrorListeners(),
      { provide: APP_CONFIG, useValue: config },
      ...(mock?.providers ?? []),
      { provide: LOCALE_ID, useValue: 'pt-BR' },
      provideRouter(
        routes,
        withComponentInputBinding(),
        withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
      ),
      // No modo demonstração, o interceptor do mock fica por último e responde no lugar da API.
      provideHttpClient(
        withFetch(),
        withInterceptors([authInterceptor, ...(mock ? [mock.interceptor] : [])]),
      ),
      { provide: MAT_SNACK_BAR_DEFAULT_OPTIONS, useValue: { verticalPosition: 'bottom' } },
      provideAppInitializer(() => {
        // Ícones do Material Symbols (fonte carregada no index.html).
        inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
      }),
    ],
  };
}
