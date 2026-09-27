/**
 * RNG determinístico (mulberry32) — permite reproduzir um dataset inteiro
 * a partir de um único --seed numérico.
 */

export function createRng(seed) {
  let state = seed >>> 0;

  function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(min, max) {
    // inteiro em [min, max], inclusive
    return min + Math.floor(next() * (max - min + 1));
  }

  function float(min, max) {
    return min + next() * (max - min);
  }

  function pick(arr) {
    return arr[int(0, arr.length - 1)];
  }

  function chance(p) {
    return next() < p;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = int(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  return { next, int, float, pick, chance, shuffle };
}
