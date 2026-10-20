import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormField, form, submit, validateStandardSchema } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { type AccountType, CreateTenantInput, type Tenant } from '@pei/shared';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { NotifyService } from '../../core/notify.service';
import { SessionStore } from '../../core/session.store';
import { FieldErrorPipe } from '../../shared/forms';

/** Fluxograma: "Assina o plano e cria a conta → Tipo de conta? Escola | Profissional". */
@Component({
  selector: 'app-onboarding-page',
  imports: [
    FormField,
    FieldErrorPipe,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './onboarding.page.html',
  styleUrl: './onboarding.page.scss',
})
export class OnboardingPage {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly busy = signal(false);
  protected readonly model = signal({
    name: '',
    type: 'school' as AccountType,
    city: '',
    state: '',
  });
  protected readonly f = form(this.model, (p) => validateStandardSchema(p, CreateTenantInput));

  protected readonly types: Array<{
    value: AccountType;
    icon: string;
    title: string;
    text: string;
  }> = [
    {
      value: 'school',
      icon: 'apartment',
      title: 'Escola',
      text: 'Gestão da instituição: equipe com papéis (admin, edita PEI, só leitura), alunos vinculados a professores regentes e do AEE.',
    },
    {
      value: 'professional',
      icon: 'person',
      title: 'Profissional',
      text: 'Conta individual para psicopedagogos, fonoaudiólogos, TOs… Atenda alunos de várias escolas, sem gestão institucional.',
    },
  ];

  protected choose(type: AccountType): void {
    this.model.update((m) => ({ ...m, type }));
  }

  protected async create(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.f, async () => {
      this.busy.set(true);
      try {
        const tenant = await this.api.post<Tenant>(
          '/tenants',
          CreateTenantInput.parse(this.model()),
        );
        await this.session.loadMe(true);
        this.notify.success('Conta criada!');
        await this.router.navigate(['/t', tenant.id]);
      } catch (e) {
        this.notify.error(e);
      } finally {
        this.busy.set(false);
      }
      return undefined;
    });
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    this.session.clear();
    await this.router.navigate(['/entrar']);
  }
}
