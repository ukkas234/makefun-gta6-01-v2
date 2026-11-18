// A small seeded random number generator (mulberry32): the same seed gives the
// same city, traffic and screenshot scenes, which is what makes the staged
// shots repeatable. Helpers below are the only randomness the game needs.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Float in [min, max). */
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

/** Integer in [min, max] inclusive. */
export function rangeInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** One element of a non-empty array, uniformly at random. */
export function pick(rng, array) {
  return array[Math.floor(rng() * array.length)];
}

/** Alias of pick, for call sites that read better as "choose one". */
export function choice(rng, array) {
  return pick(rng, array);
}

/** True with the given probability (0..1). */
export function chance(rng, probability) {
  return rng() < probability;
}

/** A new array with the elements shuffled (Fisher-Yates, seeded). */
export function shuffle(rng, array) {
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
