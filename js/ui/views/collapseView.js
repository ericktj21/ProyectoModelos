import { $, fmt, pct, minutes, readForm, renderTable } from '../dom.js';
import { metricCard } from '../widgets.js';
import { LineChart } from '../../graphics/charts.js';
import { collapseThresholds, priorityWaits, queueMetrics } from '../../core/theory.js';

export class CollapseView {
  constructor(router) {
    this.form = $('#collapse-form');
    this.waitChart = new LineChart($('#collapse-wait-chart'), { xLabel: 'λ (aviones/h)', yLabel: 'Espera Wq (min)', yMin: 0 });
    this.riskChart = new LineChart($('#collapse-risk-chart'), { xLabel: 'λ (aviones/h)', yLabel: 'P(N ≥ K)', yMin: 0, yFormat: (v) => pct(v, 0) });
    this.form.addEventListener('input', () => this.update());
    this.form.addEventListener('change', () => this.update());
    router.onShow('colapso', () => { this.waitChart.draw(); this.riskChart.draw(); });
    this.update();
  }

  update() {
    const v = readForm(this.form);
    if (!(v.mu > 0 && v.K >= 1 && v.alertProbability > 0 && v.maxWait > 0 && v.lambdaEval > 0)) return;
    const threshold = collapseThresholds({
      mu: v.mu, K: Math.round(v.K), alertProbability: v.alertProbability,
      maxWaitHours: v.maxWait / 60, p: v.p, waitClass: v.waitClass,
    });
    const lambda = v.lambdaEval;
    const metric = v.waitClass === 'normal'
      ? priorityWaits({ lambda, mu: v.mu, p: v.p })
      : queueMetrics({ lambda, mu: v.mu, K: v.K });
    const wait = v.waitClass === 'normal' ? metric.WqNormal : metric.Wq;
    const risk = queueMetrics({ lambda, mu: v.mu, K: v.K }).pSaturation;
    $('#collapse-verdict').className = `verdict ${lambda >= threshold.collapseLambda || risk > v.alertProbability ? 'verdict--danger' : 'verdict--ok'}`;
    $('#collapse-verdict').textContent = lambda >= threshold.collapseLambda
      ? `Colapso: la espera supera ${fmt(v.maxWait, 1)} min.`
      : risk > v.alertProbability ? `Alerta: el riesgo de saturación es ${pct(risk, 1)}.` : 'Escenario dentro de los criterios operativos.';
    $('#collapse-metrics').innerHTML = [
      metricCard({ label: 'Umbral de alerta λ', value: fmt(threshold.alertLambda, 2), unit: 'av/h', tone: 'warn' }),
      metricCard({ label: 'Umbral de colapso λ', value: fmt(threshold.collapseLambda, 2), unit: 'av/h', tone: 'danger' }),
      metricCard({ label: 'Escenario evaluado Wq', value: minutes(wait), unit: 'min' }),
      metricCard({ label: 'Riesgo P(N ≥ K)', value: pct(risk, 2) }),
    ].join('');
    this.renderCharts(v, threshold);
    this.renderTables(v, threshold);
  }

  renderCharts(v, threshold) {
    const points = Array.from({ length: 20 }, (_, i) => ((i + 1) / 20) * v.mu * 0.99);
    const waits = points.map((lambda) => {
      const m = v.waitClass === 'normal' ? priorityWaits({ lambda, mu: v.mu, p: v.p }) : queueMetrics({ lambda, mu: v.mu, K: v.K });
      const waitHours = v.waitClass === 'normal' ? m.WqNormal : m.Wq;
      return { x: lambda, y: Number.isFinite(waitHours) ? waitHours * 60 : waitHours };
    });
    const risks = points.map((lambda) => ({ x: lambda, y: queueMetrics({ lambda, mu: v.mu, K: v.K }).pSaturation }));
    this.waitChart.update({ series: [{ name: 'Espera', color: '#f59e0b', data: waits }], vLines: [{ x: threshold.collapseLambda, label: 'Colapso', color: '#ef4444' }] });
    this.riskChart.update({ series: [{ name: 'Saturación', color: '#ef4444', data: risks }], hLines: [{ y: v.alertProbability, label: 'Alerta', color: '#f59e0b' }], vLines: [{ x: threshold.alertLambda, label: 'Alerta', color: '#f59e0b' }] });
  }

  renderTables(v, threshold) {
    const mus = [v.mu * 0.8, v.mu, v.mu * 1.2];
    renderTable($('#collapse-sens-alert'), ['μ', 'K = 5', 'K = 10', 'K = 15'], mus.map((mu) => [
      fmt(mu, 1), ...[5, 10, 15].map((K) => fmt(Math.pow(v.alertProbability, 1 / K) * mu, 2)),
    ]));
    renderTable($('#collapse-sens-wait'), ['μ', 'M/M/1', 'M/E2/1', 'M/D/1'], mus.map((mu) => [
      fmt(mu, 1),
      fmt(collapseThresholds({ mu, K: v.K, alertProbability: v.alertProbability, maxWaitHours: v.maxWait / 60 }).collapseLambda, 2),
      fmt(collapseThresholds({ mu, K: v.K, alertProbability: v.alertProbability, maxWaitHours: v.maxWait / 60, service: { type: 'erlang', k: 2 } }).collapseLambda, 2),
      fmt(collapseThresholds({ mu, K: v.K, alertProbability: v.alertProbability, maxWaitHours: v.maxWait / 60, service: { type: 'deterministic' } }).collapseLambda, 2),
    ]));
  }
}
