import { ChangeDetectionStrategy, Component, linkedSignal } from '@angular/core';
import { FormField, form, readonly, submit, validateStandardSchema } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CaseStudy } from '@pei/shared';
import { z } from 'zod';
import { FieldErrorPipe } from '../../../shared/forms';
import { PeiTab } from '../pei-tab';

type Key = keyof CaseStudy;

const FIELDS: ReadonlyArray<{ key: Key; label: string; hint: string }> = [
  {
    key: 'reasonForReferral',
    label: 'Motivo do encaminhamento',
    hint: 'O que levou à elaboração do PEI',
  },
  {
    key: 'schoolHistory',
    label: 'Histórico escolar',
    hint: 'Trajetória, retenções, mudanças de escola',
  },
  {
    key: 'familyContext',
    label: 'Contexto familiar',
    hint: 'Rotina, rede de apoio, expectativas da família',
  },
  {
    key: 'healthInfo',
    label: 'Informações de saúde',
    hint: 'Laudos, medicações e terapias relevantes para a escola',
  },
  {
    key: 'strengths',
    label: 'Potencialidades',
    hint: 'O que o aluno faz bem — ponto de partida das metas',
  },
  {
    key: 'challenges',
    label: 'Desafios',
    hint: 'Barreiras observadas na aprendizagem e na participação',
  },
  { key: 'interests', label: 'Interesses', hint: 'Temas e atividades que engajam o aluno' },
  { key: 'communication', label: 'Comunicação', hint: 'Como se comunica e como entende melhor' },
  {
    key: 'previousInterventions',
    label: 'Intervenções anteriores',
    hint: 'O que já foi tentado e com que resultado',
  },
];

const OptionalDate = z.union([z.iso.date('Data inválida'), z.literal('')]);
const Schema = z
  .object({
    dates: z.object({ startDate: OptionalDate, reviewDate: OptionalDate }),
    caseStudy: CaseStudy,
  })
  .refine(
    (v) => !v.dates.startDate || !v.dates.reviewDate || v.dates.reviewDate >= v.dates.startDate,
    { message: 'A revisão deve ser depois do início', path: ['dates', 'reviewDate'] },
  );

/** Aba "Estudo de caso" (inclui a vigência do PEI). */
@Component({
  selector: 'app-case-study-tab',
  imports: [FormField, FieldErrorPipe, MatButtonModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="stack" (submit)="save($event)" novalidate>
      <h3>Vigência</h3>
      <div class="row">
        <mat-form-field>
          <mat-label>Início</mat-label>
          <input matInput type="date" [formField]="f.dates.startDate" />
          <mat-error>{{ f.dates.startDate | fieldError }}</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Revisão prevista</mat-label>
          <input matInput type="date" [formField]="f.dates.reviewDate" />
          <mat-error>{{ f.dates.reviewDate | fieldError }}</mat-error>
        </mat-form-field>
      </div>
      <h3>Estudo de caso</h3>
      @for (field of fields; track field.key) {
        <mat-form-field>
          <mat-label>{{ field.label }}</mat-label>
          <textarea matInput rows="3" [formField]="f.caseStudy[field.key]"></textarea>
          <mat-hint>{{ field.hint }}</mat-hint>
          <mat-error>{{ f.caseStudy[field.key] | fieldError }}</mat-error>
        </mat-form-field>
      }
      @if (pei().canEdit) {
        <div class="tab-actions">
          @if (f().dirty()) {
            <span class="muted">Alterações não salvas</span>
          }
          <button mat-flat-button type="submit" [disabled]="saving() || !f().dirty()">
            Salvar
          </button>
        </div>
      }
    </form>
  `,
})
export class CaseStudyTab extends PeiTab {
  protected readonly fields = FIELDS;
  protected readonly model = linkedSignal(() => ({
    dates: { startDate: this.pei().startDate ?? '', reviewDate: this.pei().reviewDate ?? '' },
    caseStudy: { ...this.pei().caseStudy },
  }));
  protected readonly f = form(this.model, (p) => {
    validateStandardSchema(p, Schema);
    readonly(p, { when: () => !this.pei().canEdit });
  });

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.f, async () => {
      const { dates, caseStudy } = this.model();
      const ok = await this.patch({
        startDate: dates.startDate || null,
        reviewDate: dates.reviewDate || null,
        caseStudy,
      });
      if (ok) this.f().reset();
      return undefined;
    });
  }
}
