/**
 * Ranges de pré-flop aproximadas (6-max, ~100bb) usadas para montar cenários
 * pós-flop realistas. Não são o objetivo do estudo (o solver não resolve
 * pré-flop — ver limitações no escopo), servem só para popular os ranges de
 * cada jogador que chegam ao flop, em vez de sortear cartas aleatórias sem
 * relação com jogo real.
 *
 * As ranges são intencionalmente simplificadas (não têm mistura de frequência
 * por combo, nem ajuste fino por stack) — o suficiente para gerar boards e
 * confrontos de range plausíveis.
 */

// "Tiers" de largura de range, calibrados empiricamente: o custo de uma
// iteração de CFR cresce (aprox. linearmente) com o produto do número de
// combos de todos os jogadores, porque cada iteração precisa varrer o
// showdown/EV entre as combinações de todo mundo. Ranges "de livro" (ex.
// BTN abrindo ~45% das mãos, ~500+ combos) tornam um solve de segundos em
// um de minutos — inviável para gerar dezenas de milhares de registros.
// Estes tiers são versões achatadas (mas ainda coerentes por posição: mais
// larga em posição tardia) desenhadas para manter produto raiser×caller
// tipicamente entre ~1500 e ~5000 combos, o que mantém cada solve na casa
// de poucos segundos por cenário (ver README do gerador).
const RANGE_TIERS = {
  TIGHT: 'QQ+,AKs,AKo', // 34 combos — abertura de UTG
  MED: 'JJ+,AQs+,AKo', // 44 combos — abertura HJ/CO, defesas médias
  WIDE: 'TT+,ATs+,KQs,AQo', // 62 combos — abertura BTN/SB, defesas largas
  XWIDE: '88+,A9s+,KQs,QJs,AQo', // 82 combos — defesa do BB contra steal
};

function tierRange(name) {
  const range = RANGE_TIERS[name];
  if (!range) throw new Error(`Tier de range desconhecido: ${name}`);
  return range;
}

// Ranges de 3-bet (agressor original ainda joga, mas mais forte; caller do 3-bet também mais forte).
const THREE_BET_POTS = [
  { raiser: 'BTN', caller: 'BB', raiserRange: 'TT+,AQs+,AKo', callerRange: 'QQ-88,AQs,AKs,AKo' },
  { raiser: 'CO', caller: 'BTN', raiserRange: 'JJ+,AQs+,AKo', callerRange: 'QQ-99,AQs,AKs' },
  { raiser: 'BTN', caller: 'SB', raiserRange: 'TT+,AJs+,AQo+', callerRange: 'QQ-88,AQs+,AKo' },
  { raiser: 'UTG', caller: 'BB', raiserRange: 'QQ+,AKs,AKo', callerRange: 'KK-99,AQs+' },
];

// Confrontos heads-up (2 jogadores) usados para o caso mais confiável do
// solver. `raiserTier`/`callerTier` seguem o padrão real (posições tardias
// abrem e defendem mais largo; o BB defende o mais largo de todos contra
// steal) dentro do orçamento de combos calibrado acima.
const HEADS_UP_MATCHUPS = [
  { raiser: 'BTN', raiserTier: 'WIDE', caller: 'BB', callerTier: 'XWIDE' },
  { raiser: 'BTN', raiserTier: 'WIDE', caller: 'SB', callerTier: 'WIDE' },
  { raiser: 'CO', raiserTier: 'MED', caller: 'BTN', callerTier: 'WIDE' },
  { raiser: 'CO', raiserTier: 'MED', caller: 'BB', callerTier: 'XWIDE' },
  { raiser: 'HJ', raiserTier: 'MED', caller: 'CO', callerTier: 'MED' },
  { raiser: 'HJ', raiserTier: 'MED', caller: 'BTN', callerTier: 'WIDE' },
  { raiser: 'HJ', raiserTier: 'MED', caller: 'BB', callerTier: 'WIDE' },
  { raiser: 'UTG', raiserTier: 'TIGHT', caller: 'HJ', callerTier: 'MED' },
  { raiser: 'UTG', raiserTier: 'TIGHT', caller: 'CO', callerTier: 'MED' },
  { raiser: 'UTG', raiserTier: 'TIGHT', caller: 'BTN', callerTier: 'WIDE' },
  { raiser: 'UTG', raiserTier: 'TIGHT', caller: 'BB', callerTier: 'MED' },
  { raiser: 'SB', raiserTier: 'WIDE', caller: 'BB', callerTier: 'XWIDE' },
];

/** Sorteia um confronto heads-up de 2-bet pot (raiser vs 1 caller). */
export function sampleTwoBetMatchup(rng) {
  const m = rng.pick(HEADS_UP_MATCHUPS);
  return {
    label: `${m.raiser} open vs ${m.caller} call`,
    potType: '2bet',
    players: [
      { id: m.raiser, range: tierRange(m.raiserTier) },
      { id: m.caller, range: tierRange(m.callerTier) },
    ],
  };
}

/** Sorteia um confronto de pote de 3-bet (ranges mais fortes e polarizadas, pote maior). */
export function sampleThreeBetMatchup(rng) {
  const m = rng.pick(THREE_BET_POTS);
  return {
    label: `${m.raiser} vs ${m.caller} 3-bet pot`,
    potType: '3bet',
    players: [
      { id: m.raiser, range: m.raiserRange },
      { id: m.caller, range: m.callerRange },
    ],
  };
}

/**
 * Sorteia um cenário multiway (3 jogadores) simples: um raiser e dois callers
 * de posições distintas. Aproximação — o solver trata reach independente
 * (ver limitações), então isso é usado só numa fração do dataset.
 *
 * ATENÇÃO DE PERFORMANCE (medido empiricamente): o custo por iteração de CFR
 * multiway não é dominado pelo tamanho dos ranges, e sim por um overhead fixo
 * da árvore/showdown 3-way — mesmo com ranges minúsculos (ex. 16×12×12
 * combos) cada iteração custou ~500ms+, ~30-50x mais lento que um heads-up
 * comparável. Por isso os ranges aqui usam os tiers mais estreitos (TIGHT)
 * disponíveis, e o gerador (datasetGenerator/CLI) mantém `multiwayRatio: 0`
 * por padrão — habilite só sabendo que o throughput cai bastante.
 */
export function sampleMultiwayMatchup(rng) {
  const pool = [
    { raiser: 'CO', raiserTier: 'MED', callers: [{ id: 'BTN', tier: 'TIGHT' }, { id: 'BB', tier: 'TIGHT' }] },
    { raiser: 'HJ', raiserTier: 'MED', callers: [{ id: 'CO', tier: 'TIGHT' }, { id: 'BB', tier: 'TIGHT' }] },
    { raiser: 'UTG', raiserTier: 'TIGHT', callers: [{ id: 'BTN', tier: 'TIGHT' }, { id: 'BB', tier: 'TIGHT' }] },
    { raiser: 'BTN', raiserTier: 'MED', callers: [{ id: 'SB', tier: 'TIGHT' }, { id: 'BB', tier: 'TIGHT' }] },
  ];
  const m = rng.pick(pool);
  const players = [{ id: m.raiser, range: tierRange(m.raiserTier) }];
  for (const caller of m.callers) {
    players.push({ id: caller.id, range: tierRange(caller.tier) });
  }
  return {
    label: `${m.raiser} open vs ${m.callers.map(c => c.id).join('+')} (multiway)`,
    potType: 'multiway',
    players,
  };
}
