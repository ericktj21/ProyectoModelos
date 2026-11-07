/**
 * random.js
 * ---------------------------------------------------------------------------
 * Generador de números pseudoaleatorios con semilla (reproducible) y
 * muestreo de las distribuciones de probabilidad usadas por el modelo.
 *
 * Se usa el algoritmo xoshiro128** (Blackman & Vigna, 2018), inicializado
 * con splitmix32. Math.random() no sirve para experimentos científicos
 * porque no permite fijar una semilla, por lo que los resultados no
 * podrían repetirse.
 * ---------------------------------------------------------------------------
 */

/** Expande una semilla de 32 bits en una secuencia de estados (splitmix32). */
function splitmix32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

const rotl = (x, k) => ((x << k) | (x >>> (32 - k))) >>> 0;

export class RandomGenerator {
  /** @param {number} seed Semilla entera; la misma semilla produce la misma secuencia. */
  constructor(seed = 12345) {
    const sm = splitmix32(seed);
    this.s0 = sm();
    this.s1 = sm();
    this.s2 = sm();
    this.s3 = sm();
  }

  /** Entero sin signo de 32 bits (xoshiro128**). */
  nextUint32() {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** Uniforme en el intervalo abierto (0, 1). Nunca devuelve 0 (evita ln(0)). */
  uniform() {
    return (this.nextUint32() + 0.5) / 4294967296;
  }

  /** Bernoulli: devuelve true con probabilidad p. */
  bernoulli(p) {
    return this.uniform() < p;
  }

  /**
   * Exponencial de tasa `rate` por el método de la transformada inversa:
   * si U ~ U(0,1) entonces X = -ln(U) / rate ~ Exp(rate).
   */
  exponential(rate) {
    return -Math.log(this.uniform()) / rate;
  }

  /** Erlang-k con media 1/rate (suma de k exponenciales de tasa k·rate). */
  erlang(k, rate) {
    let product = 1;
    for (let i = 0; i < k; i++) product *= this.uniform();
    return -Math.log(product) / (k * rate);
  }
}

/**
 * Crea una función de muestreo para el tiempo de servicio (ocupación de pista).
 * @param {{type:'exponential'|'deterministic'|'erlang', k?:number}} service
 * @param {number} mu tasa de servicio (aterrizajes por hora)
 * @param {RandomGenerator} rng
 * @returns {() => number} función que devuelve un tiempo en horas
 */
export function createServiceSampler(service, mu, rng) {
  switch (service.type) {
    case 'deterministic':
      return () => 1 / mu;
    case 'erlang': {
      const k = Math.max(1, Math.round(service.k || 2));
      return () => rng.erlang(k, mu);
    }
    case 'exponential':
    default:
      return () => rng.exponential(mu);
  }
}
