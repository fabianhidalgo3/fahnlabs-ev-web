import { Component, ElementRef, HostListener, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Api } from '../core/api.service';
import { Fleet } from '../core/fleet.service';
import { Live } from '../core/live.service';
import { Nav } from '../core/nav.service';
import { Ui } from '../core/ui.service';
import { I18n } from '../i18n/i18n.service';
import { ChargerLive, Config, Connector } from '../core/types';
import { fmtDate, fmtDur, fmtTime, kw, num } from '../core/fmt';
import { drawChart, sparkPoints } from '../shared/charts';

const CONFIG_KEYS = ['siteLimitKw', 'buildingLoadKw', 'buildingLoadMode', 'strategy', 'minPowerKw', 'safetyMarginKw', 'chargingRateUnit', 'voltage', 'phases'] as const;

@Component({
  selector: 'app-operations',
  imports: [FormsModule],
  template: `
  @if (s(); as s) {
  <div class="page">
    <!-- Yard busbar: the one memorable element — the contracted limit as a hazard band -->
    <section class="panel busbar" [class.over]="siteW() > limitW()">
      <div class="bus-head">
        <div>
          <p class="bus-reading"><span class="read">{{ kw(siteW()) }}</span><span class="unit">{{ t('ops.ofLimit', { limit: kw(limitW()) }) }}</span></p>
          <p class="muted">{{ t('ops.busCaption') }}</p>
        </div>
        <p class="bus-status">{{ busStatus() }}</p>
      </div>
      <div class="bus" role="img" [attr.aria-label]="t('ops.busAria', { site: kw(siteW()), limit: kw(limitW()) })">
        <div class="bus-aux" [style.width.%]="pct(s.buildingLoadW)"></div>
        <div class="bus-ev" [style.left.%]="pct(s.buildingLoadW)" [style.width.%]="pct(s.totalPowerW)"></div>
        <div class="bus-alloc" [style.left.%]="pct(s.buildingLoadW + s.totalAllocatedW)" [title]="t('ops.allocatedMarker')"></div>
        <div class="bus-margin" [style.left.%]="pct(limitW() - marginW())" [style.width.%]="pct(marginW())"></div>
        <div class="bus-limit" [style.left.%]="pct(limitW())"></div>
      </div>
      <div class="bus-scale"><span>0</span><span [style.left.%]="pct(limitW())">{{ kw(limitW(), 0) }} kW</span></div>
      <div class="legend">
        <span><i style="background: var(--aux)"></i>{{ t('legend.aux') }}</span>
        <span><i style="background: var(--carga)"></i>{{ t('legend.evMeasured') }}</span>
        <span><i style="background: var(--consigna)"></i>{{ t('legend.allocated') }}</span>
        <span><i class="hazard"></i>{{ t('legend.limit') }}</span>
      </div>
    </section>

    <section class="readings">
      <div><p class="v"><span class="read">{{ kw(s.buildingLoadW) }}</span><span class="unit">kW</span></p><p class="l">{{ t('ops.aux') }}</p></div>
      <div><p class="v"><span class="read">{{ kw(s.availableW) }}</span><span class="unit">kW</span></p><p class="l">{{ t('ops.available') }}</p>
        <p class="s">{{ t('ops.marginNote', { margin: num(s.config.safetyMarginKw, 1) }) }}</p></div>
      <div><p class="v"><span class="read">{{ kw(s.totalPowerW) }}</span><span class="unit">/ {{ kw(s.totalAllocatedW) }} kW</span></p><p class="l">{{ t('ops.measuredAllocated') }}</p></div>
      <div><p class="v"><span class="read">{{ s.activeSessions }}</span><span class="unit">{{ t('ops.sessionsUnit') }}</span></p>
        <p class="l">{{ t('ops.chargersOnline', { on: online(), total: s.chargers.length }) }}</p></div>
      <div><p class="v"><span class="read small-read">{{ t('strategy.' + s.config.strategy) }}</span></p><p class="l">{{ t('ops.strategy') }}</p></div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>{{ t('ops.chartTitle') }}</h2><span class="note">{{ t('ops.chartNote') }}</span></div>
      <canvas #chart class="chart"></canvas>
      <div class="legend">
        <span><i style="background: var(--aux)"></i>{{ t('legend.aux') }}</span>
        <span><i style="background: var(--carga)"></i>{{ t('legend.evMeasured') }}</span>
        <span><i class="dash" style="color: var(--consigna)"></i>{{ t('legend.allocated') }}</span>
        <span><i class="hazard"></i>{{ t('legend.limit') }}</span>
      </div>
    </section>

    <!-- Circuit board: one row per connector, like breakers in a panel -->
    <section class="panel board">
      <div class="panel-head"><h2>{{ t('ops.boardTitle') }}</h2><span class="note">{{ t('ops.boardNote') }}</span></div>
      @for (ch of onlineChargers(); track ch.id) {
        <div class="circuit" [attr.data-hl]="ch.id">
          <div class="circuit-head">
            <span class="lamp" [class.on]="ch.connected">{{ ch.id }}</span>
            <span class="muted small">{{ model(ch) }}</span>
            @if (ch.location) { <span class="muted small">{{ ch.location }}</span> }
            <span class="muted small">{{ t('ops.maxKw', { kw: num(ch.maxPowerKw, 1) }) }}</span>
            <span class="spacer"></span>
            <button class="sm" (click)="fleet.openStart(ch.id, 1)">{{ t('ops.startOrSchedule') }}</button>
            <button class="sm" [disabled]="!ch.connected || ui.busy('reset:' + ch.id)" (click)="reset(ch)">{{ t('ops.reset') }}</button>
          </div>
          @for (c of ch.connectors; track c.connectorId) {
            <div class="breaker" [class.active]="c.transactionId" [class.charging]="c.powerW > 50" [attr.data-hl]="ch.id + '#' + c.connectorId">
              <div class="b-id"><span class="lamp" [class.charge]="c.powerW > 50" [class.bad]="c.status === 'Faulted'" [class.warn]="c.transactionId && c.powerW <= 50">{{ c.connectorId }}</span>
                <span class="small">{{ t('status.' + c.status) }}</span></div>
              <div class="b-veh">
                @if (c.vehicle) {
                  <b>{{ c.vehicle.name }}</b> <span class="tag">{{ t('ident.' + (c.identMethod || 'none')) }}</span>
                } @else if (c.transactionId) {
                  <span class="muted">{{ t('ops.unidentified') }}</span> <span class="tag">{{ t('ident.' + (c.identMethod || 'none')) }}</span>
                } @else if (c.errorCode !== 'NoError') {
                  <span class="tag bad">{{ c.errorCode }}</span>
                }
                @if (c.plan) { <span class="small muted">{{ planText(c) }}</span> }
                @if (c.pendingPlanId) { <span class="small muted">{{ t('ops.planStarting', { id: c.pendingPlanId }) }}</span> }
              </div>
              <div class="b-bar" [title]="t('ops.barTitle')">
                <div class="b-fill" [style.width.%]="cpct(ch, c.powerW)"></div>
                @if (c.transactionId) { <div class="b-alloc" [style.left.%]="cpct(ch, c.allocatedW)"></div> }
                @if (c.transactionId && spark(ch, c); as pts) {
                  <svg class="b-spark" viewBox="0 0 160 30" preserveAspectRatio="none" aria-hidden="true"><polyline [attr.points]="pts" /></svg>
                }
              </div>
              <div class="b-num num">
                @if (c.transactionId) {
                  <b>{{ kw(c.powerW) }}</b> / {{ kw(c.allocatedW) }} kW
                  @if (c.demandLimited) { <span class="small muted" [title]="t('ops.demandLimitedHint')">{{ t('ops.demandLimited') }}</span> }
                } @else { <span class="muted">–</span> }
              </div>
              <div class="b-meta small num">
                @if (c.transactionId) {
                  <span>{{ c.soc != null ? num(c.soc) + ' %' : '' }}</span>
                  <span>{{ num(c.energyWh / 1000, 2) }} kWh</span>
                  <span>{{ dur(c) }}</span>
                }
              </div>
              <div class="b-act">
                @if (c.transactionId) {
                  <button class="sm danger" [disabled]="!ch.connected || ui.busy('stop:' + ch.id + '#' + c.connectorId)" (click)="stop(ch, c)">{{ t('ops.stop') }}</button>
                } @else {
                  <button class="sm" [disabled]="c.status === 'Faulted'" (click)="fleet.openStart(ch.id, c.connectorId)">{{ t('ops.start') }}</button>
                }
              </div>
            </div>
          } @empty {
            <p class="note">{{ t('ops.waitingStatus') }}</p>
          }
        </div>
      } @empty {
        <p class="empty">{{ t('ops.noChargers', { url: ocppUrl() }) }}</p>
      }
      @if (offlineChargers().length) {
        <details class="offline-list">
          <summary>{{ t('ops.offlineChargers', { n: offlineChargers().length }) }}</summary>
          @for (ch of offlineChargers(); track ch.id) {
            <div class="offline-row" [attr.data-hl]="ch.id">
              <span class="lamp">{{ ch.id }}</span>
              <span class="small muted">{{ model(ch) }}</span>
              <span class="small muted">{{ t('ops.lastSeen', { when: fmtDate(ch.lastSeen) }) }}</span>
              <span class="spacer"></span>
              <button class="sm" (click)="fleet.openStart(ch.id, 1)">{{ t('ops.schedule') }}</button>
            </div>
          }
        </details>
      }
    </section>

    <div class="cols">
      <section class="panel">
        <h2>{{ t('ops.configTitle') }}</h2>
        <form class="form" (ngSubmit)="saveConfig()" (focusin)="editing.set(true)">
          <label>{{ t('cfg.siteLimitKw') }}<input name="siteLimitKw" type="number" step="0.1" min="0" [(ngModel)]="cfg.siteLimitKw" /></label>
          <label>{{ t('cfg.buildingLoadKw') }}<input name="buildingLoadKw" type="number" step="0.1" min="0" [(ngModel)]="cfg.buildingLoadKw" /></label>
          <label>{{ t('cfg.buildingLoadMode') }}
            <select name="buildingLoadMode" [(ngModel)]="cfg.buildingLoadMode">
              <option value="fixed">{{ t('cfg.fixed') }}</option><option value="simulated">{{ t('cfg.simulated') }}</option>
            </select></label>
          <label>{{ t('cfg.strategy') }}
            <select name="strategy" [(ngModel)]="cfg.strategy">
              @for (k of strategies; track k) { <option [value]="k">{{ t('strategy.' + k) }}</option> }
            </select></label>
          <label>{{ t('cfg.minPowerKw') }}<input name="minPowerKw" type="number" step="0.1" min="0" [(ngModel)]="cfg.minPowerKw" /></label>
          <label [title]="t('cfg.marginHint')">{{ t('cfg.safetyMarginKw') }}<input name="safetyMarginKw" type="number" step="0.1" min="0" [(ngModel)]="cfg.safetyMarginKw" /></label>
          <label>{{ t('cfg.unit') }}
            <select name="chargingRateUnit" [(ngModel)]="cfg.chargingRateUnit"><option value="W">W</option><option value="A">A</option></select></label>
          <label>{{ t('cfg.voltage') }}<input name="voltage" type="number" min="100" [(ngModel)]="cfg.voltage" /></label>
          <label>{{ t('cfg.phases') }}<select name="phases" [(ngModel)]="cfg.phases"><option [ngValue]="1">1</option><option [ngValue]="3">3</option></select></label>
          <button class="primary" type="submit" [disabled]="ui.busy('config')">{{ t('common.apply') }}</button>
        </form>
      </section>
      <section class="panel">
        <h2>{{ t('ops.recentSessions') }}</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>{{ t('col.id') }}</th><th>{{ t('col.charger') }}</th><th>{{ t('col.vehicle') }}</th><th class="n">kWh</th><th class="n">{{ t('col.duration') }}</th></tr></thead>
            <tbody>
              @for (x of s.transactions; track x.transaction_id) {
                <tr><td class="num">{{ x.transaction_id }}</td><td>{{ x.charger_id }}/{{ x.connector_id }}</td>
                  <td>{{ x.vehicle_name || x.id_tag || '–' }}</td><td class="n">{{ num((x.energy_wh || 0) / 1000, 2) }}</td>
                  <td class="n">{{ fmtDur((x.stopped_at || now()) - x.started_at) }}</td></tr>
              } @empty { <tr><td colspan="5" class="muted">{{ t('ops.noFinished') }}</td></tr> }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <section class="panel">
      <h2>{{ t('ops.plansTitle') }}</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>{{ t('col.id') }}</th><th>{{ t('col.charger') }}</th><th>{{ t('col.vehicle') }}</th><th>{{ t('col.start') }}</th><th>{{ t('col.departure') }}</th>
            <th class="n">{{ t('col.target') }}</th><th class="n">{{ t('col.limit') }}</th><th>{{ t('col.status') }}</th><th></th></tr></thead>
          <tbody>
            @for (p of plans(); track p.id) {
              <tr>
                <td class="num">{{ p.id }}</td><td>{{ p.charger_id }}/{{ p.connector_id }}</td><td>{{ p.vehicle_name || p.id_tag }}</td>
                <td class="nowrap">{{ fmtDate(p.start_at) }}</td><td class="nowrap">{{ fmtDate(p.departure_at) }}</td>
                <td class="n">{{ p.target_soc != null ? p.target_soc + ' %' : t('ops.fromVehicle') }}</td><td class="n">{{ p.max_kw ? p.max_kw + ' kW' : '–' }}</td>
                <td><span class="lamp" [class.plan]="open(p.status)" [class.on]="p.status === 'completed'" [class.bad]="p.status === 'failed'" [title]="p.note || ''">{{ t('plan.' + p.status) }}</span>
                  @if (p.note && !open(p.status)) { <div class="small muted">{{ p.note }}</div> }</td>
                <td class="actions">@if (open(p.status)) { <button class="sm danger" [disabled]="ui.busy('plan:' + p.id)" (click)="cancelPlan(p.id)">{{ t('common.cancel') }}</button> }</td>
              </tr>
            } @empty { <tr><td colspan="9" class="muted">{{ t('ops.noPlans') }}</td></tr> }
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>{{ t('ops.eventLog') }}</h2>
        <label class="check"><input type="checkbox" [checked]="showOcpp()" (change)="showOcpp.set(!showOcpp())" /> {{ t('ops.showOcpp') }}</label></div>
      <div class="log" #log>
        @for (l of logLines(); track l.t + l.msg) {
          <div [class]="l.level"><span class="t">{{ fmtTime(l.t, true) }}</span>{{ l.chargerId ? '[' + l.chargerId + '] ' : '' }}{{ l.msg }}</div>
        }
      </div>
    </section>
  </div>
  } @else {
    <div class="page"><p class="empty">{{ t('common.connecting') }}</p></div>
  }
  `,
})
export class Operations {
  protected live = inject(Live);
  protected fleet = inject(Fleet);
  private api = inject(Api);
  protected ui = inject(Ui);
  private nav = inject(Nav);
  private i18n = inject(I18n);
  protected t = this.i18n.t;
  protected kw = kw;
  protected num = num;
  protected fmtDate = fmtDate;
  protected fmtDur = fmtDur;
  protected fmtTime = fmtTime;
  protected now = this.live.now;
  protected strategies = ['equal', 'priority', 'fifo', 'need'];

  private chartRef = viewChild<ElementRef<HTMLCanvasElement>>('chart');
  private logRef = viewChild<ElementRef<HTMLElement>>('log');

  s = this.live.snapshot;
  limitW = computed(() => (this.s()?.config.siteLimitKw ?? 0) * 1000);
  marginW = computed(() => (this.s()?.config.safetyMarginKw ?? 0) * 1000);
  siteW = computed(() => (this.s()?.buildingLoadW ?? 0) + (this.s()?.totalPowerW ?? 0));
  online = computed(() => this.s()?.chargers.filter((c) => c.connected).length ?? 0);
  onlineChargers = computed(() => this.s()?.chargers.filter((c) => c.connected) ?? []);
  offlineChargers = computed(() => this.s()?.chargers.filter((c) => !c.connected) ?? []);
  plans = computed(() => [...(this.s()?.plans ?? [])].sort((a, b) => b.start_at - a.start_at).slice(0, 25));
  showOcpp = signal(false);
  logLines = computed(() => (this.s()?.log ?? []).filter((l) => this.showOcpp() || l.level !== 'ocpp').slice(-120));
  ocppUrl = computed(() => this.nav.info()?.ocppUrl ?? 'ws://<host>:9100/ocpp/<id>');
  busStatus = computed(() => {
    const free = this.limitW() - this.siteW();
    return free >= 0 ? this.t('ops.headroom', { kw: kw(free) }) : this.t('ops.overLimit', { kw: kw(-free) });
  });

  /** Editable copy of the configuration (not overwritten while the form has focus). */
  cfg: Partial<Config> = {};
  editing = signal(false);

  constructor() {
    const route = inject(ActivatedRoute);
    route.queryParamMap.subscribe((q) => this.nav.highlight(q.get('highlight')));
    effect(() => {
      const s = this.s();
      if (!s || this.editing()) return;
      const c: Partial<Config> = {};
      for (const k of CONFIG_KEYS) (c as Record<string, unknown>)[k] = s.config[k];
      this.cfg = c;
    });
    effect(() => {
      const s = this.s();
      const cv = this.chartRef()?.nativeElement;
      this.i18n.lang(); // redraw labels on language change
      if (!s || !cv) return;
      const H = s.history;
      drawChart(cv, {
        xs: H.map((p) => p.t),
        unit: 'kW',
        limit: (H.at(-1)?.limitW ?? 0) / 1000,
        xLabel: (t) => fmtTime(t, true),
        series: [
          { values: H.map((p) => p.buildingW / 1000), color: '--aux', kind: 'area' },
          { values: H.map((p) => p.evW / 1000), base: H.map((p) => p.buildingW / 1000), color: '--carga', kind: 'area' },
          { values: H.map((p) => (p.buildingW + p.allocW) / 1000), color: '--consigna', kind: 'dash' },
        ],
      });
    });
    effect(() => {
      this.logLines();
      const el = this.logRef()?.nativeElement;
      if (!el) return;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      if (atBottom) queueMicrotask(() => (el.scrollTop = el.scrollHeight));
    });
  }

  @HostListener('window:resize')
  onResize() {
    this.live.snapshot.set(this.live.snapshot() ? { ...this.live.snapshot()! } : null);
  }

  /** Scale of the busbar: 115 % of the limit, so an excess is visible. */
  pct(w: number) {
    const max = Math.max(this.limitW() * 1.15, this.siteW(), 1);
    return Math.max(0, Math.min(100, (w / max) * 100));
  }
  cpct(ch: ChargerLive, w: number) {
    return Math.max(0, Math.min(100, (w / Math.max(ch.maxPowerKw * 1000, 1)) * 100));
  }
  spark(ch: ChargerLive, c: Connector) {
    this.live.seriesTick();
    const arr = this.live.series.get(`${ch.id}#${c.connectorId}`) ?? [];
    return sparkPoints(arr.map((x) => x.p), ch.maxPowerKw * 1000);
  }
  model(ch: ChargerLive) {
    return [ch.vendor, ch.model, ch.firmware && `fw ${ch.firmware}`].filter(Boolean).join(' ') || this.t('ops.noBoot');
  }
  dur(c: Connector) {
    return c.startedAt ? fmtDur(this.now() - c.startedAt) : '';
  }
  planText(c: Connector) {
    const p = c.plan!;
    return this.t('ops.planInfo', { id: p.id, departure: p.departureAt ? fmtDate(p.departureAt) : '–', target: p.targetSoc ?? '–' });
  }
  open(status: string) {
    return ['scheduled', 'starting', 'active'].includes(status);
  }

  async saveConfig() {
    const body: Record<string, unknown> = {};
    for (const k of CONFIG_KEYS) {
      const v = (this.cfg as Record<string, unknown>)[k];
      body[k] = typeof v === 'string' && !isNaN(Number(v)) && k !== 'strategy' && k !== 'buildingLoadMode' && k !== 'chargingRateUnit' ? Number(v) : v;
    }
    if (this.ui.busy('config')) return;
    await this.ui.run(() => this.api.put('/config', body), 'ops.configApplied', 'config');
    this.editing.set(false);
    (document.activeElement as HTMLElement | null)?.blur();
  }
  async stop(ch: ChargerLive, c: Connector) {
    await this.ui.run(
      () => this.api.post<{ status: string }>(`/chargers/${encodeURIComponent(ch.id)}/remote-stop`, { connectorId: c.connectorId }),
      (r) => this.t('ops.remoteStop', { status: r.status }),
      `stop:${ch.id}#${c.connectorId}`,
    );
  }
  async reset(ch: ChargerLive) {
    if (this.ui.busy('reset:' + ch.id) || !confirm(this.t('ops.confirmReset', { id: ch.id }))) return;
    await this.ui.run(
      () => this.api.post<{ status: string }>(`/chargers/${encodeURIComponent(ch.id)}/reset`, { type: 'Soft' }),
      (r) => this.t('ops.resetResult', { status: r.status }),
      'reset:' + ch.id,
    );
  }
  async cancelPlan(id: number) {
    if (this.ui.busy('plan:' + id) || !confirm(this.t('ops.confirmCancelPlan', { id }))) return;
    await this.ui.run(() => this.api.del(`/charging-plans/${id}`), 'ops.planCancelled', 'plan:' + id);
  }
}
