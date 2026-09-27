/**
 * Sorteio e classificação de textura de flop.
 *
 * Usamos rejection sampling: sorteamos um flop com o RNG seedado do projeto
 * (não o Math.random interno do pacote do solver, pra manter reprodutibilidade
 * com --seed) e reclassificamos até bater com a textura alvo, cobrindo o
 * espaço de boards de forma estratificada em vez de puramente aleatória.
 */

import { fullDeck, rankOf, suitOf, cardsToString } from 'poker-solver-engine';

export const TEXTURES = ['dry', 'wet', 'paired', 'monotone', 'broadway', 'low'];

function drawFlop(rng, deadCards = []) {
  const dead = new Set(deadCards);
  const deck = fullDeck().filter(c => !dead.has(c));
  const pool = deck.slice();
  const flop = [];
  for (let i = 0; i < 3; i++) {
    const idx = rng.int(0, pool.length - 1);
    flop.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return flop;
}

/** Classifica um flop em um conjunto de tags de textura (pode ter mais de uma). */
export function classifyFlop(flop) {
  const ranks = flop.map(rankOf).sort((a, b) => b - a);
  const suits = flop.map(suitOf);
  const tags = new Set();

  const suitCounts = new Map();
  for (const s of suits) suitCounts.set(s, (suitCounts.get(s) || 0) + 1);
  const maxSuitCount = Math.max(...suitCounts.values());

  const rankCounts = new Map();
  for (const r of ranks) rankCounts.set(r, (rankCounts.get(r) || 0) + 1);
  const isPaired = [...rankCounts.values()].some(c => c >= 2);

  if (isPaired) tags.add('paired');
  if (maxSuitCount === 3) tags.add('monotone');

  const span = ranks[0] - ranks[2]; // maior rank (idx0=2..12) menos o menor
  const gapTop = ranks[0] - ranks[1];
  const gapBot = ranks[1] - ranks[2];
  const connected = !isPaired && gapTop <= 2 && gapBot <= 2 && span <= 4;

  if (!isPaired && (connected || maxSuitCount === 3)) tags.add('wet');
  if (!isPaired && maxSuitCount <= 2 && !connected) tags.add('dry');

  if (ranks[0] >= 8) tags.add('broadway'); // rank idx 8 == 'T'
  if (ranks[0] <= 6) tags.add('low'); // maior carta 8 ou menor (idx<=6 -> rank 8)

  return [...tags];
}

/**
 * Sorteia um flop cuja classificação inclua `targetTexture`. Faz rejection
 * sampling com um teto de tentativas — se não achar (textura rara demais
 * combinada com deadCards), devolve o último flop sorteado mesmo assim.
 */
export function sampleFlop(rng, { targetTexture = null, deadCards = [], maxAttempts = 200 } = {}) {
  let flop = drawFlop(rng, deadCards);
  if (!targetTexture) return flop;

  for (let i = 0; i < maxAttempts; i++) {
    const tags = classifyFlop(flop);
    if (tags.includes(targetTexture)) return flop;
    flop = drawFlop(rng, deadCards);
  }
  return flop;
}

export function flopToBoardString(flop) {
  return cardsToString(flop);
}
