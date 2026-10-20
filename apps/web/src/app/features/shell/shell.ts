import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { SessionStore } from '../../core/session.store';
import { LabelPipe } from '../../shared/forms';

@Component({
  selector: 'app-shell',
  imports: [
    LabelPipe,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    MatSidenavModule,
    MatToolbarModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  protected readonly session = inject(SessionStore);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 900px)')
      .pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  protected readonly base = computed(() => ['/t', this.session.tenantId()]);
  protected readonly nav = computed(() => [
    { path: 'alunos', icon: 'groups', label: 'Alunos' },
    { path: 'registro', icon: 'touch_app', label: 'Registro rápido' },
    ...(this.session.isAdmin() ? [{ path: 'equipe', icon: 'badge', label: 'Equipe' }] : []),
  ]);

  protected switchTenant(id: string): void {
    void this.router.navigate(['/t', id]);
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    this.session.clear();
    await this.router.navigate(['/entrar']);
  }
}
