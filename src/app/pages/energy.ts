import { Component, ElementRef, HostListener, OnDestroy, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api.service';
import { Ui } from '../core/ui.service';
import { I18n } from '../i18n/i18n.service';
import { EnergyGroups, EnergyReport, Tariffs } from '../core/types';
import { clp, fmtDay, fmtTime, num } from '../core/fmt';
import { drawChart } from '../shared/charts';

const TARIFF_KEYS: (keyof Tariffs)[] = ['energyPriceClp', 'demandChargeClpKw', 'gridCo2KgKwh', 'evKmPerKwh', 'iceCo2KgKm', 'iceKmPerL', 'fuelPriceClpL'];

@Component({
  selector: 'app-energy',
  imports: [FormsModule],
  template: `
  <div class="page">
    <section class="panel filters">
      <label>{{ t('energy.period') }}
        <select [ngModel]="range()" (ngModelChange)="range.set(+$event); load()">
          <option [ngValue]="3600000">{{ t('range.1h') }}</option>
          <option [ngValue]="86400000">{{ t('range.24h') }}</option>
          <option [ngValue]="604800000">{{ t('range.7d') }}</option>
          <option [ngValue]="2592000000">{{ t('range.30d') }}</option>
        </select></label>
      <label>{{ t('energy.group') }}
        <select [ngModel]="group()" (ngModelChange)="group.set($event); load()">
          <option [ngValue]="liveGroups()">{{ t('energy.allLive') }}</option>
          @for (g of groups(); track g.group) { <option [ngValue]="g.group">{{ g.group }} ({{ t('energy.nSessions', { n: g.sessions }) }}{{ g.group === 'HIST' ? ', ' + t('energy.synthetic') : '' }})</option> }
        </select></label>
      <button class="sm" (click)="load()">{{ t('common.refresh') }}</button>
      <span class="note">{{ stamp() }}</span>
    </section>

    @if (r(); as r) {
      @if (!r.sessions) {
        <p class="lead">{{ t('energy.noSessions') }}</p>
      } @else {
        <p class="lead">{{ t('energy.lead', { period: periodText(r), kwh: num(r.energyKwh, 1), n: r.sessions, unc: num(r.demand.peakUncontrolledKw, 1), ctrl: num(r.demand.peakControlledKw, 1), limit: num(r.siteLimitKw, 1) }) }}</p>
      }

      <section class="compare">
        <div class="cmp-row">
          <p class="cmp-l">{{ t('energy.peakDemand') }}</p>
          <p class="cmp-v"><span class="muted">{{ t('energy.without') }}</span> <span class="read">{{ num(r.demand.peakUncontrolledKw, 1) }}</span><span class="unit">kW</span></p>
          <p class="cmp-v good"><span class="muted">{{ t('energy.with') }}</span> <span class="read">{{ num(r.demand.peakControlledKw, 1) }}</span><span class="unit">kW</span></p>
          <p class="cmp-d">{{ t('energy.avoided', { kw: num(r.demand.peakAvoidedKw, 1), pct: num(r.demand.peakReductionPct, 1) }) }}</p>
        </div>
        <div class="cmp-row">
          <p class="cmp-l">{{ t('energy.timeOverLimit') }}</p>
          <p class="cmp-v"><span class="muted">{{ t('energy.without') }}</span> <span class="read">{{ num(r.demand.overLimitUncontrolledPct, 1) }}</span><span class="unit">%</span></p>
          <p class="cmp-v" [class.good]="r.demand.overLimitControlledPct === 0" [class.bad]="r.demand.overLimitControlledPct > 0"><span class="muted">{{ t('energy.with') }}</span> <span class="read">{{ num(r.demand.overLimitControlledPct, 1) }}</span><span class="unit">%</span></p>
          <p class="cmp-d">{{ t('energy.windowsNote') }}</p>
        </div>
        <div class="cmp-row">
          <p class="cmp-l">{{ t('energy.loadFactor') }}</p>
          <p class="cmp-v"><span class="muted">{{ t('energy.without') }}</span> <span class="read">{{ num(r.efficiency.loadFactorUncontrolledPct) }}</span><span class="unit">%</span></p>
          <p class="cmp-v good"><span class="muted">{{ t('energy.with') }}</span> <span class="read">{{ num(r.efficiency.loadFactorControlledPct) }}</span><span class="unit">%</span></p>
          <p class="cmp-d">{{ t('energy.loadFactorNote') }}</p>
        </div>
      </section>

      <section class="readings">
        <div><p class="v"><span class="read">{{ clp(r.economics.demandChargeSavingsMonthClp) }}</span><span class="unit">{{ t('energy.perMonth') }}</span></p>
          <p class="l">{{ t('energy.demandSavings') }}</p><p class="s">{{ t('energy.demandSavingsNote', { kw: num(r.demand.peakAvoidedKw, 1), price: clp(r.assumptions.demandChargeClpKw) }) }}</p></div>
        <div><p class="v"><span class="read">{{ num(r.energyKwh, 1) }}</span><span class="unit">kWh</span></p>
          <p class="l">{{ t('energy.delivered') }}</p><p class="s">{{ clp(r.economics.energyCostClp) }}, {{ clp(r.economics.costPerKmClp) }}/km</p></div>
        <div><p class="v"><span class="read">{{ num(r.environment.co2AvoidedKg) }}</span><span class="unit">kg CO₂</span></p>
          <p class="l">{{ t('energy.co2') }}</p><p class="s">{{ t('energy.co2Note', { km: num(r.environment.electricKm) }) }}</p></div>
        <div><p class="v"><span class="read">{{ clp(r.economics.savingsVsFuelClp) }}</span></p>
          <p class="l">{{ t('energy.fuelSavings') }}</p><p class="s">{{ t('energy.fuelNote', { kmL: num(r.assumptions.iceKmPerL, 1) }) }}</p></div>
        <div><p class="v"><span class="read">{{ num(r.efficiency.contractedPowerUsePct) }}</span><span class="unit">%</span></p>
          <p class="l">{{ t('energy.contractedUse') }}</p></div>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>{{ t('energy.chartTitle') }}</h2><span class="note">{{ t('energy.chartNote') }}</span></div>
        <canvas #chart class="chart tall"></canvas>
        <div class="legend">
          <span><i style="background: var(--carga)"></i>{{ t('energy.legendWith') }}</span>
          <span><i class="dash" style="color: var(--muted)"></i>{{ t('energy.legendWithout') }}</span>
          <span><i style="background: var(--aux)"></i>{{ t('legend.aux') }}</span>
          <span><i class="hazard"></i>{{ t('legend.limit') }}</span>
        </div>
      </section>

      <div class="cols even">
        <section class="panel">
          <h2>{{ t('energy.costTitle') }}</h2>
          <div class="table-wrap"><table><tbody>
            <tr><th>{{ t('energy.shifted') }}</th><td class="n"><b>{{ num(r.efficiency.shiftedEnergyKwh, 1) }} kWh</b></td><td class="small muted">{{ t('energy.shiftedNote') }}</td></tr>
            <tr><th>{{ t('energy.extraMinutes') }}</th><td class="n"><b>{{ num(r.efficiency.extraMinutesPerSession) }} min</b></td><td class="small muted">{{ t('energy.extraNote') }}</td></tr>
            <tr><th>{{ t('energy.targetReached') }}</th><td class="n"><b>{{ r.efficiency.sessionsReachingTargetPct == null ? '–' : num(r.efficiency.sessionsReachingTargetPct, 1) + ' %' }}</b></td><td class="small muted">{{ t('energy.targetNote') }}</td></tr>
            <tr><th>{{ t('energy.evPeak') }}</th><td class="n nowrap"><b>{{ num(r.demand.peakEvUncontrolledKw, 1) }} / {{ num(r.demand.peakEvControlledKw, 1) }} kW</b></td><td class="small muted">{{ t('energy.evPeakNote') }}</td></tr>
          </tbody></table></div>
        </section>
        <section class="panel">
          <h2>{{ t('energy.tariffs') }}</h2>
          <form class="form" (ngSubmit)="save()" (focusin)="editing = true">
            @for (k of tariffKeys; track k) {
              <label>{{ t('tariff.' + k) }}<input [name]="k" type="number" min="0" step="any" [(ngModel)]="tariffs[k]" /></label>
            }
            <button class="primary" type="submit" [disabled]="ui.busy('tariffs')">{{ t('energy.saveRecalc') }}</button>
          </form>
        </section>
      </div>

      <section class="panel method">
        <h2>{{ t('energy.methodTitle') }}</h2>
        <p>{{ t('energy.method1') }}</p>
        <p class="note">{{ t('energy.method2') }}</p>
      </section>
    }
  </div>
  `,
})
export class Energy implements OnDestroy {
  private api = inject(Api);
  protected ui = inject(Ui);
  private i18n = inject(I18n);
  protected t = this.i18n.t;
  protected num = num;
  protected clp = clp;
  protected tariffKeys = TARIFF_KEYS;
  private chartRef = viewChild<ElementRef<HTMLCanvasElement>>('chart');

  range = signal(86400000);
  groups = signal<EnergyGroups['groups']>([]);
  liveGroups = signal('');
  group = signal('');
  r = signal<EnergyReport | null>(null);
  stamp = signal('');
  tariffs: Partial<Tariffs> = {};
  editing = false;
  private timer = setInterval(() => this.load(), 60000);

  constructor() {
    this.init();
    effect(() => {
      const r = this.r();
      const cv = this.chartRef()?.nativeElement;
      this.i18n.lang();
      if (!r || !cv) return;
      const S = r.series;
      const long = S.length > 1 && S.at(-1)!.t - S[0].t > 1.5 * 86400000;
      drawChart(cv, {
        xs: S.map((p) => p.t),
        unit: 'kW',
        limit: r.siteLimitKw,
        xLabel: (t) => (long ? fmtDay(t, { day: '2-digit', month: '2-digit' }) : fmtTime(t)),
        series: [
          { values: S.map((p) => p.auxKw), color: '--aux', kind: 'area', step: true },
          { values: S.map((p) => p.controlledKw), base: S.map((p) => p.auxKw), color: '--carga', kind: 'area', step: true },
          { values: S.map((p) => p.auxKw + p.uncontrolledKw), color: '--muted', kind: 'dash', step: true },
        ],
      });
    });
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  @HostListener('window:resize')
  onResize() {
    this.r.set(this.r() ? { ...this.r()! } : null);
  }

  private async init() {
    try {
      const g = await this.api.get<EnergyGroups>('/energy/groups');
      this.groups.set([...g.groups].sort((a, b) => b.lastSessionAt - a.lastSessionAt));
      // Default: every yard with real operation (HIST is synthetic history that did not go through the engine)
      const live = g.groups.filter((x) => x.group !== 'HIST').map((x) => x.group).join(',');
      this.liveGroups.set(live);
      this.group.set(live);
    } catch (e) {
      this.ui.toast((e as Error).message, true);
    }
    this.load();
  }

  async load() {
    const to = Date.now();
    try {
      const r = await this.api.get<EnergyReport>('/energy/report', { from: to - this.range(), to, groups: this.group() });
      this.r.set(r);
      if (!this.editing) this.tariffs = { ...r.assumptions };
      this.stamp.set(this.t('common.updatedAt', { time: fmtTime(Date.now(), true) }));
    } catch (e) {
      this.stamp.set((e as Error).message);
    }
  }

  periodText(r: EnergyReport) {
    return r.period.days < 1.05 ? this.t('energy.hours', { n: num(r.period.days * 24, 0) }) : this.t('energy.days', { n: num(r.period.days, 1) });
  }

  async save() {
    const energy: Record<string, number> = {};
    for (const k of TARIFF_KEYS) if (this.tariffs[k] != null) energy[k] = Number(this.tariffs[k]);
    if (this.ui.busy('tariffs')) return;
    await this.ui.run(() => this.api.put('/config', { energy }), 'energy.saved', 'tariffs');
    this.editing = false;
    (document.activeElement as HTMLElement | null)?.blur();
    this.load();
  }
}
