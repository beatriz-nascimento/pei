import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LABELS, PROGRESS_COLORS, ProgressLevel, progressScore, progressTrend } from '@pei/shared';

/** Botões coloridos do registro rápido: um toque por observação (meta < 30 s). */
@Component({
  selector: 'app-progress-buttons',
  imports: [MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="levels" role="group" aria-label="Registrar nível observado">
      @for (l of levels; track l) {
        <button
          type="button"
          class="level"
          [style.--level-color]="colors[l]"
          [disabled]="disabled()"
          (click)="record.emit(l)"
        >
          <span class="dot" aria-hidden="true"></span>{{ labels[l] }}
        </button>
      }
    </div>
  `,
  styles: `
    .levels {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }
    @media (max-width: 520px) {
      .levels {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    .level {
      min-height: 48px;
      border-radius: 12px;
      border: 2px solid var(--level-color);
      background: color-mix(in srgb, var(--level-color) 12%, transparent);
      color: var(--mat-sys-on-surface);
      font: var(--mat-sys-label-large);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 6px 8px;
    }
    .level:hover:not(:disabled) {
      background: color-mix(in srgb, var(--level-color) 24%, transparent);
    }
    .level:focus-visible {
      outline: 3px solid var(--mat-sys-primary);
      outline-offset: 2px;
    }
    .level:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--level-color);
      flex: none;
    }
  `,
})
export class ProgressButtons {
  readonly disabled = input(false);
  readonly record = output<ProgressLevel>();
  protected readonly levels = ProgressLevel.options;
  protected readonly colors = PROGRESS_COLORS;
  protected readonly labels = LABELS.progressLevel;
}

/** Histórico em barras (altura e cor = nível) com resumo em texto para leitores de tela. */
@Component({
  selector: 'app-progress-history',
  imports: [DatePipe, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (entries().length) {
      <div class="history">
        <div class="bars" aria-hidden="true">
          @for (e of recent(); track $index) {
            <span
              class="bar"
              [style.height.%]="(score(e.level) + 1) * 25"
              [style.background]="colors[e.level]"
              [matTooltip]="labels[e.level] + ' · ' + (e.observedAt | date: 'dd/MM')"
            ></span>
          }
        </div>
        <p class="summary">
          {{ entries().length }} {{ entries().length === 1 ? 'registro' : 'registros' }} · último:
          <strong>{{ labels[last()!.level] }}</strong> em
          {{ last()!.observedAt | date: 'dd/MM/yyyy' }} · {{ trendText() }}
        </p>
      </div>
    } @else {
      <p class="summary muted">Nenhum registro ainda.</p>
    }
  `,
  styles: `
    .history {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .bars {
      display: flex;
      align-items: flex-end;
      gap: 3px;
      height: 40px;
    }
    .bar {
      flex: 0 0 10px;
      border-radius: 3px 3px 0 0;
      min-height: 4px;
    }
    .summary {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class ProgressHistory {
  /** Registros em ordem cronológica. */
  readonly entries = input.required<ReadonlyArray<{ level: ProgressLevel; observedAt: string }>>();
  protected readonly colors = PROGRESS_COLORS;
  protected readonly labels = LABELS.progressLevel;
  protected readonly score = progressScore;
  protected readonly recent = computed(() => this.entries().slice(-30));
  protected readonly last = computed(() => this.entries().at(-1));
  protected readonly trendText = computed(() => {
    switch (progressTrend(this.entries().map((e) => e.level))) {
      case 'up':
        return 'evoluindo ↑';
      case 'down':
        return 'em queda ↓ — vale rever a estratégia';
      case 'stable':
        return 'estável';
      default:
        return 'poucos registros para indicar tendência';
    }
  });
}
