import { ChangeDetectionStrategy, Component, linkedSignal } from '@angular/core';
import { FormField, form, readonly, submit, validateStandardSchema } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Adaptation } from '@pei/shared';
import { z } from 'zod';
import { FieldErrorPipe, options } from '../../../shared/forms';
import { PeiTab } from '../pei-tab';

const Schema = z.object({ items: z.array(Adaptation).max(50) });

/** Aba "Adaptações": curriculares, de avaliação, materiais, ambiente, comunicação e tempo. */
@Component({
  selector: 'app-adaptations-tab',
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
      @for (item of f.items; track $index; let i = $index) {
        <div class="item-card item-inline">
          <mat-form-field subscriptSizing="dynamic" class="area">
            <mat-label>Tipo</mat-label>
            <mat-select [formField]="item.category">
              @for (o of categories; track o[0]) {
                <mat-option [value]="o[0]">{{ o[1] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="grow">
            <mat-label>Descrição</mat-label>
            <textarea matInput rows="2" [formField]="item.description"></textarea>
            <mat-error>{{ item.description | fieldError }}</mat-error>
          </mat-form-field>
          @if (pei().canEdit) {
            <button
              mat-icon-button
              type="button"
              (click)="remove(i)"
              aria-label="Remover adaptação"
            >
              <mat-icon>delete</mat-icon>
            </button>
          }
        </div>
      } @empty {
        <p class="muted">
          Nenhuma adaptação registrada. Ex.: prova com enunciados curtos, rotina visual, tempo
          estendido.
        </p>
      }
      @if (pei().canEdit) {
        <div class="tab-actions">
          <button mat-stroked-button type="button" (click)="add()">
            <mat-icon>add</mat-icon> Adicionar adaptação
          </button>
          <span class="grow"></span>
          @if (f().dirty()) {
            <span class="muted">Alterações não salvas</span>
          }
          <button mat-flat-button type="submit" [disabled]="saving() || !f().dirty()">
            Salvar adaptações
          </button>
        </div>
      }
    </form>
  `,
})
export class AdaptationsTab extends PeiTab {
  protected readonly categories = options('adaptationCategory');
  protected readonly model = linkedSignal(() => ({
    items: this.pei().adaptations.map((a) => ({ ...a })),
  }));
  protected readonly f = form(this.model, (p) => {
    validateStandardSchema(p, Schema);
    readonly(p, { when: () => !this.pei().canEdit });
  });

  protected add(): void {
    this.model.update((m) => ({
      items: [...m.items, { category: 'curricular', description: '' }],
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
      if (await this.patch({ adaptations: this.model().items })) this.f().reset();
      return undefined;
    });
  }
}
