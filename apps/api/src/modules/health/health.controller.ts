import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../../auth/auth.guard.js';
import { DbService } from '../../db/db.service.js';

/** Sondas do Cloud Run: /health (processo vivo) e /health/ready (banco acessível). */
@Controller('health')
@Public()
export class HealthController {
  private readonly logger = new Logger('Health');

  constructor(private readonly db: DbService) {}

  @Get()
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ok' }> {
    try {
      await this.db.ping();
      return { status: 'ok' };
    } catch (e) {
      // O motivo fica só no log (ex.: certificado, senha, host), não na resposta pública.
      this.logger.error(`Banco indisponível: ${e instanceof Error ? e.message : String(e)}`);
      throw new ServiceUnavailableException('Banco de dados indisponível');
    }
  }
}
