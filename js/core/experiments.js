/**
 * experiments.js
 * ---------------------------------------------------------------------------
 * Capa de experimentación: ejecuta réplicas independientes del simulador,
 * resume los resultados con intervalos de confianza y construye los planes
 * de experimentos del documento (Tablas 2, 3 y 4).
 *
 * Es código puro (sin DOM) para que pueda ejecutarse dentro de un Web Worker
 * o desde Node.js en las pruebas automáticas.
 * ---------------------------------------------------------------------------
 */

import { LandingSimulator, Discipline, normalizeConfig } from './simulator.js';
import { summarize } from './statistics.js';
import { priorityWaits, queueMetrics } from './theory.js';

/** Métricas escalares que se resumen entre réplicas. */
export const SUMMARY_METRICS = [
  'utilization', 'Lq', 'L', 'Wq', 'WqEmergency', 'WqNormal', 'W', 'pSaturation', 'served', 'maxQueue',
];

/** Semilla de la réplica i: separadas para que las secuencias sean independientes. */
export const replicaSeed = (baseSeed, index) => (baseSeed + index * 7919) >>> 0;

/**
 * Ejecuta `replicas` réplicas independientes de una misma configuración.
 * @param {object} config configuración del simulador
 * @param {{replicas:number, seed:number, onProgress?:(done:number)=>void}} options
 */
export function runReplications(config, { replicas = 5, seed = 2024, onProgress } = {}) {
  const cfg = normalizeConfig(config);
  const results = [];
  for (let i = 0; i < replicas; i++) {
    results.push(new LandingSimulator(cfg, replicaSeed(seed, i)).run());
    if (onProgress) onProgress(i + 1);
  }

  const summary = {};
  for (const key of SUMMARY_METRICS) summary[key] = summarize(results.map((r) => r[key]));

  // Distribución promedio de N (para comparar con Pn teórico).
  const distribution = results[0].distribution.map((_, n) =>
    results.reduce((acc, r) => acc + r.distribution[n], 0) / results.length,
  );

  return { config: cfg, replicas, summary, distribution, theory: theoryFor(cfg) };
}

/** Ejecuta varias configuraciones en secuencia (barrido de parámetros). */
export function runSweep(configs, { replicas = 5, seed = 2024, onProgress } = {}) {
  const total = configs.length * replicas;
  let done = 0;
  return configs.map((config) =>
    runReplications(config, {
      replicas,
      seed,
      onProgress: () => onProgress && onProgress(++done, total),
    }),
  );
}

/** Valores teóricos correspondientes a una configuración (para la comparación automática). */
export function theoryFor(config) {
  const base = queueMetrics({ lambda: config.lambda, mu: config.mu, K: config.capacityK, service: config.service });
  const prio = priorityWaits({ lambda: config.lambda, mu: config.mu, p: config.emergencyFraction, service: config.service });
  const withPriority = config.discipline === Discipline.PRIORITY && config.emergencyFraction > 0;
  return {
    ...base,
    utilization: Math.min(base.rho, 1),
    WqEmergency: withPriority ? prio.WqEmergency : base.Wq,
    WqNormal: withPriority ? prio.WqNormal : base.Wq,
  };
}

// ---------------------------------------------------------------------------
// Planes de experimentos del documento
// ---------------------------------------------------------------------------

export const DOCUMENT_RHOS_FIFO = [0.3, 0.5, 0.7, 0.8, 0.9, 0.95];
export const DOCUMENT_RHOS_PRIORITY = [0.5, 0.7, 0.8, 0.9, 0.95];
export const DOCUMENT_P_VALUES = [0.05, 0.1, 0.2];

/** Tabla 2: modo FIFO sin emergencias para distintos niveles de carga. */
export function buildFifoValidationPlan({ mu, K, rhos, horizon, warmup }) {
  return rhos.map((rho) => ({
    lambda: rho * mu, mu, capacityK: K, horizon, warmup,
    emergencyFraction: 0, discipline: Discipline.FIFO, service: { type: 'exponential' },
  }));
}

/**
 * Tabla 3: para cada ρ se simula el esquema FIFO y el de prioridad con la
 * misma fracción de emergencias p. Devuelve configuraciones intercaladas
 * [FIFO(ρ1), PRIO(ρ1), FIFO(ρ2), PRIO(ρ2), ...].
 */
export function buildPriorityPlan({ mu, K, p, rhos, horizon, warmup }) {
  const plan = [];
  for (const rho of rhos) {
    const common = { lambda: rho * mu, mu, capacityK: K, horizon, warmup, emergencyFraction: p, service: { type: 'exponential' } };
    plan.push({ ...common, discipline: Discipline.FIFO });
    plan.push({ ...common, discipline: Discipline.PRIORITY });
  }
  return plan;
}

/** Tabla 4 (teórica): aumento de la espera de los vuelos normales frente a FIFO = 1/(1 − pρ) − 1. */
export function buildNormalIncreaseTable(pValues, rhos) {
  return pValues.map((p) => ({
    p,
    increases: rhos.map((rho) => 1 / (1 - p * rho) - 1),
  }));
}
