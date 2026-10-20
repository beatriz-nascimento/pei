import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { ApiService, toApiError } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { SessionStore } from '../../core/session.store';

/** Profissional convidado aceita entrar na conta da escola. */
@Component({
  selector: 'app-invitation-page',
  imports: [MatButtonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="auth-layout">
      <section class="auth-card">
        <h1>Convite para a equipe</h1>
        <p>
          Você entrará com o e-mail <strong>{{ auth.email() }}</strong
          >. O convite precisa ter sido enviado para este mesmo endereço.
        </p>
        @if (error(); as message) {
          <p class="alert alert-error" role="alert">{{ message }}</p>
          <a routerLink="/">Ir para o início</a>
        }
        <button mat-flat-button (click)="accept()" [disabled]="busy()">Aceitar convite</button>
        <button mat-button (click)="switchAccount()">Usar outro e-mail</button>
      </section>
    </main>
  `,
  styleUrl: './auth.scss',
})
export class InvitationPage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  readonly token = input.required<string>();
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async accept(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const { tenantId } = await this.api.post<{ tenantId: string }>('/invitations/accept', {
        token: this.token(),
      });
      await this.session.loadMe(true);
      await this.router.navigate(['/t', tenantId]);
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async switchAccount(): Promise<void> {
    await this.auth.signOut();
    this.session.clear();
    await this.router.navigate(['/entrar'], {
      queryParams: { returnUrl: `/convite/${this.token()}` },
    });
  }
}
