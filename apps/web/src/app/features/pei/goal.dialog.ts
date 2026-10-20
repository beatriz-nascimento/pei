import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormField, form, submit, validateStandardSchema } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { type Goal, GoalInput } from '@pei/shared';
import { ApiService } from '../../core/api.service';
import { NotifyService } from '../../core/notify.service';
import { SessionStore } from '../../core/session.store';
import { FieldErrorPipe, options } from '../../shared/forms';

export interface GoalDialogData {
  peiId: string;
  goal?: Goal;
  defaultTargetDate?: string | null;
}

/** Cadastro de meta SMART, com orientação em cada campo. */
@Component({
  selector: 'app-goal-dialog',
  imports: [
    FormField,
    FieldErrorPipe,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.goal ? 'Editar meta' : 'Nova meta' }}</h2>
    <form (submit)="save($event)" novalidate>
      <mat-dialog-content class="stack">
        <div class="smart-tip">
          <mat-icon aria-hidden="true">lightbulb</mat-icon>
          <span>
            Meta <strong>SMART</strong>: específica (o que o aluno fará), mensurável (como saber que
            conseguiu), alcançável, relevante e com prazo.
          </span>
        </div>
        <mat-form-field>
          <mat-label>Área</mat-label>
          <mat-select [formField]="f.area">
            @for (o of areas; track o[0]) {
              <mat-option [value]="o[0]">{{ o[1] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Meta (o que o aluno fará)</mat-label>
          <textarea
            matInput
            rows="2"
            [formField]="f.description"
            placeholder="Ex.: Pedir ajuda usando o cartão de comunicação"
          ></textarea>
          <mat-hint
            >Comece com um verbo de ação observável: pedir, ler, organizar, esperar…</mat-hint
          >
          <mat-error>{{ f.description | fieldError }}</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Critério de sucesso</mat-label>
          <input
            matInput
            [formField]="f.successCriterion"
            placeholder="Ex.: em 4 de 5 oportunidades, por 3 semanas"
          />
          <mat-hint>Como saber, com números, que a meta foi alcançada</mat-hint>
          <mat-error>{{ f.successCriterion | fieldError }}</mat-error>
        </mat-form-field>
        <div class="row">
          <mat-form-field>
            <mat-label>Prazo</mat-label>
            <input matInput type="date" [formField]="f.targetDate" />
            <mat-error>{{ f.targetDate | fieldError }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Código BNCC (opcional)</mat-label>
            <input matInput [formField]="f.bnccCode" placeholder="EF01LP02" />
            <mat-error>{{ f.bnccCode | fieldError }}</mat-error>
          </mat-form-field>
        </div>
        <mat-form-field>
          <mat-label>Estratégias</mat-label>
          <textarea
            matInput
            rows="2"
            [formField]="f.strategies"
            placeholder="Ex.: modelagem, reforço positivo, apoio visual"
          ></textarea>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Responsável</mat-label>
          <input matInput [formField]="f.responsible" placeholder="Ex.: professora do AEE" />
        </mat-form-field>
        <h3>Medição</h3>
        <div class="row">
          <mat-form-field>
            <mat-label>Como medir</mat-label>
            <mat-select [formField]="f.measurementMethod">
              @for (o of methods; track o[0]) {
                <mat-option [value]="o[0]">{{ o[1] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Com que frequência</mat-label>
            <mat-select [formField]="f.measurementFrequency">
              @for (o of frequencies; track o[0]) {
                <mat-option [value]="o[0]">{{ o[1] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        @if (data.goal) {
          <mat-form-field>
            <mat-label>Situação</mat-label>
            <mat-select [formField]="f.status">
              @for (o of statuses; track o[0]) {
                <mat-option [value]="o[0]">{{ o[1] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="busy()">Salvar meta</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .smart-tip {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 12px;
      border-radius: 12px;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
  `,
})
export class GoalDialog {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly session = inject(SessionStore);
  private readonly ref = inject(MatDialogRef<GoalDialog, Goal>);
  protected readonly data = inject<GoalDialogData>(MAT_DIALOG_DATA);

  protected readonly areas = options('developmentArea');
  protected readonly methods = options('measurementMethod');
  protected readonly frequencies = options('measurementFrequency');
  protected readonly statuses = options('goalStatus');
  protected readonly busy = signal(false);

  protected readonly model = signal({
    area: this.data.goal?.area ?? 'comunicacao',
    description: this.data.goal?.description ?? '',
    successCriterion: this.data.goal?.successCriterion ?? '',
    targetDate: this.data.goal?.targetDate ?? this.data.defaultTargetDate ?? '',
    bnccCode: this.data.goal?.bnccCode ?? '',
    strategies: this.data.goal?.strategies ?? '',
    responsible: this.data.goal?.responsible ?? '',
    measurementMethod: this.data.goal?.measurementMethod ?? 'observacao',
    measurementFrequency: this.data.goal?.measurementFrequency ?? 'semanal',
    status: this.data.goal?.status ?? 'not_started',
  });
  protected readonly f = form(this.model, (p) => validateStandardSchema(p, GoalInput));

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.f, async () => {
      this.busy.set(true);
      try {
        const body = GoalInput.parse({
          ...this.model(),
          bnccCode: this.model().bnccCode.toUpperCase(),
        });
        const base = this.session.tenantPath(`/peis/${this.data.peiId}/goals`);
        const goal = this.data.goal
          ? await this.api.patch<Goal>(`${base}/${this.data.goal.id}`, body)
          : await this.api.post<Goal>(base, body);
        this.ref.close(goal);
      } catch (e) {
        this.notify.error(e);
      } finally {
        this.busy.set(false);
      }
      return undefined;
    });
  }
}
