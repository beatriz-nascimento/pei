import { httpResource } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { Router, RouterLink } from '@angular/router';
import type { Pei, PeiStatus, PeiSummary } from '@pei/shared';
import { ApiService } from '../../core/api.service';
import { NotifyService } from '../../core/notify.service';
import { SessionStore } from '../../core/session.store';
import { confirm } from '../../shared/confirm.dialog';
import { LabelPipe } from '../../shared/forms';
import { NewPeiDialog } from '../students/new-pei.dialog';
import { AdaptationsTab } from './tabs/adaptations.tab';
import { BaselineTab } from './tabs/baseline.tab';
import { CaseStudyTab } from './tabs/case-study.tab';
import { GoalsTab } from './tabs/goals.tab';
import { ProgressTab } from './tabs/progress.tab';
import { ServicesTab } from './tabs/services.tab';

/** Passos 3 a 5 do fluxo: preencher abas, definir metas, acompanhar e gerar o documento. */
@Component({
  selector: 'app-pei-editor-page',
  imports: [
    AdaptationsTab,
    BaselineTab,
    CaseStudyTab,
    DatePipe,
    GoalsTab,
    LabelPipe,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTabsModule,
    ProgressTab,
    RouterLink,
    ServicesTab,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pei-editor.page.html',
  styleUrl: './pei-editor.page.scss',
})
export class PeiEditorPage {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionStore);

  readonly peiId = input.required<string>();

  private readonly path = computed(() => this.session.tenantPath(`/peis/${this.peiId()}`));
  protected readonly resource = httpResource<Pei>(() => this.api.url(this.path()));
  protected readonly busy = signal(false);
  protected readonly exporting = signal<'pdf' | 'docx' | null>(null);

  /** Checklist do que falta antes de colocar em vigor. */
  protected readonly checklist = computed(() => {
    const p = this.resource.value();
    if (!p) return [];
    const cs = p.caseStudy;
    return [
      {
        done: !!(cs.strengths && cs.challenges),
        label: 'Estudo de caso: potencialidades e desafios',
      },
      { done: p.baseline.length > 0, label: 'Linha de base com ao menos uma área' },
      { done: p.goals.length > 0, label: 'Ao menos uma meta SMART' },
      { done: !!(p.startDate && p.reviewDate), label: 'Datas de vigência e de revisão' },
    ];
  });

  protected onSaved(pei: Pei): void {
    this.resource.set(pei);
  }

  protected async changeStatus(status: PeiStatus): Promise<void> {
    const messages: Record<string, { title: string; message: string; label: string }> = {
      active: {
        title: 'Colocar o PEI em vigor?',
        message:
          'O PEI passa a valer e aparece no portal da família. Se houver outro PEI em vigor para este aluno, ele será arquivado.',
        label: 'Colocar em vigor',
      },
      archived: {
        title: 'Arquivar o PEI?',
        message:
          'PEIs arquivados ficam como histórico e não podem mais ser editados. Para mudanças, crie uma nova versão.',
        label: 'Arquivar',
      },
    };
    const m = messages[status]!;
    if (
      !(await confirm(this.dialog, { title: m.title, message: m.message, confirmLabel: m.label }))
    )
      return;
    this.busy.set(true);
    await this.notify.run(
      async () => {
        this.resource.set(await this.api.post<Pei>(`${this.path()}/status`, { status }));
      },
      status === 'active' ? 'PEI em vigor' : 'PEI arquivado',
    );
    this.busy.set(false);
  }

  protected async export(format: 'pdf' | 'docx'): Promise<void> {
    const pei = this.resource.value()!;
    this.exporting.set(format);
    await this.notify.run(() =>
      this.api.download(
        `${this.path()}/export?format=${format}`,
        `PEI_${pei.schoolYear}_v${pei.version}.${format}`,
      ),
    );
    this.exporting.set(null);
  }

  protected newVersion(pei: Pei): void {
    const summary: PeiSummary = { ...pei };
    this.dialog
      .open(NewPeiDialog, {
        data: { studentId: pei.studentId, previous: [summary] },
        width: '520px',
        maxWidth: '96vw',
      })
      .afterClosed()
      .subscribe((created?: Pei) => {
        if (created) void this.router.navigate(['/t', this.session.tenantId(), 'peis', created.id]);
      });
  }

  protected async remove(pei: Pei): Promise<void> {
    const yes = await confirm(this.dialog, {
      title: 'Excluir rascunho?',
      message: 'O rascunho e suas metas serão apagados.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!yes) return;
    const ok = await this.notify.run(() => this.api.delete(this.path()), 'Rascunho excluído');
    if (ok) await this.router.navigate(['/t', this.session.tenantId(), 'alunos', pei.studentId]);
  }
}
