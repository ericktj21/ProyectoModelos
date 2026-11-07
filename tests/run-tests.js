/**
 * run-tests.js
 * ---------------------------------------------------------------------------
 * Pruebas automáticas del núcleo matemático (sin dependencias externas).
 * Ejecutar con:  node tests/run-tests.js   (o  npm test)
 *
 * Verifica:
 *  1. Estructuras de datos (FIFO, montículo, cola de prioridad estable).
 *  2. Fórmulas teóricas contra los valores publicados en el documento.
 *  3. Ley de conservación de la espera con prioridad.
 *  4. Umbrales de colapso (ρ ≈ 0,74 y ρ ≈ 0,83).
 *  5. El simulador reproduce la teoría M/M/1 y de Cobham (validación).
 *  6. Reproducibilidad con semilla fija.
 * ---------------------------------------------------------------------------
 */

import { FifoQueue, BinaryHeap, PriorityQueue } from '../js/core/queues.js';
import { queueMetrics, priorityWaits, collapseThresholds } from '../js/core/theory.js';
import { LandingSimulator } from '../js/core/simulator.js';
import { runReplications } from '../js/core/experiments.js';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  \u2714 ${name}`);
  } else {
    failed++;
    console.log(`  \u2718 ${name} ${detail}`);
  }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const minutes = (h) => h * 60;

console.log('\n1. Estructuras de datos');
{
  const q = new FifoQueue(2);
  for (let i = 0; i < 50; i++) q.enqueue(i);
  let ok = true;
  for (let i = 0; i < 50; i++) ok = ok && q.dequeue() === i;
  check('FifoQueue conserva el orden de llegada y crece dinámicamente', ok && q.isEmpty());

  const h = new BinaryHeap((a, b) => a - b);
  const values = Array.from({ length: 200 }, (_, i) => (i * 7919) % 211);
  values.forEach((v) => h.push(v));
  const sorted = [];
  while (!h.isEmpty()) sorted.push(h.pop());
  check('BinaryHeap extrae en orden ascendente', sorted.every((v, i) => i === 0 || sorted[i - 1] <= v));

  const pq = new PriorityQueue();
  [[1, 0], [1, 1], [0, 2], [1, 3], [0, 4]].forEach(([priority, seq]) => pq.enqueue({ priority, seq }));
  const order = [];
  while (!pq.isEmpty()) order.push(pq.dequeue().seq);
  check('PriorityQueue: emergencias primero y orden de llegada dentro de cada clase', order.join() === '2,4,0,1,3', order.join());
}

console.log('\n2. Fórmulas teóricas (Tabla 1 / Tabla 2 del documento)');
{
  const mu = 30;
  const m = queueMetrics({ lambda: 27, mu, K: 10 });
  check('ρ = 0,90 con λ = 27 y μ = 30', near(m.rho, 0.9, 1e-12));
  check('Lq = 8,100', near(m.Lq, 8.1, 1e-9));
  check('Wq = 18,00 min', near(minutes(m.Wq), 18, 1e-9));
  check('P(N ≥ 10) = 34,9 %', near(m.pSaturation, 0.3487, 1e-4));
  check('Ley de Little Lq = λ Wq', near(m.Lq, 27 * m.Wq, 1e-12));
  const m2 = queueMetrics({ lambda: 9, mu, K: 10 });
  check('ρ = 0,30: Wq = 0,86 min', near(minutes(m2.Wq), 0.857, 1e-3));
  const unstable = queueMetrics({ lambda: 31, mu, K: 10 });
  check('ρ ≥ 1 se reporta como inestable', !unstable.stable && unstable.Wq === Infinity);
}

console.log('\n3. Prioridad sin expropiación (Cobham) y ley de conservación (Tabla 3 / Tabla 4)');
{
  const pw = priorityWaits({ lambda: 0.95 * 30, mu: 30, p: 0.1 });
  check('Emergencia con ρ = 0,95 espera 2,10 min', near(minutes(pw.WqEmergency), 2.10, 0.01));
  check('Normal con ρ = 0,95 espera 41,99 min', near(minutes(pw.WqNormal), 41.99, 0.01));
  const fifo = queueMetrics({ lambda: 0.95 * 30, mu: 30 });
  check('Promedio ponderado = Wq FIFO (conservación)', near(pw.WqGlobal, fifo.Wq, 1e-12));
  const inc = priorityWaits({ lambda: 0.8 * 30, mu: 30, p: 0.05 }).normalIncrease;
  check('Aumento de espera normal p = 5 %, ρ = 0,80: +4,2 %', near(inc * 100, 4.17, 0.01));
}

console.log('\n4. Umbrales de colapso (sección 3.5)');
{
  const t = collapseThresholds({ mu: 30, K: 10, alertProbability: 0.05, maxWaitHours: 10 / 60 });
  check('Alerta en ρ ≈ 0,74 (≈ 22 aviones/h)', near(t.alertRho, 0.741, 0.001) && Math.round(t.alertLambda) === 22);
  check('Colapso en ρ ≈ 0,83 (≈ 25 aviones/h)', near(t.collapseRho, 5 / 6, 1e-6) && Math.round(t.collapseLambda) === 25);
}

console.log('\n5. Validación del simulador contra la teoría');
{
  const fifo = runReplications(
    { lambda: 24, mu: 30, capacityK: 10, horizon: 20000, warmup: 500, emergencyFraction: 0, discipline: 'fifo' },
    { replicas: 4, seed: 7 },
  );
  const s = fifo.summary;
  check(`FIFO ρ = 0,8: Wq simulado ${minutes(s.Wq.mean).toFixed(2)} ≈ 8,00 min`, near(minutes(s.Wq.mean), 8, 0.4));
  check(`FIFO ρ = 0,8: Lq simulado ${s.Lq.mean.toFixed(3)} ≈ 3,200`, near(s.Lq.mean, 3.2, 0.2));
  check(`FIFO ρ = 0,8: utilización ${s.utilization.mean.toFixed(3)} ≈ 0,80`, near(s.utilization.mean, 0.8, 0.01));
  check(`FIFO ρ = 0,8: P(N≥10) ${(s.pSaturation.mean * 100).toFixed(1)} % ≈ 10,7 %`, near(s.pSaturation.mean, 0.107, 0.012));

  const prio = runReplications(
    { lambda: 24, mu: 30, capacityK: 10, horizon: 20000, warmup: 500, emergencyFraction: 0.1, discipline: 'priority' },
    { replicas: 4, seed: 11 },
  );
  const p = prio.summary;
  check(`Prioridad: emergencia ${minutes(p.WqEmergency.mean).toFixed(2)} ≈ 1,74 min`, near(minutes(p.WqEmergency.mean), 1.74, 0.1));
  check(`Prioridad: normal ${minutes(p.WqNormal.mean).toFixed(2)} ≈ 8,70 min`, near(minutes(p.WqNormal.mean), 8.7, 0.5));

  const md1 = runReplications(
    { lambda: 24, mu: 30, horizon: 20000, warmup: 500, emergencyFraction: 0, discipline: 'fifo', service: { type: 'deterministic' } },
    { replicas: 4, seed: 3 },
  );
  const th = queueMetrics({ lambda: 24, mu: 30, service: { type: 'deterministic' } });
  check(`M/D/1: Wq simulado ${minutes(md1.summary.Wq.mean).toFixed(2)} ≈ teórico ${minutes(th.Wq).toFixed(2)} min`, near(md1.summary.Wq.mean, th.Wq, th.Wq * 0.05));
}

console.log('\n6. Reproducibilidad');
{
  const cfg = { lambda: 20, mu: 30, horizon: 2000, warmup: 100 };
  const a = new LandingSimulator(cfg, 99).run();
  const b = new LandingSimulator(cfg, 99).run();
  const c = new LandingSimulator(cfg, 100).run();
  check('Misma semilla ⇒ mismos resultados', a.Wq === b.Wq && a.served === b.served);
  check('Semilla distinta ⇒ resultados distintos', a.Wq !== c.Wq);
}

console.log(`\nResultado: ${passed} pruebas correctas, ${failed} fallidas.\n`);
process.exit(failed === 0 ? 0 : 1);
