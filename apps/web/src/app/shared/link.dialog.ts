import { Clipboard } from '@angular/cdk/clipboard';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

export interface LinkDialogData {
  title: string;
  description: string;
  url: string;
}

/** Mostra um link gerado uma única vez (convite, portal da família) para copiar. */
@Component({
  selector: 'app-link-dialog',
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatIconModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content class="stack">
      <p>{{ data.description }}</p>
      <mat-form-field>
        <mat-label>Link</mat-label>
        <input matInput readonly [value]="data.url" (focus)="$any($event.target).select()" />
      </mat-form-field>
      <p class="muted warn">
        <mat-icon inline>lock</mat-icon>
        Por segurança, este link só é mostrado agora. Se perder, gere outro e revogue este.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Fechar</button>
      <button mat-flat-button (click)="copy()">
        <mat-icon>{{ copied() ? 'check' : 'content_copy' }}</mat-icon>
        {{ copied() ? 'Copiado' : 'Copiar link' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .warn {
      display: flex;
      gap: 6px;
      align-items: center;
    }
  `,
})
export class LinkDialog {
  protected readonly data = inject<LinkDialogData>(MAT_DIALOG_DATA);
  private readonly clipboard = inject(Clipboard);
  protected readonly copied = signal(false);

  protected copy(): void {
    this.copied.set(this.clipboard.copy(this.data.url));
  }
}
