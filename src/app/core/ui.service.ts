import { Injectable, inject, signal } from '@angular/core';
import { I18n } from '../i18n/i18n.service';

export interface Toast {
  id: number;
  text: string;
  error: boolean;
}

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* no storage */
    }
  },
};

/** Toasts, light/dark theme and sidebar state. */
@Injectable({ providedIn: 'root' })
export class Ui {
  private i18n = inject(I18n);
  readonly toasts = signal<Toast[]>([]);
  readonly theme = signal<'light' | 'dark'>((document.documentElement.dataset['theme'] as 'light' | 'dark') || 'light');
  readonly sidebarCollapsed = signal(store.get('dash.sbCollapsed') === '1');
  readonly sidebarOpen = signal(false);
  private seq = 0;

  /** Shows a toast; `text` may be a translation key. */
  toast(text: string, error = false) {
    const id = ++this.seq;
    const msg = this.i18n.t(text);
    this.toasts.update((t) => [...t, { id, text: msg, error }]);
    setTimeout(() => this.toasts.update((t) => t.filter((x) => x.id !== id)), error ? 6000 : 3500);
  }

  /** Runs an action and shows its error as a toast. */
  async run<T>(fn: () => Promise<T>, ok?: string | ((r: T) => string)): Promise<T | undefined> {
    try {
      const r = await fn();
      if (ok) this.toast(typeof ok === 'function' ? ok(r) : ok);
      return r;
    } catch (e) {
      this.toast((e as Error).message, true);
      return undefined;
    }
  }

  toggleTheme() {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    document.documentElement.dataset['theme'] = next;
    store.set('emob.theme', next);
  }

  toggleSidebar() {
    this.sidebarCollapsed.update((c) => !c);
    store.set('dash.sbCollapsed', this.sidebarCollapsed() ? '1' : '0');
  }
}
