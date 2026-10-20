import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import type { Goal, Pei } from '@pei/shared';
import { confirm } from '../../../shared/confirm.dialog';
import { LabelPipe } from '../../../shared/forms';
import { GoalDialog, type GoalDialogData } from '../goal.dialog';
import { PeiTab } from '../pei-tab';

/** Aba "Metas": metas SMART com critério, prazo, BNCC e forma de medição. */
@Component({
  selector: 'app-goals-tab',
  imports: [DatePipe, LabelPipe, MatButtonModule, MatIconModule, MatMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack">
      @for (g of pei().goals; track g.id; let i = $index; let last = $last) {
        <article class="item-card goal">
          <div class="goal-number" aria-hidden="true">{{ i + 1 }}</div>
          <div class="grow stack-sm">
            <div class="goal-tags">
              <span class="badge">{{ g.area | label: 'developmentArea' }}</span>
              <span class="badge" [class.badge-active]="g.status === 'achieved'">{{
                g.status | label: 'goalStatus'
              }}</span>
              @if (g.bnccCode) {
                <span class="badge">BNCC {{ g.bnccCode }}</span>
              }
            </div>
            <h3>{{ g.description }}</h3>
            <p class="muted">
              <strong>Critério:</strong> {{ g.successCriterion }} · <strong>Prazo:</strong>
              {{ g.targetDate | date: 'dd/MM/yyyy' }}
            </p>
            <p class="muted">
              <strong>Medição:</strong> {{ g.measurementMethod | label: 'measurementMethod' }},
              {{ (g.measurementFrequency | label: 'measurementFrequency').toLowerCase() }}
              @if (g.responsible) {
                · <strong>Responsável:</strong> {{ g.responsible }}
              }
            </p>
            @if (g.strategies) {
              <p class="muted"><strong>Estratégias:</strong> {{ g.strategies }}</p>
            }
          </div>
          @if (pei().canEdit) {
            <button
              mat-icon-button
              [matMenuTriggerFor]="menu"
              [attr.aria-label]="'Ações da meta ' + (i + 1)"
            >
              <mat-icon>more_vert</mat-icon>
            </button>
            <mat-menu #menu="matMenu">
              <button mat-menu-item (click)="edit(g)">
                <mat-icon>edit</mat-icon><span>Editar</span>
              </button>
              <button mat-menu-item [disabled]="i === 0" (click)="move(i, -1)">
                <mat-icon>arrow_upward</mat-icon><span>Subir</span>
              </button>
              <button mat-menu-item [disabled]="last" (click)="move(i, 1)">
                <mat-icon>arrow_downward</mat-icon><span>Descer</span>
              </button>
              <button mat-menu-item (click)="remove(g)">
                <mat-icon>delete</mat-icon><span>Excluir</span>
              </button>
            </mat-menu>
          }
        </article>
      } @empty {
        <div class="empty-state">
          <mat-icon>flag</mat-icon>
          <p>Nenhuma meta ainda. Use a linha de base como ponto de partida.</p>
        </div>
      }
      @if (pei().canEdit) {
        <div class="tab-actions">
          <button mat-flat-button (click)="add()"><mat-icon>add</mat-icon> Nova meta</button>
        </div>
      }
    </div>
  `,
  styles: `
    .goal {
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }
    .goal h3 {
      font: var(--mat-sys-title-medium);
    }
    .goal p {
      margin: 0;
    }
    .goal-number {
      flex: none;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
      font-weight: 600;
    }
    .goal-tags {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .stack-sm {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
  `,
})
export class GoalsTab extends PeiTab {
  private readonly dialog = inject(MatDialog);

  protected add(): void {
    this.open({ peiId: this.pei().id, defaultTargetDate: this.pei().reviewDate });
  }

  protected edit(goal: Goal): void {
    this.open({ peiId: this.pei().id, goal });
  }

  private open(data: GoalDialogData): void {
    this.dialog
      .open(GoalDialog, { data, width: '680px', maxWidth: '96vw' })
      .afterClosed()
      .subscribe((goal?: Goal) => {
        if (!goal) return;
        const goals = data.goal
          ? this.pei().goals.map((g) => (g.id === goal.id ? goal : g))
          : [...this.pei().goals, goal];
        this.saved.emit({ ...this.pei(), goals, goalCount: goals.length });
      });
  }

  protected async move(index: number, delta: number): Promise<void> {
    const ids = this.pei().goals.map((g) => g.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved!);
    await this.notify.run(async () => {
      const updated = await this.api.put<Pei>(
        this.session.tenantPath(`/peis/${this.pei().id}/goals/order`),
        { goalIds: ids },
      );
      this.saved.emit(updated);
    });
  }

  protected async remove(goal: Goal): Promise<void> {
    const yes = await confirm(this.dialog, {
      title: 'Excluir meta?',
      message: `"${goal.description}" e todos os registros de progresso dela serão apagados.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!yes) return;
    await this.notify.run(async () => {
      await this.api.delete(this.session.tenantPath(`/peis/${this.pei().id}/goals/${goal.id}`));
      const goals = this.pei().goals.filter((g) => g.id !== goal.id);
      this.saved.emit({ ...this.pei(), goals, goalCount: goals.length });
    }, 'Meta excluída');
  }
}
