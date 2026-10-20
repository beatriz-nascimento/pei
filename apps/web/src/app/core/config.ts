import type { HttpInterceptorFn } from '@angular/common/http';
import { type EnvironmentProviders, InjectionToken, type Provider } from '@angular/core';

/**
 * Configuração lida em tempo de execução de /config.json.
 * A mesma imagem do frontend serve para homologação e produção: o container
 * gera esse arquivo a partir de variáveis de ambiente ao iniciar.
 */
export interface AppConfig {
  apiUrl: string;
  supabaseUrl: string;
  /** Chave pública (anon/publishable) do Supabase. Não é segredo. */
  supabaseAnonKey: string;
  /**
   * Modo demonstração: login e API simulados no navegador (src/app/mock), sem servidor.
   * Ausente ou `false` em homologação e produção.
   */
  mock?: boolean;
}

/** Peças que o modo demonstração injeta no app (carregadas só quando `mock` está ligado). */
export interface MockBackend {
  interceptor: HttpInterceptorFn;
  providers: Array<Provider | EnvironmentProviders>;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

export async function loadConfig(): Promise<AppConfig> {
  const res = await fetch('/config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Não foi possível carregar /config.json');
  return (await res.json()) as AppConfig;
}
