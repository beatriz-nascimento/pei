import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { createAppConfig } from './app/app.config';
import { loadConfig } from './app/core/config';

loadConfig()
  .then(async (config) => {
    // Import dinâmico: o código do mock só é baixado quando a flag está ligada.
    const mock = config.mock ? (await import('./app/mock')).createMockBackend() : undefined;
    return bootstrapApplication(App, createAppConfig(config, mock));
  })
  .catch((err) => {
    console.error(err);
    document.body.innerHTML =
      '<p style="font-family:sans-serif;padding:2rem">Não foi possível iniciar o aplicativo. Tente recarregar a página.</p>';
  });
