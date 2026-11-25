// Internal growth level 0..19 maps to the public tier 20..1.
// Index by attempted target level, never by the displayed tier.
export const SUCCESS_PERCENT = Object.freeze([0, 100, 100, 100, 100, 100, 100, 100, 100, 100, 85, 80, 70, 60, 50, 40, 30, 22, 15, 10]);
export const BASE_TICKETS = 10;
export const TICKETS_PER_CORRECT = 2;
export const SHIELD_COST = 2;
export const HIDDEN_CHANCE = 0.01;
export const MAX_LEVEL = 19;
export const AWAKENING_LEVEL = 10;
export const CHOICE_LEVEL = 2;
export const DEFAULT_CLASS = 'crimson';
export const DEFAULT_PATH = 'fire';
export const NORMAL_ELEMENTS = Object.freeze({
  crimson: 'fire', ring: 'fire', tide: 'water', cannon: 'water', bolt: 'lightning',
  magnet: 'lightning', mace: 'earth', crystal: 'earth', thorn: 'nature', seed: 'nature',
  blade: 'neutral', trinity: 'neutral', ninja: 'neutral', elastic: 'neutral', beam: 'neutral',
  frost: 'water', portal: 'neutral', summoner: 'neutral', chain: 'neutral', idol: 'neutral',
  star: 'neutral', berserk: 'neutral',
});
export const HIDDEN_CLASSES = Object.freeze(['prism', 'gravity', 'hourglass']);
export const nextChance = level => SUCCESS_PERCENT[level + 1] ?? 0;
export const tierOf = level => 20 - Math.max(0, Math.min(MAX_LEVEL, Math.trunc(Number(level) || 0)));
export const levelOf = tier => 20 - Math.max(1, Math.min(20, Math.trunc(Number(tier) || 20)));
