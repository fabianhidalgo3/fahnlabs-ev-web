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

/** How long an action stays blocked after it finishes, so a double click does not run it twice. */
const HOLD_MS = 800;

/** Saves a blob as a file through a temporary link. */
export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

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

  /** Keys of the actions in progress (commands, saves, exports). */
  readonly pending = signal<ReadonlySet<string>>(new Set());

  /** True while the action `key` runs, and briefly after, so a double click cannot repeat it. */
  busy(key: string) {
    return this.pending().has(key);
  }

  private mark(key: string, on: boolean) {
    const s = new Set(this.pending());
    if (on) s.add(key);
    else s.delete(key);
    this.pending.set(s);
  }

  /**
   * Runs an action and shows its error as a toast. With a `key`, the action runs only once at a time:
   * calls with the same key are ignored until it finishes (plus a short hold against double clicks).
   */
  async run<T>(fn: () => Promise<T>, ok?: string | ((r: T) => string), key?: string): Promise<T | undefined> {
    if (key) {
      if (this.busy(key)) return undefined;
      this.mark(key, true);
    }
    try {
      const r = await fn();
      if (ok) this.toast(typeof ok === 'function' ? ok(r) : ok);
      return r;
    } catch (e) {
      this.toast((e as Error).message, true);
      return undefined;
    } finally {
      if (key) setTimeout(() => this.mark(key, false), HOLD_MS);
    }
  }

  /** Downloads a server export once (repeated clicks are ignored while it downloads). */
  download(url: string) {
    return this.run(async () => {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`${this.i18n.t('common.exportFailed')} (HTTP ${res.status})`);
      const name = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '')?.[1]
        ?? url.split('?')[0].split('/').pop() ?? 'export.csv';
      saveBlob(await res.blob(), name);
    }, undefined, 'export:' + url);
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
