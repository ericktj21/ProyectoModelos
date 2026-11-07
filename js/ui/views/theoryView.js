/**
 * theoryView.js
 * ---------------------------------------------------------------------------
 * Vista "Modelo teórico": calculadora interactiva de la Tabla 1 del informe,
 * distribución estacionaria Pn y esperas por clase de Cobham con la
 * verificación de la ley de conservación.
 * ---------------------------------------------------------------------------
 */

import { $, fmt, pct, minutes, readForm, renderTable } from '../dom.js';
import { metricCard, bindErlangToggle, serviceFromForm } from '../widgets.js';
import { BarChart } from '../../graphics/charts.js';
import { queueMetrics, priorityWaits, stationaryDistribution, serviceMoments } from '../../core/theory.js';

export class TheoryView {
  constructor(router) {
    this.form = $('#theory-form');
    this.pnChart = new BarChart($('#th-pn-chart'), {
      xLabel: 'n (aviones en el sistema)',
      yLabel: 'Probabilidad',
      overlay: true,
      yFormat: (v) => `${(v * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`,
    });
    bindErlangToggle(this.form);
    this.form.addEventListener('input', () => this.update());
    this.form.addEventListener('change', () => this.update());
    router.onShow('teoria', () => this.pnChart.draw());
    this.update();
  }

  readParams() {
    const v = readForm(this.form);
    return { lambda: v.lambda, mu: v.mu, p: v.p, K: Math.round(v.K), service: serviceFromForm(v) };
  }

  update() {
    const params = this.readParams();
    const { lambda, mu, p, K, service } = params;
    if (!(lambda > 0 && mu > 0 && K >= 1 && p >= 0 && p <= 1)) return;

    const m = queueMetrics({ lambda, mu, K, service });
    const prio = priorityWaits({ lambda, mu, p, service });
    const moments = serviceMoments(service, mu);
    $('#th-service-mean').textContent = `${minutes(moments.mean)} min (${moments.label})`;

    this.renderStability(m);
    this.renderMetrics(m, K);
    this.renderTable(m, prio, params);
    this.renderPriority(m, prio, p);
    this.renderDistribution(m, K);
  }

  renderStability(m) {
    const el = $('#th-stability');
    if (!m.stable) {
      el.className = 'banner banner--danger';
      el.innerHTML = `<strong>Sistema inestable (ρ = ${fmt(m.rho, 3)} ≥ 1).</strong> Llegan más aviones de los que la pista puede atender: la cola crece sin límite y no existe régimen estacionario.`;
    } else if (m.rho >= 0.83) {
      el.className = 'banner banner--warn';
      el.innerHTML = `<strong>Carga crítica (ρ = ${fmt(m.rho, 3)}).</strong> El sistema es estable, pero la espera crece muy rápido al acercarse a ρ = 1.`;
    } else {
      el.className = 'banner banner--ok';
      el.innerHTML = `<strong>Sistema estable (ρ = ${fmt(m.rho, 3)} &lt; 1).</strong> Modelo ${m.model}: la pista está ocupada el ${pct(m.rho)} del tiempo.`;
    }
  }

  renderMetrics(m, K) {
    const tone = m.rho >= 1 ? 'danger' : m.rho >= 0.83 ? 'warn' : 'ok';
    const satTone = m.pSaturation > 0.05 ? 'danger' : 'ok';
    $('#th-metrics').innerHTML = [
      metricCard({ label: 'Utilización ρ = λ/μ', value: fmt(m.rho, 3), tone }),
      metricCard({ label: 'Aviones en espera Lq', value: fmt(m.Lq, 3), unit: 'aviones' }),
      metricCard({ label: 'Aviones en el sistema L', value: fmt(m.L, 3), unit: 'aviones' }),
      metricCard({ label: 'Espera en vuelo Wq', value: minutes(m.Wq), unit: 'min', tone: m.Wq > 10 / 60 ? 'danger' : 'info' }),
      metricCard({ label: 'Tiempo en el sistema W', value: minutes(m.W), unit: 'min' }),
      metricCard({
        label: `Riesgo de saturación P(N ≥ ${K})`,
        value: m.isMarkovian ? pct(m.pSaturation, 2) : 'N/D',
        sub: m.isMarkovian ? '' : 'Sólo tiene forma cerrada en M/M/1',
        tone: m.isMarkovian ? satTone : 'info',
      }),
    ].join('');
  }

  renderTable(m, prio, { lambda, mu, K }) {
    const rows = [
      ['Factor de utilización', '<span class="formula">ρ = λ / μ</span>', fmt(m.rho, 4), 'Fracción de tiempo que la pista está ocupada; estable sólo si ρ < 1.'],
      ['Probabilidad de 0 aviones', '<span class="formula">P₀ = 1 − ρ</span>', m.isMarkovian ? fmt(m.P0, 4) : 'N/D', 'Fracción de tiempo con la pista libre y sin aviones en espera.'],
      ['Aviones en espera', '<span class="formula">Lq = λ E[S²] / (2(1 − ρ))</span>', fmt(m.Lq, 4), 'Longitud promedio del patrón de espera (en M/M/1: ρ² / (1 − ρ)).'],
      ['Tiempo de espera', '<span class="formula">Wq = Lq / λ</span>', `${minutes(m.Wq, 3)} min`, 'Espera promedio antes de aterrizar (en M/M/1: ρ / (μ − λ)).'],
      ['Ley de Little', '<span class="formula">L = λW ; Lq = λWq</span>', `${fmt(lambda, 2)} × ${fmt(m.Wq, 5)} h = ${fmt(lambda * m.Wq, 4)}`, 'Relaciona longitudes de cola y tiempos de espera.'],
      ['Riesgo de saturación', `<span class="formula">P(N ≥ K) = ρ<sup>K</sup></span>`, m.isMarkovian ? pct(m.pSaturation, 3) : 'N/D', `Probabilidad de tener ${K} o más aviones en el sistema.`],
      ['Residuo de servicio', '<span class="formula">W₀ = λ E[S²] / 2</span>', `${minutes(prio.W0, 3)} min`, 'En M/M/1: W₀ = ρ / μ.'],
      ['Espera de emergencias', '<span class="formula">Wq,e = W₀ / (1 − pρ)</span>', `${minutes(prio.WqEmergency, 3)} min`, 'Prioridad sin expropiación (Cobham, 1954).'],
      ['Espera de vuelos normales', '<span class="formula">Wq,n = W₀ / [(1 − pρ)(1 − ρ)]</span>', `${minutes(prio.WqNormal, 3)} min`, 'Los vuelos normales asumen el costo de la prioridad.'],
    ];
    renderTable($('#th-table'), ['Magnitud', 'Expresión', `Valor (λ = ${fmt(lambda, 1)}, μ = ${fmt(mu, 1)})`, 'Interpretación'], rows);
  }

  renderPriority(m, prio, p) {
    const vsFifo = (w) => (m.stable ? `${w >= m.Wq ? '+' : ''}${fmt(((w - m.Wq) / m.Wq) * 100, 1)} %` : '—');
    renderTable(
      $('#th-priority'),
      ['Clase', 'Wq (min)', 'vs. FIFO'],
      [
        [`Emergencias (p = ${pct(p, 0)})`, minutes(prio.WqEmergency), m.stable ? `<span class="good">${vsFifo(prio.WqEmergency)}</span>` : '—'],
        [`Normales (1 − p = ${pct(1 - p, 0)})`, minutes(prio.WqNormal), m.stable ? `<span class="bad">${vsFifo(prio.WqNormal)}</span>` : '—'],
        ['Promedio ponderado con prioridad', minutes(prio.WqGlobal), m.stable ? vsFifo(prio.WqGlobal) : '—'],
        ['Esquema FIFO', minutes(m.Wq), '—'],
      ],
    );

    const el = $('#th-conservation');
    if (!m.stable) {
      el.className = 'banner banner--compact banner--danger';
      el.textContent = 'Con ρ ≥ 1 las esperas de los vuelos normales no están acotadas.';
      return;
    }
    const diff = Math.abs(prio.WqGlobal - m.Wq);
    el.className = `banner banner--compact ${diff < 1e-9 ? 'banner--ok' : 'banner--warn'}`;
    el.innerHTML = `<strong>Ley de conservación ✔</strong> p·Wq,e + (1 − p)·Wq,n = ${minutes(prio.WqGlobal, 4)} min = Wq FIFO (${minutes(m.Wq, 4)} min). La prioridad no cambia la espera global, sólo la redistribuye.`;
  }

  renderDistribution(m, K) {
    const note = $('#th-pn-note');
    if (!m.isMarkovian || !m.stable) {
      this.pnChart.update({ labels: [], series: [] });
      note.textContent = !m.stable ? 'No existe distribución estacionaria con ρ ≥ 1.' : 'La fórmula Pn = (1 − ρ)ρⁿ sólo aplica a M/M/1. Use la pestaña Simulación para estimarla.';
      return;
    }
    const maxN = Math.max(15, K + 5);
    const pn = stationaryDistribution(m.rho, maxN);
    this.pnChart.update({
      labels: pn.map((_, n) => String(n)),
      series: [
        { name: `n < K`, color: '#38bdf8', values: pn.map((v, n) => (n < K ? v : NaN)) },
        { name: `n ≥ K (saturación)`, color: '#ef4444', values: pn.map((v, n) => (n >= K ? v : NaN)) },
      ],
    });
    note.textContent = `P(N ≥ ${K}) = ρ^${K} = ${pct(m.pSaturation, 2)}. Número esperado de aviones L = ${fmt(m.L, 3)}.`;
  }
}
