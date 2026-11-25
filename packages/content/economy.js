// Index by the attempted target level. Percentages are also used by the client.
export const SUCCESS_PERCENT = Object.freeze([0, 100, 100, 100, 100, 100, 100, 100, 100, 100, 85, 80, 75, 70, 65, 60, 50, 40, 30, 20, 10]);
export const BASE_TICKETS = 8;
export const SHIELD_COST = 2;
export const HIDDEN_CHANCE = 0.01;
export const MAX_LEVEL = 20;
export const DEFAULT_CLASS = 'crimson';
export const NORMAL_ELEMENTS = Object.freeze({
  crimson: 'fire', ring: 'fire', tide: 'water', cannon: 'water', bolt: 'lightning',
  magnet: 'lightning', mace: 'earth', crystal: 'earth', thorn: 'nature', seed: 'nature',
});
export const HIDDEN_CLASSES = Object.freeze(['prism', 'gravity', 'hourglass']);
export const nextChance = level => SUCCESS_PERCENT[level + 1] ?? 0;
