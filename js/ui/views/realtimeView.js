/**
 * realtimeView.js
 * ---------------------------------------------------------------------------
 * Vista "Tiempo real": controla una instancia del simulador paso a paso
 * sincronizada con requestAnimationFrame. En cada cuadro avanza el reloj de
 * simulación según la velocidad elegida, procesa los eventos ocurridos y
 * actualiza la animación, las métricas en vivo, la gráfica N(t) y la
 * bitácora de eventos.
 *
 *   tiempo simulado por cuadro = tiempo real del cuadro × velocidad
 *
 * Usa exactamente la misma clase LandingSimulator que la simulación por
 * lotes, por lo que lo que se ve es el mismo modelo validado contra la teoría.
 * ---------------------------------------------------------------------------
 */

import { $, fmt, pct, minutes, readForm, clockLabel, bindOutputs, escapeHtml } from '../dom.js';
import { LandingSimulator } from '../../core/simulator.js';
import { theoryFor } from '../../core/experiments.js';
import { AirportRenderer } from '../../graphics/airportRenderer.js';
import { LineChart } from '../../graphics/charts.js';

const HISTORY_WINDOW_MIN = 120; // ventana de la gráfica N(t)
const UI_REFRESH_MS = 250;
const MAX_LOG_ENTRIES = 60;

export class RealtimeView {
  constructor(router) {
    this.form = $('#rt-form');
    this.renderer = new AirportRenderer($('#rt-canvas'));
    this.chart = new LineChart($('#rt-chart'), {
      xLabel: 'Tiempo de simulación (min)',
      yLabel: 'N(t)',
      yMin: 0,
    });
    this.running = true;
    this.visible = false;
    this.lastFrame = performance.now();
    this.lastUiRefresh = 0;
    this.seed = 1;

    bindOutputs(this.form);
    this.form.addEventListener('change', (e) => {
      if (e.target.name !== 'speed') this.reset();
    });
    this.form.addEventListener('input', (e) => {
      if (e.target.name === 'speed') this.speed = readForm(this.form).speed;
    });
    $('#rt-play').addEventListener('click', () => this.togglePlay());
    $('#rt-reset').addEventListener('click', () => this.reset(true));
    $('#rt-emergency').addEventListener('click', () => this.declareEmergency());

    router.onShow('tiempo-real', () => {
      this.visible = true;
      this.lastFrame = performance.now();
      this.chart.draw();
    });
    window.addEventListener('hashchange', () => {
      this.visible = location.hash === '#tiempo-real';
    });

    this.reset();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- control
  reset(newSeed = false) {
    const v = readForm(this.form);
    if (newSeed) this.seed++;
    this.params = { lambda: v.lambda, mu: v.mu, p: v.p, K: Math.round(v.K), discipline: v.discipline };
    this.speed = v.speed;
    if (!(v.lambda > 0 && v.mu > 0 && v.K >= 1 && v.speed >= 0)) {
      this.sim = null;
      this.theory = null;
      this.history = [{ x: 0, y: 0 }];
      this.wasSaturated = false;
      this.renderer.reset();
      $('#rt-log').innerHTML = '';
      this.log('Escribe valores mayores que 0 en λ, μ y K para iniciar la simulación.', 'alert');
      this.refreshUi(true);
      return;
    }
    this.sim = new LandingSimulator(
      {
        lambda: v.lambda,
        mu: v.mu,
        emergencyFraction: v.p,
        capacityK: Math.round(v.K),
        discipline: v.discipline,
        warmup: 0,
        horizon: Infinity,
      },
      this.seed,
    );
    this.sim.listener = (name, aircraft, sim) => this.onSimulationEvent(name, aircraft, sim);
    this.theory = theoryFor(this.sim.config);
    this.history = [{ x: 0, y: 0 }];
    this.wasSaturated = false;
    this.renderer.reset();
    $('#rt-log').innerHTML = '';
    this.log(`Simulación iniciada: λ = ${fmt(v.lambda, 0)}/h, μ = ${fmt(v.mu, 0)}/h, p = ${pct(v.p, 0)}, ${v.discipline === 'priority' ? 'prioridad' : 'FIFO'}.`, 'alert');
    this.refreshUi(true);
  }

  togglePlay() {
    this.running = !this.running;
    $('#rt-play').textContent = this.running ? '⏸ Pausar' : '▶ Reanudar';
    this.lastFrame = performance.now();
  }

  declareEmergency() {
    if (!this.sim) return;
    const aircraft = this.sim.injectArrival(true);
    this.log(`AV-${pad(aircraft.id)} declara EMERGENCIA manualmente.`, 'emergency');
  }

  // ------------------------------------------------------------- bucle
  frame(now) {
    const dtReal = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    if (this.visible) {
      if (this.sim && this.running) {
        const simDeltaHours = (dtReal * this.speed) / 60;
        this.sim.runUntil(this.sim.clock + simDeltaHours);
        this.sampleHistory();
      }
      if (this.sim) {
        this.renderer.render({
          clock: this.sim.clock,
          holding: this.sim.getHoldingAircraft(),
          runway: this.sim.runway,
          capacityK: this.params.K,
          numberInSystem: this.sim.numberInSystem,
          paused: !this.running,
        });
      }
      if (now - this.lastUiRefresh > UI_REFRESH_MS) {
        this.lastUiRefresh = now;
        this.refreshUi();
      }
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  sampleHistory() {
    const minutesNow = this.sim.clock * 60;
    const last = this.history[this.history.length - 1];
    const n = this.sim.numberInSystem;
    if (last.y !== n || minutesNow - last.x > 0.5) this.history.push({ x: minutesNow, y: n });
    const cutoff = minutesNow - HISTORY_WINDOW_MIN;
    while (this.history.length > 2 && this.history[1].x < cutoff) this.history.shift();

    const saturated = n >= this.params.K;
    if (saturated && !this.wasSaturated) this.log(`⚠ Saturación: N = ${n} ≥ K = ${this.params.K}.`, 'alert');
    this.wasSaturated = saturated;
  }

  // --------------------------------------------------------- eventos/bitácora
  onSimulationEvent(name, aircraft, sim) {
    const tag = `AV-${pad(aircraft.id)}${aircraft.isEmergency ? ' (EMERGENCIA)' : ''}`;
    if (name === 'arrival') {
      if (sim.runway === null) this.log(`${tag} llega y encuentra la pista libre.`, aircraft.isEmergency ? 'emergency' : '');
      else this.log(`${tag} entra al patrón de espera (cola: ${sim.queueLength + 1}).`, aircraft.isEmergency ? 'emergency' : '');
    } else if (name === 'startLanding') {
      const wait = (aircraft.serviceStart - aircraft.arrivalTime) * 60;
      if (wait > 0) this.log(`${tag} inicia aterrizaje tras esperar ${fmt(wait, 1)} min.`, 'landing');
    } else if (name === 'departure') {
      this.renderer.notifyDeparture(aircraft);
    }
  }

  log(message, type = '') {
    const list = $('#rt-log');
    const li = document.createElement('li');
    li.className = type ? `log--${type}` : '';
    li.innerHTML = `<time>${clockLabel(this.sim ? this.sim.clock : 0)}</time>${escapeHtml(message)}`;
    list.prepend(li);
    while (list.children.length > MAX_LOG_ENTRIES) list.lastChild.remove();
  }

  // ------------------------------------------------------------- métricas
  refreshUi(force = false) {
    if (!this.visible && !force) return;
    if (!this.sim || !this.theory) {
      $('#rt-clock').textContent = '00:00:00';
      $('#rt-status').className = 'banner banner--compact banner--warn';
      $('#rt-status').textContent = 'Completa λ, μ y K con valores mayores que 0 para comenzar.';
      $('#rt-metrics').innerHTML = '';
      return;
    }
    const r = this.sim.getResults();
    const t = this.theory;
    const n = this.sim.numberInSystem;
    $('#rt-clock').textContent = clockLabel(this.sim.clock);

    const status = $('#rt-status');
    if (!t.stable) {
      status.className = 'banner banner--compact banner--danger';
      status.textContent = `ρ = ${fmt(t.rho, 2)} ≥ 1: sistema inestable, la cola crecerá indefinidamente.`;
    } else if (n >= this.params.K) {
      status.className = 'banner banner--compact banner--danger';
      status.textContent = `Saturación: ${n} aviones en el sistema (K = ${this.params.K}).`;
    } else {
      status.className = 'banner banner--compact banner--ok';
      status.textContent = `Operación normal: ${n} avión(es) en el sistema.`;
    }

    const row = (label, sim, theo) => `<tr><td>${label}</td><td>${sim}</td><td>${theo}</td></tr>`;
    const hasEmergency = this.params.p > 0 || r.servedEmergency > 0;
    $('#rt-metrics').innerHTML = `
      <table class="live-table">
        <thead><tr><th>Métrica</th><th>Simulado</th><th>Teórico</th></tr></thead>
        <tbody>
          ${row('Utilización ρ', fmt(r.utilization, 3), fmt(t.rho, 3))}
          ${row('Lq (aviones)', fmt(r.Lq, 2), fmt(t.Lq, 2))}
          ${row('Wq global (min)', minutes(r.Wq), minutes(t.Wq))}
          ${hasEmergency ? row('Wq emergencias (min)', minutes(r.WqEmergency), minutes(t.WqEmergency)) : ''}
          ${row('Wq normales (min)', minutes(r.WqNormal), minutes(t.WqNormal))}
          ${row(`P(N ≥ ${this.params.K})`, pct(r.pSaturation, 1), pct(t.pSaturation, 1))}
          ${row('Aterrizajes', fmt(r.served, 0), '—')}
          ${row('Cola máxima', fmt(r.maxQueue, 0), '—')}
        </tbody>
      </table>
      <p class="hint">Los promedios simulados convergen a los teóricos a medida que avanza el reloj (ley de los grandes números).</p>`;

    const xMax = Math.max(HISTORY_WINDOW_MIN, this.sim.clock * 60);
    const series = [{ name: 'N(t)', color: '#38bdf8', data: stepSeries(this.history, this.sim.clock * 60), area: true }];
    this.chart.update({
      series,
      xMin: xMax - HISTORY_WINDOW_MIN,
      xMax,
      yMax: Math.max(this.params.K + 2, ...this.history.map((p) => p.y + 1)),
      hLines: [{ y: this.params.K, label: `K = ${this.params.K}`, color: '#ef4444' }],
    });
  }
}

const pad = (id) => String(id).padStart(3, '0');

/** Convierte muestras en una función escalonada (N(t) es constante entre eventos). */
function stepSeries(points, xEnd) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    out.push(points[i]);
    const nextX = i + 1 < points.length ? points[i + 1].x : xEnd;
    out.push({ x: nextX, y: points[i].y });
  }
  return out;
}
