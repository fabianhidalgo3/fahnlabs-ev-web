import { Routes } from '@angular/router';

// Every section is lazy loaded.
export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/operations').then((m) => m.Operations) },
  { path: 'yard', loadComponent: () => import('./pages/yard').then((m) => m.Yard) },
  { path: 'energy', loadComponent: () => import('./pages/energy').then((m) => m.Energy) },
  { path: 'motor', loadComponent: () => import('./pages/motor').then((m) => m.Motor) },
  { path: 'calendar', loadComponent: () => import('./pages/calendar').then((m) => m.Calendar) },
  { path: 'vehicles', loadComponent: () => import('./pages/vehicles').then((m) => m.Vehicles) },
  { path: 'chargers', loadComponent: () => import('./pages/chargers').then((m) => m.Chargers) },
  { path: 'sessions', loadComponent: () => import('./pages/sessions').then((m) => m.Sessions) },
  { path: '**', redirectTo: '' },
];
