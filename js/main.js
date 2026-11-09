import { Router } from './ui/router.js';
import { SimulationWorkerClient } from './ui/workerClient.js';
import { TheoryView } from './ui/views/theoryView.js';
import { RealtimeView } from './ui/views/realtimeView.js';
import { ExperimentsView } from './ui/views/experimentsView.js';

const router = new Router('inicio');
const worker = new SimulationWorkerClient();

new TheoryView(router);
new RealtimeView(router);
new ExperimentsView(router, worker);

router.start();
