import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import {
  type FieldTree,
  FormField,
  form,
  submit,
  validateStandardSchema,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { Router } from '@angular/router';
import { z } from 'zod';
import { AuthService } from '../../core/auth.service';
import { SessionStore } from '../../core/session.store';
import { FieldErrorPipe } from '../../shared/forms';

const Email = z.email('E-mail inválido');

const LoginSchema = z.object({ email: Email, password: z.string().min(1, 'Informe a senha') });
const SignUpSchema = z.object({
  fullName: z.string().trim().min(2, 'Informe seu nome'),
  email: Email,
  password: z
    .string()
    .min(10, 'Use ao menos 10 caracteres')
    .regex(/[a-z]/, 'Inclua uma letra minúscula')
    .regex(/[A-Z]/, 'Inclua uma letra maiúscula')
    .regex(/\d/, 'Inclua um número'),
});
const MagicSchema = z.object({ email: Email });

@Component({
  selector: 'app-login-page',
  imports: [
    FormField,
    FieldErrorPipe,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatTabsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.page.html',
  styleUrl: './auth.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  /** Preenchido pela rota (?returnUrl=...). */
  readonly returnUrl = input<string>();

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly info = signal<string | null>(null);

  protected readonly login = form(signal({ email: '', password: '' }), (p) =>
    validateStandardSchema(p, LoginSchema),
  );
  protected readonly signUp = form(signal({ fullName: '', email: '', password: '' }), (p) =>
    validateStandardSchema(p, SignUpSchema),
  );
  protected readonly magic = form(signal({ email: '' }), (p) =>
    validateStandardSchema(p, MagicSchema),
  );

  protected onLogin(event: Event): Promise<void> {
    event.preventDefault();
    return this.run(this.login, async () => {
      const { email, password } = this.login().value();
      await this.auth.signIn(email, password);
      await this.afterLogin();
    });
  }

  protected onSignUp(event: Event): Promise<void> {
    event.preventDefault();
    return this.run(this.signUp, async () => {
      const { fullName, email, password } = this.signUp().value();
      const { needsConfirmation } = await this.auth.signUp(fullName, email, password);
      if (needsConfirmation) {
        this.info.set('Enviamos um link de confirmação para o seu e-mail. Abra-o para continuar.');
      } else {
        await this.afterLogin();
      }
    });
  }

  protected onMagicLink(event: Event): Promise<void> {
    event.preventDefault();
    return this.run(this.magic, async () => {
      await this.auth.sendMagicLink(this.magic().value().email, this.returnUrl() ?? '/');
      this.info.set('Pronto! Confira seu e-mail e clique no link para entrar.');
    });
  }

  private async run<T>(tree: FieldTree<T>, action: () => Promise<void>): Promise<void> {
    this.error.set(null);
    this.info.set(null);
    await submit(tree, async () => {
      this.busy.set(true);
      try {
        await action();
      } catch (e) {
        this.error.set(e instanceof Error ? e.message : 'Não foi possível continuar');
      } finally {
        this.busy.set(false);
      }
      return undefined;
    });
  }

  private async afterLogin(): Promise<void> {
    this.session.clear();
    const target = this.returnUrl();
    await this.router.navigateByUrl(target && target.startsWith('/') ? target : '/');
  }
}
