import { $, fmt, minutes, readForm, renderTable, toast, writeForm } from '../dom.js';
import { ProgressBar } from '../widgets.js';
import { LineChart } from '../../graphics/charts.js';
import {
  DOCUMENT_P_VALUES,
  DOCUMENT_RHOS_FIFO,
  DOCUMENT_RHOS_PRIORITY,
  buildFifoValidationPlan,
  buildNormalIncreaseTable,
  buildPriorityPlan,
} from '../../core/experiments.js';

const toMinutes = (hours) => (Number.isFinite(hours) ? hours * 60 : hours);

export class ExperimentsView {
  constructor(router, worker) {
    this.form = $('#exp-form');
    this.worker = worker;
    this.progress = new ProgressBar($('#exp-progress'));
    this.job = null;
    this.fifoChart = new LineChart($('#exp-fifo-chart'), {
      xLabel: 'Utilización ρ', yLabel: 'Espera Wq (min)', yMin: 0,
    });
    this.prioChart = new LineChart($('#exp-prio-chart'), {
      xLabel: 'Utilización ρ', yLabel: 'Espera Wq (min)', yMin: 0,
    });
    $('#exp-fifo-run').addEventListener('click', () => this.runFifo());
    $('#exp-prio-run').addEventListener('click', () => this.runPriority());
    for (const button of document.querySelectorAll('#experimentos .exp-cancel')) {
      button.addEventListener('click', () => this.job?.cancel());
    }
    $('#exp-doc-preset').addEventListener('click', () => {
      writeForm(this.form, { horizon: 40000, warmup: 1000, replicas: 8 });
      toast('Configuración del informe aplicada.');
    });
    this.form.addEventListener('change', () => this.renderIncreaseTable());
    router.onShow('experimentos', () => {
      this.fifoChart.draw();
      this.prioChart.draw();
    });
    this.renderIncreaseTable();
  }

  values() {
    const v = readForm(this.form);
    return {
      mu: v.mu, K: Math.round(v.K), replicas: Math.round(v.replicas),
      horizon: v.horizon, warmup: v.warmup, seed: Math.round(v.seed), p: Number(v.p),
    };
  }

  async execute(configs, kind) {
    if (this.job) return;
    const v = this.values();
    if (!(v.horizon > v.warmup) || v.replicas < 2) {
      toast('El horizonte debe ser mayor que el calentamiento y se requieren al menos 2 réplicas.', 'error');
      return;
    }
    this.progress.start();
    this.job = this.worker.run('sweep', { configs, replicas: v.replicas, seed: v.seed },
      (done, total) => this.progress.set(done, total));
    this.setButtons(true);
    try {
      const results = await this.job.promise;
      this.progress.finish();
      if (kind === 'fifo') this.renderFifo(results);
      else this.renderPriority(results);
    } catch (error) {
      this.progress.hide();
      toast(`Error en el experimento: ${error.message}`, 'error');
    } finally {
      this.job = null;
      this.setButtons(false);
    }
  }

  setButtons(running) {
    for (const button of $('#experimentos').querySelectorAll('button')) {
      if (button.id === 'exp-doc-preset') continue;
      button.disabled = running;
    }
  }

  runFifo() {
    const v = this.values();
    this.execute(buildFifoValidationPlan({ ...v, rhos: DOCUMENT_RHOS_FIFO }), 'fifo');
  }

  runPriority() {
    const v = this.values();
    this.execute(buildPriorityPlan({ ...v, p: v.p, rhos: DOCUMENT_RHOS_PRIORITY }), 'priority');
  }

  renderFifo(results) {
    const rows = results.map((r) => [
      fmt(r.config.lambda / r.config.mu, 2),
      minutes(r.theory.Wq),
      minutes(r.summary.Wq.mean),
      `[${minutes(r.summary.Wq.low)} ; ${minutes(r.summary.Wq.high)}]`,
      fmt(r.summary.pSaturation.mean * 100, 2) + ' %',
    ]);
    renderTable($('#exp-fifo-table'), ['ρ', 'Wq teórico (min)', 'Wq simulado (min)', 'IC 95 %', 'Saturación'], rows);
    this.fifoChart.update({
      series: [
        { name: 'Teoría M/M/1', color: '#38bdf8', dashed: true, data: results.map((r) => ({ x: r.config.lambda / r.config.mu, y: toMinutes(r.theory.Wq) })) },
        { name: 'Simulación', color: '#818cf8', points: true, data: results.map((r) => ({ x: r.config.lambda / r.config.mu, y: toMinutes(r.summary.Wq.mean), low: toMinutes(r.summary.Wq.low), high: toMinutes(r.summary.Wq.high) })) },
      ],
    });
    requestAnimationFrame(() => this.fifoChart.draw());
  }

  renderPriority(results) {
    const rows = [];
    for (let i = 0; i < results.length; i += 2) {
      const fifo = results[i];
      const priority = results[i + 1];
      rows.push([
        fmt(fifo.config.lambda / fifo.config.mu, 2),
        minutes(fifo.summary.Wq.mean),
        minutes(priority.summary.WqEmergency.mean),
        minutes(priority.summary.WqNormal.mean),
        fmt(priority.theory.normalIncrease * 100, 2) + ' %',
      ]);
    }
    renderTable($('#exp-prio-table'), ['ρ', 'FIFO Wq (min)', 'Emergencias (min)', 'Normales (min)', 'Aumento teórico'], rows);
    const points = (key, color) => results.filter((_, i) => i % 2 === 1).map((r) => ({
      x: r.config.lambda / r.config.mu, y: toMinutes(r.summary[key].mean), low: toMinutes(r.summary[key].low), high: toMinutes(r.summary[key].high),
    }));
    this.prioChart.update({
      series: [
        { name: 'FIFO', color: '#94a3b8', dashed: true, data: results.filter((_, i) => i % 2 === 0).map((r) => ({ x: r.config.lambda / r.config.mu, y: toMinutes(r.summary.Wq.mean) })) },
        { name: 'Emergencias', color: '#22c55e', points: true, data: points('WqEmergency', '#22c55e') },
        { name: 'Normales', color: '#ef4444', points: true, data: points('WqNormal', '#ef4444') },
      ],
    });
    requestAnimationFrame(() => this.prioChart.draw());
  }

  renderIncreaseTable() {
    const v = this.values();
    const table = buildNormalIncreaseTable(DOCUMENT_P_VALUES, DOCUMENT_RHOS_PRIORITY);
    renderTable($('#exp-increase-table'), ['p', ...DOCUMENT_RHOS_PRIORITY.map((rho) => `ρ = ${rho}`)],
      table.map((row) => [fmt(row.p * 100, 0) + ' %', ...row.increases.map((x) => '+' + fmt(x * 100, 2) + ' %')]));
  }
}
