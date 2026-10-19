import { ProgressLevel } from './enums.js';

/** Posição do nível na escala (0 = não observado … 3 = alcançado). */
export function progressScore(level: ProgressLevel): number {
  return ProgressLevel.options.indexOf(level);
}

/** Cores dos botões de registro rápido. Mantidas aqui para UI e documento usarem as mesmas. */
export const PROGRESS_COLORS: Record<ProgressLevel, string> = {
  not_observed: '#C62828',
  emerging: '#EF6C00',
  developing: '#F9A825',
  achieved: '#2E7D32',
};

export type Trend = 'up' | 'down' | 'stable' | 'insufficient';

/**
 * Tendência comparando a média dos registros mais recentes com a dos anteriores.
 * Espera os registros em ordem cronológica.
 */
export function progressTrend(levels: readonly ProgressLevel[], window = 3): Trend {
  if (levels.length < 2) return 'insufficient';
  const recent = levels.slice(-window);
  const previous = levels.slice(-window * 2, -window);
  if (previous.length === 0) {
    const first = progressScore(levels[0]!);
    const last = progressScore(levels[levels.length - 1]!);
    return last > first ? 'up' : last < first ? 'down' : 'stable';
  }
  const avg = (xs: readonly ProgressLevel[]) =>
    xs.reduce((sum, l) => sum + progressScore(l), 0) / xs.length;
  const diff = avg(recent) - avg(previous);
  if (diff > 0.25) return 'up';
  if (diff < -0.25) return 'down';
  return 'stable';
}
