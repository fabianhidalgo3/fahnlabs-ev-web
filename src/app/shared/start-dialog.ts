import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api.service';
import { Fleet } from '../core/fleet.service';
import { Live } from '../core/live.service';
import { Ui } from '../core/ui.service';
import { I18n } from '../i18n/i18n.service';
import { fmtDate, toLocalInput } from '../core/fmt';
import { Plan } from '../core/types';

/** "Start charging" dialog: now or scheduled, with vehicle, departure time, target SoC and power limit. */
@Component({
  selector: 'app-start-dialog',
  imports: [FormsModule],
  template: `
    <dialog #dlg (close)="fleet.startFor.set(null)" aria-labelledby="sdTitle">
      @if (fleet.startFor(); as target) {
        <form class="form two-col" (ngSubmit)="submit()">
          <h2 id="sdTitle" class="full">{{ t('start.title', { charger: target.chargerId }) }}</h2>
          <label>{{ t('start.connector') }}
            <select name="conn" [(ngModel)]="connectorId">
              @for (c of connectors(); track c.n) {
                <option [ngValue]="c.n">{{ c.n }}{{ c.busy ? ' (' + t('start.busy') + ')' : '' }}</option>
              }
            </select>
          </label>
          <label>{{ t('start.vehicle') }}
            <select name="veh" [(ngModel)]="vehicleId">
              <option [ngValue]="null">{{ t('start.manualTag') }}</option>
              @for (v of fleet.vehicles(); track v.id) {
                <option [ngValue]="v.id">{{ v.name }}{{ v.vin ? ', VIN …' + v.vin.slice(-6) : '' }}</option>
              }
            </select>
          </label>
          @if (vehicleId() == null) {
            <label>idTag<input name="tag" maxlength="20" [(ngModel)]="idTag" /></label>
          }
          <div class="seg full" role="group" [attr.aria-label]="t('start.when')">
            <button type="button" [class.on]="!later()" (click)="later.set(false)">{{ t('start.now') }}</button>
            <button type="button" [class.on]="later()" (click)="later.set(true)">{{ t('start.schedule') }}</button>
          </div>
          @if (later()) {
            <label>{{ t('start.startAt') }}<input name="start" type="datetime-local" [(ngModel)]="startAt" /></label>
          }
          <label>{{ t('start.departure') }}<input name="dep" type="datetime-local" [(ngModel)]="departureAt" /></label>
          <label>{{ t('start.targetSoc') }}<input name="soc" type="number" min="10" max="100" [placeholder]="socHint()" [(ngModel)]="targetSoc" /></label>
          <label>{{ t('start.maxKw') }}<input name="max" type="number" min="1" step="0.1" [(ngModel)]="maxKw" /></label>
          @if (hint()) { <p class="note full">{{ hint() }}</p> }
          <div class="row full" style="justify-content: flex-end">
            <button type="button" (click)="dlg.close()">{{ t('common.cancel') }}</button>
            <button class="primary" type="submit" [disabled]="busy()">{{ t(later() ? 'start.submitLater' : 'start.submitNow') }}</button>
          </div>
        </form>
      }
    </dialog>
  `,
})
export class StartDialog {
  protected fleet = inject(Fleet);
  private live = inject(Live);
  private api = inject(Api);
  private ui = inject(Ui);
  protected t = inject(I18n).t;
  private dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  connectorId = signal(1);
  vehicleId = signal<number | null>(null);
  idTag = signal('REMOTE01');
  later = signal(false);
  startAt = signal('');
  departureAt = signal('');
  targetSoc = signal<number | null>(null);
  maxKw = signal<number | null>(null);
  busy = signal(false);

  private charger = computed(() => {
    const target = this.fleet.startFor();
    return target ? this.live.snapshot()?.chargers.find((c) => c.id === target.chargerId) : undefined;
  });
  connectors = computed(() => {
    const ch = this.charger();
    const n = Math.max(1, ch?.connectors.length || 1);
    return Array.from({ length: n }, (_, i) => ({ n: i + 1, busy: !!ch?.connectors[i]?.transactionId }));
  });
  private vehicle = computed(() => this.fleet.byId(this.vehicleId()));
  socHint = computed(() => (this.vehicle() ? this.t('start.socFromVehicle', { n: this.vehicle()!.target_soc }) : this.t('common.optional')));
  hint = computed(() => {
    const v = this.vehicle();
    const ch = this.charger();
    const out: string[] = [];
    if (v)
      out.push(this.t('start.identifiesAs', { tag: v.id_tag ? `RFID ${v.id_tag}` : `VID:${v.evccid}`, kwh: v.battery_kwh, ac: v.max_ac_kw }));
    if (this.fleet.startFor() && ch && !ch.connected) out.push(this.t(this.later() ? 'start.offlineLater' : 'start.offlineNow'));
    return out.join(' ');
  });

  constructor() {
    effect(() => {
      const target = this.fleet.startFor();
      const d = this.dlg().nativeElement;
      if (target && !d.open) {
        this.connectorId.set(target.connectorId);
        this.vehicleId.set(null);
        this.later.set(false);
        this.startAt.set(toLocalInput(Date.now() + 15 * 60000));
        this.departureAt.set('');
        this.targetSoc.set(null);
        this.maxKw.set(null);
        d.showModal();
      } else if (!target && d.open) d.close();
    });
  }

  async submit() {
    const target = this.fleet.startFor();
    if (!target || this.busy()) return;
    const later = this.later();
    const body = {
      chargerId: target.chargerId,
      connectorId: this.connectorId(),
      vehicleId: this.vehicleId(),
      idTag: this.idTag().trim(),
      startAt: later && this.startAt() ? new Date(this.startAt()).getTime() : null,
      departureAt: this.departureAt() ? new Date(this.departureAt()).getTime() : null,
      targetSoc: this.targetSoc() ?? null,
      maxKw: this.maxKw() ?? null,
    };
    this.busy.set(true);
    const p = await this.ui.run(
      () => this.api.post<Plan>('/charging-plans', body),
      (p) => (later ? this.t('start.scheduled', { id: p.id, when: fmtDate(p.start_at) }) : this.t('start.starting', { id: p.id })),
    );
    this.busy.set(false);
    if (p) this.dlg().nativeElement.close();
  }
}
