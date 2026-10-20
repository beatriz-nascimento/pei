import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, linkedSignal, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router, RouterLink } from '@angular/router';
import type { Student, StudentSummary } from '@pei/shared';
import { debounced } from '../../shared/debounce';
import { ApiService } from '../../core/api.service';
import { SessionStore } from '../../core/session.store';
import { StudentFormDialog } from './student-form.dialog';

@Component({
  selector: 'app-students-page',
  imports: [
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './students.page.html',
  styleUrl: './students.page.scss',
})
export class StudentsPage {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionStore);

  protected readonly query = signal('');
  private readonly debouncedQuery = debounced(this.query, 250);
  protected readonly showArchived = signal(false);

  protected readonly students = httpResource<StudentSummary[]>(() => ({
    url: this.api.url(this.session.tenantPath('/students')),
    params: { q: this.debouncedQuery(), archived: String(this.showArchived()) },
  }));
  /** Mantém a lista anterior visível enquanto a nova busca carrega. */
  protected readonly list = linkedSignal<StudentSummary[] | undefined, StudentSummary[]>({
    source: () => this.students.value(),
    computation: (value, previous) => value ?? previous?.value ?? [],
  });

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected create(): void {
    this.dialog
      .open<StudentFormDialog, { student?: Student }, Student>(StudentFormDialog, {
        data: {},
        width: '720px',
        maxWidth: '96vw',
      })
      .afterClosed()
      .subscribe((student) => {
        if (student)
          void this.router.navigate(['/t', this.session.tenantId(), 'alunos', student.id]);
      });
  }
}
