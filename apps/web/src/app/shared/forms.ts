import { Pipe, type PipeTransform } from '@angular/core';
import type { FieldTree } from '@angular/forms/signals';
import { LABELS } from '@pei/shared';

/**
 * Primeira mensagem de erro de um campo de Signal Forms.
 * As mensagens vêm dos esquemas zod de @pei/shared (validateStandardSchema),
 * os mesmos que a API usa — o formulário e o servidor validam igual.
 */
// Impuro de propósito: o FieldTree é sempre o mesmo objeto; o que muda são os signals
// de estado (touched/errors). O custo é mínimo — só lê signals já calculados.
@Pipe({ name: 'fieldError', pure: false })
export class FieldErrorPipe implements PipeTransform {
  transform(field: FieldTree<unknown>): string {
    const state = field();
    if (!state.touched() || !state.invalid()) return '';
    const err = state.errors()[0];
    return friendly(err?.message ?? err?.kind ?? '');
  }
}

function friendly(message: string): string {
  if (/expected string, received undefined|Campo obrigatório|Too small/i.test(message)) {
    return 'Campo obrigatório';
  }
  if (/Invalid ISO date|Invalid date/i.test(message)) return 'Data inválida';
  if (/Invalid email/i.test(message)) return 'E-mail inválido';
  if (/Too big/i.test(message)) return 'Texto muito longo';
  return message;
}

type LabelGroup = keyof typeof LABELS;

/** Rótulo em português de um valor de enumeração: {{ goal.area | label: 'developmentArea' }} */
@Pipe({ name: 'label' })
export class LabelPipe implements PipeTransform {
  transform(value: string | null | undefined, group: LabelGroup): string {
    if (!value) return '—';
    return (LABELS[group] as Record<string, string>)[value] ?? value;
  }
}

/** Lista de opções [valor, rótulo] para <mat-select>. */
export function options<G extends LabelGroup>(
  group: G,
): Array<[keyof (typeof LABELS)[G] & string, string]> {
  return Object.entries(LABELS[group]) as Array<[keyof (typeof LABELS)[G] & string, string]>;
}
