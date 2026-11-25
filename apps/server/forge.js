import { randomInt } from 'node:crypto';
import { enhance as enhanceShared } from '../../packages/content/forge.js';
export * from '../../packages/content/forge.js';

// Production owns all random draws. Browser practice shares only transitions.
const randomUnit = () => randomInt(0x100000000) / 0x100000000;
export function enhance(build, forgeDraw = randomUnit, awakeningDraw = randomUnit, options = {}) {
  return enhanceShared(build, forgeDraw, awakeningDraw, options);
}
