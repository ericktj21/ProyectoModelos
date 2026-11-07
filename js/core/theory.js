/**
 * theory.js
 * ---------------------------------------------------------------------------
 * Solución analítica del modelo (Tabla 1 del documento).
 *
 *   ρ  = λ / μ                       Factor de utilización (estable si ρ < 1)
 *   Pn = (1 − ρ) ρⁿ                  Probabilidad de n aviones en el sistema
 *   Lq = ρ² / (1 − ρ)                Aviones en el patrón de espera
 *   Wq = λ / (μ (μ − λ)) = ρ/(μ − λ) Espera promedio antes de aterrizar
 *   L  = λW,  Lq = λWq               Ley de Little
 *   P(N ≥ K) = ρᴷ                    Riesgo de saturación
 *
 * Prioridad sin expropiación (Cobham, 1954):
 *   W0    = λ E[S²] / 2   (= ρ/μ en el caso exponencial)
 *   σ1    = p ρ           (carga de las emergencias)
 *   Wq,e  = W0 / (1 − σ1)
 *   Wq,n  = W0 / ((1 − σ1)(1 − ρ))
 *
 * Generalización M/G/1 (Pollaczek–Khinchine) para tiempos de servicio no
 * exponenciales:  Wq = λ E[S²] / (2 (1 − ρ)).
 *
 * Todas las tasas están en "por hora" y todos los tiempos en horas.
 * ---------------------------------------------------------------------------
 */

/**
 * Momentos del tiempo de servicio S con media 1/μ.
 * @returns {{mean:number, secondMoment:number, cs2:number, label:string}}
 *   cs2 = coeficiente de variación al cuadrado.
 */
export function serviceMoments(service, mu) {
  const mean = 1 / mu;
  switch (service?.type) {
    case 'deterministic':
      return { mean, secondMoment: mean * mean, cs2: 0, label: 'M/D/1' };
    case 'erlang': {
      const k = Math.max(1, Math.round(service.k || 2));
      return { mean, secondMoment: (1 + 1 / k) * mean * mean, cs2: 1 / k, label: `M/E${k}/1` };
    }
    case 'exponential':
    default:
      return { mean, secondMoment: 2 * mean * mean, cs2: 1, label: 'M/M/1' };
  }
}

/**
 * Métricas de desempeño del sistema de una pista.
 * @param {{lambda:number, mu:number, K?:number, service?:object}} params
 */
export function queueMetrics({ lambda, mu, K = 10, service = { type: 'exponential' } }) {
  const rho = lambda / mu;
  const moments = serviceMoments(service, mu);
  const isMarkovian = !service || service.type === 'exponential';
  const stable = rho < 1;

  if (!stable) {
    return {
      rho, stable, model: moments.label, isMarkovian,
      L: Infinity, Lq: Infinity, W: Infinity, Wq: Infinity,
      P0: 0, pSaturation: 1, W0: (lambda * moments.secondMoment) / 2,
    };
  }

  const W0 = (lambda * moments.secondMoment) / 2; // residuo medio de servicio
  const Wq = W0 / (1 - rho); // Pollaczek–Khinchine (coincide con M/M/1)
  const W = Wq + moments.mean;
  const Lq = lambda * Wq; // Ley de Little
  const L = lambda * W;

  return {
    rho,
    stable,
    model: moments.label,
    isMarkovian,
    W0,
    Wq,
    W,
    Lq,
    L,
    P0: 1 - rho,
    // P(N ≥ K) tiene forma cerrada sólo para M/M/1.
    pSaturation: isMarkovian ? Math.pow(rho, K) : NaN,
  };
}

/** Pn = (1 − ρ) ρⁿ para n = 0..maxN (sólo M/M/1). */
export function stationaryDistribution(rho, maxN) {
  const out = [];
  for (let n = 0; n <= maxN; n++) out.push(rho < 1 ? (1 - rho) * Math.pow(rho, n) : 0);
  return out;
}

/**
 * Esperas por clase con prioridad sin expropiación (Cobham, 1954).
 * @param {{lambda:number, mu:number, p:number, service?:object}} params
 */
export function priorityWaits({ lambda, mu, p, service = { type: 'exponential' } }) {
  const rho = lambda / mu;
  const { secondMoment } = serviceMoments(service, mu);
  const W0 = (lambda * secondMoment) / 2;
  const sigma1 = p * rho;
  if (rho >= 1) {
    return { W0, sigma1, WqEmergency: sigma1 < 1 ? W0 / (1 - sigma1) : Infinity, WqNormal: Infinity, WqGlobal: Infinity, normalIncrease: Infinity };
  }
  const WqEmergency = W0 / (1 - sigma1);
  const WqNormal = W0 / ((1 - sigma1) * (1 - rho));
  // Ley de conservación: promedio ponderado = Wq del esquema FIFO.
  const WqGlobal = p * WqEmergency + (1 - p) * WqNormal;
  return {
    W0,
    sigma1,
    WqEmergency,
    WqNormal,
    WqGlobal,
    /** Aumento relativo de la espera de los vuelos normales frente a FIFO: 1/(1 − pρ) − 1. */
    normalIncrease: 1 / (1 - sigma1) - 1,
  };
}

/** Búsqueda por bisección del menor x en [lo, hi] tal que predicate(x) es verdadero. */
function bisect(predicate, lo, hi, iterations = 80) {
  if (!predicate(hi)) return NaN;
  if (predicate(lo)) return lo;
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    if (predicate(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Umbrales de colapso operativo (sección 3.5 del documento).
 *
 *  - Alerta:  P(N ≥ K) > alertProbability   ⇒  ρ > alertProbability^(1/K)
 *  - Colapso: espera promedio > maxWaitHours ⇒  ρ > Tμ / (1 + Tμ) en FIFO M/M/1
 *
 * Si se indica p > 0 y `waitClass = 'normal'`, el criterio de colapso se aplica
 * a la espera de los vuelos normales con prioridad (se resuelve por bisección).
 */
export function collapseThresholds({
  mu,
  K,
  alertProbability = 0.05,
  maxWaitHours = 10 / 60,
  p = 0,
  waitClass = 'global',
  service = { type: 'exponential' },
}) {
  const alertRho = Math.pow(alertProbability, 1 / K);

  const waitAt = (rho) => {
    const lambda = rho * mu;
    if (waitClass === 'normal' && p > 0) return priorityWaits({ lambda, mu, p, service }).WqNormal;
    return queueMetrics({ lambda, mu, K, service }).Wq;
  };
  const collapseRho = bisect((rho) => waitAt(rho) > maxWaitHours, 0, 0.999999);

  return {
    alertRho,
    alertLambda: alertRho * mu,
    collapseRho,
    collapseLambda: collapseRho * mu,
  };
}
