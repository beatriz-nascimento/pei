import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

/** Destino do link mágico / confirmação de e-mail do Supabase. */
@Component({
  selector: 'app-callback-page',
  imports: [MatProgressSpinnerModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="auth-layout">
      <section class="auth-card" aria-live="polite">
        @if (failed()) {
          <h1>Link inválido ou expirado</h1>
          <p class="muted">Peça um novo link na tela de entrada.</p>
          <a routerLink="/entrar">Voltar para entrar</a>
        } @else {
          <mat-spinner diameter="40" aria-label="Entrando" />
          <p>Entrando…</p>
        }
      </section>
    </main>
  `,
  styleUrl: './auth.scss',
})
export class CallbackPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly returnUrl = input<string>();
  protected readonly failed = signal(false);

  async ngOnInit(): Promise<void> {
    // O supabase-js lê o token da URL sozinho (detectSessionInUrl).
    await this.auth.whenReady();
    const token = await this.auth.accessToken();
    if (!token) {
      this.failed.set(true);
      return;
    }
    const target = this.returnUrl();
    await this.router.navigateByUrl(target?.startsWith('/') ? target : '/', { replaceUrl: true });
  }
}
