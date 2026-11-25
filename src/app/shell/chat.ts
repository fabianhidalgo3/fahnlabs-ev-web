import { Component, ElementRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { Api } from '../core/api.service';
import { Nav } from '../core/nav.service';
import { I18n } from '../i18n/i18n.service';

interface Step {
  tool: string;
  input: Record<string, unknown>;
}
interface Msg {
  role: 'user' | 'assistant';
  content: string;
  steps?: Step[];
  nav?: boolean;
  error?: boolean;
}
interface NavRequest {
  section: string;
  chargerId?: string | null;
  action?: string | null;
}

// ---------- local navigation (works without an API key), English and Spanish ----------
const SECTIONS: [string, RegExp][] = [
  ['motor', /\b(motor|engine|commands?|comandos?|setpoints?|consignas?|logs?( ocpp)?|frames?|tramas?|meter ?values?|metervalues|profiles?|perfiles?)\b/],
  ['patio', /\b(patio|yard|live yard|veh[ií]culos cargando|vehicles charging)\b/],
  ['calendar', /\b(calendar|calendario|agenda|schedule|planes programados)\b/],
  ['energy', /\b(energy|energ[ií]a|savings?|ahorros?|efficiency|eficiencia|co2|emissions?|emisiones|peak demand|demanda m[aá]xima)\b/],
  ['vehicles', /\b(vehicles|veh[ií]culos|fleet|flota)\b/],
  ['chargers', /\b(chargers|cargadores|charger registry|registro de cargadores)\b/],
  ['data', /\b(sessions|sesiones|data|datos|export|exportar|csv)\b/],
  ['emulator', /\b(emulator|emulador)\b/],
  ['ops', /\b(operations?|operaci[oó]n|home|inicio|overview|resumen general|dashboard|tablero)\b/],
];
const ACTIONS: [string, RegExp][] = [
  ['MeterValues', /meter ?values?|medidas|mediciones|measurements/],
  ['StatusNotification', /status ?notification|estados?|status/],
  ['SetChargingProfile', /set ?charging ?profile|consignas?|perfiles?|setpoints?|profiles?/],
  ['Heartbeat', /heartbeat/],
  ['StartTransaction', /start ?transaction/],
  ['StopTransaction', /stop ?transaction/],
  ['BootNotification', /boot ?notification|arranques?|boots?/],
];
const NAV_VERB = /^(go( to)?|open|show( me)?|take me( to)?|navigate( to)?|see|view|ir|ve|vamos|abre|abrir|abr[ií]|mu[eé]strame|muestra|mostrar|ver|ll[eé]vame|navega|navegar|quiero ver|pon|cambia a|entra|entrar)\b/;

export function parseNav(text: string): NavRequest | null {
  const t = text.toLowerCase().normalize('NFC').trim();
  const words = t.split(/\s+/).length;
  const question = /[¿?]|\b(why|how many|which|what|analy[sz]e|predict|risk|compare|por ?qu[eé]|cu[aá]nt|cu[aá]l|qu[eé] cargador|analiza|predice|riesgo|compara)\b/.test(t);
  const verb = NAV_VERB.test(t);
  if (question || words > 10 || (!verb && words > 4)) return null;
  const chargerId = text.match(/\b([A-Za-z]+-\d{1,4})\b/)?.[1]?.toUpperCase() || null;
  const action = ACTIONS.find(([, re]) => re.test(t))?.[0] || null;
  let section = SECTIONS.find(([, re]) => re.test(t))?.[0] || null;
  if (action && (!section || section === 'chargers' || section === 'data')) section = 'motor';
  if (!section && chargerId && verb) section = 'ops';
  if (!section) return null;
  return { section, chargerId, action: section === 'motor' ? action : null };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Minimal, safe Markdown: everything is escaped, then bold, code, lists and tables are applied. */
function md(src: string): string {
  const lines = esc(src).split('\n');
  const out: string[] = [];
  let i = 0;
  const inline = (s: string) =>
    s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])_([^_]+)_(?=[\s).,]|$)/g, '$1<i>$2</i>');
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const row = (r: string) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      const head = row(l);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]));
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body
        .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
        .join('')}</tbody></table></div>`);
      continue;
    }
    if (/^\s*[-*] /.test(l) || /^\s*\d+\. /.test(l)) {
      const ordered = /^\s*\d+\. /.test(l);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+\. /.test(lines[i]) : /^\s*[-*] /.test(lines[i]))) items.push(inline(lines[i++].replace(/^\s*([-*]|\d+\.) /, '')));
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((x) => `<li>${x}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    const h = l.match(/^#{1,4} (.*)/);
    if (h) out.push(`<p><b>${inline(h[1])}</b></p>`);
    else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
    i++;
  }
  return out.join('');
}

const session = {
  get(): Msg[] {
    try {
      return JSON.parse(sessionStorage.getItem('as.history') || '[]');
    } catch {
      return [];
    }
  },
  set(v: Msg[]) {
    try {
      sessionStorage.setItem('as.history', JSON.stringify(v.slice(-30)));
    } catch {
      /* no storage */
    }
  },
};

@Component({
  selector: 'app-chat',
  template: `
    <form class="chat-bar" (submit)="$event.preventDefault(); send(input.value)" role="search" autocomplete="off">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>
      <input #input type="text" maxlength="2000" (focus)="open.set(true)" [placeholder]="t('chat.placeholder')" [attr.aria-label]="t('chat.aria')" />
      <kbd>Ctrl K</kbd>
    </form>
    @if (open()) {
      <section class="chat-panel" [attr.aria-label]="t('chat.title')">
        <header class="spread">
          <div><b>{{ t('chat.title') }}</b><div class="note">{{ t('chat.subtitle') }}</div></div>
          <div class="row">
            <button type="button" class="sm" (click)="clear()">{{ t('chat.new') }}</button>
            <button type="button" class="sm ghost" (click)="open.set(false)">{{ t('common.close') }}</button>
          </div>
        </header>
        @if (configured() === false) {
          <p class="chat-warn">{{ t('chat.noKey') }}</p>
        }
        <div class="chat-msgs" #msgsEl aria-live="polite">
          @for (m of history(); track $index) {
            @if (m.role === 'user') {
              <div class="msg user">{{ m.content }}</div>
            } @else {
              <div class="msg bot" [class.nav]="m.nav">
                @if (m.steps?.length) {
                  <details><summary>{{ i18n.tn('chat.steps', m.steps!.length) }}</summary>
                    <ul>@for (s of m.steps; track $index) { <li>{{ label(s) }}</li> }</ul>
                  </details>
                }
                @if (m.error) { <p class="err">{{ m.content }}</p> } @else { <div [innerHTML]="html(m.content)"></div> }
              </div>
            }
          } @empty {
            <p class="note">{{ t('chat.empty') }}</p>
          }
          @if (busy()) { <div class="msg bot typing">{{ t('chat.thinking') }}</div> }
        </div>
        @if (!history().length) {
          <div class="chat-sugg">
            @for (s of navSugg(); track s) { <button type="button" class="sm" (click)="send(s)">{{ s }}</button> }
            @for (s of questions(); track s) { <button type="button" class="sm ghost q" (click)="send(s)">{{ s }}</button> }
          </div>
        }
      </section>
    }
  `,
  host: { class: 'chat', '[class.open]': 'open()' },
})
export class Chat {
  private api = inject(Api);
  private nav = inject(Nav);
  protected i18n = inject(I18n);
  protected t = this.i18n.t;
  private host = inject(ElementRef<HTMLElement>);
  private inputEl = viewChild.required<ElementRef<HTMLInputElement>>('input');
  private msgsEl = viewChild<ElementRef<HTMLElement>>('msgsEl');

  open = signal(false);
  busy = signal(false);
  configured = signal<boolean | null>(null);
  history = signal<Msg[]>(session.get());
  navSugg = computed(() => [1, 2, 3, 4].map((i) => this.t(`chat.nav${i}`)));
  questions = computed(() => [1, 2, 3].map((i) => this.t(`chat.q${i}`)));
  private mdCache = new Map<string, string>();

  constructor() {
    this.api.get<{ configured: boolean }>('/assistant/status').then((r) => this.configured.set(r.configured)).catch(() => {});
  }

  label(s: Step): string {
    const inp = s.input || {};
    const name = this.t(`tool.${s.tool}`);
    if (s.tool === 'query_database') return `${name}: ${String(inp['sql'] || inp['collection'] || '').replace(/\s+/g, ' ').slice(0, 140)}`;
    const bits = [
      inp['chargerId'], inp['action'], inp['level'], inp['text'] && `“${inp['text']}”`,
      inp['sinceMinutes'] && this.t('chat.lastMinutes', { n: inp['sinceMinutes'] as number }),
      inp['days'] && this.t('chat.days', { n: inp['days'] as number }), inp['hours'] && this.t('chat.hours', { n: inp['hours'] as number }),
    ].filter(Boolean);
    return `${name}${bits.length ? ': ' + bits.join(', ') : ''}`;
  }

  html(src: string) {
    let h = this.mdCache.get(src);
    if (!h) this.mdCache.set(src, (h = md(src)));
    return h;
  }

  private push(m: Msg) {
    this.history.update((h) => [...h, m]);
    session.set(this.history());
    setTimeout(() => {
      const el = this.msgsEl()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  clear() {
    this.history.set([]);
    session.set([]);
    this.inputEl().nativeElement.focus();
  }

  private go(n: NavRequest) {
    this.push({ role: 'assistant', content: `${this.nav.go(n)}.`, nav: true });
    if (n.section !== 'motor') this.nav.highlight(n.chargerId);
  }

  async send(text: string) {
    text = text.trim();
    if (!text || this.busy()) return;
    this.open.set(true);
    this.inputEl().nativeElement.value = '';
    this.push({ role: 'user', content: text });

    const nav = parseNav(text);
    if (nav) return this.go(nav);

    this.busy.set(true);
    try {
      const data = await this.api.post<{ reply: string; steps: Step[]; navigate?: NavRequest }>('/assistant/messages', {
        language: this.i18n.lang(),
        messages: this.history()
          .filter((m) => !m.error && !m.nav)
          .map((m) => ({ role: m.role, content: m.content })),
      });
      this.push({ role: 'assistant', content: data.reply || '–', steps: data.steps });
      if (data.navigate) this.go(data.navigate);
    } catch (e) {
      const msg = this.t((e as Error).message);
      this.push({ role: 'assistant', error: true, content: this.configured() === false ? `${msg} ${this.t('chat.navStillWorks')}` : msg });
    } finally {
      this.busy.set(false);
      this.inputEl().nativeElement.focus();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.inputEl().nativeElement.focus();
      this.inputEl().nativeElement.select();
    }
    if (e.key === 'Escape' && this.open() && !document.querySelector('dialog[open]')) {
      this.open.set(false);
      this.inputEl().nativeElement.blur();
    }
  }

  @HostListener('document:mousedown', ['$event'])
  onDown(e: MouseEvent) {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.open.set(false);
  }
}
