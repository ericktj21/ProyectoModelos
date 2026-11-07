/**
 * charts.js
 * ---------------------------------------------------------------------------
 * Librería de gráficas propia sobre <canvas> (sin dependencias externas):
 *
 *  - LineChart: curvas teóricas/simuladas, barras de error (IC 95 %), líneas
 *               de referencia horizontales/verticales y tooltip al pasar el
 *               ratón.
 *  - BarChart:  barras agrupadas por categoría (p. ej. distribución Pn).
 *
 * Ambas se adaptan automáticamente al tamaño del contenedor y a pantallas de
 * alta densidad (devicePixelRatio). Los colores base se leen de variables CSS
 * para mantener la coherencia con la hoja de estilos.
 * ---------------------------------------------------------------------------
 */

const PADDING = { top: 34, right: 18, bottom: 46, left: 62 };

function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Paso "bonito" (1, 2, 2.5, 5 × 10ⁿ) para las marcas de un eje. */
function niceStep(range, targetTicks = 6) {
  const raw = range / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const residual = raw / magnitude;
  const nice = residual > 5 ? 10 : residual > 2.5 ? 5 : residual > 2 ? 2.5 : residual > 1 ? 2 : 1;
  return nice * magnitude;
}

function ticks(min, max, target) {
  if (!(max > min)) return [min];
  const step = niceStep(max - min, target);
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

const defaultFormat = (v) => {
  const abs = Math.abs(v);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
  return v.toLocaleString('es-CO', { maximumFractionDigits: decimals });
};

class BaseChart {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = { xLabel: '', yLabel: '', title: '', ...options };
    this._observer = new ResizeObserver(() => this.draw());
    this._observer.observe(canvas.parentElement);
  }

  update(options) {
    Object.assign(this.options, options);
    this.draw();
  }

  /** Ajusta la resolución del canvas al tamaño CSS × devicePixelRatio. */
  _prepare() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const width = Math.max(0, Math.floor(rect.width));
    const height = Math.max(0, Math.floor(this.options.height || rect.height || 300));
    if (width === 0 || height === 0) return null;
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
      this.canvas.width = width * dpr;
      this.canvas.height = height * dpr;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, width, height);
    this.theme = {
      text: cssVar('--chart-text', '#cbd5e1'),
      grid: cssVar('--chart-grid', 'rgba(148,163,184,0.15)'),
      axis: cssVar('--chart-axis', 'rgba(148,163,184,0.5)'),
      font: cssVar('--font-sans', 'system-ui, sans-serif'),
    };
    return { width, height };
  }

  _drawFrame(size, xScale, yScale, xTicks, yTicks, xFormat, yFormat) {
    const { ctx, theme } = this;
    const { width, height } = size;
    const plotBottom = height - PADDING.bottom;
    const plotRight = width - PADDING.right;

    ctx.font = `12px ${theme.font}`;
    ctx.lineWidth = 1;

    // Rejilla y etiquetas del eje Y
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const t of yTicks) {
      const y = yScale(t);
      ctx.strokeStyle = theme.grid;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(plotRight, y);
      ctx.stroke();
      ctx.fillStyle = theme.text;
      ctx.fillText(yFormat(t), PADDING.left - 8, y);
    }

    // Etiquetas del eje X
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const t of xTicks) {
      const x = typeof t === 'object' ? t.x : xScale(t);
      const label = typeof t === 'object' ? t.label : xFormat(t);
      ctx.fillStyle = theme.text;
      ctx.fillText(label, x, plotBottom + 8);
    }

    // Ejes
    ctx.strokeStyle = theme.axis;
    ctx.beginPath();
    ctx.moveTo(PADDING.left, PADDING.top);
    ctx.lineTo(PADDING.left, plotBottom);
    ctx.lineTo(plotRight, plotBottom);
    ctx.stroke();

    // Títulos de los ejes
    ctx.fillStyle = theme.text;
    ctx.font = `600 12px ${theme.font}`;
    ctx.textAlign = 'center';
    ctx.fillText(this.options.xLabel, (PADDING.left + plotRight) / 2, height - 18);
    ctx.save();
    ctx.translate(14, (PADDING.top + plotBottom) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'middle';
    ctx.fillText(this.options.yLabel, 0, 0);
    ctx.restore();
  }

  _drawLegend(items, width) {
    const { ctx, theme } = this;
    ctx.font = `12px ${theme.font}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    let x = PADDING.left;
    const y = 14;
    for (const item of items) {
      const labelWidth = ctx.measureText(item.name).width;
      if (x + labelWidth + 30 > width) break;
      ctx.strokeStyle = item.color;
      ctx.fillStyle = item.color;
      ctx.lineWidth = 2.5;
      ctx.setLineDash(item.dashed ? [6, 4] : []);
      ctx.beginPath();
      if (item.bar) ctx.fillRect(x, y - 5, 18, 10);
      else {
        ctx.moveTo(x, y);
        ctx.lineTo(x + 18, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.fillStyle = theme.text;
      ctx.fillText(item.name, x + 24, y);
      x += labelWidth + 44;
    }
  }
}

export class LineChart extends BaseChart {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{
   *   xLabel?:string, yLabel?:string,
   *   series?:Array<{name:string,color:string,data:Array<{x:number,y:number,low?:number,high?:number}>,dashed?:boolean,points?:boolean}>,
   *   hLines?:Array<{y:number,label:string,color:string}>, vLines?:Array<{x:number,label:string,color:string}>,
   *   xMin?:number, xMax?:number, yMin?:number, yMax?:number,
   *   xFormat?:(v:number)=>string, yFormat?:(v:number)=>string, animate?:boolean
   * }} options
   */
  constructor(canvas, options = {}) {
    super(canvas, { series: [], hLines: [], vLines: [], ...options });
    this._hover = null;
    canvas.addEventListener('mousemove', (e) => this._onHover(e));
    canvas.addEventListener('mouseleave', () => {
      this._hover = null;
      this.draw();
    });
    this.draw();
  }

  _domain() {
    const o = this.options;
    const xs = [];
    const ys = [];
    for (const s of o.series) {
      for (const p of s.data) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        xs.push(p.x);
        if (Number.isFinite(p.low)) ys.push(p.low);
        if (Number.isFinite(p.high)) ys.push(p.high);
        ys.push(p.y);
      }
    }
    for (const h of o.hLines) if (Number.isFinite(h.y)) ys.push(h.y);
    for (const v of o.vLines) if (Number.isFinite(v.x)) xs.push(v.x);
    let xMin = o.xMin ?? (xs.length ? Math.min(...xs) : 0);
    let xMax = o.xMax ?? (xs.length ? Math.max(...xs) : 1);
    let yMin = o.yMin ?? (ys.length ? Math.min(0, ...ys) : 0);
    let yMax = o.yMax ?? (ys.length ? Math.max(...ys) * 1.08 : 1);
    if (xMax <= xMin) xMax = xMin + 1;
    if (yMax <= yMin) yMax = yMin + 1;
    return { xMin, xMax, yMin, yMax };
  }

  draw() {
    const size = this._prepare();
    if (!size) return;
    const { ctx } = this;
    const o = this.options;
    const { width, height } = size;
    const d = this._domain();
    const plotW = width - PADDING.left - PADDING.right;
    const plotH = height - PADDING.top - PADDING.bottom;
    const xScale = (x) => PADDING.left + ((x - d.xMin) / (d.xMax - d.xMin)) * plotW;
    const yScale = (y) => PADDING.top + plotH - ((Math.min(Math.max(y, d.yMin), d.yMax) - d.yMin) / (d.yMax - d.yMin)) * plotH;
    this._scales = { xScale, yScale, d };

    const xFormat = o.xFormat || defaultFormat;
    const yFormat = o.yFormat || defaultFormat;
    this._drawFrame(size, xScale, yScale, ticks(d.xMin, d.xMax, Math.max(3, Math.floor(plotW / 80))), ticks(d.yMin, d.yMax, 6), xFormat, yFormat);

    ctx.save();
    ctx.beginPath();
    ctx.rect(PADDING.left, PADDING.top - 2, plotW + 2, plotH + 4);
    ctx.clip();

    // Líneas de referencia
    ctx.font = `11px ${this.theme.font}`;
    for (const h of o.hLines) {
      const y = yScale(h.y);
      ctx.strokeStyle = h.color;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(PADDING.left + plotW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = h.color;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(h.label, PADDING.left + plotW - 4, y - 3);
    }
    for (const v of o.vLines) {
      const x = xScale(v.x);
      ctx.strokeStyle = v.color;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, PADDING.top);
      ctx.lineTo(x, PADDING.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = v.color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(v.label, x + 4, PADDING.top + 4);
    }

    // Series
    for (const s of o.series) {
      const pts = s.data.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (!pts.length) continue;
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.lineWidth || 2.2;
      ctx.setLineDash(s.dashed ? [7, 5] : []);
      if (s.line !== false) {
        ctx.beginPath();
        pts.forEach((p, i) => (i === 0 ? ctx.moveTo(xScale(p.x), yScale(p.y)) : ctx.lineTo(xScale(p.x), yScale(p.y))));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      if (s.area) {
        ctx.globalAlpha = 0.15;
        ctx.beginPath();
        ctx.moveTo(xScale(pts[0].x), yScale(d.yMin));
        pts.forEach((p) => ctx.lineTo(xScale(p.x), yScale(p.y)));
        ctx.lineTo(xScale(pts[pts.length - 1].x), yScale(d.yMin));
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      for (const p of pts) {
        if (Number.isFinite(p.low) && Number.isFinite(p.high)) {
          const x = xScale(p.x);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, yScale(p.low));
          ctx.lineTo(x, yScale(p.high));
          ctx.moveTo(x - 4, yScale(p.low));
          ctx.lineTo(x + 4, yScale(p.low));
          ctx.moveTo(x - 4, yScale(p.high));
          ctx.lineTo(x + 4, yScale(p.high));
          ctx.stroke();
        }
        if (s.points) {
          ctx.beginPath();
          ctx.arc(xScale(p.x), yScale(p.y), 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();

    this._drawLegend(o.series.filter((s) => s.name), width);
    this._drawHover(xFormat, yFormat, width);
  }

  _onHover(event) {
    if (!this._scales) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    let best = null;
    for (const s of this.options.series) {
      if (!s.name) continue;
      for (const p of s.data) {
        if (!Number.isFinite(p.y)) continue;
        const dx = this._scales.xScale(p.x) - mx;
        const dy = this._scales.yScale(p.y) - my;
        const dist = dx * dx + dy * dy;
        if (!best || dist < best.dist) best = { dist, p, s };
      }
    }
    this._hover = best && best.dist < 900 ? best : null;
    this.draw();
  }

  _drawHover(xFormat, yFormat, width) {
    if (!this._hover) return;
    const { ctx, theme } = this;
    const { p, s } = this._hover;
    const x = this._scales.xScale(p.x);
    const y = this._scales.yScale(p.y);
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    const text = `${s.name}: (${xFormat(p.x)}; ${yFormat(p.y)})`;
    ctx.font = `12px ${theme.font}`;
    const w = ctx.measureText(text).width + 14;
    const bx = Math.min(Math.max(x - w / 2, 4), width - w - 4);
    const by = Math.max(y - 34, 2);
    ctx.fillStyle = 'rgba(15,23,42,0.95)';
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, by, w, 24, 6) : ctx.rect(bx, by, w, 24);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + 7, by + 12);
  }
}

export class BarChart extends BaseChart {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{labels?:string[], series?:Array<{name:string,color:string,values:number[]}>, yFormat?:(v:number)=>string}} options
   */
  constructor(canvas, options = {}) {
    super(canvas, { labels: [], series: [], ...options });
    this.draw();
  }

  draw() {
    const size = this._prepare();
    if (!size) return;
    const { ctx } = this;
    const o = this.options;
    const { width, height } = size;
    const plotW = width - PADDING.left - PADDING.right;
    const plotH = height - PADDING.top - PADDING.bottom;
    const all = o.series.flatMap((s) => s.values).filter(Number.isFinite);
    const yMax = (all.length ? Math.max(...all) : 1) * 1.1 || 1;
    const yScale = (y) => PADDING.top + plotH - (Math.max(0, y) / yMax) * plotH;
    const n = Math.max(1, o.labels.length);
    const band = plotW / n;
    const every = Math.ceil(n / Math.max(1, Math.floor(plotW / 34)));
    const xTicks = o.labels
      .map((label, i) => ({ x: PADDING.left + band * (i + 0.5), label }))
      .filter((_, i) => i % every === 0);

    this._drawFrame(size, null, yScale, xTicks, ticks(0, yMax, 5), null, o.yFormat || defaultFormat);

    // overlay = true: las series comparten el mismo espacio (útil cuando son complementarias).
    const groupW = band * 0.78;
    const barW = o.overlay ? groupW : groupW / Math.max(1, o.series.length);
    o.series.forEach((s, si) => {
      ctx.fillStyle = s.color;
      s.values.forEach((v, i) => {
        if (!Number.isFinite(v)) return;
        const x = PADDING.left + band * i + (band - groupW) / 2 + (o.overlay ? 0 : si * barW);
        const y = yScale(v);
        ctx.fillRect(x, y, Math.max(1, barW - 1), PADDING.top + plotH - y);
      });
    });
    this._drawLegend(o.series.map((s) => ({ ...s, bar: true })), width);
  }
}
