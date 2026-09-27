/**
 * Pool simples de worker_threads pra rodar solveScenario em paralelo.
 * Cada worker roda um cenário CPU-bound por vez; o pool distribui um
 * cenário por worker ocioso e resolve/rejeita a Promise correspondente
 * quando a resposta chega.
 */

import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, 'solveWorker.js');

export class SolverPool {
  constructor(size) {
    this.size = size;
    this.workers = [];
    this.idle = [];
    this.queue = [];
    this.pending = new Map();
    this.nextId = 0;
    for (let i = 0; i < size; i++) this._spawnWorker();
  }

  _spawnWorker() {
    const worker = new Worker(WORKER_PATH);
    worker.on('message', (msg) => {
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error));
        else p.resolve(msg.result);
      }
      this.idle.push(worker);
      this._drain();
    });
    worker.on('error', (err) => {
      // Um worker que crasha perde a tarefa em andamento — não temos como
      // saber qual `id` estava rodando nele, então só logamos. O chamador
      // (datasetGenerator) trata isso como "sem resposta" via timeout se
      // necessário; na prática solveScenario não deveria lançar exceções
      // não capturadas (validateScenario já cobre os casos esperados).
      console.error('[workerPool] worker crashou:', err.message);
    });
    this.workers.push(worker);
    this.idle.push(worker);
  }

  solve(scenario) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.queue.push({ id, scenario });
      this._drain();
    });
  }

  _drain() {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const worker = this.idle.pop();
      const task = this.queue.shift();
      worker.postMessage(task);
    }
  }

  async close() {
    await Promise.all(this.workers.map(w => w.terminate()));
  }
}
