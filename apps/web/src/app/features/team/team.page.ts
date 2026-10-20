import { httpResource } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormField, form, submit, validateStandardSchema } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { CreateInvitationInput, type Invitation, type Member, type MemberRole } from '@pei/shared';
import { ApiService } from '../../core/api.service';
import { NotifyService } from '../../core/notify.service';
import { SessionStore } from '../../core/session.store';
import { confirm } from '../../shared/confirm.dialog';
import { FieldErrorPipe, LabelPipe, options } from '../../shared/forms';
import { LinkDialog, type LinkDialogData } from '../../shared/link.dialog';

/** Fluxograma: "Cadastra responsáveis e permissões — papéis: Admin · Edita PEI · Só leitura". */
@Component({
  selector: 'app-team-page',
  imports: [
    DatePipe,
    FormField,
    FieldErrorPipe,
    LabelPipe,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './team.page.html',
  styles: `
    .roles {
      margin: 0 0 16px;
      padding-left: 20px;
    }
    .invite {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: flex-start;
    }
    .invite mat-form-field {
      flex: 1 1 220px;
    }
    .invite button {
      margin-top: 8px;
    }
    table {
      width: 100%;
      background: transparent;
    }
    .role-select {
      width: 170px;
    }
    section + section {
      margin-top: 24px;
    }
  `,
})
export class TeamPage {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  protected readonly session = inject(SessionStore);

  protected readonly roles = options('memberRole');
  protected readonly members = httpResource<Member[]>(() =>
    this.api.url(this.session.tenantPath('/members')),
  );
  protected readonly invitations = httpResource<Invitation[]>(() =>
    this.api.url(this.session.tenantPath('/invitations')),
  );

  protected readonly busy = signal(false);
  protected readonly invite = form(signal({ email: '', role: 'editor' as MemberRole }), (p) =>
    validateStandardSchema(p, CreateInvitationInput),
  );

  protected async sendInvite(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.invite, async () => {
      this.busy.set(true);
      try {
        const inv = await this.api.post<Invitation>(
          this.session.tenantPath('/invitations'),
          CreateInvitationInput.parse(this.invite().value()),
        );
        this.invite().reset({ email: '', role: inv.role });
        this.invitations.reload();
        this.dialog.open<LinkDialog, LinkDialogData>(LinkDialog, {
          width: '560px',
          maxWidth: '96vw',
          data: {
            title: 'Convite criado',
            description: `Envie este link para ${inv.email}. A pessoa entra (ou cria a conta) com esse mesmo e-mail e aceita o convite. Vale por 7 dias.`,
            url: inv.acceptUrl!,
          },
        });
      } catch (e) {
        this.notify.error(e);
      } finally {
        this.busy.set(false);
      }
      return undefined;
    });
  }

  protected async changeRole(member: Member, role: MemberRole): Promise<void> {
    const ok = await this.notify.run(
      () => this.api.patch(this.session.tenantPath(`/members/${member.userId}`), { role }),
      'Papel atualizado',
    );
    this.members.reload();
    if (ok && member.userId === this.session.me()?.id) await this.session.loadMe(true);
  }

  protected async removeMember(member: Member): Promise<void> {
    const yes = await confirm(this.dialog, {
      title: 'Remover da equipe?',
      message: `${member.fullName ?? member.email} perde o acesso a esta conta e é desvinculado(a) dos alunos.`,
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!yes) return;
    await this.notify.run(async () => {
      await this.api.delete(this.session.tenantPath(`/members/${member.userId}`));
      this.members.reload();
    }, 'Membro removido');
  }

  protected async revoke(inv: Invitation): Promise<void> {
    await this.notify.run(async () => {
      await this.api.delete(this.session.tenantPath(`/invitations/${inv.id}`));
      this.invitations.reload();
    }, 'Convite cancelado');
  }
}
