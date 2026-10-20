import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import type { ActiveGoal } from '@pei/shared';
import { ApiService } from '../../core/api.service';
import { SessionStore } from '../../core/session.store';
import { LabelPipe } from '../../shared/forms';
import { GoalProgress } from '../pei/goal-progress';

/**
 * Registro rápido no celular: as metas em andamento dos PEIs em vigor,
 * agrupadas por aluno, com os botões coloridos à mão.
 */
@Component({
  selector: 'app-quick-progress-page',
  imports: [
    GoalProgress,
    LabelPipe,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page narrow">
      <header class="page-header">
        <h1>Registro rápido</h1>
      </header>
      <p class="muted">
        Toque no nível observado. Leva poucos segundos e alimenta os gráficos da equipe e da
        família.
      </p>

      @if (goals.isLoading() && !goals.hasValue()) {
        <mat-progress-bar mode="indeterminate" aria-label="Carregando metas" />
      }

      @if (groups().length > 1) {
        <mat-chip-listbox
          aria-label="Filtrar por aluno"
          class="filter"
          [value]="studentFilter()"
          (change)="studentFilter.set($event.value ?? null)"
        >
          @for (g of groups(); track g.studentId) {
            <mat-chip-option [value]="g.studentId">{{ g.studentName }}</mat-chip-option>
          }
        </mat-chip-listbox>
      }

      @for (g of visibleGroups(); track g.studentId) {
        <section class="student" [attr.aria-label]="g.studentName">
          <h2>
            <a [routerLink]="['/t', session.tenantId(), 'peis', g.peiId]">{{ g.studentName }}</a>
          </h2>
          @for (item of g.items; track item.goal.id) {
            <article class="goal-card stack">
              <span class="badge">{{ item.goal.area | label: 'developmentArea' }}</span>
              <h3>{{ item.goal.description }}</h3>
              <p class="muted">{{ item.goal.successCriterion }}</p>
              <app-goal-progress
                [peiId]="item.peiId"
                [goal]="item.goal"
                [canEdit]="item.canEdit"
                [showLog]="false"
              />
            </article>
          }
        </section>
      } @empty {
        @if (!goals.isLoading()) {
          <div class="empty-state">
            <mat-icon>flag</mat-icon>
            <p>Nenhuma meta em andamento nos PEIs em vigor dos seus alunos.</p>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .narrow {
      max-width: 760px;
    }
    .filter {
      display: block;
      margin: 8px 0 16px;
    }
    .student {
      margin-top: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .student h2 a {
      color: inherit;
      text-decoration: none;
    }
    .goal-card {
      padding: 16px;
      border-radius: var(--mat-sys-corner-large);
      background: var(--mat-sys-surface-container-low);
    }
    .goal-card h3 {
      font: var(--mat-sys-title-medium);
    }
    .goal-card p {
      margin: 0;
    }
    .goal-card .badge {
      align-self: flex-start;
    }
  `,
})
export class QuickProgressPage {
  private readonly api = inject(ApiService);
  protected readonly session = inject(SessionStore);

  protected readonly goals = httpResource<ActiveGoal[]>(() =>
    this.api.url(this.session.tenantPath('/active-goals')),
  );
  protected readonly studentFilter = signal<string | null>(null);

  protected readonly groups = computed(() => {
    const map = new Map<
      string,
      { studentId: string; studentName: string; peiId: string; items: ActiveGoal[] }
    >();
    for (const item of this.goals.value() ?? []) {
      const group = map.get(item.studentId) ?? {
        studentId: item.studentId,
        studentName: item.studentName,
        peiId: item.peiId,
        items: [],
      };
      group.items.push(item);
      map.set(item.studentId, group);
    }
    return [...map.values()];
  });

  protected readonly visibleGroups = computed(() => {
    const filter = this.studentFilter();
    return filter ? this.groups().filter((g) => g.studentId === filter) : this.groups();
  });
}
