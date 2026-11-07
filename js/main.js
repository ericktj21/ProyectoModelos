import { Router } from './ui/router.js';
import { SimulationWorkerClient } from './ui/workerClient.js';
import { TheoryView } from './ui/views/theoryView.js';
import { SimulationView } from './ui/views/simulationView.js';
import { RealtimeView } from './ui/views/realtimeView.js';
import { ExperimentsView } from './ui/views/experimentsView.js';
import { CollapseView } from './ui/views/collapseView.js';

const router = new Router('inicio');
const worker = new SimulationWorkerClient();

new TheoryView(router);
new SimulationView(router, worker);
new RealtimeView(router);
new ExperimentsView(router, worker);
new CollapseView(router);

router.start();
