import type { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard, homeRedirectGuard, tenantGuard } from './core/guards';

export const routes: Routes = [
  {
    path: 'entrar',
    canActivate: [guestGuard],
    title: 'Entrar · PEI',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'auth/callback',
    loadComponent: () => import('./features/auth/callback.page').then((m) => m.CallbackPage),
  },
  {
    // Portal da família: público, sem login.
    path: 'familia/:token',
    title: 'Acompanhamento do PEI',
    loadComponent: () =>
      import('./features/family/family-portal.page').then((m) => m.FamilyPortalPage),
  },
  {
    path: 'convite/:token',
    canActivate: [authGuard],
    title: 'Convite · PEI',
    loadComponent: () => import('./features/auth/invitation.page').then((m) => m.InvitationPage),
  },
  {
    path: 'comecar',
    canActivate: [authGuard],
    title: 'Criar conta · PEI',
    loadComponent: () =>
      import('./features/onboarding/onboarding.page').then((m) => m.OnboardingPage),
  },
  {
    path: 't/:tenantId',
    canActivate: [authGuard, tenantGuard],
    loadComponent: () => import('./features/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'alunos' },
      {
        path: 'alunos',
        title: 'Alunos · PEI',
        loadComponent: () =>
          import('./features/students/students.page').then((m) => m.StudentsPage),
      },
      {
        path: 'alunos/:studentId',
        title: 'Aluno · PEI',
        loadComponent: () =>
          import('./features/students/student-detail.page').then((m) => m.StudentDetailPage),
      },
      {
        path: 'peis/:peiId',
        title: 'PEI · PEI',
        loadComponent: () => import('./features/pei/pei-editor.page').then((m) => m.PeiEditorPage),
      },
      {
        path: 'registro',
        title: 'Registro rápido · PEI',
        loadComponent: () =>
          import('./features/progress/quick-progress.page').then((m) => m.QuickProgressPage),
      },
      {
        path: 'equipe',
        canActivate: [adminGuard],
        title: 'Equipe · PEI',
        loadComponent: () => import('./features/team/team.page').then((m) => m.TeamPage),
      },
    ],
  },
  { path: '', pathMatch: 'full', canActivate: [authGuard, homeRedirectGuard], children: [] },
  { path: '**', redirectTo: '' },
];
