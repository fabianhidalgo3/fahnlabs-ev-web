// Shared formatting helpers. The locale follows the selected UI language (see I18n.setLang).

let locale = 'en-US';
const cache = new Map<string, Intl.NumberFormat>();

export function setLocale(l: string) {
  locale = l;
  cache.clear();
}

function nf(d: number): Intl.NumberFormat {
  const k = `${locale}|${d}`;
  let f = cache.get(k);
  if (!f) cache.set(k, (f = new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d })));
  return f;
}

/** Number with d decimals in the current locale; '–' when missing. */
export function num(x: number | null | undefined, d = 0): string {
  return x == null || !Number.isFinite(x) ? '–' : nf(Math.min(d, 3)).format(x);
}
/** Watts → kW. */
export const kw = (w: number | null | undefined, d = 1) => num(w == null ? null : w / 1000, d);
export const clp = (x: number | null | undefined) => (x == null ? '–' : `$${num(x)}`);

export function fmtDate(t: number | null | undefined): string {
  return t ? new Date(t).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) : '–';
}
export function fmtDateTime(t: number | null | undefined): string {
  return t ? new Date(t).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '–';
}
export function fmtTime(t: number, seconds = false): string {
  return new Date(t).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });
}
export function fmtDay(t: number | Date, opts: Intl.DateTimeFormatOptions): string {
  return new Date(t).toLocaleDateString(locale, opts);
}
/** Compact duration: "1 h 05 min" or "4 min 12 s". */
export function fmtDur(ms: number | null | undefined): string {
  if (ms == null || !(ms >= 0)) return '–';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min ${String(s % 60).padStart(2, '0')} s`;
}
/** Shortens long identifiers (VIN, EVCCID): "WVWZZZ…123456". */
export const abbr = (s: string | null | undefined, n = 6) => (s ? (s.length > n * 2 ? `${s.slice(0, n)}…${s.slice(-n)}` : s) : '');

/** Value for <input type="datetime-local"> from epoch ms. */
export function toLocalInput(t: number): string {
  const d = new Date(t - new Date(t).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export function niceStep(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v || 1)));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= v) || p * 10;
}

/** Stable colour per vehicle (grey when unidentified). */
export function vehicleColor(id: number | null | undefined): string {
  if (id == null) return 'hsl(210 8% 52%)';
  return `hsl(${((id * 137.508) % 360).toFixed(0)} 52% 46%)`;
}

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
