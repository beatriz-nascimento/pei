import { Injectable, computed, inject, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import type { AuthService } from '../core/auth.service';
import { MockDb, type MockUser, uuid } from './db';

const SESSION_KEY = 'pei.mock.session';
const MAGIC_LINK_KEY = 'pei.mock.magicLink';

/**
 * Substitui o AuthService (Supabase) no modo demonstração.
 * Qualquer senha serve para os usuários do banco simulado; o "token" é o id do usuário,
 * que o interceptor do mock lê para saber quem está chamando.
 */
@Injectable()
export class MockAuthService implements Omit<AuthService, 'client'> {
  private readonly db = inject(MockDb);

  private readonly _session = signal<Session | null>(null);
  readonly session = this._session.asReadonly();
  readonly ready = signal(true).asReadonly();
  readonly isLoggedIn = computed(() => this._session() !== null);
  readonly email = computed(() => this._session()?.user.email ?? null);

  constructor() {
    // Volta do "link mágico": entra com o e-mail guardado no envio.
    const magicEmail = location.pathname === '/auth/callback' ? read(MAGIC_LINK_KEY) : null;
    if (magicEmail) {
      write(MAGIC_LINK_KEY, null);
      const user = this.findUser(magicEmail);
      if (user) this.start(user);
      return;
    }
    const user = this.db.data.users.find((u) => u.id === read(SESSION_KEY));
    if (user) this._session.set(fakeSession(user));
  }

  whenReady(): Promise<void> {
    return Promise.resolve();
  }

  async accessToken(): Promise<string | null> {
    return this._session()?.access_token ?? null;
  }

  async signIn(email: string, _password: string): Promise<void> {
    await delay();
    const user = this.findUser(email);
    if (!user) throw new Error('E-mail ou senha incorretos');
    this.start(user);
  }

  async signUp(
    fullName: string,
    email: string,
    _password: string,
  ): Promise<{ needsConfirmation: boolean }> {
    await delay();
    if (this.findUser(email)) throw new Error('Este e-mail já tem cadastro. Faça login.');
    this.start(this.createUser(email, fullName));
    return { needsConfirmation: false };
  }

  /** Simula o clique no e-mail: vai direto para /auth/callback, como o link do Supabase. */
  async sendMagicLink(email: string, returnUrl = '/'): Promise<void> {
    await delay();
    // Como no Supabase, o link mágico também cria a conta de quem ainda não tem.
    const user = this.findUser(email) ?? this.createUser(email, null);
    write(MAGIC_LINK_KEY, user.email);
    setTimeout(() => {
      location.assign(`/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}`);
    }, 800);
  }

  async signOut(): Promise<void> {
    this._session.set(null);
    write(SESSION_KEY, null);
  }

  private start(user: MockUser): void {
    this._session.set(fakeSession(user));
    write(SESSION_KEY, user.id);
  }

  private findUser(email: string): MockUser | undefined {
    const e = email.trim().toLowerCase();
    return this.db.data.users.find((u) => u.email === e);
  }

  private createUser(email: string, fullName: string | null): MockUser {
    const user = { id: uuid(), email: email.trim().toLowerCase(), fullName };
    this.db.data.users.push(user);
    this.db.save();
    return user;
  }
}

/** Só os campos de Session que o app usa. */
function fakeSession(user: MockUser): Session {
  return {
    access_token: `mock.${user.id}`,
    user: { id: user.id, email: user.email },
  } as unknown as Session;
}

function delay(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* armazenamento indisponível: a sessão dura só até recarregar a página */
  }
}
