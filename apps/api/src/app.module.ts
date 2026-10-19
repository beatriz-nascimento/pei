import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuthGuard } from './auth/auth.guard.js';
import { TokenVerifier } from './auth/token-verifier.js';
import { ErrorsFilter } from './common/errors.filter.js';
import { ENV, type Env } from './config/env.js';
import { DbModule } from './db/db.module.js';
import { ExportService } from './modules/exports/export.service.js';
import { FamilyLinksController, FamilyPortalController } from './modules/family/family.controller.js';
import { HealthController } from './modules/health/health.controller.js';
import { MeController } from './modules/me/me.controller.js';
import { InvitationsController, MembersController } from './modules/members/members.controller.js';
import { PeisController } from './modules/peis/peis.controller.js';
import { PeisService } from './modules/peis/peis.service.js';
import { StudentsController } from './modules/students/students.controller.js';
import { StudentsService } from './modules/students/students.service.js';
import { TenantsController } from './modules/tenants/tenants.controller.js';
import { TenantGuard } from './tenancy/tenant.guard.js';

/** Níveis do pino → "severity" do Cloud Logging, para os logs aparecerem com a cor certa. */
const GCP_SEVERITY: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    const pretty = env.NODE_ENV === 'development';
    return {
      module: AppModule,
      imports: [
        // nestjs-pino: logs estruturados em JSON (pino), com id de requisição.
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
            messageKey: 'message',
            formatters: { level: (label) => ({ severity: GCP_SEVERITY[label] ?? 'DEFAULT' }) },
            // Nunca registrar tokens: o link da família e os convites carregam credenciais na URL.
            redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], remove: true },
            serializers: {
              req: (req: { method: string; url: string; id: string }) => ({
                id: req.id,
                method: req.method,
                url: req.url.replace(/\/(public\/family|convite)\/[^/?]+/, '/$1/[token]'),
              }),
            },
            autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
            ...(pretty && { transport: { target: 'pino-pretty', options: { singleLine: true } } }),
          },
        }),
        DbModule,
      ],
      controllers: [
        HealthController,
        MeController,
        TenantsController,
        MembersController,
        InvitationsController,
        StudentsController,
        PeisController,
        FamilyLinksController,
        FamilyPortalController,
      ],
      providers: [
        { provide: ENV, useValue: env },
        TokenVerifier,
        TenantGuard,
        StudentsService,
        PeisService,
        ExportService,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: ErrorsFilter },
      ],
      exports: [ENV],
      global: true,
    };
  }
}
