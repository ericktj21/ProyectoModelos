/**
 * simulation.worker.js
 * ---------------------------------------------------------------------------
 * Web Worker que ejecuta las simulaciones pesadas en un hilo separado para
 * que la interfaz no se congele mientras se procesan millones de eventos.
 *
 * Protocolo de mensajes:
 *   entrada  { id, type: 'replications', payload: { config, replicas, seed } }
 *            { id, type: 'sweep',        payload: { configs, replicas, seed } }
 *   salida   { id, type: 'progress', done, total }
 *            { id, type: 'result',   data }
 *            { id, type: 'error',    message }
 * ---------------------------------------------------------------------------
 */

import { runReplications, runSweep } from '../core/experiments.js';

self.addEventListener('message', (event) => {
  const { id, type, payload } = event.data;
  const progress = (done, total) => self.postMessage({ id, type: 'progress', done, total });

  try {
    let data;
    if (type === 'replications') {
      data = runReplications(payload.config, {
        replicas: payload.replicas,
        seed: payload.seed,
        onProgress: (done) => progress(done, payload.replicas),
      });
    } else if (type === 'sweep') {
      data = runSweep(payload.configs, {
        replicas: payload.replicas,
        seed: payload.seed,
        onProgress: progress,
      });
    } else {
      throw new Error(`Tipo de trabajo desconocido: ${type}`);
    }
    self.postMessage({ id, type: 'result', data });
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error.message });
  }
});
