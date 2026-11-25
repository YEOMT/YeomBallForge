import { BASE_TICKETS, TICKETS_PER_CORRECT, SHIELD_COST, MAX_LEVEL, AWAKENING_LEVEL, CHOICE_LEVEL, nextChance, HIDDEN_CHANCE, HIDDEN_CLASSES, DEFAULT_PATH, tierOf, ECONOMY_VERSION, wardRequired, failedLevel } from './economy.js';
import { PATHS, getBall, getBallChoices, classPath } from './balls.js';
import { compatibleTraits, traitCompatible } from './traits.js';
import {packPaths} from './packs.js';
import { ensure } from '../protocol/index.js';

// Production supplies crypto draws. Practice uses these same transitions.
// Command IDs, de-duplication and success acknowledgement belong to the room.
export function initialBuild() {
  return { level: 0, best: 0, tickets: 0, shields: 0, useShield: false, element: 'neutral',
    classId: 'basic', profileId: 'basic', ballId: 'core-20', formId: 'core-20', path: null,
    pendingChoice: false, choiceHistory: {}, classChosen: false, awakeningRolled: false,
    hiddenOffer: null, hiddenClass: null, hiddenDecision: null, funded: false, locked: false,
    storageLocked: false, traitId: null, traitPreference: null, pendingTrait: false,
    economyVersion: ECONOMY_VERSION, buildVersion: '2.1.0', packId:'all' };
}
export function fundBuild(build, correct) {
  ensure(Number.isInteger(correct) && correct >= 0 && correct <= 20, '정답 수를 확인하세요.');
  if (!build.funded) {
    build.tickets = BASE_TICKETS + correct * TICKETS_PER_CORRECT;
    build.funded = true;
  }
  return build.tickets;
}
const hiddenPending = build => Boolean(build.hiddenOffer && build.hiddenDecision === null);
export const choicePending = build => Boolean(build.pendingChoice || hiddenPending(build) || build.pendingTrait);
function editable(build) {
  ensure(!build.locked, '대기열 또는 경기 중인 공은 변경할 수 없습니다.');
  ensure(!build.storageLocked, '보관 잠금을 먼저 해제하세요.');
}
function syncTrait(build) {
  if (build.level < AWAKENING_LEVEL || build.traitsEnabled === false) {
    build.traitId = null; build.pendingTrait = false; return;
  }
  // Resolve the final (possibly hidden) profile before asking for a trait once.
  if (build.pendingChoice || hiddenPending(build)) { build.pendingTrait = false; return; }
  if (!traitCompatible(build, build.traitId)) build.traitId = null;
  build.pendingTrait = !build.traitId;
}
function applyBall(build, ball) {
  ensure(ball && ball.tier === tierOf(build.level), '현재 티어의 볼을 확인하세요.');
  build.ballId = ball.id; build.formId = ball.id;
  build.classId = ball.classId; build.profileId = ball.classId;
  build.element = ball.hidden ? PATHS[build.path]?.element ?? 'neutral' : ball.element;
  build.pendingChoice = false;
  build.classChosen = build.level >= AWAKENING_LEVEL && Boolean(build.path);
  build.choiceHistory ??= {};
  build.choiceHistory[ball.tier] = ball.id;
  syncTrait(build);
}
function restoreCurrentTier(build) {
  const tier = tierOf(build.level);
  if (tier >= 19) return applyBall(build, getBall('core-' + tier));
  const candidates = getBallChoices({ ...build, pendingChoice: true });
  const available = candidates.find(b => b.id === build.choiceHistory?.[tier]);
  // A migrated build missing history gets the first legal versioned candidate.
  ensure(available || candidates.length, '현재 티어의 볼을 복원할 수 없습니다.');
  applyBall(build, available || candidates[0]);
}
export function resetBuild(build) {
  editable(build);
  const keep = {};
  for (const key of ['instanceId','ownerId','slotId','generation','revision','tickets','shields','funded','best','awakeningRolled','traitsEnabled','packId','discovered']) {
    if (Object.hasOwn(build, key)) keep[key] = build[key];
  }
  keep.traitPreference = build.traitId || build.traitPreference || null;
  // The first-T10 ledger and discoveries survive; hidden power does not.
  for (const key of Object.keys(build)) delete build[key];
  Object.assign(build, initialBuild(), keep);
  return build;
}
export function forgeQuote(build, protect = build.useShield === true) {
  const required = wardRequired(build.level);
  const shortfall = protect ? Math.max(0, required - build.shields) : 0;
  return { version: ECONOMY_VERSION, previousTier: tierOf(build.level), targetTier: Math.max(1, tierOf(build.level) - 1),
    chance: nextChance(build.level), failureTier: tierOf(failedLevel(build.level)),
    wardRequired: required, wardOwned: build.shields, wardShortfall: shortfall,
    purchaseCost: shortfall * SHIELD_COST, attemptCost: 1, totalCost: 1 + shortfall * SHIELD_COST };
}
function drawUnit(fn) {
  const value = fn();
  ensure(Number.isFinite(value) && value >= 0 && value < 1, '강화 난수 범위를 확인하세요.');
  return value;
}
export function forgeCandidates(build) {
  const paths = build.pendingChoice && build.level >= AWAKENING_LEVEL && !build.path ? packPaths(build.packId) : [];
  return { paths, balls: build.pendingChoice ? getBallChoices(build).map(b => b.id) : [],
    byPath: Object.fromEntries(paths.map(path => [path, getBallChoices({...build, path}).map(b => b.id)])),
    hidden: hiddenPending(build) ? build.hiddenOffer : null,
    traits: build.pendingTrait ? compatibleTraits(build).map(t => t.id) : [] };
}
export function enhance(build, forgeDraw, awakeningDraw = forgeDraw, options = {}) {
  editable(build);
  ensure(!choicePending(build), '경로·공·히든·특성 선택을 먼저 완료하세요.');
  ensure(Number.isInteger(build.level) && build.level >= 0 && build.level < MAX_LEVEL, '최종 1티어입니다.');
  ensure(typeof forgeDraw === 'function' && typeof awakeningDraw === 'function', '강화 판정 함수를 확인하세요.');
  ensure(options.protect === undefined || typeof options.protect === 'boolean', '보호 여부를 확인하세요.');
  ensure(options.buyMissing === undefined || typeof options.buyMissing === 'boolean', '유지권 구매 여부를 확인하세요.');
  const protect = options.protect ?? build.useShield;
  const quote = forgeQuote(build, protect);
  ensure(!protect || !quote.wardShortfall || options.buyMissing === true, '이번 보호에 필요한 유지권이 부족합니다.');
  const purchased = protect && options.buyMissing ? quote.wardShortfall : 0;
  const cost = 1 + purchased * SHIELD_COST;
  ensure(Number.isInteger(build.tickets) && build.tickets >= cost, '강화와 유지권 구매에 필요한 강화권이 부족합니다.');
  ensure(Number.isInteger(build.shields) && build.shields >= 0, '유지권 수를 확인하세요.');
  // Validate and stage all RNG and state changes before the single commit.
  const previous = build.level, roll = drawUnit(forgeDraw);
  const success = roll < nextChance(previous) / 100;
  const next = structuredClone(build);
  next.tickets -= cost; next.shields += purchased; next.useShield = Boolean(protect);
  let consumed = 0, protectedLevel = false, reset = false;
  if (success) {
    next.level++; next.best = Math.max(next.best, next.level);
    next.pendingChoice = next.level >= CHOICE_LEVEL;
    if (next.level === AWAKENING_LEVEL && !next.awakeningRolled) {
      next.awakeningRolled = true;
      if (drawUnit(awakeningDraw) < HIDDEN_CHANCE) {
        next.hiddenOffer = HIDDEN_CLASSES[Math.floor(drawUnit(awakeningDraw) * HIDDEN_CLASSES.length)];
        next.hiddenDecision = null;
      }
    }
    if (!next.pendingChoice) applyBall(next, getBall('core-' + tierOf(next.level)));
    else next.pendingTrait = false;
  } else if (previous > 0) {
    if (protect) {
      consumed = quote.wardRequired; next.shields -= consumed; protectedLevel = true;
    } else if (previous >= AWAKENING_LEVEL) {
      resetBuild(next); reset = true;
    } else {
      next.level = failedLevel(previous); restoreCurrentTier(next);
    }
  }
  for (const key of Object.keys(build)) if (!Object.hasOwn(next, key)) delete build[key];
  Object.assign(build, next);
  return { version: ECONOMY_VERSION, previous, level: build.level, previousTier: tierOf(previous), tier: tierOf(build.level),
    chanceApplied: quote.chance, success, protected: protectedLevel, reset,
    wardRequired: quote.wardRequired, wardConsumed: consumed, wardPurchased: purchased,
    ticketCost: cost, walletAfter: {tickets:build.tickets, shields:build.shields},
    pendingChoice: build.pendingChoice, pendingTrait: build.pendingTrait, immutableCandidates: forgeCandidates(build) };
}
export function buyShield(build, count = 1) {
  editable(build);
  ensure(Number.isInteger(count) && count >= 1 && count <= 99, '구매할 유지권 수를 확인하세요.');
  ensure(build.level < MAX_LEVEL && build.tickets >= SHIELD_COST * count, '유지권 한 개에 강화권 2장이 필요합니다.');
  build.tickets -= SHIELD_COST * count; build.shields += count;
}
export function toggleShield(build, enabled) {
  editable(build);
  ensure(typeof enabled === 'boolean', '유지권 적용 여부를 선택하세요.');
  ensure(!enabled || build.shields >= wardRequired(build.level), '이번 보호에 필요한 유지권이 부족합니다.');
  build.useShield = enabled;
}
export function choosePath(build, pathId) {
  editable(build);
  ensure(build.level >= AWAKENING_LEVEL && build.pendingChoice && !build.path, '지금은 성장 경로를 선택할 수 없습니다.');
  ensure(Object.hasOwn(PATHS, pathId) && packPaths(build.packId).includes(pathId) && getBallChoices({...build, path:pathId}).length, '성장 경로를 선택하세요.');
  build.path = pathId;
}
export function chooseBall(build, ballId) {
  editable(build);
  ensure(build.pendingChoice, '지금은 볼을 선택할 수 없습니다.');
  ensure(build.level < AWAKENING_LEVEL || PATHS[build.path], '10티어부터 성장 경로를 먼저 선택하세요.');
  const chosen = getBallChoices(build).find(b => b.id === ballId);
  ensure(chosen, '현재 티어와 성장 경로에 맞는 볼을 선택하세요.');
  applyBall(build, chosen);
}
export function chooseClass(build, classId) {
  editable(build);
  ensure(build.level >= AWAKENING_LEVEL && !build.classChosen, '지금은 전직을 선택할 수 없습니다.');
  ensure(classPath(classId), '일반 전직을 선택하세요.');
  const next=structuredClone(build);next.pendingChoice = true;
  if (!next.path) choosePath(next, classPath(classId) || DEFAULT_PATH);
  const chosen = getBallChoices(next).find(b => b.classId === classId && !b.hidden);
  ensure(chosen, '선택한 경로에 없는 클래스입니다.');
  chooseBall(next, chosen.id);Object.assign(build,next);
}
export function resolveHidden(build, accept) {
  editable(build);
  ensure(typeof accept === 'boolean' && build.classChosen && !build.pendingChoice && hiddenPending(build), '응답할 히든 제안이 없습니다.');
  ensure(HIDDEN_CLASSES.includes(build.hiddenOffer), '유효한 히든 제안이 아닙니다.');
  build.hiddenDecision = accept;
  if (accept) {
    build.hiddenClass = build.hiddenOffer;
    applyBall(build, getBall(`hidden-${tierOf(build.level)}-${build.hiddenClass}`));
  }
  syncTrait(build);
}
export function chooseTrait(build, traitId) {
  editable(build);
  ensure(build.level >= AWAKENING_LEVEL && build.traitsEnabled !== false && !build.pendingChoice && !hiddenPending(build), '최종 공을 정한 다음 특성을 선택하세요.');
  ensure(traitCompatible(build, traitId), '이 공에서 사용할 수 없는 전술 특성입니다.');
  build.traitId = traitId; build.traitPreference = traitId; build.pendingTrait = false;
}
export function buildReady(build) {
  const ball = getBall(build.ballId);
  return Boolean(ball && ball.tier === tierOf(build.level) && !choicePending(build) &&
    (build.level < AWAKENING_LEVEL || (PATHS[build.path] && (build.traitsEnabled === false || traitCompatible(build, build.traitId)))));
}
export function finalizeBuild(build) {
  // Only deadline/draining resolution chooses defaults. Queue admission uses
  // buildReady, so incomplete forms never silently enter a live match.
  if (build.locked) return build;
  const selected = getBall(build.ballId);
  const stored = build.storageLocked; build.storageLocked = false;
  try {
    if (build.level >= CHOICE_LEVEL && (build.pendingChoice || !selected || selected.tier !== tierOf(build.level))) {
      build.pendingChoice = true;
      if (build.level >= AWAKENING_LEVEL && !build.path) choosePath(build, packPaths(build.packId).includes(DEFAULT_PATH) ? DEFAULT_PATH : packPaths(build.packId)[0]);
      const choice = getBallChoices(build)[0];
      ensure(choice, '출전할 볼을 찾을 수 없습니다.'); chooseBall(build, choice.id);
    } else if (build.level < CHOICE_LEVEL) applyBall(build, getBall('core-' + tierOf(build.level)));
    if (hiddenPending(build)) resolveHidden(build, false);
    syncTrait(build);
    if (build.pendingTrait) chooseTrait(build, compatibleTraits(build)[0]?.id);
  } finally { build.storageLocked = stored; }
  return build;
}
export function lockBuild(build) {
  if (build.locked) return;
  finalizeBuild(build);
  ensure(buildReady(build), '출전 준비를 완료하세요.');
  build.locked = true;
}
