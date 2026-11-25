import { Component, computed, effect, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { Title } from '@angular/platform-browser';
import { Live } from './core/live.service';
import { Nav, SECTIONS } from './core/nav.service';
import { Ui } from './core/ui.service';
import { I18n } from './i18n/i18n.service';
import { Chat } from './shell/chat';
import { StartDialog } from './shared/start-dialog';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Chat, StartDialog],
  template: `
    <aside class="sidebar" [class.collapsed]="ui.sidebarCollapsed()" [class.open]="ui.sidebarOpen()" [attr.aria-label]="t('nav.menu')">
      <a class="brand" routerLink="/" (click)="ui.sidebarOpen.set(false)">
        <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="6" class="b0" /><rect x="5" y="14" width="22" height="5" rx="1" class="b1" /><rect x="21" y="9" width="3" height="15" class="b2" /></svg>
        <span class="brand-t">{{ t('app.name') }}<small>{{ t('app.tagline') }}</small></span>
      </a>
      <nav>
        @for (g of groups; track g.name) {
          <p class="grp">{{ t(g.name) }}</p>
          @for (s of g.items; track s.id) {
            <a [routerLink]="'/' + s.path" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: s.path === '' }" [title]="t(s.label)" (click)="ui.sidebarOpen.set(false)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="s.icon" /></svg><span>{{ t(s.label) }}</span>
            </a>
          }
        }
        <p class="grp">{{ t('nav.group.testing') }}</p>
        <a [href]="nav.emulatorUrl()" target="_blank" rel="noopener" [title]="t('nav.emulatorHint')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v16H7zM10 8h4M10 12h4M12 16h.01" /></svg><span>{{ t('nav.emulator') }}</span>
        </a>
      </nav>
      <div class="sb-foot">
        <div class="lang" role="group" [attr.aria-label]="t('nav.language')">
          <button type="button" [class.on]="i18n.lang() === 'en'" (click)="i18n.setLang('en')" lang="en">English</button>
          <button type="button" [class.on]="i18n.lang() === 'es'" (click)="i18n.setLang('es')" lang="es">Español</button>
        </div>
        <button type="button" class="ghost" (click)="ui.toggleTheme()">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z" /></svg><span>{{ t(ui.theme() === 'dark' ? 'nav.lightTheme' : 'nav.darkTheme') }}</span>
        </button>
        <button type="button" class="ghost collapse" (click)="ui.toggleSidebar()" [title]="t(ui.sidebarCollapsed() ? 'nav.expand' : 'nav.collapse')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="ui.sidebarCollapsed() ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'" /></svg><span>{{ t('nav.collapse') }}</span>
        </button>
      </div>
    </aside>
    @if (ui.sidebarOpen()) { <div class="sb-backdrop" (click)="ui.sidebarOpen.set(false)"></div> }

    <div class="main" [class.wide]="ui.sidebarCollapsed()">
      <header class="topbar">
        <button type="button" class="burger ghost" (click)="ui.sidebarOpen.set(true)" [attr.aria-label]="t('nav.openMenu')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <h1>{{ t(section().title) }}</h1>
        <span class="lamp" [class.on]="live.status() === 'live.online'" [class.warn]="live.status() !== 'live.online'">{{ t(live.status()) }}</span>
        <app-chat />
      </header>
      <main>
        <router-outlet />
      </main>
    </div>

    <app-start-dialog />
    <div class="toasts" aria-live="polite">
      @for (x of ui.toasts(); track x.id) { <div class="toast" [class.error]="x.error">{{ x.text }}</div> }
    </div>
  `,
})
export class App {
  protected ui = inject(Ui);
  protected live = inject(Live);
  protected nav = inject(Nav);
  protected i18n = inject(I18n);
  protected t = this.i18n.t;
  private router = inject(Router);
  private title = inject(Title);

  protected groups = (['nav.group.operations', 'nav.group.management'] as const).map((name) => ({ name, items: SECTIONS.filter((s) => s.group === name) }));

  private url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => (e as NavigationEnd).urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected section = computed(() => {
    const path = this.url().split(/[?#]/)[0].replace(/^\/+/, '');
    return SECTIONS.find((x) => x.path === path) || SECTIONS[0];
  });

  constructor() {
    effect(() => this.title.setTitle(`${this.t(this.section().title)} | ${this.t('app.name')}`));
  }
}
