// A small seeded random generator: the same seed always gives the same city, the same
// traffic and the same screenshot scenes, which is what makes the game repeatable.
// The core is a four-state counter generator (sfc32): cheap, fast and good enough for
// a game world, with the state scrambled once from the seed at creation.

export function createRandom(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  let b = ((a * 2654435761) >>> 0) ^ 0x85ebca6b;
  let c = ((b * 2246822519) >>> 0) ^ 0xc2b2ae35;
  let d = ((c * 3266489917) >>> 0) ^ 0x27d4eb2f;
  return function random() {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** A float in [lo, hi). */
export function range(random, lo, hi) {
  return lo + random() * (hi - lo);
}

/** An integer in [lo, hi], both ends included. */
export function intRange(random, lo, hi) {
  return lo + Math.floor(random() * (hi - lo + 1));
}

/** One element of an array, uniformly. */
export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

/** True with probability p (0 to 1). */
export function chance(random, p) {
  return random() < p;
}

/** -1 or 1, a coin flip. */
export function sign(random) {
  return random() < 0.5 ? -1 : 1;
}
