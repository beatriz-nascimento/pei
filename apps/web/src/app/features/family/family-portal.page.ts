import { httpResource } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormField, form, submit, validateStandardSchema } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { FamilyConsentInput, type FamilyPortalView } from '@pei/shared';
import { z } from 'zod';
import { ApiService } from '../../core/api.service';
import { NotifyService } from '../../core/notify.service';
import { FieldErrorPipe, LabelPipe } from '../../shared/forms';
import { ProgressHistory } from '../../shared/progress';

// O checkbox começa desmarcado (false); o esquema compartilhado exige true.
const ConsentForm = FamilyConsentInput.extend({
  accepted: z.boolean().refine((v) => v, 'É preciso aceitar o termo para continuar'),
});

/** Passo 7: "Família acessa o portal — somente leitura · cada acesso é contado". */
@Component({
  selector: 'app-family-portal-page',
  imports: [
    DatePipe,
    FieldErrorPipe,
    FormField,
    LabelPipe,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    ProgressHistory,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './family-portal.page.html',
  styleUrl: './family-portal.page.scss',
})
export class FamilyPortalPage {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  readonly token = input.required<string>();

  protected readonly view = httpResource<FamilyPortalView>(() =>
    this.api.url(`/public/family/${encodeURIComponent(this.token())}`),
  );
  protected readonly peis = computed(() => this.view.value()?.peis ?? []);

  protected readonly busy = signal(false);
  protected readonly consent = form(
    signal({ guardianName: '', relationship: '', accepted: false }),
    (p) => validateStandardSchema(p, ConsentForm),
  );

  protected async accept(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.consent, async () => {
      this.busy.set(true);
      try {
        await this.api.post(
          `/public/family/${encodeURIComponent(this.token())}/consent`,
          this.consent().value(),
        );
        this.view.reload();
      } catch (e) {
        this.notify.error(e);
      } finally {
        this.busy.set(false);
      }
      return undefined;
    });
  }
}
