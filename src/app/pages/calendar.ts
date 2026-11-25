import { Component, HostListener, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api.service';
import { Fleet } from '../core/fleet.service';
import { Live } from '../core/live.service';
import { Ui } from '../core/ui.service';
import { I18n } from '../i18n/i18n.service';
import { Plan, SessionRow } from '../core/types';
import { fmtDateTime, fmtDay, fmtDur, fmtTime, num, vehicleColor } from '../core/fmt';

type View = 'month' | 'week' | 'day';
const DAY = 86400000;
const PENDING = new Set(['scheduled', 'starting']);

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const startOfWeek = (d: Date) => addDays(startOfDay(d), -((startOfDay(d).getDay() + 6) % 7)); // Monday first
const isLive = (s: SessionRow) => !!s.live || s.stopped_at == null;
const endOf = (s: SessionRow) => (isLive(s) ? Date.now() : s.stopped_at!);
/** Drawn end of a plan: departure, or a symbolic hour when it has none. */
const planEnd = (p: Plan) => p.departure_at || p.start_at + 3600000;
function overlap(s: SessionRow, a: number, b: number) {
  const st = s.started_at;
  const en = Math.max(endOf(s), st + 1);
  const o = Math.min(en, b) - Math.max(st, a);
  return o > 0 ? o / (en - st) : 0;
}

interface Bar {
  key: string;
  left: number;
  width: number;
  color: string;
  label: string;
  sub: string;
  tip: string;
  live?: boolean;
  plan?: Plan;
  session?: SessionRow;
}

@Component({
  selector: 'app-calendar',
  imports: [FormsModule],
  template: `
  <div class="page">
    <section class="panel cal-toolbar">
      <div class="seg" role="tablist">
        @for (v of views; track v) { <button type="button" [class.on]="view() === v" (click)="setView(v)">{{ t('cal.' + v) }}</button> }
      </div>
      <div class="row">
        <button type="button" class="sm" (click)="move(-1)" [attr.aria-label]="t('cal.prev')">‹</button>
        <button type="button" class="sm" (click)="move(0)">{{ t('cal.today') }}</button>
        <button type="button" class="sm" (click)="move(1)" [attr.aria-label]="t('cal.next')">›</button>
      </div>
      <h2 class="cal-title">{{ title() }}</h2>
      <label>{{ t('col.vehicle') }}
        <select [ngModel]="fVehicle()" (ngModelChange)="fVehicle.set($event)">
          <option value="">{{ t('common.all') }}</option><option value="none">{{ t('cal.unidentified') }}</option>
          @for (v of fleet.vehicles(); track v.id) { <option [value]="'' + v.id">{{ v.name }}</option> }
        </select></label>
      <label>{{ t('col.charger') }}
        <select [ngModel]="fCharger()" (ngModelChange)="fCharger.set($event)">
          <option value="">{{ t('common.all') }}</option>
          @for (id of chargerIds(); track id) { <option [value]="id">{{ id }}</option> }
        </select></label>
    </section>

    <section class="readings">
      <div><p class="v"><span class="read">{{ summary().n }}</span></p><p class="l">{{ t('cal.sessions') }}</p></div>
      <div><p class="v"><span class="read">{{ num(summary().kwh, 1) }}</span><span class="unit">kWh</span></p><p class="l">{{ t('energy.delivered') }}</p></div>
      <div><p class="v"><span class="read">{{ summary().vehicles }}</span></p><p class="l">{{ t('cal.vehicles') }}</p></div>
      <div><p class="v"><span class="read">{{ summary().live }}</span></p><p class="l">{{ t('cal.live') }}</p></div>
      <div><p class="v"><span class="read">{{ summary().planned }}</span></p><p class="l">{{ t('cal.planned') }}</p></div>
    </section>

    @if (view() === 'month') {
      <section class="panel">
        <div class="cal-month-head">@for (d of weekDays(); track d) { <div>{{ d }}</div> }</div>
        <div class="cal-month">
          @for (d of monthDays(); track d.t) {
            <button type="button" class="cal-day" [class.other]="d.other" [class.today]="d.today" [style.--int]="d.intensity" (click)="openDay(d.t)" [title]="d.full">
              <span class="d-n">{{ d.n }}</span>
              @if (d.count) { <span class="d-e num">{{ num(d.kwh, 1) }} kWh</span><span class="d-s">{{ i18n.tn('cal.nSessions', d.count) }}</span> }
              @if (d.planned) { <span class="d-p">{{ i18n.tn('cal.nPlanned', d.planned) }}</span> }
              @if (d.live) { <span class="d-live" [title]="t('cal.liveCharge')"></span> }
            </button>
          }
        </div>
      </section>
    } @else {
      <section class="panel">
        <div class="gantt-scroll">
          <div class="gantt" [class.week]="view() === 'week'">
            <div class="g-row head"><div class="g-label">{{ t('cal.chargerConnector') }}</div>
              <div class="g-track">
                @for (k of ticks(); track k.t) { <div class="g-tick" [class.major]="k.major" [style.left.%]="k.pct"></div>
                  @if (k.label) { <div class="g-tick-label" [style.left.%]="k.pct">{{ k.label }}</div> } }
                @if (nowPct() != null) { <div class="g-now" [style.left.%]="nowPct()"></div> }
              </div></div>
            @for (row of gantt(); track row.key) {
              <div class="g-row"><div class="g-label"><b>{{ row.charger }}</b><span>{{ t('yard.connector', { n: row.connector }) }}</span></div>
                <div class="g-track">
                  @for (k of ticks(); track k.t) { <div class="g-tick" [class.major]="k.major" [style.left.%]="k.pct"></div> }
                  @if (nowPct() != null) { <div class="g-now" [style.left.%]="nowPct()"></div> }
                  @for (b of row.bars; track b.key) {
                    <button type="button" class="g-bar" [class.live]="b.live" [class.plan]="b.plan" [style.left.%]="b.left" [style.width.%]="b.width"
                      [style.--c]="b.color" [title]="b.tip" (click)="b.plan ? openPlan(b.plan) : openSession(b.session!)">{{ b.label }}<small>{{ b.sub }}</small></button>
                  }
                </div></div>
            } @empty { <p class="empty">{{ t('cal.empty') }}</p> }
          </div>
        </div>
      </section>
    }

    @if (detail(); as d) {
      <div class="cal-backdrop" (click)="detail.set(null)"></div>
      <aside class="panel cal-detail" aria-live="polite">
        <div class="panel-head"><h2>{{ d.title }}</h2><button class="sm ghost" (click)="detail.set(null)">{{ t('common.close') }}</button></div>
        <dl class="dl">
          @for (row of d.rows; track row[0]) { <dt>{{ row[0] }}</dt><dd>{{ row[1] }}</dd> }
        </dl>
        @if (d.session) {
          @if (samplesSvg(); as svg) {
            <svg class="mini-chart" viewBox="0 0 400 180" preserveAspectRatio="none" role="img" [attr.aria-label]="t('cal.chartAria')">
              @for (g of svg.grid; track g.y) { <line [attr.x1]="34" [attr.x2]="370" [attr.y1]="g.y" [attr.y2]="g.y" class="grid" /><text x="2" [attr.y]="g.y + 3">{{ g.label }}</text> }
              <path [attr.d]="svg.power" class="p" /><path [attr.d]="svg.alloc" class="a" /><path [attr.d]="svg.soc" class="s" />
              <text x="34" y="176">{{ svg.t0 }}</text><text x="370" y="176" text-anchor="end">{{ svg.t1 }}</text>
            </svg>
            <div class="legend"><span><i style="background: var(--carga)"></i>{{ t('cal.measuredKw') }}</span><span><i class="dash" style="color: var(--consigna)"></i>{{ t('cal.allocatedKw') }}</span><span><i style="background: var(--limite)"></i>SoC (%)</span></div>
          } @else { <p class="note">{{ t('cal.noSamples') }}</p> }
          <p><a [href]="'/api/v1/exports/meter-samples.csv?transactionId=' + d.session.transaction_id">{{ t('cal.downloadSamples') }}</a></p>
        }
        @if (d.plan) {
          <p class="note">{{ t('cal.planNote') }}</p>
          <button class="sm danger" (click)="cancelPlan(d.plan)">{{ t('cal.cancelPlan') }}</button>
        }
      </aside>
    }
  </div>
  `,
})
export class Calendar implements OnDestroy {
  private api = inject(Api);
  private ui = inject(Ui);
  private live = inject(Live);
  protected fleet = inject(Fleet);
  protected i18n = inject(I18n);
  protected t = this.i18n.t;
  protected num = num;
  protected views: View[] = ['month', 'week', 'day'];

  view = signal<View>('month');
  cursor = signal(startOfDay(new Date()));
  sessions = signal<SessionRow[]>([]);
  plans = signal<Plan[]>([]);
  fVehicle = signal('');
  fCharger = signal('');
  detail = signal<{ title: string; rows: [string, string][]; session?: SessionRow; plan?: Plan } | null>(null);
  samples = signal<{ t: number; power_w: number | null; allocated_w: number | null; soc: number | null }[]>([]);
  private liveSig = '';
  private timer = setInterval(() => {
    if (this.sessions().some(isLive)) this.load();
  }, 5000);

  constructor() {
    this.fleet.load();
    this.load();
    // Reload when a charge starts or ends, or a plan changes (from the live snapshot)
    effect(() => {
      const s = this.live.snapshot();
      if (!s) return;
      const ids = s.chargers.flatMap((c) => c.connectors.filter((k) => k.transactionId).map((k) => k.transactionId)).sort();
      const sig = ids.join(',') + '|' + s.plans.map((p) => `${p.id}:${p.status}`).join(',');
      if (this.liveSig && sig !== this.liveSig) this.load();
      this.liveSig = sig;
    });
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  @HostListener('document:keydown.escape')
  esc() {
    this.detail.set(null);
  }

  range = computed(() => {
    const c = this.cursor();
    if (this.view() === 'day') return { from: startOfDay(c), to: addDays(startOfDay(c), 1) };
    if (this.view() === 'week') return { from: startOfWeek(c), to: addDays(startOfWeek(c), 7) };
    const from = startOfWeek(new Date(c.getFullYear(), c.getMonth(), 1));
    return { from, to: addDays(from, 42) };
  });

  async load() {
    const { from, to } = this.range();
    try {
      const [rows, plans] = await Promise.all([
        this.api.get<SessionRow[]>('/sessions', { from: +from, to: +to }),
        this.api.get<Plan[]>('/charging-plans', { from: +from, to: +to }).catch(() => []),
      ]);
      this.sessions.set(rows);
      // Active/completed plans already appear as sessions; only plans not started yet are drawn
      this.plans.set(plans.filter((p) => PENDING.has(p.status) && p.start_at < +to && planEnd(p) >= +from));
    } catch (e) {
      this.ui.toast((e as Error).message, true);
    }
  }

  setView(v: View) {
    this.view.set(v);
    this.load();
  }
  move(dir: number) {
    const c = this.cursor();
    if (dir === 0) this.cursor.set(startOfDay(new Date()));
    else if (this.view() === 'month') this.cursor.set(new Date(c.getFullYear(), c.getMonth() + dir, 1));
    else this.cursor.set(addDays(c, dir * (this.view() === 'week' ? 7 : 1)));
    this.load();
  }
  openDay(t: number) {
    this.cursor.set(new Date(t));
    this.setView('day');
  }

  private filter<T extends { charger_id: string; vehicle_id: number | null }>(list: T[]) {
    const fc = this.fCharger();
    const fv = this.fVehicle();
    return list.filter((s) => (!fc || s.charger_id === fc) && (fv === 'none' ? s.vehicle_id == null : !fv || String(s.vehicle_id) === fv));
  }
  rows = computed(() => this.filter(this.sessions()));
  planRows = computed(() => this.filter(this.plans()));
  chargerIds = computed(() => {
    const ids = new Set([...this.sessions(), ...this.plans()].map((s) => s.charger_id));
    if (this.fCharger()) ids.add(this.fCharger());
    return [...ids].sort();
  });

  title = computed(() => {
    this.i18n.lang();
    const { from } = this.range();
    const c = this.cursor();
    let s: string;
    if (this.view() === 'month') s = fmtDay(c, { month: 'long', year: 'numeric' });
    else if (this.view() === 'week')
      s = `${fmtDay(from, { day: 'numeric', month: 'short' })} – ${fmtDay(addDays(from, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`;
    else s = fmtDay(c, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  });

  summary = computed(() => {
    // In the month view only the month itself counts (not the padding days of the grid)
    let { from, to } = this.range();
    if (this.view() === 'month') {
      const c = this.cursor();
      from = new Date(c.getFullYear(), c.getMonth(), 1);
      to = new Date(c.getFullYear(), c.getMonth() + 1, 1);
    }
    let n = 0;
    let wh = 0;
    let liveN = 0;
    const veh = new Set<number>();
    for (const s of this.rows()) {
      const f = overlap(s, +from, +to);
      if (f <= 0) continue;
      n++;
      wh += (s.energy_wh || 0) * f;
      if (isLive(s)) liveN++;
      if (s.vehicle_id != null) veh.add(s.vehicle_id);
    }
    const planned = this.planRows().filter((p) => p.start_at >= +from && p.start_at < +to).length;
    return { n, kwh: wh / 1000, live: liveN, vehicles: veh.size, planned };
  });

  weekDays = computed(() => {
    this.i18n.lang();
    const f = this.range().from;
    return Array.from({ length: 7 }, (_, i) => fmtDay(addDays(f, i), { weekday: 'short' }));
  });

  monthDays = computed(() => {
    this.i18n.lang();
    const { from } = this.range();
    const month = this.cursor().getMonth();
    const today = +startOfDay(new Date());
    const days = Array.from({ length: 42 }, (_, i) => {
      const d = addDays(from, i);
      const a = +d;
      const b = +addDays(d, 1);
      let count = 0;
      let wh = 0;
      let liveDay = false;
      for (const s of this.rows()) {
        const f = overlap(s, a, b);
        if (f <= 0) continue;
        count++;
        wh += (s.energy_wh || 0) * f;
        if (isLive(s)) liveDay = true;
      }
      const planned = this.planRows().filter((p) => p.start_at >= a && p.start_at < b).length;
      return { t: a, n: d.getDate(), other: d.getMonth() !== month, today: a === today, count, kwh: wh / 1000, live: liveDay, planned, full: fmtDay(d, { dateStyle: 'full' }), intensity: 0 };
    });
    const max = Math.max(...days.map((d) => d.kwh), 0);
    for (const d of days) d.intensity = max > 0 && d.count ? Math.round(10 + (d.kwh / max) * 55) : 0;
    return days;
  });

  private span = computed(() => {
    const { from, to } = this.range();
    return { a: +from, b: +to };
  });
  private pct(t: number) {
    const { a, b } = this.span();
    return ((Math.min(Math.max(t, a), b) - a) / (b - a)) * 100;
  }
  nowPct = computed(() => {
    this.live.now();
    const { a, b } = this.span();
    const now = Date.now();
    return now >= a && now <= b ? this.pct(now) : null;
  });

  ticks = computed(() => {
    this.i18n.lang();
    const { a } = this.span();
    const out: { t: number; pct: number; major: boolean; label: string }[] = [];
    if (this.view() === 'day') {
      for (let h = 0; h <= 24; h++) {
        const t = a + h * 3600000;
        out.push({ t, pct: this.pct(t), major: h % 6 === 0, label: h < 24 && h % 2 === 0 ? `${String(h).padStart(2, '0')}:00` : '' });
      }
    } else {
      for (let d = 0; d <= 7; d++)
        for (let h = 0; h < 24; h += 6) {
          if (d === 7 && h > 0) break;
          const t = +addDays(new Date(a), d) + h * 3600000;
          out.push({ t, pct: this.pct(t), major: h === 0, label: d < 7 ? (h === 0 ? fmtDay(t, { weekday: 'short', day: 'numeric' }) : `${h}h`) : '' });
        }
    }
    return out;
  });

  gantt = computed(() => {
    if (this.view() === 'month') return [];
    this.live.now();
    const { a, b } = this.span();
    const groups = new Map<string, Bar[]>();
    const add = (key: string, bar: Bar) => (groups.get(key) ?? groups.set(key, []).get(key)!).push(bar);
    for (const s of this.rows()) {
      if (overlap(s, a, b) <= 0) continue;
      const l = this.pct(s.started_at);
      const liveS = isLive(s);
      const name = s.vehicle_name || this.t('cal.unidentified');
      const kwh = num((s.energy_wh || 0) / 1000, 2);
      add(`${s.charger_id}#${s.connector_id}`, {
        key: `s${s.transaction_id}`, left: l, width: Math.max(this.pct(endOf(s)) - l, 0.15), color: vehicleColor(s.vehicle_id), live: liveS, session: s,
        label: name, sub: `${kwh} kWh${liveS ? ', ' + this.t('cal.liveShort') : ''}`,
        tip: `${name}, ${fmtTime(s.started_at)}–${liveS ? this.t('cal.now') : fmtTime(s.stopped_at!)}, ${kwh} kWh`,
      });
    }
    for (const p of this.planRows()) {
      if (p.start_at >= b || planEnd(p) < a) continue;
      const l = this.pct(p.start_at);
      const name = p.vehicle_name || p.id_tag;
      add(`${p.charger_id}#${p.connector_id}`, {
        key: `p${p.id}`, left: l, width: Math.max(this.pct(planEnd(p)) - l, 0.4), color: vehicleColor(p.vehicle_id), plan: p,
        label: name, sub: this.t(p.status === 'starting' ? 'plan.starting' : 'plan.scheduled'),
        tip: `${this.t('cal.planN', { id: p.id })}, ${name}, ${fmtTime(p.start_at)}${p.departure_at ? '–' + fmtTime(p.departure_at) : ''}`,
      });
    }
    return [...groups.keys()]
      .sort((x, y) => x.localeCompare(y, undefined, { numeric: true }))
      .map((key) => {
        const i = key.lastIndexOf('#');
        return { key, charger: key.slice(0, i), connector: key.slice(i + 1), bars: groups.get(key)! };
      });
  });

  async openSession(s: SessionRow) {
    const v = this.fleet.byId(s.vehicle_id);
    const soc = (x: number | null) => (x == null ? '–' : `${Math.round(x)} %`);
    const liveS = isLive(s);
    const rows: [string, string][] = [
      [this.t('col.vehicle'), s.vehicle_name || this.t('cal.unidentified')],
      ['VIN', s.vehicle_vin || v?.vin || '–'],
      ['EVCCID', s.vehicle_evccid || v?.evccid || '–'],
      [this.t('cal.identification'), this.t('ident.' + (s.ident_method || 'none'))],
      ['idTag', s.id_tag || '–'],
      [this.t('col.charger'), `${s.charger_id}, ${this.t('yard.connector', { n: s.connector_id })}`],
      [this.t('col.start'), fmtDateTime(s.started_at)],
      [this.t('cal.end'), liveS ? this.t('cal.ongoing') : fmtDateTime(s.stopped_at)],
      [this.t('col.duration'), fmtDur(endOf(s) - s.started_at)],
      [this.t('motor.energy'), `${num((s.energy_wh || 0) / 1000, 2)} kWh`],
      ['SoC', `${soc(s.soc_start)} – ${soc(s.soc_end)}`],
      liveS
        ? [this.t('motor.power'), `${num((s.power_w || 0) / 1000, 1)} kW (${this.t('cal.allocatedKw')}: ${num((s.allocated_w || 0) / 1000, 1)})`]
        : [this.t('cal.maxPower'), s.max_power_w != null ? `${num(s.max_power_w / 1000, 1)} kW` : '–'],
      [this.t('cal.stopReason'), s.stop_reason || '–'],
    ];
    this.samples.set([]);
    this.detail.set({ title: `${this.t('cal.sessionN', { id: s.transaction_id })}${liveS ? ', ' + this.t('cal.liveShort') : ''}`, rows, session: s });
    try {
      this.samples.set(await this.api.get(`/sessions/${s.transaction_id}/samples`));
    } catch {
      /* no samples */
    }
  }

  openPlan(p: Plan) {
    const v = this.fleet.byId(p.vehicle_id);
    this.detail.set({
      title: `${this.t('cal.planN', { id: p.id })}, ${this.t('plan.' + p.status)}`,
      plan: p,
      rows: [
        [this.t('col.vehicle'), p.vehicle_name || this.t('start.manualTag')],
        ['VIN', v?.vin || '–'],
        ['idTag', p.id_tag],
        [this.t('col.charger'), `${p.charger_id}, ${this.t('yard.connector', { n: p.connector_id })}`],
        [this.t('col.start'), fmtDateTime(p.start_at)],
        [this.t('col.departure'), p.departure_at ? fmtDateTime(p.departure_at) : '–'],
        [this.t('cal.window'), p.departure_at ? fmtDur(p.departure_at - p.start_at) : '–'],
        [this.t('col.target'), p.target_soc != null ? `${p.target_soc} %` : v ? `${v.target_soc} % (${this.t('ops.fromVehicle')})` : '–'],
        [this.t('col.limit'), p.max_kw ? `${p.max_kw} kW` : '–'],
        [this.t('cal.created'), fmtDateTime(p.created_at)],
      ],
    });
  }

  async cancelPlan(p: Plan) {
    if (!confirm(this.t('ops.confirmCancelPlan', { id: p.id }))) return;
    await this.ui.run(() => this.api.del(`/charging-plans/${p.id}`), 'ops.planCancelled');
    this.detail.set(null);
    this.load();
  }

  samplesSvg = computed(() => {
    const S = this.samples();
    if (S.length < 2) return null;
    const W = 400;
    const H = 180;
    const p = { l: 34, r: 30, t: 10, b: 20 };
    const t0 = S[0].t;
    const t1 = S[S.length - 1].t;
    const maxP = Math.max(1, ...S.map((s) => Math.max(s.power_w || 0, s.allocated_w || 0))) * 1.1;
    const x = (t: number) => p.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - p.l - p.r);
    const yP = (v: number) => H - p.b - (v / maxP) * (H - p.t - p.b);
    const yS = (v: number) => H - p.b - (v / 100) * (H - p.t - p.b);
    const path = (fn: (v: number) => number, key: 'power_w' | 'allocated_w' | 'soc') =>
      S.filter((s) => s[key] != null).map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)},${fn(s[key]!).toFixed(1)}`).join(' ');
    return {
      grid: [0, 0.5, 1].map((f) => ({ y: yP(maxP * f), label: `${num((maxP * f) / 1000)} kW` })),
      power: path(yP, 'power_w'),
      alloc: path(yP, 'allocated_w'),
      soc: path(yS, 'soc'),
      t0: fmtTime(t0),
      t1: fmtTime(t1),
    };
  });
}
