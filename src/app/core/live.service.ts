import { Injectable, computed, signal } from '@angular/core';
import { Snapshot } from './types';

export interface ConnSample {
  t: number;
  p: number;
  a: number;
}

/**
 * Live state: BFF WebSocket /ws/live (motor snapshots ~2/s).
 * Exposes signals; components update by themselves, incrementally.
 */
@Injectable({ providedIn: 'root' })
export class Live {
  readonly snapshot = signal<Snapshot | null>(null);
  /** Browser ↔ BFF link */
  readonly online = signal(false);
  /** BFF ↔ motor link */
  readonly motorUp = signal(true);
  /** Short history per connector (sparklines), key "CP#connector". */
  readonly series = new Map<string, ConnSample[]>();
  readonly seriesTick = signal(0);
  /** 1-second clock for durations. */
  readonly now = signal(Date.now());

  /** i18n key of the connection status. */
  readonly status = computed(() => (!this.online() ? 'live.reconnecting' : !this.motorUp() ? 'live.motorDown' : 'live.online'));

  private lastPush = 0;

  constructor() {
    this.connect();
    setInterval(() => this.now.set(Date.now()), 1000);
  }

  private connect() {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/live`);
    ws.onopen = () => this.online.set(true);
    ws.onclose = () => {
      this.online.set(false);
      setTimeout(() => this.connect(), 2000);
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'snapshot') {
          this.pushSeries(msg.data);
          this.snapshot.set(msg.data);
          this.motorUp.set(true);
        } else if (msg.type === 'motor') this.motorUp.set(!!msg.data.connected);
      } catch {
        /* invalid message */
      }
    };
  }

  private pushSeries(s: Snapshot) {
    const now = Date.now();
    if (now - this.lastPush < 900) return;
    this.lastPush = now;
    for (const ch of s.chargers)
      for (const c of ch.connectors) {
        const key = `${ch.id}#${c.connectorId}`;
        if (!c.transactionId) {
          this.series.delete(key);
          continue;
        }
        const arr = this.series.get(key) || [];
        arr.push({ t: now, p: c.powerW || 0, a: c.allocatedW || 0 });
        if (arr.length > 150) arr.shift();
        this.series.set(key, arr);
      }
    this.seriesTick.update((n) => n + 1);
  }
}
