#!/usr/bin/env node
/**
 * CLI do gerador de dataset. Exemplo:
 *   node bin/generate.js --count 20000 --out data/dataset.jsonl --seed 42
 */

import os from 'node:os';
import path from 'node:path';
import { generateDataset } from '../src/datasetGenerator.js';

function parseArgs(argv) {
  const args = { count: 1000, out: 'data/dataset.jsonl', iterations: 300, timeBudgetMs: 12000, multiwayRatio: 0, threeBetRatio: 0.2, append: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--count': args.count = Number(next()); break;
      case '--out': args.out = next(); break;
      case '--seed': args.seed = Number(next()); break;
      case '--iterations': args.iterations = Number(next()); break;
      case '--timeBudgetMs': args.timeBudgetMs = Number(next()); break;
      case '--multiwayRatio': args.multiwayRatio = Number(next()); break;
      case '--threeBetRatio': args.threeBetRatio = Number(next()); break;
      case '--maxAttemptsPerRecord': args.maxAttemptsPerRecord = Number(next()); break;
      case '--concurrency': args.concurrency = Number(next()); break;
      case '--append': args.append = true; break;
      case '--help': case '-h': args.help = true; break;
      default:
        throw new Error(`Argumento desconhecido: ${a}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Uso: node bin/generate.js [opções]

  --count <n>               quantos cenários resolvidos gerar (default: 1000)
  --out <path>               arquivo .jsonl de saída (default: data/dataset.jsonl)
  --seed <n>                 seed do RNG, para reprodutibilidade (default: aleatório)
  --iterations <n>           iterações de CFR por cenário (default: 300)
  --timeBudgetMs <n>         teto de tempo por cenário em ms (default: 12000)
  --multiwayRatio <0-1>      fração de cenários com 3 jogadores (default: 0 — ver aviso de
                             performance em src/positionRanges.js; 3-way é dezenas de vezes
                             mais lento que heads-up mesmo com ranges pequenos)
  --threeBetRatio <0-1>      fração (dos 2-jogadores) que é pote de 3-bet (default: 0.2)
  --maxAttemptsPerRecord <n> tentativas antes de desistir de um registro (default: 5)
  --concurrency <n>          nº de workers em paralelo (default: nº de núcleos = ${os.cpus().length})
  --append                   acrescenta ao arquivo de saída em vez de sobrescrever
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const outPath = path.resolve(process.cwd(), args.out);
  console.log(`Gerando ${args.count} cenários -> ${outPath}${args.seed !== undefined ? ` (seed=${args.seed})` : ''}`);

  const stats = await generateDataset({
    ...args,
    outPath,
    onProgress: (s) => {
      const rate = s.processed / ((Date.now() - s.startedAt) / 1000);
      const eta = rate > 0 ? Math.round((s.requested - s.processed) / rate) : '?';
      console.log(`[${s.processed}/${s.requested}] escritos=${s.written} falhas=${s.failed} (~${rate.toFixed(1)}/s, eta ${eta}s)`);
    },
  });

  console.log('\nConcluído.');
  console.log(`Escritos: ${stats.written}  Falhas: ${stats.failed}  Tempo total: ${(stats.elapsedMs / 1000).toFixed(1)}s`);
  console.log('Por tipo de pote:', stats.byPotType);
  console.log('Por textura de board:', stats.byTexture);
  if (stats.failed > 0) {
    console.log(`Último erro: ${stats.lastError}`);
  }
}

main().catch(err => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
