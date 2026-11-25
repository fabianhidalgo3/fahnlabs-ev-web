import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Api } from '../core/api.service';
import { Fleet } from '../core/fleet.service';
import { Live } from '../core/live.service';
import { Nav } from '../core/nav.service';
import { Ui } from '../core/ui.service';
import { I18n } from '../i18n/i18n.service';
import { ChargerRow } from '../core/types';
import { fmtDate } from '../core/fmt';

interface Row {
  id: string;
  connected: boolean;
  vendor: string;
  location: string;
  maxPowerKw: number | null;
  priority: number | null;
  connectors: number | string;
  lastSeen: number | null;
}

@Component({
  selector: 'app-chargers',
  imports: [FormsModule],
  template: `
  <div class="page">
    <div class="cols">
      <section class="panel">
        <h2>{{ t('chg.registerTitle') }}</h2>
        <form class="form" (ngSubmit)="register()">
          <label>ChargePoint ID *<input name="id" required maxlength="48" [(ngModel)]="newId" /></label>
          <label>{{ t('chg.location') }}<input name="location" maxlength="120" [(ngModel)]="newLocation" /></label>
          <label>{{ t('chg.maxPower') }}<input name="max" type="number" step="0.1" min="1" [(ngModel)]="newMax" /></label>
          <label>{{ t('veh.priority') }}<input name="prio" type="number" min="1" max="10" [(ngModel)]="newPrio" /></label>
          <button class="primary" type="submit">{{ t('chg.register') }}</button>
        </form>
      </section>
      <section class="panel">
        <h2>{{ t('chg.policyTitle') }}</h2>
        <label class="check"><input type="checkbox" [checked]="acceptUnknown()" (change)="setAccept($any($event.target).checked)" /> {{ t('chg.acceptUnknown') }}</label>
        <p class="note">{{ t('chg.policyNote') }}</p>
        <p class="note">{{ t('chg.ocppUrl') }} <code>{{ ocppUrl() }}</code></p>
      </section>
    </div>
    <section class="panel">
      <h2>{{ t('chg.registryTitle') }}</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>{{ t('col.status') }}</th><th>{{ t('chg.vendorModel') }}</th><th>{{ t('chg.location') }}</th><th>{{ t('chg.maxKw') }}</th><th>{{ t('veh.prio') }}</th>
            <th class="n">{{ t('chg.connectors') }}</th><th>{{ t('chg.lastSeen') }}</th><th></th></tr></thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr [attr.data-hl]="r.id">
                <td><b>{{ r.id }}</b></td><td><span class="lamp" [class.on]="r.connected">{{ t(r.connected ? 'common.online' : 'common.offline') }}</span></td>
                <td>{{ r.vendor || '–' }}</td>
                <td><input [(ngModel)]="edits[r.id].location" maxlength="120" [attr.aria-label]="t('chg.location')" /></td>
                <td><input type="number" step="0.1" min="1" [(ngModel)]="edits[r.id].maxPowerKw" [attr.aria-label]="t('chg.maxKw')" /></td>
                <td><input type="number" min="1" max="10" [(ngModel)]="edits[r.id].priority" [attr.aria-label]="t('veh.prio')" /></td>
                <td class="n">{{ r.connectors }}</td><td class="nowrap">{{ fmtDate(r.lastSeen) }}</td>
                <td class="actions">
                  <button class="sm" (click)="fleet.openStart(r.id, 1)">{{ t('ops.start') }}</button>
                  <button class="sm" (click)="save(r.id)">{{ t('common.save') }}</button>
                  @if (!r.connected) { <button class="sm danger" (click)="remove(r.id)">{{ t('common.delete') }}</button> }
                </td>
              </tr>
            } @empty { <tr><td colspan="9" class="muted">{{ t('chg.none') }}</td></tr> }
          </tbody>
        </table>
      </div>
    </section>
  </div>
  `,
})
export class Chargers {
  private api = inject(Api);
  private ui = inject(Ui);
  private live = inject(Live);
  protected fleet = inject(Fleet);
  protected nav = inject(Nav);
  protected t = inject(I18n).t;
  protected fmtDate = fmtDate;

  registry = signal<ChargerRow[]>([]);
  newId = '';
  newLocation = '';
  newMax: number | null = 22;
  newPrio = 5;
  /** Editable values per charger (kept while the user edits; filled from the data the first time). */
  edits: Record<string, { location: string; maxPowerKw: number | null; priority: number | null }> = {};

  acceptUnknown = computed(() => this.live.snapshot()?.config.acceptUnknownChargers !== false);
  ocppUrl = computed(() => this.nav.info()?.ocppUrl || 'ws://<host>:9100/ocpp/{chargePointId}');

  /** Registry rows (database) merged with chargers that exist only in memory (connected, not registered yet). */
  rows = computed<Row[]>(() => {
    const snap = new Map((this.live.snapshot()?.chargers ?? []).map((c) => [c.id, c]));
    const reg = new Map(this.registry().map((r) => [r.id, r]));
    const ids = [...new Set([...reg.keys(), ...snap.keys()])].sort();
    const out = ids.map((id) => {
      const r = reg.get(id);
      const s = snap.get(id);
      return {
        id,
        connected: !!s?.connected,
        vendor: [s?.vendor || r?.vendor, s?.model || r?.model].filter(Boolean).join(' '),
        location: s?.location ?? r?.location ?? '',
        maxPowerKw: s?.maxPowerKw ?? r?.max_power_kw ?? null,
        priority: s?.priority ?? r?.priority ?? null,
        connectors: s?.connectors.length || r?.connectors || '–',
        lastSeen: s?.lastSeen ?? r?.last_seen ?? null,
      };
    });
    for (const r of out) this.edits[r.id] ??= { location: r.location, maxPowerKw: r.maxPowerKw, priority: r.priority };
    return out;
  });

  constructor() {
    this.load();
    inject(ActivatedRoute).queryParamMap.subscribe((q) => this.nav.highlight(q.get('highlight')));
  }

  async load() {
    try {
      this.registry.set(await this.api.get<ChargerRow[]>('/chargers'));
    } catch (e) {
      this.ui.toast((e as Error).message, true);
    }
  }
  async register() {
    const body = { id: this.newId.trim(), location: this.newLocation.trim(), maxPowerKw: this.newMax, priority: this.newPrio };
    if ((await this.ui.run(() => this.api.post('/chargers', body), this.t('chg.registered', { id: body.id }))) !== undefined) {
      this.newId = '';
      this.newLocation = '';
      this.load();
    }
  }
  async save(id: string) {
    const e = this.edits[id];
    await this.ui.run(
      () => this.api.put(`/chargers/${encodeURIComponent(id)}`, { location: e.location, maxPowerKw: Number(e.maxPowerKw), priority: Number(e.priority) }),
      'chg.updated',
    );
    this.load();
  }
  async remove(id: string) {
    if (!confirm(this.t('chg.confirmDelete', { id }))) return;
    await this.ui.run(() => this.api.del(`/chargers/${encodeURIComponent(id)}`), 'chg.deleted');
    delete this.edits[id];
    this.load();
  }
  async setAccept(v: boolean) {
    await this.ui.run(() => this.api.put('/config', { acceptUnknownChargers: v }), v ? 'chg.acceptOn' : 'chg.acceptOff');
  }
}
