import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormField, form, submit, validateStandardSchema } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { CreatePeiInput, type Pei, type PeiSummary } from '@pei/shared';
import { ApiService } from '../../core/api.service';
import { NotifyService } from '../../core/notify.service';
import { SessionStore } from '../../core/session.store';
import { FieldErrorPipe, LabelPipe } from '../../shared/forms';

/** Passo 2: "Cria o PEI do aluno — novo PEI em rascunho, por ano/versão". */
@Component({
  selector: 'app-new-pei-dialog',
  imports: [
    FormField,
    FieldErrorPipe,
    LabelPipe,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Novo PEI</h2>
    <form (submit)="save($event)" novalidate>
      <mat-dialog-content class="stack">
        <p class="muted">
          O PEI começa como rascunho. Ele só passa a valer quando você o colocar em vigor.
        </p>
        <mat-form-field>
          <mat-label>Ano letivo</mat-label>
          <input matInput type="number" [formField]="f.schoolYear" />
          <mat-error>{{ f.schoolYear | fieldError }}</mat-error>
        </mat-form-field>
        <div class="row">
          <mat-form-field>
            <mat-label>Início da vigência</mat-label>
            <input matInput type="date" [formField]="f.startDate" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>Revisão prevista</mat-label>
            <input matInput type="date" [formField]="f.reviewDate" />
          </mat-form-field>
        </div>
        @if (data.previous.length) {
          <mat-form-field>
            <mat-label>Copiar conteúdo de</mat-label>
            <mat-select [value]="copyFrom()" (valueChange)="copyFrom.set($event)">
              <mat-option [value]="null">Começar em branco</mat-option>
              @for (p of data.previous; track p.id) {
                <mat-option [value]="p.id">
                  {{ p.schoolYear }} · v{{ p.version }} ({{ p.status | label: 'peiStatus' }})
                </mat-option>
              }
            </mat-select>
            <mat-hint>Copia as abas e as metas não descontinuadas</mat-hint>
          </mat-form-field>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="busy()">Criar PEI</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class NewPeiDialog {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(MatDialogRef<NewPeiDialog, Pei>);
  protected readonly data = inject<{ studentId: string; previous: PeiSummary[] }>(MAT_DIALOG_DATA);

  protected readonly busy = signal(false);
  protected readonly copyFrom = signal<string | null>(this.data.previous[0]?.id ?? null);
  protected readonly model = signal({
    schoolYear: new Date().getFullYear(),
    startDate: '',
    reviewDate: '',
  });
  protected readonly f = form(this.model, (p) => validateStandardSchema(p, CreatePeiInput));

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.f, async () => {
      this.busy.set(true);
      try {
        const body = CreatePeiInput.parse({
          ...this.model(),
          copyFromPeiId: this.copyFrom() ?? undefined,
        });
        const pei = await this.api.post<Pei>(
          this.session.tenantPath(`/students/${this.data.studentId}/peis`),
          body,
        );
        this.ref.close(pei);
      } catch (e) {
        this.notify.error(e);
      } finally {
        this.busy.set(false);
      }
      return undefined;
    });
  }
}
