import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Fleet } from '../core/fleet.service';
import { Live } from '../core/live.service';
import { Nav } from '../core/nav.service';
import { I18n } from '../i18n/i18n.service';
import { ChargerLive, Connector } from '../core/types';
import { fmtTime, kw, num } from '../core/fmt';

// Generic car silhouette (own drawing), viewBox 0 0 200 80
const BODY = 'M10,58 L17,42 Q21,35 30,34 L60,32 Q71,18 90,16 L128,16 Q145,16 158,30 L178,34 Q191,37 192,48 L192,58 Q192,62 188,62 L12,62 Q10,62 10,58 Z';
let uid = 0;

interface Slot {
  key: string;
  ch: ChargerLive;
  c: Connector;
}

@Component({
  selector: 'app-yard',
  template: `
  <div class="page">
    <section class="readings">
      <div><p class="v"><span class="read">{{ active().length }}</span></p><p class="l">{{ t('yard.connected') }}</p></div>
      <div><p class="v"><span class="read">{{ kw(totalW()) }}</span><span class="unit">kW</span></p><p class="l">{{ t('yard.totalPower') }}</p></div>
      <div><p class="v"><span class="read">{{ avgSoc() ?? '–' }}</span><span class="unit">{{ avgSoc() != null ? '%' : '' }}</span></p><p class="l">{{ t('yard.avgSoc') }}</p></div>
      <div><p class="v"><span class="read">{{ slots().length - active().length }}</span></p><p class="l">{{ t('yard.free') }}</p></div>
    </section>

    <section class="yard-grid">
      @for (x of slots(); track x.key) {
        <article class="bay" [class.active]="x.c.transactionId" [class.charging]="x.c.powerW > 50" [attr.data-hl]="x.key">
          <header class="spread">
            <div>
              <b>{{ x.c.transactionId ? (x.c.vehicle?.name || t('ops.unidentified')) : t('yard.connector', { n: x.c.connectorId }) }}</b>
              <div class="small muted">{{ x.ch.id }}, {{ t('yard.connector', { n: x.c.connectorId }) }}{{ x.ch.location ? ', ' + x.ch.location : '' }}</div>
            </div>
            <span class="tag">{{ x.c.transactionId ? t('ident.' + (x.c.identMethod || 'none')) : t(x.ch.connected ? 'common.online' : 'common.offline') }}</span>
          </header>
          <div class="bay-car">
            <svg viewBox="0 0 200 80" aria-hidden="true">
              <defs><clipPath [attr.id]="clip"><path [attr.d]="body" /></clipPath></defs>
              <path [attr.d]="body" class="car-shell" />
              <g [attr.clip-path]="'url(#' + clip + ')'">
                <rect class="car-fill" [class.low]="(x.c.soc ?? 0) < 20" x="10" y="10" height="56" [attr.width]="x.c.transactionId ? 182 * clamp(x.c.soc) / 100 : 0" />
                @if (x.c.transactionId && target(x.c) != null) {
                  <rect class="car-target" [attr.x]="10 + 182 * target(x.c)! / 100 - 1" y="10" width="2" height="56" />
                }
              </g>
              <path [attr.d]="body" class="car-outline" />
              <circle cx="50" cy="62" r="11" class="car-wheel" /><circle cx="152" cy="62" r="11" class="car-wheel" />
            </svg>
            @if (x.c.transactionId) {
              <p class="bay-soc"><span class="read">{{ x.c.soc != null ? num(x.c.soc) : '–' }}</span><span class="unit">%</span>
                @if (target(x.c) != null) { <small>{{ t('yard.target', { n: target(x.c) }) }}</small> }</p>
            }
          </div>
          <p class="bay-state">{{ stateLabel(x.c) }}</p>
          <dl class="bay-stats num">
            <div><dt>{{ t('yard.kwNow') }}</dt><dd>{{ x.c.transactionId ? kw(x.c.powerW) : '–' }}</dd></div>
            <div><dt>{{ t('yard.kwAllocated') }}</dt><dd>{{ x.c.transactionId ? kw(x.c.allocatedW) : '–' }}</dd></div>
            <div><dt>{{ t('yard.kwhCharged') }}</dt><dd>{{ x.c.transactionId ? num(x.c.energyWh / 1000, 1) : '–' }}</dd></div>
          </dl>
          @if (x.c.transactionId && eta(x.c); as e) { <p class="small muted">{{ e }}</p> }
        </article>
      } @empty {
        <p class="empty">{{ t('yard.none') }}</p>
      }
    </section>
    <p class="note">{{ t('yard.note') }}</p>
  </div>
  `,
})
export class Yard {
  private live = inject(Live);
  private fleet = inject(Fleet);
  private nav = inject(Nav);
  protected t = inject(I18n).t;
  protected kw = kw;
  protected num = num;
  protected body = BODY;
  protected clip = `carclip${++uid}`;

  slots = computed<Slot[]>(() => {
    const out: Slot[] = [];
    for (const ch of this.live.snapshot()?.chargers ?? []) for (const c of ch.connectors) out.push({ key: `${ch.id}#${c.connectorId}`, ch, c });
    // Sessions first, then free connectors; by charger inside each group
    return out.sort((a, b) => (b.c.transactionId ? 1 : 0) - (a.c.transactionId ? 1 : 0) || a.key.localeCompare(b.key, undefined, { numeric: true }));
  });
  active = computed(() => this.slots().filter((x) => x.c.transactionId));
  totalW = computed(() => this.active().reduce((a, x) => a + (x.c.powerW || 0), 0));
  avgSoc = computed(() => {
    const s = this.active().map((x) => x.c.soc).filter((v): v is number => v != null);
    return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null;
  });

  constructor() {
    this.fleet.load();
    inject(ActivatedRoute).queryParamMap.subscribe((q) => this.nav.highlight(q.get('highlight')));
  }

  clamp(v: number | null) {
    return Math.max(0, Math.min(100, v ?? 0));
  }
  target(c: Connector) {
    return c.plan?.targetSoc ?? c.vehicle?.targetSoc ?? null;
  }
  stateLabel(c: Connector) {
    if (!c.transactionId)
      return this.t(c.status === 'Faulted' ? 'yard.faulted' : c.status === 'Unavailable' ? 'yard.unavailable' : c.status === 'Preparing' ? 'yard.pluggedNoSession' : 'yard.freeBay');
    if (c.allocatedW === 0) return this.t('yard.pausedNoPower');
    if (c.status === 'SuspendedEVSE') return this.t('yard.waitingSetpoint');
    if (c.status === 'SuspendedEV') return this.t('yard.pausedByEv');
    if (c.powerW < c.allocatedW - 1000) return this.t('yard.rampingUp');
    return this.t('yard.charging');
  }
  eta(c: Connector): string | null {
    const target = this.target(c);
    if (c.soc == null || target == null || !(c.powerW > 300) || !c.vehicle) {
      return c.plan?.departureAt ? this.t('yard.departure', { time: fmtTime(c.plan.departureAt) }) : null;
    }
    if (c.soc >= target) return this.t('yard.targetReached');
    const kwh = ((target - c.soc) / 100) * (c.vehicle.batteryKwh ?? 60);
    const m = Math.round((kwh / (c.powerW / 1000)) * 60);
    if (!isFinite(m)) return null;
    return this.t('yard.eta', { target, time: m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min` });
  }
}
