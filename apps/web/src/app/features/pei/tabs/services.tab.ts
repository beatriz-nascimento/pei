import { ChangeDetectionStrategy, Component, linkedSignal } from '@angular/core';
import { FormField, form, readonly, submit, validateStandardSchema } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Service } from '@pei/shared';
import { z } from 'zod';
import { FieldErrorPipe, options } from '../../../shared/forms';
import { PeiTab } from '../pei-tab';

const Schema = z.object({ items: z.array(Service).max(20) });

/** Aba "Serviços": AEE, profissional de apoio e terapias (com frequência e local). */
@Component({
  selector: 'app-services-tab',
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
        <div class="item-card stack">
          <div class="item-header">
            <mat-form-field subscriptSizing="dynamic" class="area">
              <mat-label>Serviço</mat-label>
              <mat-select [formField]="item.type">
                @for (o of types; track o[0]) {
                  <mat-option [value]="o[0]">{{ o[1] }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            @if (pei().canEdit) {
              <button
                mat-icon-button
                type="button"
                (click)="remove(i)"
                aria-label="Remover serviço"
              >
                <mat-icon>delete</mat-icon>
              </button>
            }
          </div>
          <div class="row">
            <mat-form-field>
              <mat-label>Profissional ou instituição</mat-label>
              <input matInput [formField]="item.provider" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>Frequência</mat-label>
              <input matInput [formField]="item.frequency" placeholder="Ex.: 2x por semana" />
            </mat-form-field>
          </div>
          <div class="row">
            <mat-form-field>
              <mat-label>Duração (minutos)</mat-label>
              <input matInput type="number" [formField]="item.durationMinutes" />
              <mat-error>{{ item.durationMinutes | fieldError }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Local</mat-label>
              <input matInput [formField]="item.location" />
            </mat-form-field>
          </div>
        </div>
      } @empty {
        <p class="muted">Nenhum serviço registrado.</p>
      }
      @if (pei().canEdit) {
        <div class="tab-actions">
          <button mat-stroked-button type="button" (click)="add()">
            <mat-icon>add</mat-icon> Adicionar serviço
          </button>
          <span class="grow"></span>
          @if (f().dirty()) {
            <span class="muted">Alterações não salvas</span>
          }
          <button mat-flat-button type="submit" [disabled]="saving() || !f().dirty()">
            Salvar serviços
          </button>
        </div>
      }
    </form>
  `,
})
export class ServicesTab extends PeiTab {
  protected readonly types = options('serviceType');
  protected readonly model = linkedSignal(() => ({
    items: this.pei().services.map((s) => ({ ...s, durationMinutes: s.durationMinutes ?? null })),
  }));
  protected readonly f = form(this.model, (p) => {
    validateStandardSchema(p, Schema);
    readonly(p, { when: () => !this.pei().canEdit });
  });

  protected add(): void {
    this.model.update((m) => ({
      items: [
        ...m.items,
        {
          type: 'aee_sala_recursos' as const,
          provider: '',
          frequency: '',
          durationMinutes: null,
          location: '',
        },
      ],
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
      if (await this.patch({ services: this.model().items })) this.f().reset();
      return undefined;
    });
  }
}
