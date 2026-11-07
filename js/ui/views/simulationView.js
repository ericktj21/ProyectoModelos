/**
 * simulationView.js
 * ---------------------------------------------------------------------------
 * Vista "Simulación": ejecuta réplicas independientes en el Web Worker y
 * presenta la comparación automática entre teoría y simulación con
 * intervalos de confianza del 95 %.
 * ---------------------------------------------------------------------------
 */

import { $, fmt, pct, minutes, readForm, writeForm, renderTable, toast } from '../dom.js';
import { metricCard, ProgressBar, bindErlangToggle, serviceFromForm } from '../widgets.js';
import { BarChart } from '../../graphics/charts.js';
import { relativeError } from '../../core/statistics.js';
import { stationaryDistribution } from '../../core/theory.js';

/** Definición de las filas de la tabla comparativa. */
const ROWS = [
  { key: 'utilization', label: 'Utilización ρ', format: (v) => fmt(v, 4) },
  { key: 'Lq', label: 'Aviones en espera Lq', format: (v) => fmt(v, 3) },
  { key: 'L', label: 'Aviones en el sistema L', format: (v) => fmt(v, 3) },
  { key: 'Wq', label: 'Espera promedio global Wq (min)', format: (v) => minutes(v) },
  { key: 'WqEmergency', label: 'Espera de emergencias Wq,e (min)', format: (v) => minutes(v) },
  { key: 'WqNormal', label: 'Espera de vuelos normales Wq,n (min)', format: (v) => minutes(v) },
  { key: 'W', label: 'Tiempo en el sistema W (min)', format: (v) => minutes(v) },
  { key: 'pSaturation', label: 'Riesgo de saturación P(N ≥ K)', format: (v) => pct(v, 2) },
];

export class SimulationView {
  constructor(router, workerClient) {
    this.worker = workerClient;
    this.form = $('#sim-form');
    this.progress = new ProgressBar($('#sim-progress'));
    this.job = null;
    this.chart = new BarChart($('#sim-dist-chart'), {
      xLabel: 'n (aviones en el sistema)',
      yLabel: 'Fracción del tiempo',
      yFormat: (v) => `${(v * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`,
    });

    bindErlangToggle(this.form);
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.run();
    });
    $('#sim-cancel').addEventListener('click', () => this.job?.cancel());
    $('#sim-doc-preset').addEventListener('click', () => {
      writeForm(this.form, { horizon: 40000, warmup: 1000, replicas: 8 });
      toast('Configuración del informe: 8 réplicas de 40.000 h con 1.000 h de calentamiento.');
    });
    router.onShow('simulacion', () => this.chart.draw());
  }

  buildConfig() {
    const v = readForm(this.form);
    return {
      config: {
        lambda: v.lambda,
        mu: v.mu,
        emergencyFraction: v.p,
        capacityK: Math.round(v.K),
        discipline: v.discipline,
        service: serviceFromForm(v),
        horizon: v.horizon,
        warmup: v.warmup,
      },
      replicas: Math.round(v.replicas),
      seed: Math.round(v.seed),
    };
  }

  async run() {
    if (!this.form.reportValidity()) return;
    const payload = this.buildConfig();
    if (payload.config.lambda >= payload.config.mu) {
      toast('Atención: ρ ≥ 1, el sistema es inestable y la cola crecerá sin límite.', 'error');
    }
    this.setRunning(true);
    this.progress.start();
    this.job = this.worker.run('replications', payload, (done, total) => this.progress.set(done, total));
    try {
      const result = await this.job.promise;
      this.progress.finish();
      this.render(result);
    } catch (error) {
      this.progress.hide();
      toast(error.message === 'Cancelado' ? 'Simulación cancelada.' : `Error: ${error.message}`, error.message === 'Cancelado' ? 'info' : 'error');
    } finally {
      this.setRunning(false);
      this.job = null;
    }
  }

  setRunning(running) {
    $('#sim-run').disabled = running;
    $('#sim-cancel').disabled = !running;
  }

  render(result) {
    const { summary: s, theory: t, config, replicas } = result;
    $('#sim-empty').hidden = true;
    $('#sim-results').hidden = false;

    $('#sim-metrics').innerHTML = [
      metricCard({ label: 'Modelo simulado', value: t.model, sub: config.discipline === 'priority' ? 'Cola de prioridad' : 'Cola FIFO' }),
      metricCard({ label: 'Aviones atendidos (promedio)', value: fmt(s.served.mean, 0), sub: `${replicas} réplicas × ${fmt(config.horizon - config.warmup, 0)} h` }),
      metricCard({ label: 'Espera promedio Wq', value: minutes(s.Wq.mean), unit: 'min', sub: `± ${minutes(s.Wq.halfWidth)} min (IC 95 %)`, tone: s.Wq.mean > 10 / 60 ? 'danger' : 'ok' }),
      metricCard({ label: 'Cola máxima observada', value: fmt(s.maxQueue.mean, 1), unit: 'aviones', sub: 'Promedio entre réplicas', tone: s.maxQueue.mean >= config.capacityK ? 'warn' : 'info' }),
    ].join('');

    const rows = ROWS.map(({ key, label, format }) => {
      const stat = s[key];
      const theo = key === 'pSaturation' && !t.isMarkovian ? NaN : t[key];
      const err = relativeError(stat.mean, theo);
      const covered = Number.isFinite(theo) && theo >= stat.low - 1e-12 && theo <= stat.high + 1e-12;
      const errClass = !Number.isFinite(err) ? 'muted' : covered || Math.abs(err) < 5 ? 'good' : 'bad';
      return [
        label,
        Number.isFinite(theo) ? format(theo) : theo === Infinity ? '∞' : '—',
        format(stat.mean),
        Number.isFinite(stat.halfWidth) ? `[${format(stat.low)} ; ${format(stat.high)}]` : '—',
        `<span class="${errClass}">${Number.isFinite(err) ? `${fmt(err, 2)} %` : '—'}${covered ? ' ✔' : ''}</span>`,
      ];
    });
    renderTable($('#sim-table'), ['Métrica', 'Teórico', 'Simulado (media)', 'IC 95 %', 'Error relativo'], rows);

    // Distribución de N: simulada vs. teórica (sólo M/M/1 estable)
    const n = result.distribution.length;
    const series = [{ name: 'Simulación', color: '#818cf8', values: result.distribution }];
    if (t.isMarkovian && t.stable) {
      const pn = stationaryDistribution(t.rho, n - 1);
      pn[n - 1] = Math.pow(t.rho, n - 1); // último intervalo = P(N ≥ n−1)
      series.push({ name: 'Teoría (1 − ρ)ρⁿ', color: '#38bdf8', values: pn });
    }
    this.chart.update({ labels: result.distribution.map((_, i) => (i === n - 1 ? `${i}+` : String(i))), series });
  }
}
