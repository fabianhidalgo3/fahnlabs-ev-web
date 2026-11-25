import { Injectable, inject, signal } from '@angular/core';
import { Api } from './api.service';
import { Vehicle } from './types';

/** Flota registrada (vehículos) compartida por varias vistas, y el diálogo «Iniciar carga». */
@Injectable({ providedIn: 'root' })
export class Fleet {
  private api = inject(Api);
  readonly vehicles = signal<Vehicle[]>([]);
  /** Diálogo abierto para { cargador, conector } */
  readonly startFor = signal<{ chargerId: string; connectorId: number } | null>(null);
  private loading: Promise<Vehicle[]> | null = null;

  load(force = false): Promise<Vehicle[]> {
    if (!force && this.loading) return this.loading;
    this.loading = this.api
      .get<Vehicle[]>('/vehicles')
      .then((v) => {
        this.vehicles.set(v);
        return v;
      })
      .catch(() => this.vehicles());
    return this.loading;
  }

  byId(id: number | null | undefined): Vehicle | undefined {
    return id == null ? undefined : this.vehicles().find((v) => v.id === id);
  }

  openStart(chargerId: string, connectorId = 1) {
    this.load();
    this.startFor.set({ chargerId, connectorId });
  }
}
