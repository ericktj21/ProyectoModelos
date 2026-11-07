/**
 * statistics.js
 * ---------------------------------------------------------------------------
 * Estadística descriptiva para el análisis de réplicas independientes:
 * media, desviación estándar muestral e intervalo de confianza del 95 %
 * basado en la distribución t de Student con n − 1 grados de libertad
 * (Law, 2015, cap. 9).
 * ---------------------------------------------------------------------------
 */

/** Valores críticos t(0.975, gl) para gl = 1..30. */
const T_975 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
  2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086,
  2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];

export function tCritical95(degreesOfFreedom) {
  if (degreesOfFreedom < 1) return NaN;
  if (degreesOfFreedom <= 30) return T_975[degreesOfFreedom - 1];
  if (degreesOfFreedom <= 60) return 2.0;
  if (degreesOfFreedom <= 120) return 1.98;
  return 1.96;
}

export function mean(values) {
  if (values.length === 0) return NaN;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function sampleStdDev(values) {
  const n = values.length;
  if (n < 2) return 0;
  const m = mean(values);
  let acc = 0;
  for (const v of values) acc += (v - m) * (v - m);
  return Math.sqrt(acc / (n - 1));
}

/**
 * Resumen estadístico de una muestra de réplicas.
 * @returns {{mean:number, std:number, halfWidth:number, low:number, high:number, n:number}}
 */
export function summarize(values) {
  const clean = values.filter((v) => Number.isFinite(v));
  const n = clean.length;
  const m = mean(clean);
  const s = sampleStdDev(clean);
  const halfWidth = n >= 2 ? (tCritical95(n - 1) * s) / Math.sqrt(n) : 0;
  return { mean: m, std: s, halfWidth, low: m - halfWidth, high: m + halfWidth, n };
}

/** Error relativo porcentual entre un valor simulado y uno teórico. */
export function relativeError(simulated, theoretical) {
  if (!Number.isFinite(theoretical) || theoretical === 0) return NaN;
  return ((simulated - theoretical) / theoretical) * 100;
}
