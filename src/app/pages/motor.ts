import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Api } from '../core/api.service';
import { Live } from '../core/live.service';
import { I18n } from '../i18n/i18n.service';
import { CommandRow, CommandStat, OcppRow } from '../core/types';
import { fmtDay, fmtTime, num } from '../core/fmt';

interface Meter {
  connector?: number;
  tx?: number;
  power?: number;
  energy?: number;
  current?: number;
  soc?: number;
  voltage?: number;
}

const parse = (s: string | null | undefined): any => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};

function meter(p: any): Meter {
  const out: Meter = { connector: p?.connectorId, tx: p?.transactionId };
  for (const mv of p?.meterValue || [])
    for (const sv of mv.sampledValue || []) {
      const m = sv.measurand || 'Energy.Active.Import.Register';
      const v = Number(sv.value);
      if (m === 'Power.Active.Import') out.power = sv.unit === 'kW' ? v : v / 1000;
      else if (m === 'Energy.Active.Import.Register') out.energy = sv.unit === 'kWh' ? v : v / 1000;
      else if (m === 'Current.Import') out.current = v;
      else if (m === 'SoC') out.soc = v;
      else if (m === 'Voltage') out.voltage = v;
    }
  return out;
}

@Component({
  selector: 'app-motor',
  imports: [FormsModule],
  template: `
  <div class="page">
    <section class="panel filters">
      <label>{{ t('col.charger') }}
        <select [ngModel]="charger()" (ngModelChange)="charger.set($event); reload()">
          <option value="">{{ t('common.all') }}</option>
          @for (id of chargerIds(); track id) { <option [value]="id">{{ id }}</option> }
        </select></label>
      <label>{{ t('energy.period') }}
        <select [ngModel]="range()" (ngModelChange)="range.set(+$event); reload()">
          <option [ngValue]="900000">{{ t('range.15m') }}</option>
          <option [ngValue]="3600000">{{ t('range.1h') }}</option>
          <option [ngValue]="21600000">{{ t('range.6h') }}</option>
          <option [ngValue]="86400000">{{ t('range.24h') }}</option>
          <option [ngValue]="604800000">{{ t('range.7d') }}</option>
        </select></label>
      <label class="check"><input type="checkbox" [checked]="liveRefresh()" (change)="liveRefresh.set(!liveRefresh())" /> {{ t('motor.live') }}</label>
      <button class="sm" (click)="reload()">{{ t('common.refresh') }}</button>
      <span class="note">{{ stamp() }}</span>
    </section>

    <section class="panel">
      <h2>{{ t('motor.commandsTitle') }}</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>{{ t('motor.command') }}</th><th class="n">{{ t('motor.sent') }}</th><th class="n">{{ t('motor.rejected') }}</th><th class="n">{{ t('motor.noResponse') }}</th><th class="n">{{ t('motor.latency') }}</th></tr></thead>
          <tbody>
            @for (s of stats(); track s.action) {
              <tr><td><b>{{ s.action }}</b></td><td class="n">{{ s.n }}</td><td class="n" [class.bad-text]="s.rejected">{{ s.rejected }}</td>
                <td class="n" [class.warn-text]="s.no_response">{{ s.no_response }}</td><td class="n">{{ s.latency_ms != null ? s.latency_ms + ' ms' : '–' }}</td></tr>
            } @empty { <tr><td colspan="5" class="muted">{{ t('motor.noCommands') }}</td></tr> }
          </tbody>
        </table>
      </div>
      <div class="row filters-inline">
        <label>{{ t('motor.command') }}
          <select [ngModel]="cmd()" (ngModelChange)="cmd.set($event); reload()">
            <option value="">{{ t('common.all') }}</option>
            @for (s of stats(); track s.action) { <option [value]="s.action">{{ s.action }}</option> }
          </select></label>
        <label class="check"><input type="checkbox" [checked]="cmdErr()" (change)="cmdErr.set(!cmdErr()); reload()" /> {{ t('motor.onlyFailed') }}</label>
      </div>
      <div class="table-wrap scroll">
        <table>
          <thead><tr><th>{{ t('col.time') }}</th><th>{{ t('col.charger') }}</th><th>{{ t('motor.command') }}</th><th>{{ t('motor.detail') }}</th><th>{{ t('motor.answer') }}</th><th class="n">{{ t('motor.latency') }}</th></tr></thead>
          <tbody>
            @for (c of commands(); track c.t + c.charger_id + $index) {
              <tr class="click" (click)="toggle('c' + $index)">
                <td class="nowrap num">{{ time(c.t) }}</td><td>{{ c.charger_id }}</td><td><b>{{ c.action }}</b></td>
                <td>{{ commandDetail(c.action, parse(c.payload)) }}</td>
                <td>@if (!c.result_kind) { <span class="tag warn">{{ t('motor.noAnswer') }}</span> }
                  @else if (c.result_kind === 'CALLERROR') { <span class="tag bad">{{ parse(c.result_payload)?.code || 'CALLERROR' }}</span> }
                  @else { <span class="tag" [class.bad]="c.result_error" [class.ok]="!c.result_error">{{ parse(c.result_payload)?.status ?? 'OK' }}</span> }</td>
                <td class="n nowrap">{{ c.result_t ? c.result_t - c.t + ' ms' : '–' }}</td>
              </tr>
              @if (opened().has('c' + $index)) {
                <tr class="json"><td colspan="6"><pre>{{ pretty({ command: parse(c.payload), answer: parse(c.result_payload) }) }}</pre></td></tr>
              }
            } @empty { <tr><td colspan="6" class="muted">{{ t('motor.noCommandsFiltered') }}</td></tr> }
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>{{ t('motor.logTitle') }}</h2><button class="sm" (click)="exportCsv()">{{ t('motor.exportCsv') }}</button></div>
      <div class="row filters-inline">
        <label>{{ t('motor.action') }}
          <select [ngModel]="action()" (ngModelChange)="action.set($event); reload()">
            <option value="">{{ t('common.all') }}</option>
            @for (a of actions(); track a) { <option [value]="a">{{ a }}</option> }
          </select></label>
        <label>{{ t('motor.direction') }}
          <select [ngModel]="dir()" (ngModelChange)="dir.set($event); reload()" [disabled]="isMeter()">
            <option value="">{{ t('motor.both') }}</option><option value="in">{{ t('motor.in') }}</option><option value="out">{{ t('motor.out') }}</option>
          </select></label>
        <label>{{ t('motor.kind') }}
          <select [ngModel]="kind()" (ngModelChange)="kind.set($event); reload()" [disabled]="isMeter()">
            <option value="">{{ t('common.all') }}</option><option>CALL</option><option>CALLRESULT</option><option>CALLERROR</option>
          </select></label>
        <label>{{ t('motor.search') }}<input [ngModel]="text()" (ngModelChange)="text.set($event); debounce()" [placeholder]="t('motor.searchHint')" /></label>
        <label class="check"><input type="checkbox" [checked]="onlyErr()" (change)="onlyErr.set(!onlyErr()); reload()" /> {{ t('motor.onlyErrors') }}</label>
      </div>
      <p class="note">{{ t(isMeter() ? 'motor.meterHint' : 'motor.logHint') }}</p>
      <div class="table-wrap scroll">
        <table>
          @if (isMeter()) {
            <thead><tr><th>{{ t('col.time') }}</th><th>{{ t('col.charger') }}</th><th class="n">{{ t('motor.conn') }}</th><th class="n">{{ t('motor.session') }}</th>
              <th class="n">{{ t('motor.power') }}</th><th class="n">{{ t('motor.energy') }}</th><th class="n">{{ t('motor.current') }}</th><th class="n">SoC</th><th class="n">{{ t('motor.voltage') }}</th></tr></thead>
            <tbody>
              @for (r of log(); track r.t + r.msg_id + r.dir) {
                @let m = meterOf(r);
                <tr class="click" (click)="toggle('l' + $index)">
                  <td class="nowrap num">{{ time(r.t) }}</td><td>{{ r.charger_id }}</td><td class="n">{{ m.connector ?? '–' }}</td><td class="n">{{ m.tx ?? '–' }}</td>
                  <td class="n"><b>{{ f(m.power, 2, 'kW') }}</b></td><td class="n">{{ f(m.energy, 3, 'kWh') }}</td><td class="n">{{ f(m.current, 1, 'A') }}</td>
                  <td class="n">{{ f(m.soc, 1, '%') }}</td><td class="n">{{ f(m.voltage, 0, 'V') }}</td>
                </tr>
                @if (opened().has('l' + $index)) { <tr class="json"><td colspan="9"><pre>{{ pretty(parse(r.payload)) }}</pre></td></tr> }
              } @empty { <tr><td colspan="9" class="muted">{{ t('motor.noFrames') }}</td></tr> }
            </tbody>
          } @else {
            <thead><tr><th>{{ t('col.time') }}</th><th>{{ t('col.charger') }}</th><th></th><th>{{ t('motor.kind') }}</th><th>{{ t('motor.action') }}</th><th>{{ t('motor.content') }}</th></tr></thead>
            <tbody>
              @for (r of log(); track r.t + r.msg_id + r.dir + r.kind) {
                <tr class="click" [class.err-row]="r.error_code" (click)="toggle('l' + $index)">
                  <td class="nowrap num">{{ time(r.t) }}</td><td>{{ r.charger_id }}</td>
                  <td [title]="t(r.dir === 'in' ? 'motor.in' : 'motor.out')">{{ r.dir === 'in' ? '⇠' : '⇢' }}</td>
                  <td class="small muted">{{ r.kind }}</td>
                  <td><b>{{ r.action || '–' }}</b> @if (r.error_code) { <span class="tag bad">{{ r.error_code }}</span> }</td>
                  <td>{{ summary(r) }}</td>
                </tr>
                @if (opened().has('l' + $index)) { <tr class="json"><td colspan="6"><pre>{{ pretty(parse(r.payload)) }}</pre></td></tr> }
              } @empty { <tr><td colspan="6" class="muted">{{ t('motor.noFrames') }}</td></tr> }
            </tbody>
          }
        </table>
      </div>
      @if (log().length >= 150 && hasMore()) {
        <div class="row" style="justify-content: center; margin-top: 10px"><button class="sm" (click)="loadLog(true)">{{ t('motor.loadOlder') }}</button></div>
      }
    </section>
  </div>
  `,
})
export class Motor implements OnDestroy {
  private api = inject(Api);
  private live = inject(Live);
  protected t = inject(I18n).t;
  protected parse = parse;

  charger = signal('');
  range = signal(3600000);
  liveRefresh = signal(true);
  cmd = signal('');
  cmdErr = signal(false);
  action = signal('');
  dir = signal('');
  kind = signal('');
  text = signal('');
  onlyErr = signal(false);
  stats = signal<CommandStat[]>([]);
  commands = signal<CommandRow[]>([]);
  log = signal<OcppRow[]>([]);
  actionList = signal<string[]>(['MeterValues']);
  opened = signal(new Set<string>());
  hasMore = signal(false);
  stamp = signal('');
  isMeter = computed(() => this.action() === 'MeterValues');
  chargerIds = computed(() => {
    const ids = new Set((this.live.snapshot()?.chargers ?? []).map((c) => c.id));
    if (this.charger()) ids.add(this.charger());
    return [...ids].sort();
  });
  actions = computed(() => {
    const s = new Set(this.actionList());
    if (this.action()) s.add(this.action());
    return [...s];
  });
  private loading = false;
  private textTimer?: ReturnType<typeof setTimeout>;
  private timer = setInterval(() => this.liveRefresh() && this.refresh(false), 3000);

  constructor() {
    inject(ActivatedRoute).queryParamMap.subscribe((q) => {
      // Filters can come from the assistant: /motor?charger=PRUEBA-03&action=MeterValues
      this.charger.set(q.get('charger') ?? this.charger());
      this.action.set(q.get('action') ?? this.action());
      this.reload();
    });
    this.api.get<{ action: string; n: number }[]>('/logs/actions').then((a) => this.actionList.set(['MeterValues', ...a.map((x) => x.action).filter((x) => x !== 'MeterValues')])).catch(() => {});
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  time(t: number) {
    const d = new Date(t);
    const today = new Date().toDateString() === d.toDateString();
    const hms = `${fmtTime(t, true)}.${String(d.getMilliseconds()).padStart(3, '0')}`;
    return today ? hms : `${fmtDay(t, { day: '2-digit', month: '2-digit' })} ${hms}`;
  }
  f(v: number | undefined, d: number, u: string) {
    return v == null ? '–' : `${num(v, d)} ${u}`;
  }
  pretty(v: unknown) {
    return JSON.stringify(v, null, 2);
  }
  meterOf(r: OcppRow) {
    return meter(parse(r.payload));
  }
  toggle(k: string) {
    const s = new Set(this.opened());
    if (s.has(k)) s.delete(k);
    else s.add(k);
    this.opened.set(s);
  }
  debounce() {
    clearTimeout(this.textTimer);
    this.textTimer = setTimeout(() => this.reload(), 400);
  }
  reload() {
    this.opened.set(new Set());
    this.refresh(true);
  }

  private async refresh(all: boolean) {
    if (this.loading) return;
    this.loading = true;
    try {
      // While the user reads an expanded frame or older pages, the log is not replaced
      const reading = this.opened().size > 0 || this.log().length > 150;
      await Promise.all([this.loadCommands(), reading && !all ? null : this.loadLog(false)]);
      this.stamp.set(this.t('common.updatedAt', { time: fmtTime(Date.now(), true) }));
    } catch (e) {
      this.stamp.set((e as Error).message);
    } finally {
      this.loading = false;
    }
  }

  private async loadCommands() {
    const from = Date.now() - this.range();
    const [stats, cmds] = await Promise.all([
      this.api.get<CommandStat[]>('/logs/command-stats', { from, chargerId: this.charger() }),
      this.api.get<CommandRow[]>('/logs/commands', { from, limit: 100, chargerId: this.charger(), action: this.cmd(), errorsOnly: this.cmdErr() || undefined }),
    ]);
    this.stats.set(stats);
    this.commands.set(cmds);
  }

  async loadLog(append: boolean) {
    const q: Record<string, unknown> = { limit: 150, from: Date.now() - this.range(), chargerId: this.charger(), action: this.action(), text: this.text().trim() };
    if (this.isMeter()) q['kind'] = 'CALL'; // values travel in the CALL; the CALLRESULT is empty
    else {
      q['kind'] = this.kind();
      q['direction'] = this.dir();
    }
    if (this.onlyErr()) q['errorsOnly'] = true;
    if (append && this.log().length) q['to'] = this.log().at(-1)!.t;
    const rows = await this.api.get<OcppRow[]>('/logs/ocpp', q);
    this.log.set(append ? [...this.log(), ...rows] : rows);
    this.hasMore.set(rows.length >= 150);
  }

  private kwOf(sched: any) {
    const p = sched?.chargingSchedulePeriod?.[0];
    if (!p) return '–';
    return sched.chargingRateUnit === 'A' ? `${p.limit} A${p.numberPhases ? ` × ${p.numberPhases}` : ''}` : `${num(p.limit / 1000, 1)} kW`;
  }

  commandDetail(action: string | null, p: any): string {
    if (!p) return '';
    switch (action) {
      case 'SetChargingProfile': {
        const cp = p.csChargingProfiles || {};
        return this.t('motor.profileDetail', { c: p.connectorId, kw: this.kwOf(cp.chargingSchedule), purpose: cp.chargingProfilePurpose, level: cp.stackLevel })
          + (cp.transactionId ? `, #${cp.transactionId}` : '');
      }
      case 'RemoteStartTransaction':
        return this.t('motor.startDetail', { c: p.connectorId ?? '–', tag: p.idTag });
      case 'RemoteStopTransaction':
        return `#${p.transactionId}`;
      case 'Reset':
        return p.type;
      default:
        return JSON.stringify(p).slice(0, 120);
    }
  }

  summary(r: OcppRow): string {
    const p = parse(r.payload);
    if (r.kind === 'CALLERROR') return `${p?.code}: ${p?.description}`;
    if (r.kind === 'CALLRESULT') {
      const st = p?.status ?? p?.idTagInfo?.status;
      if (st) return `→ ${st}${p?.transactionId ? `, #${p.transactionId}` : ''}`;
      if (p?.currentTime) return `→ ${fmtTime(Date.parse(p.currentTime), true)}`;
      return '→ OK';
    }
    switch (r.action) {
      case 'MeterValues': {
        const m = meter(p);
        return [m.power != null && `${num(m.power, 1)} kW`, m.energy != null && `${num(m.energy, 2)} kWh`, m.current != null && `${m.current} A`, m.soc != null && `SoC ${m.soc} %`]
          .filter(Boolean).join(', ') + ` (c${m.connector}${m.tx ? ', #' + m.tx : ''})`;
      }
      case 'StatusNotification':
        return `${this.t('motor.connectorN', { n: p?.connectorId })}: ${p?.status}${p?.errorCode && p.errorCode !== 'NoError' ? `, ${p.errorCode}` : ''}`;
      case 'StartTransaction':
        return this.t('motor.startTxDetail', { c: p?.connectorId, tag: p?.idTag, wh: p?.meterStart });
      case 'StopTransaction':
        return this.t('motor.stopTxDetail', { tx: p?.transactionId, reason: p?.reason || 'Local', wh: p?.meterStop });
      case 'Authorize':
        return `idTag ${p?.idTag}`;
      case 'BootNotification':
        return `${p?.chargePointVendor} ${p?.chargePointModel}, fw ${p?.firmwareVersion}`;
      case 'DataTransfer':
        return `${p?.vendorId}/${p?.messageId}`;
      case 'Heartbeat':
        return '';
      default:
        return r.dir === 'out' ? this.commandDetail(r.action, p) : JSON.stringify(p ?? {}).slice(0, 120);
    }
  }

  exportCsv() {
    const meterView = this.isMeter();
    const head = meterView ? ['time', 'charger', 'connector', 'session', 'kW', 'kWh', 'A', 'SoC', 'V'] : ['time', 'charger', 'direction', 'kind', 'action', 'error', 'payload'];
    const rows = this.log().map((r) => {
      if (meterView) {
        const m = meter(parse(r.payload));
        return [new Date(r.t).toISOString(), r.charger_id, m.connector, m.tx, m.power, m.energy, m.current, m.soc, m.voltage];
      }
      return [new Date(r.t).toISOString(), r.charger_id, r.dir, r.kind, r.action, r.error_code, r.payload];
    });
    const cell = (v: unknown) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `ocpp-${meterView ? 'metervalues' : 'log'}-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
