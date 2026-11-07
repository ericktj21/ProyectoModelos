/**
 * workerClient.js
 * ---------------------------------------------------------------------------
 * Fachada sobre el Web Worker de simulación. Convierte el protocolo de
 * mensajes en una API basada en promesas:
 *
 *   const job = client.run('sweep', payload, onProgress);
 *   const data = await job.promise;
 *   job.cancel();   // termina el worker y lo vuelve a crear
 * ---------------------------------------------------------------------------
 */

const WORKER_URL = new URL('../workers/simulation.worker.js', import.meta.url);

export class SimulationWorkerClient {
  constructor() {
    this._nextId = 1;
    this._pending = new Map();
    this._spawn();
  }

  _spawn() {
    this._worker = new Worker(WORKER_URL, { type: 'module' });
    this._worker.addEventListener('message', (event) => this._onMessage(event.data));
    this._worker.addEventListener('error', (event) => {
      for (const job of this._pending.values()) job.reject(new Error(event.message || 'Error en el worker de simulación.'));
      this._pending.clear();
    });
  }

  _onMessage({ id, type, done, total, data, message }) {
    const job = this._pending.get(id);
    if (!job) return;
    if (type === 'progress') {
      job.onProgress?.(done, total);
    } else if (type === 'result') {
      this._pending.delete(id);
      job.resolve(data);
    } else if (type === 'error') {
      this._pending.delete(id);
      job.reject(new Error(message));
    }
  }

  /**
   * @param {'replications'|'sweep'} type
   * @param {object} payload
   * @param {(done:number,total:number)=>void} [onProgress]
   */
  run(type, payload, onProgress) {
    const id = this._nextId++;
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this._pending.set(id, { resolve, reject, onProgress });
    this._worker.postMessage({ id, type, payload });

    return {
      promise,
      cancel: () => {
        if (!this._pending.has(id)) return;
        this._pending.delete(id);
        this._worker.terminate();
        // Los demás trabajos en curso también se pierden al terminar el worker.
        for (const job of this._pending.values()) job.reject(new Error('Cancelado'));
        this._pending.clear();
        this._spawn();
        reject(new Error('Cancelado'));
      },
    };
  }
}
