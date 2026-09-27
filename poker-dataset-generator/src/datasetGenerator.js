/**
 * Loop principal: sorteia cenários, roda o solver (oráculo) num pool de
 * worker_threads (paralelo entre núcleos) e grava cada registro resolvido em
 * JSON Lines — um por linha, streaming direto pro arquivo, sem acumular o
 * dataset inteiro em memória.
 */

import fs from 'node:fs';
import os from 'node:os';
import { createRng } from './rng.js';
import { sampleScenario } from './scenarioSampler.js';
import { SolverPool } from './workerPool.js';

/**
 * @param {Object} options
 * @param {number} options.count quantos cenários resolvidos gravar
 * @param {string} options.outPath caminho do arquivo .jsonl de saída
 * @param {number} [options.seed]
 * @param {number} [options.iterations]
 * @param {number} [options.timeBudgetMs]
 * @param {number} [options.multiwayRatio]
 * @param {number} [options.threeBetRatio]
 * @param {number} [options.maxAttemptsPerRecord] tentativas antes de desistir de um registro
 * @param {number} [options.concurrency] nº de workers (default: nº de núcleos)
 * @param {boolean} [options.append]
 * @param {(stats: object) => void} [options.onProgress]
 */
export async function generateDataset(options) {
  const {
    count,
    outPath,
    seed = Date.now() >>> 0,
    iterations = 300,
    timeBudgetMs = 12000,
    multiwayRatio = 0,
    threeBetRatio = 0.2,
    maxAttemptsPerRecord = 5,
    concurrency = os.cpus().length,
    append = false,
    onProgress = () => {},
  } = options;

  const rng = createRng(seed);
  const stream = fs.createWriteStream(outPath, { flags: append ? 'a' : 'w' });
  const pool = new SolverPool(concurrency);

  const stats = {
    requested: count,
    written: 0,
    failed: 0,
    startedAt: Date.now(),
    byPotType: {},
    byTexture: {},
  };

  let processed = 0;

  async function runOne() {
    let ok = false;
    let lastError = null;

    for (let attempt = 0; attempt < maxAttemptsPerRecord && !ok; attempt++) {
      const { scenario, meta } = sampleScenario(rng, { multiwayRatio, threeBetRatio, iterations, timeBudgetMs });
      try {
        const result = await pool.solve(scenario);
        const record = {
          scenario,
          result,
          meta: {
            ...meta,
            iterationsRun: result.iterationsRun,
            elapsedMs: result.elapsedMs,
            solverWarnings: result.warnings,
            generatedAt: new Date().toISOString(),
            seed,
          },
        };
        stream.write(JSON.stringify(record) + '\n');
        stats.written++;
        stats.byPotType[meta.potType] = (stats.byPotType[meta.potType] || 0) + 1;
        for (const tag of meta.texture) {
          stats.byTexture[tag] = (stats.byTexture[tag] || 0) + 1;
        }
        ok = true;
      } catch (err) {
        lastError = err;
      }
    }

    if (!ok) {
      stats.failed++;
      stats.lastError = lastError?.message;
    }

    processed++;
    if (processed % 10 === 0 || processed === count) {
      onProgress({ ...stats, processed });
    }
  }

  // `concurrency` loops sequenciais rodando em paralelo (cada um aguarda seu
  // solve no pool antes de pegar o próximo) — mantém ~`concurrency` cenários
  // em voo o tempo todo, um por worker.
  let started = 0;
  async function loop() {
    while (started < count) {
      started++;
      await runOne();
    }
  }
  const loops = Array.from({ length: Math.min(concurrency, count) }, loop);
  await Promise.all(loops);

  await pool.close();
  await new Promise((resolve, reject) => {
    stream.end(err => (err ? reject(err) : resolve()));
  });

  stats.elapsedMs = Date.now() - stats.startedAt;
  return stats;
}
