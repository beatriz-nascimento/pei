import { provideAppInitializer } from '@angular/core';
import { AuthService } from '../core/auth.service';
import type { MockBackend } from '../core/config';
import { MockDb } from './db';
import { mockApiInterceptor } from './mock-api.interceptor';
import { MockAuthService } from './mock-auth.service';
import { DEMO_FAMILY_TOKEN, DEMO_USERS } from './seed';

/**
 * Modo demonstração: liga com `"mock": true` em public/config.json.
 * Login e API passam a ser simulados no navegador, com dados salvos no localStorage.
 */
export function createMockBackend(): MockBackend {
  const db = new MockDb();
  return {
    interceptor: mockApiInterceptor,
    providers: [
      { provide: MockDb, useValue: db },
      { provide: AuthService, useClass: MockAuthService },
      provideAppInitializer(() => {
        exposeConsoleHelpers(db);
        showBadge(db);
      }),
    ],
  };
}

function exposeConsoleHelpers(db: MockDb): void {
  const reset = () => {
    db.reset();
    localStorage.removeItem('pei.mock.session');
    location.assign('/');
  };
  Object.assign(window, { peiMock: { db, reset } });
  // eslint-disable-next-line no-console -- instruções do modo demonstração
  console.info(
    '%cPEI · modo demonstração',
    'font-weight:bold',
    '\nLogin e API simulados no navegador (qualquer senha serve):',
    `\n  ${DEMO_USERS.ana.email}    Administradora (escola e consultório)`,
    `\n  ${DEMO_USERS.bruno.email}  Edita PEI (vinculado ao Lucas)`,
    `\n  ${DEMO_USERS.carla.email}  Só leitura (Lucas e Maria)`,
    '\n  outro e-mail: crie a conta em "Criar conta" para testar o onboarding',
    `\nPortal da família: ${location.origin}/familia/${DEMO_FAMILY_TOKEN}`,
    '\nDados: window.peiMock.db.data · Restaurar: window.peiMock.reset()',
  );
}

/** Selo fixo para ninguém confundir a demonstração com dados reais. */
function showBadge(db: MockDb): void {
  const badge = document.createElement('div');
  badge.setAttribute('role', 'status');
  badge.style.cssText =
    'position:fixed;left:12px;bottom:12px;z-index:10000;display:flex;gap:8px;align-items:center;' +
    'padding:6px 10px;border-radius:999px;background:#5d4037;color:#fff;' +
    'font:500 12px/1.2 system-ui,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.25);opacity:.92';
  badge.title = `Usuários: ${Object.values(DEMO_USERS)
    .map((u) => u.email)
    .join(', ')} (qualquer senha)`;
  badge.textContent = 'Modo demonstração';

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Restaurar dados';
  reset.style.cssText =
    'border:0;border-radius:999px;padding:2px 8px;background:rgba(255,255,255,.2);color:inherit;' +
    'font:inherit;cursor:pointer';
  reset.addEventListener('click', () => {
    db.reset();
    location.reload();
  });

  badge.append(reset);
  document.body.append(badge);
}
