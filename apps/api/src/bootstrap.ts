import 'reflect-metadata';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

/** Cria e configura a aplicação. Usado pelo main.ts e pelos testes e2e. */
export async function createApp(env: Env): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(env),
    new FastifyAdapter({
      // Cloud Run fica atrás de um balanceador: o IP real vem em X-Forwarded-For.
      trustProxy: true,
      bodyLimit: 1_048_576,
    }),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready'] });
  app.enableShutdownHooks();

  // @fastify/helmet: cabeçalhos HTTP de segurança. A API só responde JSON e arquivos.
  await app.register(helmet, { contentSecurityPolicy: false });
  // @fastify/cors: só o frontend configurado pode chamar a API pelo navegador.
  await app.register(cors, {
    origin: env.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 600,
  });
  // @fastify/rate-limit: limite por IP; o portal da família (sem login) tem limite menor.
  if (env.NODE_ENV !== 'test') {
    await app.register(rateLimit, {
      timeWindow: '1 minute',
      max: (req) => (req.url.startsWith('/v1/public/') ? 30 : 300),
      allowList: (req) => req.url.startsWith('/health'),
    });
  }

  return app;
}
