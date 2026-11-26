import { Component, inject, signal } from '@angular/core';
import { Api } from '../core/api.service';
import { Ui } from '../core/ui.service';
import { I18n } from '../i18n/i18n.service';
import { SessionRow } from '../core/types';
import { fmtDate, fmtDur, kw, num } from '../core/fmt';

@Component({
  selector: 'app-sessions',
  template: `
  <div class="page">
    <section class="panel">
      <h2>{{ t('data.exportTitle') }}</h2>
      <p class="note">{{ t('data.exportNote') }}</p>
      <div class="row">
        @for (e of exports; track e.file) {
          @let url = '/api/v1/exports/' + e.file;
          <a class="btn" [href]="url" [attr.aria-disabled]="ui.busy('export:' + url) || null" (click)="$event.preventDefault(); ui.download(url)">{{ t(e.label) }}</a>
        }
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>{{ t('data.sessionsTitle') }}</h2><button class="sm" (click)="load()">{{ t('common.refresh') }}</button></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>{{ t('col.id') }}</th><th>{{ t('col.start') }}</th><th class="n">{{ t('col.duration') }}</th><th>{{ t('col.charger') }}</th><th>{{ t('col.vehicle') }}</th>
            <th>{{ t('cal.identification') }}</th><th class="n">kWh</th><th class="n">SoC</th><th class="n">{{ t('data.maxKw') }}</th><th>{{ t('cal.end') }}</th><th></th></tr></thead>
          <tbody>
            @for (s of rows(); track s.transaction_id) {
              <tr>
                <td class="num">{{ s.transaction_id }}</td><td class="nowrap">{{ fmtDate(s.started_at) }}</td>
                <td class="n nowrap">{{ fmtDur((s.stopped_at || now) - s.started_at) }}</td>
                <td>{{ s.charger_id }}/{{ s.connector_id }}</td><td>{{ s.vehicle_name || '–' }}</td>
                <td><span class="tag">{{ t('ident.' + (s.ident_method || 'none')) }}</span></td>
                <td class="n">{{ num((s.energy_wh || 0) / 1000, 2) }}</td>
                <td class="n nowrap">{{ soc(s) }}</td>
                <td class="n">{{ s.max_power_w != null ? kw(s.max_power_w) : s.power_w != null ? kw(s.power_w) : '–' }}</td>
                <td>@if (s.live) { <span class="lamp charge">{{ t('cal.ongoing') }}</span> } @else { {{ s.stop_reason || '–' }} }</td>
                @let csvUrl = '/api/v1/exports/meter-samples.csv?transactionId=' + s.transaction_id;
                <td><a [href]="csvUrl" [title]="t('data.samplesCsv')" [attr.aria-disabled]="ui.busy('export:' + csvUrl) || null" (click)="$event.preventDefault(); ui.download(csvUrl)">CSV</a></td>
              </tr>
            } @empty { <tr><td colspan="11" class="muted">{{ t('data.none') }}</td></tr> }
          </tbody>
        </table>
      </div>
    </section>
  </div>
  `,
})
export class Sessions {
  private api = inject(Api);
  protected ui = inject(Ui);
  protected t = inject(I18n).t;
  protected fmtDate = fmtDate;
  protected fmtDur = fmtDur;
  protected kw = kw;
  protected num = num;
  protected now = Date.now();
  protected exports = [
    { file: 'sessions.csv', label: 'data.expSessions' },
    { file: 'meter-samples.csv', label: 'data.expSamples' },
    { file: 'site-samples.csv', label: 'data.expSite' },
    { file: 'vehicles.csv', label: 'data.expVehicles' },
    { file: 'chargers.csv', label: 'data.expChargers' },
  ];
  rows = signal<SessionRow[]>([]);

  constructor() {
    this.load();
  }

  async load() {
    this.now = Date.now();
    try {
      const rows = await this.api.get<SessionRow[]>('/sessions', { from: Date.now() - 30 * 86400000 });
      this.rows.set(rows.sort((a, b) => b.started_at - a.started_at));
    } catch (e) {
      this.ui.toast((e as Error).message, true);
    }
  }

  soc(s: SessionRow) {
    if (s.soc_start == null && s.soc_end == null) return '–';
    const f = (v: number | null) => (v != null ? Math.round(v) : '?');
    return `${f(s.soc_start)}–${f(s.soc_end)} %`;
  }
}
