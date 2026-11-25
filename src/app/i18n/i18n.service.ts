import { Injectable, computed, signal } from '@angular/core';
import { EN, Dictionary } from './en';
import { ES } from './es';
import { setLocale } from '../core/fmt';

export type Lang = 'en' | 'es';
const DICTS: Record<Lang, Dictionary> = { en: EN, es: ES };
const LOCALES: Record<Lang, string> = { en: 'en-US', es: 'es-CL' };

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('emob.lang');
    if (saved === 'en' || saved === 'es') return saved;
  } catch {
    /* no storage */
  }
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

/**
 * Runtime translations (English / Spanish) with a language switch.
 * `t()` reads the language signal, so any template that calls it re-renders when the language changes.
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  readonly lang = signal<Lang>(initialLang());
  readonly locale = computed(() => LOCALES[this.lang()]);

  constructor() {
    this.apply(this.lang());
  }

  setLang(l: Lang) {
    this.lang.set(l);
    this.apply(l);
    try {
      localStorage.setItem('emob.lang', l);
    } catch {
      /* no storage */
    }
  }

  private apply(l: Lang) {
    document.documentElement.lang = l;
    setLocale(LOCALES[l]);
  }

  /** Translation of `key`, replacing `{name}` placeholders with `params`. Falls back to English, then to the key. */
  t = (key: string, params?: Record<string, string | number | null | undefined>): string => {
    const dict = DICTS[this.lang()];
    let s = dict[key] ?? EN[key] ?? key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(v == null ? '–' : String(v));
    return s;
  };

  /** Plural helper: key + '.one' / key + '.other'. */
  tn = (key: string, n: number, params?: Record<string, string | number>): string =>
    this.t(`${key}.${n === 1 ? 'one' : 'other'}`, { n, ...params });
}
