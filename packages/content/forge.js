import { BASE_TICKETS, TICKETS_PER_CORRECT, SHIELD_COST, MAX_LEVEL, AWAKENING_LEVEL, CHOICE_LEVEL, nextChance, HIDDEN_CHANCE, HIDDEN_CLASSES, DEFAULT_PATH, tierOf } from './economy.js';
import { PATHS, getBall, getBallChoices, classPath } from './balls.js';
import { ensure } from '../protocol/index.js';

// Shared rule transitions. Production supplies crypto draws; the clearly labelled
// offline practice supplies its own draws and never submits them as online results.
export function initialBuild() {
  return { level: 0, best: 0, tickets: 0, shields: 0, useShield: false, element: 'neutral',
    classId: 'basic', ballId: 'core-20', path: null, pendingChoice: false, choiceHistory: {},
    classChosen: false, awakeningRolled: false, hiddenOffer: null, hiddenClass: null,
    hiddenDecision: null, funded: false, locked: false };
}
export function fundBuild(build, correct) {
  ensure(Number.isInteger(correct) && correct >= 0 && correct <= 20, '정답 수를 확인하세요.');
  if (!build.funded) {
    build.tickets = BASE_TICKETS + correct * TICKETS_PER_CORRECT;
    build.funded = true;
  }
  return build.tickets;
}
function applyBall(build, ball) {
  build.ballId = ball.id;
  build.classId = ball.classId;
  build.element = ball.hidden ? PATHS[build.path]?.element ?? 'neutral' : ball.element;
  build.pendingChoice = false;
  build.classChosen = build.level >= AWAKENING_LEVEL && Boolean(build.path);
  build.choiceHistory ??= {};
  build.choiceHistory[ball.tier] = ball.id;
}
function restoreCurrentTier(build) {
  const tier = tierOf(build.level);
  if (tier >= 19) return applyBall(build, getBall('core-' + tier));
  const candidates = getBallChoices({ ...build, pendingChoice: true });
  const previous = getBall(build.choiceHistory?.[tier]);
  const available = previous && candidates.find(b => b.id === previous.id);
  // A downgrade always restores a legal form of the lower tier. Its old stronger
  // form is never carried over merely because its picture was already selected.
  ensure(available || candidates.length, '현재 티어의 볼을 복원할 수 없습니다.');
  applyBall(build, available || candidates[0]);
}
export function enhance(build, forgeDraw, awakeningDraw = forgeDraw) {
  ensure(!build.locked, '이미 출전이 확정됐습니다.');
  ensure(!build.pendingChoice, '승급한 티어의 볼을 먼저 선택하세요.');
  ensure(Number.isInteger(build.level) && build.level >= 0 && build.level < MAX_LEVEL, '최종 1티어입니다.');
  ensure(build.tickets >= 1, '강화권이 부족합니다.');
  ensure(typeof forgeDraw === 'function' && typeof awakeningDraw === 'function', '강화 판정 함수를 확인하세요.');
  const previous = build.level;
  const roll = forgeDraw();
  ensure(Number.isFinite(roll) && roll >= 0 && roll < 1, '강화 난수 범위를 확인하세요.');
  const success = roll < nextChance(previous) / 100;
  let protectedLevel = false;
  build.tickets--;
  if (success) {
    build.level++;
    build.best = Math.max(build.best, build.level);
    build.pendingChoice = build.level >= CHOICE_LEVEL;
    if (!build.pendingChoice) applyBall(build, getBall('core-' + tierOf(build.level)));
    if (build.level === AWAKENING_LEVEL && !build.awakeningRolled) {
      build.awakeningRolled = true;
      if (awakeningDraw() < HIDDEN_CHANCE) {
        build.hiddenOffer = HIDDEN_CLASSES[Math.min(HIDDEN_CLASSES.length - 1, Math.floor(awakeningDraw() * HIDDEN_CLASSES.length))];
      }
    }
  } else if (previous > AWAKENING_LEVEL) {
    if (build.useShield && build.shields > 0) {
      build.shields--;
      if (!build.shields) build.useShield = false;
      protectedLevel = true;
    } else {
      build.level--;
      restoreCurrentTier(build);
    }
  }
  return { previous, level: build.level, previousTier: tierOf(previous), tier: tierOf(build.level),
    success, protected: protectedLevel, pendingChoice: build.pendingChoice };
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
export function choosePath(build, pathId) {
  ensure(!build.locked && build.level >= AWAKENING_LEVEL && build.pendingChoice && !build.path, '지금은 성장 경로를 선택할 수 없습니다.');
  ensure(Object.hasOwn(PATHS, pathId), '성장 경로를 선택하세요.');
  build.path = pathId;
}
export function chooseBall(build, ballId) {
  ensure(!build.locked && build.pendingChoice, '지금은 볼을 선택할 수 없습니다.');
  ensure(build.level < AWAKENING_LEVEL || PATHS[build.path], '10티어부터 성장 경로를 먼저 선택하세요.');
  const chosen = getBallChoices(build).find(b => b.id === ballId);
  ensure(chosen, '현재 티어와 성장 경로에 맞는 볼을 선택하세요.');
  applyBall(build, chosen);
}
// Compatibility for older teacher scripts. The current UI sends choosePath and
// chooseBall separately and uses exact content IDs for every promotion.
export function chooseClass(build, classId) {
  ensure(!build.locked && build.level >= AWAKENING_LEVEL && !build.classChosen, '지금은 전직을 선택할 수 없습니다.');
  ensure(classPath(classId), '일반 전직을 선택하세요.');
  build.pendingChoice = true;
  if (!build.path) choosePath(build, classPath(classId) || DEFAULT_PATH);
  const chosen = getBallChoices(build).find(b => b.classId === classId && !b.hidden);
  ensure(chosen, '선택한 경로에 없는 클래스입니다.');
  chooseBall(build, chosen.id);
}
export function resolveHidden(build, accept) {
  ensure(typeof accept === 'boolean' && !build.locked && build.classChosen && !build.pendingChoice && build.hiddenOffer && build.hiddenDecision === null, '응답할 히든 제안이 없습니다.');
  ensure(HIDDEN_CLASSES.includes(build.hiddenOffer), '유효한 히든 제안이 아닙니다.');
  build.hiddenDecision = accept;
  if (accept) {
    build.hiddenClass = build.hiddenOffer;
    applyBall(build, getBall(`hidden-${tierOf(build.level)}-${build.hiddenClass}`));
  }
}
export function lockBuild(build) {
  if (build.locked) return;
  const selected = getBall(build.ballId);
  if (build.level >= CHOICE_LEVEL && (build.pendingChoice || !selected || selected.tier !== tierOf(build.level))) {
    build.pendingChoice = true;
    if (build.level >= AWAKENING_LEVEL && !build.path) choosePath(build, DEFAULT_PATH);
    const choice = getBallChoices(build)[0];
    ensure(choice, '출전할 볼을 찾을 수 없습니다.');
    chooseBall(build, choice.id);
  } else if (build.level < CHOICE_LEVEL) {
    applyBall(build, getBall('core-' + tierOf(build.level)));
  }
  if (build.hiddenOffer && build.hiddenDecision === null) resolveHidden(build, false);
  build.locked = true;
}
