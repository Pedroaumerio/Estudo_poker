/**
 * Worker thread: recebe um cenário, roda solveScenario (CPU-bound) e devolve
 * o resultado. O solver em si é single-thread — paralelizamos entre
 * cenários, um por worker, pra usar todos os núcleos disponíveis.
 */

import { parentPort } from 'node:worker_threads';
import { solveScenario } from 'poker-solver-engine';

parentPort.on('message', ({ id, scenario }) => {
  try {
    const result = solveScenario(scenario);
    parentPort.postMessage({ id, result });
  } catch (err) {
    parentPort.postMessage({ id, error: err.message });
  }
});
