import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormField, form, submit, validateStandardSchema } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule, type MatChipInputEvent } from '@angular/material/chips';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { CreateStudentInput, type Student } from '@pei/shared';
import { ApiService } from '../../core/api.service';
import { NotifyService } from '../../core/notify.service';
import { SessionStore } from '../../core/session.store';
import { FieldErrorPipe } from '../../shared/forms';

interface GuardianForm {
  name: string;
  relationship: string;
  email: string;
  phone: string;
}

/** Sugestões comuns; o campo aceita qualquer texto. */
const CONDITION_SUGGESTIONS = [
  'TEA nível 1',
  'TEA nível 2',
  'TEA nível 3',
  'TDAH',
  'TAG',
  'Síndrome de Down (T21)',
  'Dislexia',
  'Discalculia',
  'Deficiência intelectual',
  'Altas habilidades',
];

@Component({
  selector: 'app-student-form-dialog',
  imports: [
    FormField,
    FieldErrorPipe,
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './student-form.dialog.html',
  styles: `
    .guardian {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      padding: 12px;
    }
    .guardian-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .suggestions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: -8px 0 8px;
    }
    .suggestions button {
      font-size: 12px;
    }
  `,
})
export class StudentFormDialog {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  private readonly notify = inject(NotifyService);
  private readonly ref = inject(MatDialogRef<StudentFormDialog, Student>);
  protected readonly data = inject<{ student?: Student }>(MAT_DIALOG_DATA);

  protected readonly suggestions = CONDITION_SUGGESTIONS;
  protected readonly busy = signal(false);

  protected readonly model = signal({
    fullName: this.data.student?.fullName ?? '',
    birthDate: this.data.student?.birthDate ?? '',
    schoolName: this.data.student?.schoolName ?? '',
    grade: this.data.student?.grade ?? '',
    classGroup: this.data.student?.classGroup ?? '',
    conditions: [...(this.data.student?.conditions ?? [])],
    notes: this.data.student?.notes ?? '',
    guardians: (this.data.student?.guardians ?? []).map((g): GuardianForm => ({
      name: g.name,
      relationship: g.relationship,
      email: g.email ?? '',
      phone: g.phone ?? '',
    })),
  });
  protected readonly f = form(this.model, (p) => validateStandardSchema(p, CreateStudentInput));
  protected readonly isProfessional = this.session.membership()?.tenantType === 'professional';

  protected addCondition(value: string): void {
    const v = value.trim();
    if (!v) return;
    this.model.update((m) =>
      m.conditions.includes(v) ? m : { ...m, conditions: [...m.conditions, v] },
    );
  }

  protected onChipInput(event: MatChipInputEvent): void {
    this.addCondition(event.value);
    event.chipInput.clear();
  }

  protected removeCondition(value: string): void {
    this.model.update((m) => ({ ...m, conditions: m.conditions.filter((c) => c !== value) }));
  }

  protected addGuardian(): void {
    this.model.update((m) => ({
      ...m,
      guardians: [...m.guardians, { name: '', relationship: '', email: '', phone: '' }],
    }));
  }

  protected removeGuardian(index: number): void {
    this.model.update((m) => ({ ...m, guardians: m.guardians.filter((_, i) => i !== index) }));
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.f, async () => {
      this.busy.set(true);
      try {
        const body = CreateStudentInput.parse(this.model());
        const base = this.session.tenantPath('/students');
        const student = this.data.student
          ? await this.api.patch<Student>(`${base}/${this.data.student.id}`, body)
          : await this.api.post<Student>(base, body);
        this.ref.close(student);
      } catch (e) {
        this.notify.error(e);
      } finally {
        this.busy.set(false);
      }
      return undefined;
    });
  }
}
