# poker-dataset-generator

Fase 1 do pipeline descrito em `poker-ai-training-pipeline-scope.md`: gera um
dataset de cenários pós-flop **resolvidos** pelo `poker-solver-engine`
(oráculo de CFR), pra depois treinar um modelo que generalize a estratégia
do solver (Fase 2, fora deste pacote).

## Uso

```bash
npm install   # cria o link pra ../../poker/poker-solver-engine

# amostra rápida
node bin/generate.js --count 50 --out data/sample.jsonl --seed 1

# dataset maior, em background (ver "Performance" abaixo antes de rodar
# dezenas de milhares de uma vez)
node bin/generate.js --count 20000 --out data/dataset.jsonl --seed 42
```

`node bin/generate.js --help` lista todas as opções.

## Como os cenários são sorteados

Em vez de sortear board/ranges/stacks puramente ao acaso (que gera cenários
pouco representativos de jogo real — ver `positionRanges.js`), o gerador:

1. Sorteia um **matchup de posições** (`src/positionRanges.js`): abertura de
   uma posição vs call de outra (2bet), pote de 3-bet, ou (opcional,
   desligado por padrão) um confronto multiway de 3 jogadores. As ranges são
   aproximações "achatadas" de ranges reais de 6-max — mais largas em
   posição tardia, BB defende mais largo contra steal — calibradas para
   manter o custo do solve controlado (ver Performance).
2. Sorteia uma **profundidade de stack** (curto 20-40bb / médio 40-80bb /
   fundo 100-200bb; potes de 3-bet só usam médio/fundo, porque com stack
   curto o 3-bet normalmente vira all-in pré-flop).
3. Sorteia um **flop com textura alvo** (`src/boardSampler.js`): seco,
   molhado, paired, monotone, broadway-heavy, low — por rejection sampling,
   garantindo cobertura estratificada em vez de board aleatório puro.
4. Sorteia um **conjunto de bet sizes** dentre algumas configurações
   (incluindo uma configuração pot-size fixa, útil como baseline).
5. Chama `solveScenario` (num worker separado, ver abaixo) e grava o
   registro completo (`scenario` + `result` + `meta`) como uma linha JSON em
   `data/*.jsonl`.

`meta` inclui `matchup`, `potType`, `stackBucket`/`stackBB`, `targetTexture`/
`texture`, `iterationsRun`, `elapsedMs`, `solverWarnings` — dá pra filtrar ou
pesar o dataset por convergência na hora de treinar (ver limitação #3 do
escopo: turn/river convergem mais devagar).

## Performance (importante antes de gerar em escala)

O solver é **JavaScript single-thread**. Medido neste projeto:

- O custo por iteração de CFR cresce aproximadamente linear com o **produto**
  do nº de combos de todos os jogadores (não a soma) — ranges "de livro"
  (BTN abrindo ~45% = 500+ combos) tornam um solve de segundos em um de
  *minutos*. Por isso as ranges em `positionRanges.js` são tiers achatados
  (34-82 combos), calibrados pra manter esse produto na faixa de ~1500-5000.
- Com esse orçamento, um solve heads-up de ~300 iterações leva tipicamente
  4-13s numa única thread.
- **Multiway (3 jogadores) é desproporcionalmente mais lento** — não é só o
  produto de combos, há um overhead fixo grande na árvore/showdown 3-way.
  Medido: mesmo com ranges minúsculos (16×12×12 combos) uma iteração custou
  ~500ms+ (30-50x mais lento que um heads-up comparável). Por isso
  `multiwayRatio` é **0 por padrão** — habilite (`--multiwayRatio 0.1`, por
  exemplo) só sabendo que o throughput cai bastante.
- Para compensar o single-thread do solver, `bin/generate.js` roda um **pool
  de `worker_threads`** (`src/workerPool.js` + `src/solveWorker.js`), um
  cenário por worker, com `--concurrency` = nº de núcleos por padrão.

Nesta máquina (12 núcleos), com os defaults (heads-up + 3-bet, sem
multiway), o throughput observado foi **~0.8-0.9 cenários/s** (~3000/hora).
Gerar "dezenas de milhares" de registros como o escopo sugere é viável, mas
leva **horas**, não minutos — rode com `run_in_background` ou similar, e
use `--seed` pra poder retomar/auditar de forma reprodutível.

## Limitações herdadas (ver escopo original para detalhes)

- Só o **primeiro jogador a agir no flop** é reportado por `solveScenario`
  hoje — os demais nós da árvore (resposta à ação, streets seguintes) são
  resolvidos internamente mas não expostos. Se o treino da Fase 2 precisar
  desses nós, isso exige estender `solverService.js` no motor antes de gerar
  dados em massa (decisão em aberto no escopo — não implementado aqui).
- Pré-flop não é resolvido pelo motor — as ranges usadas aqui são
  aproximações fixas, não uma solução de equilíbrio pré-flop.
- Multiway usa reach independente por oponente (aproximação padrão da
  literatura), e é lento demais pra gerar em volume (ver Performance).
