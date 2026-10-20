import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { toApiError } from './api.service';

@Injectable({ providedIn: 'root' })
export class NotifyService {
  private readonly snack = inject(MatSnackBar);

  success(message: string): void {
    this.snack.open(message, 'OK', { duration: 3000 });
  }

  error(error: unknown): void {
    this.snack.open(toApiError(error).message, 'Fechar', {
      duration: 6000,
      panelClass: 'snack-error',
      politeness: 'assertive',
    });
  }

  /** Executa uma ação e mostra o erro, se houver. Retorna se deu certo. */
  async run(action: () => Promise<unknown>, successMessage?: string): Promise<boolean> {
    try {
      await action();
      if (successMessage) this.success(successMessage);
      return true;
    } catch (e) {
      this.error(e);
      return false;
    }
  }
}
