import { randomInt } from 'node:crypto';
import { BASE_TICKETS, SHIELD_COST, MAX_LEVEL, nextChance, HIDDEN_CHANCE, HIDDEN_CLASSES, NORMAL_ELEMENTS, DEFAULT_CLASS } from '../../packages/content/economy.js';
import { ensure } from '../../packages/protocol/index.js';

// Each production draw uses independent cryptographic random bytes. The two injected
// draw functions let tests exercise a hidden awakening without changing forge rolls.
const randomUnit = () => randomInt(0x100000000) / 0x100000000;

export function initialBuild() {
  return { level: 0, best: 0, tickets: 0, shields: 0, useShield: false, element: 'neutral',
    classId: 'basic', classChosen: false, awakeningRolled: false, hiddenOffer: null,
    hiddenDecision: null, locked: false };
}
export function fundBuild(build, correct) { build.tickets = BASE_TICKETS + correct; }
export function enhance(build, forgeDraw = randomUnit, awakeningDraw = randomUnit) {
  ensure(!build.locked, '이미 출전이 확정됐습니다.');
  ensure(build.level < MAX_LEVEL, '최종 강화 단계입니다.');
  ensure(build.tickets >= 1, '강화권이 부족합니다.');
  const previous = build.level;
  const success = forgeDraw() < nextChance(previous) / 100;
  let protectedLevel = false;
  build.tickets--;
  if (success) {
    build.level++;
    build.best = Math.max(build.best, build.level);
    if (build.level === 10 && !build.awakeningRolled) {
      build.awakeningRolled = true;
      if (awakeningDraw() < HIDDEN_CHANCE) {
        build.hiddenOffer = HIDDEN_CLASSES[Math.floor(awakeningDraw() * HIDDEN_CLASSES.length)];
      }
    }
  } else if (previous > 10) {
    if (build.useShield && build.shields > 0) {
      build.shields--;
      if (!build.shields) build.useShield = false;
      protectedLevel = true;
    } else build.level--;
  }
  return { previous, level: build.level, success, protected: protectedLevel };
}
export function buyShield(build) {
  ensure(!build.locked && build.level < MAX_LEVEL, '현재 공은 유지권을 구매할 수 없습니다.');
  ensure(build.tickets >= SHIELD_COST, '유지권 구매에는 강화권 2장이 필요합니다.');
  build.tickets -= SHIELD_COST;
  build.shields++;
}
export function toggleShield(build, enabled) {
  ensure(typeof enabled === 'boolean', '유지권 적용 여부를 선택하세요.');
  ensure(!build.locked && (!enabled || build.shields > 0), '사용 가능한 유지권이 없습니다.');
  build.useShield = enabled;
}
export function chooseClass(build, classId) {
  ensure(!build.locked && build.best >= 10 && !build.classChosen, '지금은 전직을 선택할 수 없습니다.');
  ensure(Object.hasOwn(NORMAL_ELEMENTS, classId), '일반 전직을 선택하세요.');
  build.element = NORMAL_ELEMENTS[classId];
  build.classId = classId;
  build.classChosen = true;
}
export function resolveHidden(build, accept) {
  ensure(typeof accept === 'boolean' && !build.locked && build.classChosen && build.hiddenOffer && build.hiddenDecision === null, '응답할 히든 제안이 없습니다.');
  if (accept) build.classId = build.hiddenOffer;
  build.hiddenDecision = accept;
}
export function lockBuild(build) {
  if (build.locked) return;
  if (build.best >= 10 && !build.classChosen) chooseClass(build, DEFAULT_CLASS);
  if (build.hiddenOffer && build.hiddenDecision === null) resolveHidden(build, false);
  build.locked = true;
}
