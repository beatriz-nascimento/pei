import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { LabelPipe } from '../../../shared/forms';
import { GoalProgress } from '../goal-progress';
import { PeiTab } from '../pei-tab';

/** Aba "Acompanhamento": registro de progresso por meta e histórico. */
@Component({
  selector: 'app-progress-tab',
  imports: [DatePipe, GoalProgress, LabelPipe, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack">
      @if (pei().status === 'draft' && pei().canEdit) {
        <p class="hint">
          <mat-icon inline>info</mat-icon>
          O PEI ainda é rascunho. Você já pode registrar, mas o acompanhamento costuma começar
          quando ele é colocado em vigor.
        </p>
      }
      @for (g of pei().goals; track g.id; let i = $index) {
        <article class="item-card stack">
          <header>
            <span class="badge">{{ g.area | label: 'developmentArea' }}</span>
            <h3>{{ i + 1 }}. {{ g.description }}</h3>
            <p class="muted">
              Critério: {{ g.successCriterion }} · até {{ g.targetDate | date: 'dd/MM/yyyy' }}
            </p>
          </header>
          <app-goal-progress
            [peiId]="pei().id"
            [goal]="g"
            [canEdit]="writable()"
            (recorded)="onRecorded(g.id)"
          />
        </article>
      } @empty {
        <p class="muted">Cadastre metas na aba "Metas" para começar o acompanhamento.</p>
      }
    </div>
  `,
  styles: `
    header h3 {
      font: var(--mat-sys-title-medium);
      margin: 6px 0 2px;
    }
    header p {
      margin: 0;
    }
    .hint {
      display: flex;
      gap: 8px;
      align-items: center;
      margin: 0;
      padding: 10px 12px;
      border-radius: 12px;
      background: var(--mat-sys-surface-container-high);
    }
  `,
})
export class ProgressTab extends PeiTab {
  protected readonly writable = computed(
    () => this.pei().canEdit && this.pei().status !== 'archived',
  );

  /** A primeira medição muda a meta para "em andamento": atualiza o PEI no editor. */
  protected onRecorded(goalId: string): void {
    const goals = this.pei().goals.map((g) =>
      g.id === goalId && g.status === 'not_started'
        ? { ...g, status: 'in_progress' as const, progressCount: g.progressCount + 1 }
        : g.id === goalId
          ? { ...g, progressCount: g.progressCount + 1 }
          : g,
    );
    this.saved.emit({ ...this.pei(), goals });
  }
}
