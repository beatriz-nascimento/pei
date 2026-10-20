import { Injectable, computed, inject, signal } from '@angular/core';
import type { Me, MemberRole } from '@pei/shared';
import { ApiService } from './api.service';

/** Usuário logado, suas contas e a conta em uso. */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(ApiService);

  private readonly _me = signal<Me | null>(null);
  private readonly _tenantId = signal<string | null>(null);

  readonly me = this._me.asReadonly();
  readonly tenantId = this._tenantId.asReadonly();
  readonly membership = computed(
    () => this._me()?.memberships.find((m) => m.tenantId === this._tenantId()) ?? null,
  );
  readonly role = computed<MemberRole | null>(() => this.membership()?.role ?? null);
  readonly isAdmin = computed(() => this.role() === 'admin');
  readonly canEdit = computed(() => this.role() === 'admin' || this.role() === 'editor');

  async loadMe(force = false): Promise<Me> {
    const cached = this._me();
    if (cached && !force) return cached;
    const me = await this.api.get<Me>('/me');
    this._me.set(me);
    return me;
  }

  selectTenant(id: string | null): void {
    this._tenantId.set(id);
    if (id) {
      try {
        localStorage.setItem('pei.lastTenant', id);
      } catch {
        /* armazenamento indisponível: sem problema */
      }
    }
  }

  lastTenantId(): string | null {
    try {
      return localStorage.getItem('pei.lastTenant');
    } catch {
      return null;
    }
  }

  clear(): void {
    this._me.set(null);
    this._tenantId.set(null);
  }

  /** Caminho base das rotas da conta atual na API. */
  tenantPath(suffix = ''): string {
    return `/tenants/${this._tenantId()}${suffix}`;
  }
}
