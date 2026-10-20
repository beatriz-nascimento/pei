import { DestroyRef, type Signal, effect, inject, signal } from '@angular/core';

/** Versão "atrasada" de um signal, para não chamar a API a cada tecla. */
export function debounced<T>(source: Signal<T>, ms: number): Signal<T> {
  const out = signal(source());
  let timer: ReturnType<typeof setTimeout> | undefined;
  effect(() => {
    const value = source();
    clearTimeout(timer);
    timer = setTimeout(() => out.set(value), ms);
  });
  inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  return out.asReadonly();
}
