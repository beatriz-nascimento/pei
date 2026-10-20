import { Injectable, computed, inject, signal } from '@angular/core';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { APP_CONFIG } from './config';

/**
 * Login pelo Supabase Auth (@supabase/supabase-js: cliente oficial do Supabase).
 * A sessão fica num signal; o access token vai no cabeçalho das chamadas à API.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly config = inject(APP_CONFIG);
  readonly client: SupabaseClient = createClient(
    this.config.supabaseUrl,
    this.config.supabaseAnonKey,
    {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    },
  );

  private readonly _session = signal<Session | null>(null);
  private readonly _ready = signal(false);
  readonly session = this._session.asReadonly();
  readonly ready = this._ready.asReadonly();
  readonly isLoggedIn = computed(() => this._session() !== null);
  readonly email = computed(() => this._session()?.user.email ?? null);

  private readonly initPromise: Promise<void>;

  constructor() {
    this.client.auth.onAuthStateChange((_event, session) => this._session.set(session));
    this.initPromise = this.client.auth.getSession().then(({ data }) => {
      this._session.set(data.session);
      this._ready.set(true);
    });
  }

  /** Aguarda a leitura inicial da sessão (usado pelos guards). */
  whenReady(): Promise<void> {
    return this.initPromise;
  }

  async accessToken(): Promise<string | null> {
    await this.initPromise;
    const { data } = await this.client.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(translateAuthError(error.message));
  }

  async signUp(
    fullName: string,
    email: string,
    password: string,
  ): Promise<{ needsConfirmation: boolean }> {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    });
    if (error) throw new Error(translateAuthError(error.message));
    return { needsConfirmation: !data.session };
  }

  async sendMagicLink(email: string, returnUrl = '/'): Promise<void> {
    const { error } = await this.client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?returnUrl=${encodeURIComponent(returnUrl)}`,
      },
    });
    if (error) throw new Error(translateAuthError(error.message));
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }
}

function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos';
  if (m.includes('already registered')) return 'Este e-mail já tem cadastro. Faça login.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar';
  if (m.includes('password'))
    return 'Senha fraca: use ao menos 10 caracteres, com maiúsculas, minúsculas e números';
  if (m.includes('rate limit')) return 'Muitas tentativas. Aguarde alguns minutos.';
  return message;
}
