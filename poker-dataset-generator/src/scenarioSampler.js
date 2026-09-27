/**
 * Combina matchup de ranges + textura de board + profundidade de stack +
 * tamanhos de aposta num cenário pronto pra `solveScenario`, com metadados
 * pra permitir amostragem estratificada (não puramente aleatória) e análise
 * posterior do dataset.
 */

import { sampleTwoBetMatchup, sampleThreeBetMatchup, sampleMultiwayMatchup } from './positionRanges.js';
import { sampleFlop, classifyFlop, flopToBoardString, TEXTURES } from './boardSampler.js';

const STACK_BUCKETS = {
  short: { min: 20, max: 40 },
  medium: { min: 40, max: 80 },
  deep: { min: 100, max: 200 },
};

// Potes de 3-bet praticamente não sobrevivem com stack curto (vira all-in
// pré-flop), então restringimos a buckets onde o pós-flop ainda existe.
const BUCKETS_BY_POT_TYPE = {
  '2bet': ['short', 'medium', 'deep'],
  '3bet': ['medium', 'deep'],
  multiway: ['short', 'medium', 'deep'],
};

const POT_PRE_BY_TYPE = {
  '2bet': { min: 4.5, max: 6.5 },
  '3bet': { min: 16, max: 24 },
  multiway: { min: 7, max: 11 },
};

const BET_SIZE_CONFIGS = [
  { flop: [0.33, 0.75], turn: [0.5, 1.0], river: [0.75] },
  { flop: [0.5, 1.0], turn: [0.66, 1.0], river: [0.75, 1.5] },
  { flop: [0.75], turn: [0.75, 1.5], river: [1.0] },
  { flop: [0.33, 0.66, 1.25], turn: [0.66, 1.25], river: [0.5, 1.0] },
  { flop: [1.0], turn: [1.0], river: [1.0] }, // pot-size sempre, útil pra baseline
];

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * @param {import('./rng.js').createRng} rng
 * @param {Object} [options]
 * @param {number} [options.multiwayRatio] fração de cenários com 3 jogadores
 * @param {number} [options.threeBetRatio] fração (dos 2-jogadores) que é pote de 3-bet
 * @param {number} [options.iterations]
 * @param {number} [options.timeBudgetMs]
 */
export function sampleScenario(rng, options = {}) {
  const {
    // multiway (3 jogadores) é desligado por padrão: ver o aviso de
    // performance em positionRanges.js — cada solve 3-way custa dezenas de
    // vezes mais que um heads-up comparável, mesmo com ranges minúsculos.
    multiwayRatio = 0,
    threeBetRatio = 0.2,
    iterations = 300,
    timeBudgetMs = 12000,
    maxRaisesRange = [1, 3],
  } = options;

  let matchup;
  if (rng.chance(multiwayRatio)) {
    matchup = sampleMultiwayMatchup(rng);
  } else if (rng.chance(threeBetRatio)) {
    matchup = sampleThreeBetMatchup(rng);
  } else {
    matchup = sampleTwoBetMatchup(rng);
  }

  const bucketName = rng.pick(BUCKETS_BY_POT_TYPE[matchup.potType]);
  const bucket = STACK_BUCKETS[bucketName];
  const stack = rng.int(bucket.min, bucket.max);

  const potPreRange = POT_PRE_BY_TYPE[matchup.potType];
  const potPre = round1(rng.float(potPreRange.min, potPreRange.max));

  const targetTexture = rng.pick(TEXTURES);
  const flop = sampleFlop(rng, { targetTexture });
  const texture = classifyFlop(flop);
  const board = flopToBoardString(flop);

  const betSizes = rng.pick(BET_SIZE_CONFIGS);
  const maxRaisesPerStreet = rng.int(maxRaisesRange[0], maxRaisesRange[1]);

  const players = matchup.players.map(p => ({ id: p.id, stack, range: p.range }));

  const scenario = { players, board, potPre, betSizes, maxRaisesPerStreet, iterations, timeBudgetMs };

  const meta = {
    matchup: matchup.label,
    potType: matchup.potType,
    stackBucket: bucketName,
    stackBB: stack,
    targetTexture,
    texture,
    numPlayers: players.length,
  };

  return { scenario, meta };
}
