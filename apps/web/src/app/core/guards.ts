import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { SessionStore } from './session.store';

/** Exige login; sem sessão, manda para /entrar guardando o destino. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  if (auth.isLoggedIn()) return true;
  return router.createUrlTree(['/entrar'], { queryParams: { returnUrl: state.url } });
};

/** Só para visitantes (tela de login). */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  await auth.whenReady();
  return auth.isLoggedIn() ? inject(Router).createUrlTree(['/']) : true;
};

/** Raiz "/": leva para a última conta usada, para a primeira, ou para a criação de conta. */
export const homeRedirectGuard: CanActivateFn = async () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  const me = await session.loadMe();
  if (me.memberships.length === 0) return router.createUrlTree(['/comecar']);
  const last = session.lastTenantId();
  const target = me.memberships.find((m) => m.tenantId === last) ?? me.memberships[0]!;
  return router.createUrlTree(['/t', target.tenantId]);
};

/** Rotas /t/:tenantId — confere se o usuário é membro e marca a conta em uso. */
export const tenantGuard: CanActivateFn = async (route) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  const me = await session.loadMe();
  const tenantId = route.paramMap.get('tenantId');
  if (!me.memberships.some((m) => m.tenantId === tenantId)) return router.createUrlTree(['/']);
  session.selectTenant(tenantId);
  return true;
};

export const adminGuard: CanActivateFn = () => {
  const session = inject(SessionStore);
  return session.isAdmin() || inject(Router).createUrlTree(['/t', session.tenantId()]);
};
