import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';

/**
 * Valida e normaliza o corpo/parâmetros da requisição com um esquema zod
 * de @pei/shared — o mesmo usado pelos formulários do frontend.
 */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Dados inválidos',
        issues: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    return result.data;
  }
}

/** Valida parâmetros de rota UUID. */
export const UuidPipe = new ZodPipe(z.uuid({ error: 'Identificador inválido' }));
