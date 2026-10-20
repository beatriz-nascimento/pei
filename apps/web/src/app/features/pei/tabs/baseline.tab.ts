import { ChangeDetectionStrategy, Component, linkedSignal } from '@angular/core';
import { FormField, form, readonly, submit, validateStandardSchema } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { BaselineEntry, type DevelopmentArea } from '@pei/shared';
import { z } from 'zod';
import { FieldErrorPipe, options } from '../../../shared/forms';
import { PeiTab } from '../pei-tab';

const Schema = z.object({ items: z.array(BaselineEntry).max(20) });

/** Aba "Linha de base": desempenho atual por área, ponto de partida das metas. */
@Component({
  selector: 'app-baseline-tab',
  imports: [
    FormField,
    FieldErrorPipe,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="stack" (submit)="save($event)" novalidate>
      <p class="muted">
        Descreva o que o aluno já faz hoje em cada área, com evidências (observações, atividades,
        relatórios). As metas partem daqui.
      </p>
      @for (item of f.items; track $index; let i = $index) {
        <div class="item-card stack">
          <div class="item-header">
            <mat-form-field class="area">
              <mat-label>Área</mat-label>
              <mat-select [formField]="item.area">
                @for (o of areas; track o[0]) {
                  <mat-option [value]="o[0]">{{ o[1] }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            @if (pei().canEdit) {
              <button mat-icon-button type="button" (click)="remove(i)" aria-label="Remover área">
                <mat-icon>delete</mat-icon>
              </button>
            }
          </div>
          <mat-form-field>
            <mat-label>Desempenho atual</mat-label>
            <textarea matInput rows="3" [formField]="item.currentPerformance"></textarea>
            <mat-error>{{ item.currentPerformance | fieldError }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Evidências</mat-label>
            <input
              matInput
              [formField]="item.evidence"
              placeholder="Ex.: observação em sala, 10/03"
            />
          </mat-form-field>
        </div>
      } @empty {
        <p class="muted">Nenhuma área registrada.</p>
      }
      @if (pei().canEdit) {
        <div class="tab-actions">
          <button mat-stroked-button type="button" (click)="add()">
            <mat-icon>add</mat-icon> Adicionar área
          </button>
          <span class="grow"></span>
          @if (f().dirty()) {
            <span class="muted">Alterações não salvas</span>
          }
          <button mat-flat-button type="submit" [disabled]="saving() || !f().dirty()">
            Salvar linha de base
          </button>
        </div>
      }
    </form>
  `,
})
export class BaselineTab extends PeiTab {
  protected readonly areas = options('developmentArea');
  protected readonly model = linkedSignal(() => ({
    items: this.pei().baseline.map((b) => ({ ...b })),
  }));
  protected readonly f = form(this.model, (p) => {
    validateStandardSchema(p, Schema);
    readonly(p, { when: () => !this.pei().canEdit });
  });

  protected add(): void {
    const used = new Set(this.model().items.map((i) => i.area));
    const area = (this.areas.find(([a]) => !used.has(a))?.[0] ?? 'academica') as DevelopmentArea;
    this.model.update((m) => ({
      items: [...m.items, { area, currentPerformance: '', evidence: '' }],
    }));
    this.f().markAsDirty();
  }

  protected remove(index: number): void {
    this.model.update((m) => ({ items: m.items.filter((_, i) => i !== index) }));
    this.f().markAsDirty();
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.f, async () => {
      if (await this.patch({ baseline: this.model().items })) this.f().reset();
      return undefined;
    });
  }
}
