import { describe, expect, it } from 'vitest';
import { CreateStudentInput, GoalInput, progressTrend, ProgressEntryInput } from './index.js';

describe('GoalInput', () => {
  const base = {
    area: 'comunicacao',
    description: 'Pedir ajuda usando cartão de comunicação',
    successCriterion: 'Em 4 de 5 oportunidades',
    targetDate: '2026-12-15',
  } as const;

  it('aplica padrões de medição', () => {
    const goal = GoalInput.parse(base);
    expect(goal.measurementMethod).toBe('observacao');
    expect(goal.measurementFrequency).toBe('semanal');
    expect(goal.status).toBe('not_started');
  });

  it.each(['EF01LP02', 'EI03EO01', 'EM13LGG101', ''])('aceita código BNCC %s', (bnccCode) => {
    expect(GoalInput.safeParse({ ...base, bnccCode }).success).toBe(true);
  });

  it('rejeita código BNCC inválido', () => {
    expect(GoalInput.safeParse({ ...base, bnccCode: 'LP02' }).success).toBe(false);
  });

  it('exige critério de sucesso (mensurável)', () => {
    expect(GoalInput.safeParse({ ...base, successCriterion: '  ' }).success).toBe(false);
  });
});

describe('CreateStudentInput', () => {
  it('normaliza listas vazias', () => {
    const s = CreateStudentInput.parse({ fullName: 'Ana Souza' });
    expect(s.conditions).toEqual([]);
    expect(s.guardians).toEqual([]);
  });
});

describe('ProgressEntryInput', () => {
  it('aceita data com fuso', () => {
    expect(
      ProgressEntryInput.safeParse({ level: 'emerging', observedAt: '2026-10-19T10:00:00-03:00' })
        .success,
    ).toBe(true);
  });
});

describe('progressTrend', () => {
  it('indica dados insuficientes com menos de 2 registros', () => {
    expect(progressTrend(['emerging'])).toBe('insufficient');
  });
  it('detecta melhora', () => {
    expect(
      progressTrend(['not_observed', 'emerging', 'emerging', 'developing', 'achieved', 'achieved']),
    ).toBe('up');
  });
  it('detecta estabilidade', () => {
    expect(progressTrend(['developing', 'developing', 'developing', 'developing'])).toBe('stable');
  });
  it('detecta piora em série curta', () => {
    expect(progressTrend(['achieved', 'emerging'])).toBe('down');
  });
});
