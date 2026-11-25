import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api } from './api.service';
import { Info } from './types';
import { I18n } from '../i18n/i18n.service';

export interface Section {
  /** Identifier used by the assistant (navigate_dashboard). */
  id: string;
  path: string;
  /** i18n keys */
  label: string;
  title: string;
  group: 'nav.group.operations' | 'nav.group.management';
  icon: string;
}

// Line icons (24×24, stroke) drawn for this dashboard.
const I = {
  ops: 'M4 12h4l2-6 4 12 2-6h4',
  patio: 'M5 17h14M7 17v-5l2-4h6l2 4v5M9 13h6',
  energy: 'M12 3v4M12 17v4M5 12H3M21 12h-2M7 7 5.5 5.5M18.5 18.5 17 17M17 7l1.5-1.5M5.5 18.5 7 17M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  motor: 'M4 6h16M4 12h10M4 18h7M17 15l3 3-3 3',
  calendar: 'M5 6h14v14H5zM5 10h14M9 4v4M15 4v4',
  vehicles: 'M4 15l2-5h12l2 5v3H4zM7 18v2M17 18v2M8 15h.01M16 15h.01',
  chargers: 'M8 3v5M16 3v5M6 8h12v4a6 6 0 0 1-12 0zM12 18v3',
  data: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
};

export const SECTIONS: Section[] = [
  { id: 'ops', path: '', label: 'nav.ops', title: 'title.ops', group: 'nav.group.operations', icon: I.ops },
  { id: 'patio', path: 'yard', label: 'nav.patio', title: 'title.patio', group: 'nav.group.operations', icon: I.patio },
  { id: 'energy', path: 'energy', label: 'nav.energy', title: 'title.energy', group: 'nav.group.operations', icon: I.energy },
  { id: 'motor', path: 'motor', label: 'nav.motor', title: 'title.motor', group: 'nav.group.operations', icon: I.motor },
  { id: 'calendar', path: 'calendar', label: 'nav.calendar', title: 'title.calendar', group: 'nav.group.operations', icon: I.calendar },
  { id: 'vehicles', path: 'vehicles', label: 'nav.vehicles', title: 'title.vehicles', group: 'nav.group.management', icon: I.vehicles },
  { id: 'chargers', path: 'chargers', label: 'nav.chargers', title: 'title.chargers', group: 'nav.group.management', icon: I.chargers },
  { id: 'data', path: 'sessions', label: 'nav.data', title: 'title.data', group: 'nav.group.management', icon: I.data },
];

/** Programmatic navigation (used by the assistant chat) and environment information. */
@Injectable({ providedIn: 'root' })
export class Nav {
  private router = inject(Router);
  private api = inject(Api);
  private i18n = inject(I18n);
  readonly info = signal<Info | null>(null);

  constructor() {
    this.loadInfo();
  }

  async loadInfo() {
    try {
      this.info.set(await this.api.get<Info>('/info'));
    } catch {
      /* the BFF is not answering yet */
    }
  }

  emulatorUrl(): string {
    return this.info()?.emulatorUrl || `${location.protocol}//${location.hostname}:9100/emulator/`;
  }

  /**
   * { section, chargerId?, action? } → navigates and returns a sentence describing where it went.
   * In "motor" the charger and action become filters; elsewhere the charger is highlighted.
   */
  go({ section, chargerId, action }: { section?: string; chargerId?: string | null; action?: string | null }): string {
    const t = this.i18n.t;
    if (section === 'emulator') {
      window.open(this.emulatorUrl(), '_blank');
      return t('nav.openedEmulator');
    }
    const s = SECTIONS.find((x) => x.id === section) || SECTIONS[0];
    const queryParams: Record<string, string> = {};
    if (s.id === 'motor') {
      if (chargerId) queryParams['charger'] = chargerId;
      if (action) queryParams['action'] = action;
    } else if (chargerId) queryParams['highlight'] = chargerId;
    this.router.navigate(['/' + s.path], { queryParams });
    const what = s.id === 'motor' ? [action, chargerId].filter(Boolean).join(' · ') : chargerId;
    return t('nav.wentTo', { section: t(s.label) }) + (what ? `: ${what}` : '');
  }

  /** Highlights the element with data-hl="<id>" in the current view (after rendering). */
  highlight(id: string | null | undefined) {
    if (!id) return;
    setTimeout(() => {
      const el = document.querySelector(`[data-hl="${CSS.escape(id)}"]`) || document.querySelector(`[data-hl^="${CSS.escape(id)}#"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('nav-hl');
      void (el as HTMLElement).offsetWidth;
      el.classList.add('nav-hl');
    }, 350);
  }
}
