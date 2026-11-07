/**
 * simulator.js
 * ---------------------------------------------------------------------------
 * Simulador por eventos discretos (DES) del patrón de espera de una pista.
 *
 * Elementos del modelo (Law, 2015):
 *  - Entidades:   aeronaves (normales o en emergencia).
 *  - Recurso:     una pista (servidor único).
 *  - Cola:        patrón de espera en vuelo. FIFO o cola de prioridad.
 *  - Agenda:      montículo binario de eventos ordenado por tiempo.
 *  - Eventos:     ARRIVAL (llegada de aeronave) y DEPARTURE (fin de aterrizaje).
 *  - Reloj:       avanza de un evento al siguiente (next-event time advance).
 *
 * Estadísticas (tras el periodo de calentamiento):
 *  - Integrales en el tiempo del número en cola, en el sistema, del tiempo
 *    de pista ocupada y del tiempo con N ≥ K (promedios temporales).
 *  - Sumas de esperas por clase para los promedios por aeronave.
 *
 * La clase puede ejecutarse completa (modo lote, para experimentos) o paso a
 * paso con `runUntil(t)` (modo animación en tiempo real). Ambos modos usan
 * exactamente la misma lógica, lo que garantiza que la animación muestra el
 * mismo modelo que se valida contra la teoría.
 * ---------------------------------------------------------------------------
 */

import { BinaryHeap, FifoQueue, PriorityQueue } from './queues.js';
import { RandomGenerator, createServiceSampler } from './random.js';

export const EventType = Object.freeze({ ARRIVAL: 'ARRIVAL', DEPARTURE: 'DEPARTURE' });
export const Discipline = Object.freeze({ FIFO: 'fifo', PRIORITY: 'priority' });

/** Número máximo de estados distintos que se registran en el histograma de N. */
const HISTOGRAM_SIZE = 31;

export const DEFAULT_CONFIG = Object.freeze({
  lambda: 24, // llegadas por hora
  mu: 30, // aterrizajes por hora
  emergencyFraction: 0.1, // p
  capacityK: 10, // capacidad segura del patrón
  horizon: 10000, // horas totales simuladas
  warmup: 500, // horas descartadas al inicio
  discipline: Discipline.PRIORITY,
  service: { type: 'exponential', k: 2 },
});

/** Combina la configuración del usuario con los valores por defecto y la valida. */
export function normalizeConfig(config = {}) {
  const c = { ...DEFAULT_CONFIG, ...config, service: { ...DEFAULT_CONFIG.service, ...(config.service || {}) } };
  if (!(c.lambda > 0)) throw new Error('λ debe ser mayor que 0.');
  if (!(c.mu > 0)) throw new Error('μ debe ser mayor que 0.');
  if (!(c.emergencyFraction >= 0 && c.emergencyFraction <= 1)) throw new Error('p debe estar entre 0 y 1.');
  if (!(c.capacityK >= 1)) throw new Error('K debe ser al menos 1.');
  if (!(c.warmup >= 0) || !(c.horizon > c.warmup)) throw new Error('El horizonte debe ser mayor que el calentamiento.');
  return c;
}

export class LandingSimulator {
  /**
   * @param {object} config ver DEFAULT_CONFIG
   * @param {number} seed semilla del generador aleatorio
   */
  constructor(config, seed = 12345) {
    this.config = normalizeConfig(config);
    this.rng = new RandomGenerator(seed);
    this.sampleService = createServiceSampler(this.config.service, this.config.mu, this.rng);

    this.clock = 0;
    this.agenda = new BinaryHeap((a, b) => a.time - b.time || a.seq - b.seq);
    this.holdingPattern =
      this.config.discipline === Discipline.PRIORITY ? new PriorityQueue() : new FifoQueue();
    this.runway = null; // aeronave que ocupa la pista
    this.listener = null; // callback opcional (eventName, aircraft, simulator)

    this._eventSeq = 0;
    this._aircraftSeq = 0;
    this._resetStatistics();
    this._scheduleNextArrival();
  }

  // ------------------------------------------------------------------ estado
  get queueLength() {
    return this.holdingPattern.size;
  }

  get numberInSystem() {
    return this.holdingPattern.size + (this.runway ? 1 : 0);
  }

  /** Aeronaves en el patrón de espera en el orden en que aterrizarán. */
  getHoldingAircraft() {
    return this.holdingPattern.toArray();
  }

  // --------------------------------------------------------------- ejecución
  /** Procesa el siguiente evento de la agenda. Devuelve el evento o null. */
  step() {
    const event = this.agenda.pop();
    if (!event) return null;
    this._advanceClock(event.time);
    if (event.type === EventType.ARRIVAL) this._handleArrival(event);
    else this._handleDeparture(event);
    return event;
  }

  /** Procesa todos los eventos con tiempo ≤ t y deja el reloj exactamente en t. */
  runUntil(t) {
    while (!this.agenda.isEmpty() && this.agenda.peek().time <= t) this.step();
    if (t > this.clock) this._advanceClock(t);
  }

  /** Ejecuta la réplica completa hasta el horizonte configurado y devuelve los resultados. */
  run() {
    this.runUntil(this.config.horizon);
    return this.getResults();
  }

  /** Inserta manualmente una aeronave en el instante actual (usado en la animación). */
  injectArrival(isEmergency = true) {
    const aircraft = this._createAircraft(isEmergency);
    this._admit(aircraft);
    return aircraft;
  }

  // ----------------------------------------------------------------- eventos
  _handleArrival(event) {
    this._scheduleNextArrival();
    const isEmergency = this.rng.bernoulli(this.config.emergencyFraction);
    this._admit(this._createAircraft(isEmergency));
  }

  _admit(aircraft) {
    this.stats.arrivals++;
    this._emit('arrival', aircraft);
    if (this.runway === null) {
      this._startLanding(aircraft);
    } else {
      this.holdingPattern.enqueue(aircraft);
      if (this.holdingPattern.size > this.stats.maxQueue) this.stats.maxQueue = this.holdingPattern.size;
    }
  }

  _handleDeparture(event) {
    const aircraft = event.aircraft;
    aircraft.departureTime = this.clock;
    this.runway = null;
    this._recordDeparture(aircraft);
    this._emit('departure', aircraft);

    // Disciplina sin expropiación: sólo al liberar la pista se elige al siguiente.
    if (!this.holdingPattern.isEmpty()) this._startLanding(this.holdingPattern.dequeue());
  }

  _startLanding(aircraft) {
    aircraft.serviceStart = this.clock;
    aircraft.serviceTime = this.sampleService();
    this.runway = aircraft;
    this._recordWait(aircraft);
    this._schedule(this.clock + aircraft.serviceTime, EventType.DEPARTURE, aircraft);
    this._emit('startLanding', aircraft);
  }

  _scheduleNextArrival() {
    this._schedule(this.clock + this.rng.exponential(this.config.lambda), EventType.ARRIVAL, null);
  }

  _schedule(time, type, aircraft) {
    this.agenda.push({ time, type, aircraft, seq: this._eventSeq++ });
  }

  _createAircraft(isEmergency) {
    const seq = this._aircraftSeq++;
    return {
      id: seq + 1,
      seq,
      isEmergency,
      priority: isEmergency ? 0 : 1,
      arrivalTime: this.clock,
      serviceStart: NaN,
      serviceTime: NaN,
      departureTime: NaN,
    };
  }

  _emit(name, aircraft) {
    if (this.listener) this.listener(name, aircraft, this);
  }

  // ------------------------------------------------------------ estadísticas
  _resetStatistics() {
    this.stats = {
      areaQueue: 0,
      areaSystem: 0,
      busyTime: 0,
      saturatedTime: 0,
      timeAtN: new Float64Array(HISTOGRAM_SIZE),
      arrivals: 0,
      maxQueue: 0,
      servedEmergency: 0,
      servedNormal: 0,
      sumWaitEmergency: 0,
      sumWaitNormal: 0,
      departures: 0,
      sumSystemTime: 0,
    };
  }

  /** Acumula las integrales temporales en el intervalo [clock, t] descartando el calentamiento. */
  _advanceClock(t) {
    const start = Math.max(this.clock, this.config.warmup);
    if (t > start) {
      const dt = t - start;
      const q = this.holdingPattern.size;
      const n = q + (this.runway ? 1 : 0);
      const s = this.stats;
      s.areaQueue += q * dt;
      s.areaSystem += n * dt;
      if (n > 0) s.busyTime += dt;
      if (n >= this.config.capacityK) s.saturatedTime += dt;
      s.timeAtN[Math.min(n, HISTOGRAM_SIZE - 1)] += dt;
    }
    this.clock = t;
  }

  _recordWait(aircraft) {
    if (aircraft.arrivalTime < this.config.warmup) return;
    const wait = aircraft.serviceStart - aircraft.arrivalTime;
    if (aircraft.isEmergency) {
      this.stats.servedEmergency++;
      this.stats.sumWaitEmergency += wait;
    } else {
      this.stats.servedNormal++;
      this.stats.sumWaitNormal += wait;
    }
  }

  _recordDeparture(aircraft) {
    if (aircraft.arrivalTime < this.config.warmup) return;
    this.stats.departures++;
    this.stats.sumSystemTime += aircraft.departureTime - aircraft.arrivalTime;
  }

  /** Métricas de desempeño observadas (tiempos en horas). */
  getResults() {
    const s = this.stats;
    const observed = Math.max(0, this.clock - this.config.warmup);
    const served = s.servedEmergency + s.servedNormal;
    const div = (a, b) => (b > 0 ? a / b : NaN);
    return {
      observedTime: observed,
      utilization: div(s.busyTime, observed),
      Lq: div(s.areaQueue, observed),
      L: div(s.areaSystem, observed),
      Wq: div(s.sumWaitEmergency + s.sumWaitNormal, served),
      WqEmergency: div(s.sumWaitEmergency, s.servedEmergency),
      WqNormal: div(s.sumWaitNormal, s.servedNormal),
      W: div(s.sumSystemTime, s.departures),
      pSaturation: div(s.saturatedTime, observed),
      distribution: Array.from(s.timeAtN, (v) => div(v, observed)),
      arrivals: s.arrivals,
      served,
      servedEmergency: s.servedEmergency,
      servedNormal: s.servedNormal,
      maxQueue: s.maxQueue,
    };
  }
}
