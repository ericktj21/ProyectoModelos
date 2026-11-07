/**
 * airportRenderer.js
 * ---------------------------------------------------------------------------
 * Representación gráfica en tiempo real del sistema de colas:
 *
 *   - Patrón de espera (circuito tipo "hipódromo") donde orbitan las
 *     aeronaves en cola, numeradas según su turno de aterrizaje.
 *   - Pista de aterrizaje (el servidor), con la aeronave que la ocupa
 *     avanzando según la fracción de su tiempo de servicio transcurrida.
 *   - Aeronaves que llegan (entran desde el borde) y que salen (rodaje).
 *   - Indicador de saturación cuando N ≥ K.
 *
 * Este módulo SÓLO dibuja: no conoce la lógica del simulador. Recibe una
 * "instantánea" (snapshot) del estado y la pinta, lo que separa claramente
 * el modelo (core/) de la presentación (graphics/).
 * ---------------------------------------------------------------------------
 */

import { drawAircraft } from './aircraftShape.js';

const COLORS = {
  normal: { body: '#e2e8f0', accent: '#38bdf8' },
  emergency: { body: '#f87171', accent: '#fde047' },
  track: 'rgba(56,189,248,0.35)',
  trackSaturated: 'rgba(239,68,68,0.85)',
  runway: '#1f2937',
  runwayEdge: '#64748b',
  text: '#cbd5e1',
};

const ARRIVAL_ANIMATION_MS = 1100;
const DEPARTURE_ANIMATION_MS = 1400;
const ORBIT_SPEED_PX_S = 38;

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

export class AirportRenderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.appearTimes = new Map();
    this.slotPositions = new Map();
    this.departures = [];
    this.phase = 0;
    this.radarAngle = 0;
    this.lastFrame = performance.now();
    this._resize();
    new ResizeObserver(() => this._resize()).observe(canvas.parentElement);
  }

  reset() {
    this.appearTimes.clear();
    this.slotPositions.clear();
    this.departures = [];
  }

  /** Avisa al renderizador de que una aeronave terminó de aterrizar (animación de rodaje). */
  notifyDeparture(aircraft) {
    this.departures.push({ aircraft, start: performance.now() });
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = Math.max(320, Math.floor(rect.width));
    this.height = Math.max(260, Math.floor(rect.height));
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._computeLayout();
  }

  _computeLayout() {
    const { width: W, height: H } = this;
    const r = Math.min(H * 0.16, W * 0.11);
    const straight = Math.max(60, Math.min(W * 0.42, W - 2 * r - 140));
    this.track = { cx: W * 0.5, cy: H * 0.32, r, straight };
    this.track.perimeter = 2 * straight + 2 * Math.PI * r;
    this.aircraftSize = Math.max(18, Math.min(30, W / 32));
    const runwayLength = W * 0.66;
    this.runway = { x0: (W - runwayLength) / 2, x1: (W + runwayLength) / 2, y: H * 0.8, h: Math.max(26, H * 0.075) };
  }

  /** Punto y rumbo a una distancia `s` a lo largo del circuito de espera (sentido horario). */
  _trackPoint(s) {
    const { cx, cy, r, straight, perimeter } = this.track;
    let d = ((s % perimeter) + perimeter) % perimeter;
    const half = straight / 2;
    if (d < straight) return { x: cx - half + d, y: cy - r, angle: 0 };
    d -= straight;
    if (d < Math.PI * r) {
      const a = -Math.PI / 2 + d / r;
      return { x: cx + half + r * Math.cos(a), y: cy + r * Math.sin(a), angle: a + Math.PI / 2 };
    }
    d -= Math.PI * r;
    if (d < straight) return { x: cx + half - d, y: cy + r, angle: Math.PI };
    d -= straight;
    const a = Math.PI / 2 + d / r;
    return { x: cx - half + r * Math.cos(a), y: cy + r * Math.sin(a), angle: a + Math.PI / 2 };
  }

  /** Trayectoria de aterrizaje: aproximación (curva) + recorrido sobre la pista. */
  _landingPoint(progress) {
    const { x0, x1, y } = this.runway;
    const start = { x: this.track.cx - this.track.straight / 2 - this.track.r * 0.9, y: this.track.cy + this.track.r * 0.7 };
    const control = { x: x0 - 70, y: y - 10 };
    const threshold = { x: x0 + 20, y };
    const approachShare = 0.4;
    if (progress < approachShare) {
      const t = easeInOut(progress / approachShare);
      const px = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * control.x + t * t * threshold.x;
      const py = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * control.y + t * t * threshold.y;
      const dx = 2 * (1 - t) * (control.x - start.x) + 2 * t * (threshold.x - control.x);
      const dy = 2 * (1 - t) * (control.y - start.y) + 2 * t * (threshold.y - control.y);
      return { x: px, y: py, angle: Math.atan2(dy, dx), scale: lerp(1.1, 0.95, t) };
    }
    const t = easeOut((progress - approachShare) / (1 - approachShare));
    return { x: lerp(threshold.x, x1 - 50, t), y, angle: 0, scale: 0.95 };
  }

  /**
   * Dibuja un cuadro.
   * @param {{clock:number, holding:object[], runway:object|null, capacityK:number, numberInSystem:number}} snapshot
   */
  render(snapshot) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.phase += ORBIT_SPEED_PX_S * dt * (snapshot.paused ? 0 : 1);
    this.radarAngle += dt * 0.9;

    const saturated = snapshot.numberInSystem >= snapshot.capacityK;
    this._drawBackground();
    this._drawTrack(saturated, snapshot);
    this._drawRunway(snapshot);
    this._drawHolding(snapshot.holding, now);
    this._drawLanding(snapshot);
    this._drawDepartures(now);
    this._drawLegend();
  }

  _drawBackground() {
    const { ctx, width: W, height: H } = this;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1324');
    g.addColorStop(1, '#0f1d33');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Anillos de radar centrados en el patrón de espera
    const { cx, cy } = this.track;
    ctx.strokeStyle = 'rgba(56,189,248,0.07)';
    ctx.lineWidth = 1;
    for (let rr = 60; rr < Math.max(W, H); rr += 70) {
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Barrido del radar
    const sweep = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.6);
    sweep.addColorStop(0, 'rgba(56,189,248,0.18)');
    sweep.addColorStop(1, 'rgba(56,189,248,0)');
    ctx.fillStyle = sweep;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, Math.max(W, H) * 0.6, this.radarAngle, this.radarAngle + 0.35);
    ctx.closePath();
    ctx.fill();
  }

  _drawTrack(saturated, snapshot) {
    const { ctx } = this;
    const { cx, cy, r, straight } = this.track;
    const half = straight / 2;
    ctx.save();
    ctx.lineWidth = saturated ? 3 : 2;
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = saturated ? COLORS.trackSaturated : COLORS.track;
    if (saturated) {
      ctx.shadowColor = 'rgba(239,68,68,0.8)';
      ctx.shadowBlur = 14;
    }
    ctx.beginPath();
    ctx.moveTo(cx - half, cy - r);
    ctx.lineTo(cx + half, cy - r);
    ctx.arc(cx + half, cy, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(cx - half, cy + r);
    ctx.arc(cx - half, cy, r, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = saturated ? '#fca5a5' : COLORS.text;
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PATRÓN DE ESPERA', cx, cy - 8);
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`En espera: ${snapshot.holding.length}  ·  N = ${snapshot.numberInSystem} / K = ${snapshot.capacityK}`, cx, cy + 12);
    if (saturated) {
      ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#ef4444';
      ctx.fillText('⚠ SATURACIÓN (N ≥ K)', cx, cy + 32);
    }
  }

  _drawRunway(snapshot) {
    const { ctx } = this;
    const { x0, x1, y, h } = this.runway;
    ctx.fillStyle = COLORS.runway;
    ctx.strokeStyle = COLORS.runwayEdge;
    ctx.lineWidth = 2;
    ctx.fillRect(x0, y - h / 2, x1 - x0, h);
    ctx.strokeRect(x0, y - h / 2, x1 - x0, h);

    // Línea central
    ctx.strokeStyle = 'rgba(248,250,252,0.6)';
    ctx.setLineDash([16, 12]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 + 40, y);
    ctx.lineTo(x1 - 40, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Marcas de umbral
    ctx.fillStyle = 'rgba(248,250,252,0.7)';
    for (let i = 0; i < 4; i++) {
      const off = -h / 2 + 5 + i * ((h - 10) / 4);
      ctx.fillRect(x0 + 6, y + off, 18, (h - 10) / 4 - 3);
      ctx.fillRect(x1 - 24, y + off, 18, (h - 10) / 4 - 3);
    }

    // Luces de borde
    const busy = !!snapshot.runway;
    ctx.fillStyle = busy ? '#f59e0b' : '#22c55e';
    for (let x = x0 + 10; x < x1; x += 28) {
      ctx.beginPath();
      ctx.arc(x, y - h / 2 - 5, 2, 0, Math.PI * 2);
      ctx.arc(x, y + h / 2 + 5, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = COLORS.text;
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(busy ? 'PISTA OCUPADA' : 'PISTA LIBRE', (x0 + x1) / 2, y + h / 2 + 24);
  }

  _styleFor(aircraft, now) {
    if (!aircraft.isEmergency) return { ...COLORS.normal };
    const pulse = 0.25 + 0.2 * Math.sin(now / 160);
    return { ...COLORS.emergency, halo: `rgba(239,68,68,${pulse.toFixed(3)})` };
  }

  _drawHolding(holding, now) {
    const { ctx } = this;
    const n = holding.length;
    const spacing = Math.min(this.aircraftSize * 2.2, this.track.perimeter / Math.max(1, n));
    const alive = new Set();

    holding.forEach((aircraft, index) => {
      alive.add(aircraft.id);
      if (!this.appearTimes.has(aircraft.id)) this.appearTimes.set(aircraft.id, now);
      const target = this._trackPoint(this.phase - index * spacing);

      // Animación de entrada desde el borde derecho
      const age = (now - this.appearTimes.get(aircraft.id)) / ARRIVAL_ANIMATION_MS;
      let pos = target;
      if (age < 1) {
        const t = easeOut(Math.max(0, age));
        const from = { x: this.width + 30, y: this.track.cy - this.track.r - 50 };
        pos = { x: lerp(from.x, target.x, t), y: lerp(from.y, target.y, t), angle: t < 0.8 ? Math.PI : target.angle };
      }
      // Suaviza los saltos de posición cuando cambia el orden (p. ej. entra una emergencia)
      const prev = this.slotPositions.get(aircraft.id);
      if (prev && age >= 1) {
        pos = { x: lerp(prev.x, pos.x, 0.18), y: lerp(prev.y, pos.y, 0.18), angle: pos.angle };
      }
      this.slotPositions.set(aircraft.id, pos);

      drawAircraft(ctx, pos.x, pos.y, pos.angle, this.aircraftSize, this._styleFor(aircraft, now));
      if (index < 15) {
        ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = aircraft.isEmergency ? '#fecaca' : '#bae6fd';
        ctx.fillText(`#${index + 1}`, pos.x, pos.y - this.aircraftSize * 0.75);
      }
    });

    for (const id of this.appearTimes.keys()) {
      if (!alive.has(id)) {
        this.appearTimes.delete(id);
        this.slotPositions.delete(id);
      }
    }
  }

  _drawLanding(snapshot) {
    const aircraft = snapshot.runway;
    if (!aircraft) return;
    const progress = Math.min(1, Math.max(0, (snapshot.clock - aircraft.serviceStart) / aircraft.serviceTime));
    const p = this._landingPoint(progress);
    drawAircraft(this.ctx, p.x, p.y, p.angle, this.aircraftSize * p.scale, this._styleFor(aircraft, performance.now()));
    this.ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.fillText(`AV-${String(aircraft.id).padStart(3, '0')}`, p.x, p.y - this.aircraftSize * 0.8);
  }

  _drawDepartures(now) {
    const { x1, y, h } = this.runway;
    this.departures = this.departures.filter((d) => now - d.start < DEPARTURE_ANIMATION_MS);
    for (const d of this.departures) {
      const t = (now - d.start) / DEPARTURE_ANIMATION_MS;
      const x = lerp(x1 - 50, x1 + 10, Math.min(1, t * 1.5));
      const yy = y + easeInOut(t) * (h * 1.6);
      const angle = lerp(0, Math.PI / 2, easeInOut(t));
      drawAircraft(this.ctx, x, yy, angle, this.aircraftSize * 0.9, { ...this._styleFor(d.aircraft, now), halo: null, alpha: 1 - t });
    }
  }

  _drawLegend() {
    const { ctx, height: H } = this;
    const y = H - 16;
    drawAircraft(ctx, 22, y, 0, 18, COLORS.normal);
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.text;
    ctx.fillText('Vuelo normal', 38, y + 4);
    drawAircraft(ctx, 140, y, 0, 18, COLORS.emergency);
    ctx.fillText('Emergencia (prioridad)', 156, y + 4);
  }
}
