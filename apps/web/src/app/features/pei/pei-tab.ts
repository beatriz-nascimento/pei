import { Directive, inject, input, output, signal } from '@angular/core';
import type { Pei, UpdatePeiInput } from '@pei/shared';
import { ApiService } from '../../core/api.service';
import { NotifyService } from '../../core/notify.service';
import { SessionStore } from '../../core/session.store';

/** Base das abas do PEI: recebe o PEI, salva um pedaço dele e avisa o editor. */
@Directive()
export abstract class PeiTab {
  protected readonly api = inject(ApiService);
  protected readonly notify = inject(NotifyService);
  protected readonly session = inject(SessionStore);

  readonly pei = input.required<Pei>();
  readonly saved = output<Pei>();
  protected readonly saving = signal(false);

  protected async patch(body: UpdatePeiInput, message = 'Alterações salvas'): Promise<boolean> {
    this.saving.set(true);
    try {
      const updated = await this.api.patch<Pei>(
        this.session.tenantPath(`/peis/${this.pei().id}`),
        body,
      );
      this.saved.emit(updated);
      this.notify.success(message);
      return true;
    } catch (e) {
      this.notify.error(e);
      return false;
    } finally {
      this.saving.set(false);
    }
  }
}
