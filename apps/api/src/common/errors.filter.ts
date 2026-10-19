import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { ApiErrorBody } from '@pei/shared';

interface PgError {
  code: string;
  message: string;
  hint?: string;
  constraint?: string;
}

function isPgError(e: unknown): e is PgError {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as PgError).code === 'string' &&
    /^[0-9A-Z]{5}$/.test((e as PgError).code)
  );
}

/**
 * Converte erros em respostas JSON consistentes. Erros do Postgres viram
 * códigos HTTP adequados (ex.: violação de RLS → 403) sem vazar detalhes internos.
 */
@Catch()
export class ErrorsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const body = this.toBody(exception);
    if (body.statusCode >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    void reply.status(body.statusCode).send(body);
  }

  private toBody(exception: unknown): ApiErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null && 'message' in res) {
        const r = res as Partial<ApiErrorBody> & { message: string | string[] };
        return {
          statusCode: status,
          error: r.error ?? HttpStatus[status] ?? 'Error',
          message: Array.isArray(r.message) ? r.message.join('; ') : r.message,
          ...(r.issues ? { issues: r.issues } : {}),
        };
      }
      return { statusCode: status, error: HttpStatus[status] ?? 'Error', message: String(res) };
    }

    if (isPgError(exception)) {
      switch (exception.code) {
        case '42501': // RLS ou permissão
          return {
            statusCode: 403,
            error: 'Forbidden',
            message: exception.hint ? exception.message : 'Você não tem permissão para esta ação',
          };
        case '23505':
          return { statusCode: 409, error: 'Conflict', message: conflictMessage(exception) };
        case '23503':
          return { statusCode: 400, error: 'Bad Request', message: 'Referência inválida' };
        case '23514':
        case '22P02':
        case '22007':
        case '22008':
          return { statusCode: 400, error: 'Bad Request', message: 'Dados inválidos' };
        case 'P0001':
          return { statusCode: 409, error: 'Conflict', message: exception.message };
        case 'P0002':
          return { statusCode: 404, error: 'Not Found', message: exception.message };
      }
    }

    return {
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Erro inesperado. Tente novamente em instantes.',
    };
  }
}

function conflictMessage(e: PgError): string {
  switch (e.constraint) {
    case 'peis_one_active_per_student':
      return 'Este aluno já tem um PEI em vigor';
    case 'peis_student_id_school_year_version_key':
      return 'Já existe um PEI com este ano e versão';
    case 'memberships_pkey':
    case 'student_staff_pkey':
      return 'Este vínculo já existe';
    default:
      return 'Registro duplicado';
  }
}
