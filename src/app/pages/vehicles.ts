import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Api } from '../core/api.service';
import { Fleet } from '../core/fleet.service';
import { Live } from '../core/live.service';
import { Nav } from '../core/nav.service';
import { Ui } from '../core/ui.service';
import { I18n } from '../i18n/i18n.service';
import { Vehicle } from '../core/types';
import { kw } from '../core/fmt';

type Form = Omit<Vehicle, 'id'> & { id: number | null };
const EMPTY: Form = { id: null, name: '', make: '', model: '', vin: '', evccid: '', id_tag: '', battery_kwh: 60, max_ac_kw: 11, phases: 3, target_soc: 80, priority: 5 };

@Component({
  selector: 'app-vehicles',
  imports: [FormsModule],
  template: `
  <div class="page">
    <section class="panel" #formPanel>
      <h2>{{ form.id ? t('veh.editTitle', { id: form.id }) : t('veh.newTitle') }}</h2>
      <form class="form" (ngSubmit)="save()">
        <label>{{ t('veh.name') }} *<input name="name" required maxlength="80" [(ngModel)]="form.name" /></label>
        <label>{{ t('veh.make') }}<input name="make" maxlength="40" [(ngModel)]="form.make" /></label>
        <label>{{ t('veh.model') }}<input name="model" maxlength="40" [(ngModel)]="form.model" /></label>
        <label>VIN<input name="vin" maxlength="17" [placeholder]="t('veh.vinHint')" [(ngModel)]="form.vin" /></label>
        <label>EVCCID (MAC)<input name="evccid" maxlength="17" placeholder="0A1B2C3D4E5F" [(ngModel)]="form.evccid" /></label>
        <label>{{ t('veh.rfid') }}<input name="id_tag" maxlength="20" [(ngModel)]="form.id_tag" /></label>
        <label>{{ t('veh.battery') }}<input name="battery_kwh" type="number" step="0.1" min="1" [(ngModel)]="form.battery_kwh" /></label>
        <label>{{ t('veh.onboard') }}<input name="max_ac_kw" type="number" step="0.1" min="1" [(ngModel)]="form.max_ac_kw" /></label>
        <label>{{ t('cfg.phases') }}<select name="phases" [(ngModel)]="form.phases"><option [ngValue]="1">1</option><option [ngValue]="3">3</option></select></label>
        <label>{{ t('veh.targetSoc') }}<input name="target_soc" type="number" min="10" max="100" [(ngModel)]="form.target_soc" /></label>
        <label>{{ t('veh.priority') }}<input name="priority" type="number" min="1" max="10" [(ngModel)]="form.priority" /></label>
        <div class="row">
          <button class="primary" type="submit">{{ t(form.id ? 'common.saveChanges' : 'veh.create') }}</button>
          @if (form.id) { <button type="button" (click)="reset()">{{ t('common.cancel') }}</button> }
        </div>
      </form>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>{{ t('veh.fleetTitle') }}</h2><span class="note">{{ t('veh.count', { n: fleet.vehicles().length }) }}</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>{{ t('col.id') }}</th><th>{{ t('col.vehicle') }}</th><th>VIN</th><th>EVCCID</th><th>idTag</th><th class="n">kWh</th><th class="n">AC kW</th>
            <th class="n">{{ t('cfg.phases') }}</th><th class="n">{{ t('col.target') }}</th><th class="n">{{ t('veh.prio') }}</th><th>{{ t('col.status') }}</th><th></th></tr></thead>
          <tbody>
            @for (v of fleet.vehicles(); track v.id) {
              <tr [attr.data-hl]="'' + v.id">
                <td class="num">{{ v.id }}</td><td><b>{{ v.name }}</b><div class="small muted">{{ [v.make, v.model].join(' ') }}</div></td>
                <td><code>{{ v.vin || '–' }}</code></td><td><code>{{ v.evccid || '–' }}</code></td><td>{{ v.id_tag || '–' }}</td>
                <td class="n">{{ v.battery_kwh }}</td><td class="n">{{ v.max_ac_kw }}</td><td class="n">{{ v.phases }}</td><td class="n">{{ v.target_soc }} %</td><td class="n">{{ v.priority }}</td>
                <td>@if (charging().get(v.id); as where) { <span class="lamp charge">{{ where }}</span> } @else { <span class="muted">–</span> }</td>
                <td class="actions"><button class="sm" (click)="edit(v)">{{ t('common.edit') }}</button><button class="sm danger" (click)="remove(v)">{{ t('common.delete') }}</button></td>
              </tr>
            } @empty { <tr><td colspan="12" class="muted">{{ t('veh.none') }}</td></tr> }
          </tbody>
        </table>
      </div>
    </section>
  </div>
  `,
})
export class Vehicles {
  protected fleet = inject(Fleet);
  private api = inject(Api);
  private ui = inject(Ui);
  private live = inject(Live);
  protected t = inject(I18n).t;
  private panel = viewChild<ElementRef<HTMLElement>>('formPanel');
  form: Form = { ...EMPTY };

  /** vehicle id → where it is charging now */
  charging = computed(() => {
    const m = new Map<number, string>();
    for (const ch of this.live.snapshot()?.chargers ?? [])
      for (const c of ch.connectors) if (c.vehicle && c.transactionId) m.set(c.vehicle.id, `${ch.id}/${c.connectorId}, ${kw(c.powerW)} kW`);
    return m;
  });

  constructor() {
    this.fleet.load(true);
    const nav = inject(Nav);
    inject(ActivatedRoute).queryParamMap.subscribe((q) => nav.highlight(q.get('highlight')));
  }

  reset() {
    this.form = { ...EMPTY };
  }
  edit(v: Vehicle) {
    this.form = { ...v, make: v.make ?? '', model: v.model ?? '', vin: v.vin ?? '', evccid: v.evccid ?? '', id_tag: v.id_tag ?? '' };
    this.panel()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async save() {
    const { id, ...body } = this.form;
    const ok = await this.ui.run(
      () => (id ? this.api.put(`/vehicles/${id}`, body) : this.api.post('/vehicles', body)),
      id ? 'veh.updated' : 'veh.created',
    );
    if (ok !== undefined) {
      this.reset();
      this.fleet.load(true);
    }
  }
  async remove(v: Vehicle) {
    if (!confirm(this.t('veh.confirmDelete', { name: v.name }))) return;
    await this.ui.run(() => this.api.del(`/vehicles/${v.id}`), 'veh.deleted');
    this.fleet.load(true);
  }
}
