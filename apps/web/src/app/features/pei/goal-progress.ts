import { httpResource } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import type { Goal, ProgressEntry, ProgressLevel, SupportType } from '@pei/shared';
import { ApiService } from '../../core/api.service';
import { NotifyService } from '../../core/notify.service';
import { SessionStore } from '../../core/session.store';
import { LabelPipe, options } from '../../shared/forms';
import { ProgressButtons, ProgressHistory } from '../../shared/progress';

/**
 * Registro e histórico de uma meta. Usado na aba "Acompanhamento" do PEI
 * e na tela de registro rápido.
 */
@Component({
  selector: 'app-goal-progress',
  imports: [
    DatePipe,
    LabelPipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    ProgressButtons,
    ProgressHistory,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="goal-progress stack">
      @if (canEdit()) {
        <app-progress-buttons [disabled]="saving()" (record)="record($event)" />
        <button
          mat-button
          type="button"
          class="details-toggle"
          (click)="showDetails.set(!showDetails())"
        >
          <mat-icon>{{ showDetails() ? 'expand_less' : 'tune' }}</mat-icon>
          {{ showDetails() ? 'Ocultar detalhes' : 'Apoio e observação (opcional)' }}
        </button>
        @if (showDetails()) {
          <div class="details stack">
            <mat-button-toggle-group
              [value]="support()"
              (change)="support.set($event.value)"
              aria-label="Tipo de apoio"
              hideSingleSelectionIndicator
            >
              @for (o of supports; track o[0]) {
                <mat-button-toggle [value]="o[0]">{{ o[1] }}</mat-button-toggle>
              }
            </mat-button-toggle-group>
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>Observação</mat-label>
              <input
                matInput
                maxlength="1000"
                [value]="note()"
                (input)="note.set($any($event.target).value)"
              />
            </mat-form-field>
          </div>
        }
      }

      <app-progress-history [entries]="chronological()" />

      @if (showLog() && entries.value()?.length) {
        <ul class="log">
          @for (e of entries.value()!.slice(0, 5); track e.id) {
            <li>
              <span class="badge">{{ e.level | label: 'progressLevel' }}</span>
              {{ e.observedAt | date: 'dd/MM HH:mm' }}
              @if (e.support) {
                · {{ e.support | label: 'supportType' }}
              }
              @if (e.note) {
                · “{{ e.note }}”
              }
              <span class="muted"> — {{ e.recordedBy.fullName || 'equipe' }}</span>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .details-toggle {
      align-self: flex-start;
    }
    .details {
      padding: 4px 0;
    }
    mat-button-toggle-group {
      flex-wrap: wrap;
    }
    .log {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font: var(--mat-sys-body-small);
    }
  `,
})
export class GoalProgress {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly session = inject(SessionStore);

  readonly peiId = input.required<string>();
  readonly goal = input.required<Goal>();
  readonly canEdit = input(false);
  readonly showLog = input(true);
  readonly recorded = output<ProgressEntry>();

  protected readonly supports = options('supportType');
  protected readonly saving = signal(false);
  protected readonly showDetails = signal(false);
  protected readonly support = signal<SupportType | null>(null);
  protected readonly note = signal('');

  protected readonly entries = httpResource<ProgressEntry[]>(() =>
    this.api.url(this.session.tenantPath(`/peis/${this.peiId()}/goals/${this.goal().id}/progress`)),
  );
  protected readonly chronological = computed(() => [...(this.entries.value() ?? [])].reverse());

  protected async record(level: ProgressLevel): Promise<void> {
    this.saving.set(true);
    try {
      const entry = await this.api.post<ProgressEntry>(
        this.session.tenantPath(`/peis/${this.peiId()}/goals/${this.goal().id}/progress`),
        { level, support: this.support() ?? undefined, note: this.note() || undefined },
      );
      this.entries.update((list) => [entry, ...(list ?? [])]);
      this.note.set('');
      this.support.set(null);
      this.recorded.emit(entry);
      this.notify.success('Registro salvo');
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.saving.set(false);
    }
  }
}
