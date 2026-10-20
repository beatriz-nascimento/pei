import { httpResource } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import type { FamilyLink, Member, Pei, PeiSummary, StaffFunction, Student } from '@pei/shared';
import { ApiService } from '../../core/api.service';
import { NotifyService } from '../../core/notify.service';
import { SessionStore } from '../../core/session.store';
import { confirm } from '../../shared/confirm.dialog';
import { LabelPipe, options } from '../../shared/forms';
import { LinkDialog, type LinkDialogData } from '../../shared/link.dialog';
import { NewPeiDialog } from './new-pei.dialog';
import { StudentFormDialog } from './student-form.dialog';

@Component({
  selector: 'app-student-detail-page',
  imports: [
    DatePipe,
    LabelPipe,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTooltipModule,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './student-detail.page.html',
  styleUrl: './student-detail.page.scss',
})
export class StudentDetailPage {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionStore);

  readonly studentId = input.required<string>();

  private readonly path = computed(() => this.session.tenantPath(`/students/${this.studentId()}`));
  protected readonly student = httpResource<Student>(() => this.api.url(this.path()));
  protected readonly peis = httpResource<PeiSummary[]>(() => this.api.url(`${this.path()}/peis`));
  protected readonly links = httpResource<FamilyLink[]>(() =>
    this.api.url(`${this.path()}/family-links`),
  );
  protected readonly members = httpResource<Member[]>(() =>
    this.session.isAdmin() ? this.api.url(this.session.tenantPath('/members')) : undefined,
  );

  protected readonly staffFunctions = options('staffFunction');
  protected readonly newStaffUser = signal<string | null>(null);
  protected readonly newStaffFunction = signal<StaffFunction>('regente');

  /** Membros que ainda não estão vinculados ao aluno. */
  protected readonly availableMembers = computed(() => {
    const linked = new Set(this.student.value()?.staff.map((s) => s.userId) ?? []);
    return (this.members.value() ?? []).filter((m) => !linked.has(m.userId));
  });

  protected readonly now = Date.now();

  protected edit(student: Student): void {
    this.dialog
      .open(StudentFormDialog, { data: { student }, width: '720px', maxWidth: '96vw' })
      .afterClosed()
      .subscribe((updated?: Student) => updated && this.student.set(updated));
  }

  protected async toggleArchive(student: Student): Promise<void> {
    const action = student.archivedAt ? 'unarchive' : 'archive';
    await this.notify.run(
      async () => this.student.set(await this.api.post<Student>(`${this.path()}/${action}`)),
      action === 'archive' ? 'Aluno arquivado' : 'Aluno reativado',
    );
  }

  protected async remove(student: Student): Promise<void> {
    const yes = await confirm(this.dialog, {
      title: 'Excluir aluno definitivamente?',
      message: `Todos os PEIs, metas e registros de ${student.fullName} serão apagados. Isso não pode ser desfeito. Para apenas tirar da lista, use "Arquivar".`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!yes) return;
    const ok = await this.notify.run(() => this.api.delete(this.path()), 'Aluno excluído');
    if (ok) await this.router.navigate(['/t', this.session.tenantId(), 'alunos']);
  }

  protected async addStaff(): Promise<void> {
    const userId = this.newStaffUser();
    if (!userId) return;
    await this.notify.run(async () => {
      this.student.set(
        await this.api.put<Student>(`${this.path()}/staff/${userId}`, {
          function: this.newStaffFunction(),
        }),
      );
      this.newStaffUser.set(null);
    }, 'Profissional vinculado');
  }

  protected async removeStaff(userId: string): Promise<void> {
    await this.notify.run(async () =>
      this.student.set(await this.api.request<Student>('DELETE', `${this.path()}/staff/${userId}`)),
    );
  }

  protected newPei(): void {
    this.dialog
      .open(NewPeiDialog, {
        data: { studentId: this.studentId(), previous: this.peis.value() ?? [] },
        width: '520px',
        maxWidth: '96vw',
      })
      .afterClosed()
      .subscribe((pei?: Pei) => {
        if (pei) void this.router.navigate(['/t', this.session.tenantId(), 'peis', pei.id]);
      });
  }

  protected async newFamilyLink(student: Student): Promise<void> {
    await this.notify.run(async () => {
      const link = await this.api.post<FamilyLink>(`${this.path()}/family-links`, {
        expiresInDays: 90,
        label: student.guardians[0]
          ? `${student.guardians[0].relationship} — ${student.guardians[0].name}`
          : undefined,
      });
      this.links.reload();
      this.dialog.open<LinkDialog, LinkDialogData>(LinkDialog, {
        width: '560px',
        maxWidth: '96vw',
        data: {
          title: 'Link para a família',
          description:
            'Envie este link aos responsáveis (WhatsApp, e-mail…). Eles acessam sem cadastro, só leitura, e cada acesso fica registrado. Vale por 90 dias.',
          url: link.url!,
        },
      });
    });
  }

  protected async revokeLink(link: FamilyLink): Promise<void> {
    const yes = await confirm(this.dialog, {
      title: 'Revogar link?',
      message: 'Quem tiver este link deixará de acessar o portal imediatamente.',
      confirmLabel: 'Revogar',
      danger: true,
    });
    if (!yes) return;
    await this.notify.run(async () => {
      await this.api.post(`${this.path()}/family-links/${link.id}/revoke`);
      this.links.reload();
    }, 'Link revogado');
  }

  protected linkState(link: FamilyLink): 'revoked' | 'expired' | 'active' {
    if (link.revokedAt) return 'revoked';
    return new Date(link.expiresAt).getTime() < this.now ? 'expired' : 'active';
  }
}
