/** Deterministic noise helpers for the simulators: the same instant always yields the same value. */

export function strSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function hash01(n: number, seed: number): number {
  let x = Math.imul((n | 0) ^ seed, 0x9e3779b1);
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca77);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae3d);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Uniform [0,1) for a string key. */
export const rand = (key: string): number => hash01(1, strSeed(key));

/** Smooth value noise in [-1, 1]. */
export function noise1(seed: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash01(i, seed);
  const b = hash01(i + 1, seed);
  return (a + (b - a) * u) * 2 - 1;
}

/** Fractal noise in roughly [-1, 1]. */
export function fbm(seed: number, x: number, octaves = 3): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise1(seed + o * 1013, x * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
