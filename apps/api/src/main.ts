import { createApp } from './bootstrap.js';
import { loadEnv } from './config/env.js';

const env = loadEnv();
const app = await createApp(env);
// 0.0.0.0: necessário dentro de container (Cloud Run).
await app.listen({ port: env.PORT, host: '0.0.0.0' });
