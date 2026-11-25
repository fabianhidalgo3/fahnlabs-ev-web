// Canvas charts. Colours come from the CSS tokens, so both themes work without extra code.
import { niceStep, num } from '../core/fmt';

export interface Series {
  values: number[]; // one value per x
  color: string; // CSS variable name, e.g. '--carga'
  kind: 'area' | 'line' | 'dash';
  base?: number[]; // area bottom (stacked areas)
  step?: boolean; // draw as steps (window averages)
}

export interface ChartSpec {
  xs: number[]; // epoch ms
  series: Series[];
  limit?: number; // drawn as a hazard band
  unit: string;
  xLabel: (t: number) => string;
}

function prepare(cv: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  if (!w || !h) return null;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const css = getComputedStyle(document.documentElement);
  const col = (v: string) => css.getPropertyValue(v).trim() || '#888';
  return { ctx, w, h, col };
}

/** Draws a time chart; returns silently when the canvas is not visible yet. */
export function drawChart(cv: HTMLCanvasElement | undefined, spec: ChartSpec) {
  if (!cv) return;
  const p = prepare(cv);
  if (!p || spec.xs.length < 2) return;
  const { ctx, w, h, col } = p;
  const pad = { l: 52, r: 10, t: 12, b: 22 };
  let maxV = spec.limit ?? 0;
  for (const s of spec.series) for (let i = 0; i < s.values.length; i++) maxV = Math.max(maxV, s.values[i] + (s.base?.[i] ?? 0));
  maxV = maxV * 1.12 || 1;
  const t0 = spec.xs[0];
  const t1 = spec.xs[spec.xs.length - 1];
  const x = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (w - pad.l - pad.r);
  const y = (v: number) => h - pad.b - (v / maxV) * (h - pad.t - pad.b);

  const font = getComputedStyle(document.body).fontFamily;
  ctx.font = `12px ${font}`;
  ctx.fillStyle = col('--muted');
  ctx.strokeStyle = col('--rule');
  ctx.lineWidth = 1;
  const stepV = niceStep(maxV / 4);
  for (let v = 0; v <= maxV; v += stepV) {
    ctx.beginPath();
    ctx.moveTo(pad.l, Math.round(y(v)) + 0.5);
    ctx.lineTo(w - pad.r, Math.round(y(v)) + 0.5);
    ctx.stroke();
    ctx.fillText(`${num(v)} ${spec.unit}`, 4, y(v) + 4);
  }
  const l0 = spec.xLabel(t0);
  const l1 = spec.xLabel(t1);
  ctx.fillText(l0, pad.l, h - 5);
  ctx.fillText(l1, w - pad.r - ctx.measureText(l1).width, h - 5);

  const path = (vals: number[], step?: boolean) => {
    ctx.beginPath();
    vals.forEach((v, i) => {
      const px = x(spec.xs[i]);
      if (!i) ctx.moveTo(px, y(v));
      else {
        if (step) ctx.lineTo(px, y(vals[i - 1]));
        ctx.lineTo(px, y(v));
      }
    });
  };
  for (const s of spec.series) {
    const top = s.values.map((v, i) => v + (s.base?.[i] ?? 0));
    if (s.kind === 'area') {
      path(top, s.step);
      for (let i = top.length - 1; i >= 0; i--) {
        const b = s.base?.[i] ?? 0;
        if (s.step && i < top.length - 1) ctx.lineTo(x(spec.xs[i + 1]), y(s.base?.[i] ?? 0));
        ctx.lineTo(x(spec.xs[i]), y(b));
      }
      ctx.closePath();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = col(s.color);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    path(top, s.step);
    ctx.setLineDash(s.kind === 'dash' ? [5, 4] : []);
    ctx.strokeStyle = col(s.color);
    ctx.lineWidth = s.kind === 'area' ? 2 : 1.6;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (spec.limit) {
    // The contracted limit as a hazard band: yellow and ink stripes
    const ly = y(spec.limit);
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, ly - 3, w - pad.l - pad.r, 6);
    ctx.clip();
    ctx.fillStyle = col('--limite');
    ctx.fillRect(pad.l, ly - 3, w - pad.l - pad.r, 6);
    ctx.strokeStyle = col('--ink');
    ctx.lineWidth = 3;
    for (let sx = pad.l - 12; sx < w; sx += 12) {
      ctx.beginPath();
      ctx.moveTo(sx, ly + 6);
      ctx.lineTo(sx + 12, ly - 6);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Sparkline (SVG path points) of measured vs allocated power. */
export function sparkPoints(values: number[], maxV: number, w = 160, h = 30): string {
  if (values.length < 2) return '';
  const m = Math.max(maxV, ...values, 1);
  return values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - (v / m) * (h - 4)).toFixed(1)}`).join(' ');
}
