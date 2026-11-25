import test from 'node:test';
import assert from 'node:assert/strict';
import { SUCCESS_PERCENT, nextChance, MAX_LEVEL, tierOf, levelOf } from '../packages/content/economy.js';
import { PATHS, getBall, getBallChoices } from '../packages/content/balls.js';
import { initialBuild, fundBuild, enhance, buyShield, toggleShield, chooseClass, choosePath, chooseBall, chooseTrait, resolveHidden, lockBuild } from '../apps/server/forge.js';
import {compatibleTraits} from '../packages/content/traits.js';
import { defaultBank, parseBank, assignQuestions, publicQuestion } from '../apps/server/quiz.js';

function selectPending(b, path = 'fire', choose = () => true) {
  if (b.pendingChoice) {
    if (b.level >= 10 && !b.path) choosePath(b, path);
    chooseBall(b, getBallChoices(b).find(choose).id);
  }
  if (b.hiddenOffer && b.hiddenDecision === null) resolveHidden(b, false);
  if (b.pendingTrait) chooseTrait(b, compatibleTraits(b)[0].id);
}
function ready(level, extra = {}) {
  const b = { ...initialBuild(), level, best: level, tickets: 50, ...extra };
  if (level >= 2) { b.pendingChoice = true; selectPending(b); }
  return b;
}

test('funding is ten plus two per correct answer and cannot be refilled twice', () => {
  for (const correct of [0, 5, 10, 15, 20]) {
    const b = initialBuild();
    assert.equal(fundBuild(b, correct), 10 + correct * 2);
    b.tickets--;
    fundBuild(b, correct);
    assert.equal(b.tickets, 9 + correct * 2);
  }
  for (const invalid of [-1, 1.5, 21]) assert.throws(() => fundBuild(initialBuild(), invalid));
});
test('display tiers descend from twenty to one with target chances and a level nineteen cap', () => {
  assert.equal(MAX_LEVEL, 19);
  assert.deepEqual(SUCCESS_PERCENT, [0,95,92,90,88,85,82,80,78,75,72,68,60,52,44,35,26,18,10,3]);
  for (let level = 0; level <= MAX_LEVEL; level++) {
    assert.equal(tierOf(level), 20 - level);
    assert.equal(levelOf(tierOf(level)), level);
  }
  for (let previous = 0; previous < MAX_LEVEL; previous++) {
    const setup = () => ready(previous, { tickets: 2 });
    assert.equal(enhance(setup(), () => nextChance(previous) / 100 - .000001, () => .9).success, true);
    if (nextChance(previous) < 100) assert.equal(enhance(setup(), () => nextChance(previous) / 100).success, false);
  }
  assert.throws(() => enhance(ready(19)));
});
test('every promotion from tier eighteen requires a real legal ball choice before further spending', () => {
  const b = initialBuild(); fundBuild(b, 20);
  enhance(b, () => 0, () => .9);
  assert.equal(b.ballId, 'core-19'); assert.equal(b.pendingChoice, false);
  enhance(b, () => 0, () => .9);
  assert.equal(tierOf(b.level), 18); assert.equal(b.pendingChoice, true);
  const before = b.tickets;
  assert.throws(() => enhance(b, () => 0));
  assert.equal(b.tickets, before);
  assert.equal(new Set(getBallChoices(b).map(x => x.classId)).size, 2);
  assert.throws(() => chooseBall(b, 'fire-1-crimson'));
  selectPending(b);
  assert.equal(getBall(b.ballId).tier, 18);
  assert.throws(() => chooseBall(b, b.ballId));
  for (let level = 3; level <= 19; level++) {
    enhance(b, () => 0, () => .9);
    assert.equal(b.level, level);
    assert.equal(b.pendingChoice, true);
    selectPending(b);
    assert.equal(getBall(b.ballId).tier, 20 - level);
  }
});
test('v2.1 shields preserve success and T20 floor, and protect actual drops or resets', () => {
  const floor = ready(0); buyShield(floor); toggleShield(floor, true);
  assert.equal(enhance(floor, () => .99).level, 0); assert.equal(floor.shields, 1);
  const b = ready(9); buyShield(b); toggleShield(b, true);
  enhance(b, () => 0, () => .9); selectPending(b);
  assert.equal(b.level, 10); assert.equal(b.shields, 1);
  assert.equal(enhance(b, () => .99).protected, true);
  assert.equal(b.shields, 0); assert.equal(b.level, 10);
  assert.throws(() => enhance(b, () => .99));
  toggleShield(b, false); enhance(b, () => .99);
  assert.equal(b.level, 0); assert.equal(b.best, 10); assert.equal(b.ballId, 'core-20');
  const empty = { ...b, tickets: 0, shields: 2 };
  assert.throws(() => enhance(empty)); assert.throws(() => buyShield(empty));
});
test('a common choice preserves the path; lower-tier failure restores its historical form', () => {
  const b = ready(9);
  enhance(b, () => 0, () => .9);
  assert.equal(getBallChoices(b).length, 0);
  choosePath(b, 'space');
  assert.throws(() => choosePath(b, 'fire'));
  chooseBall(b, 'common-10-beam');
  assert.equal(b.path, 'space'); assert.equal(b.element, 'neutral');
  selectPending(b);
  enhance(b, () => 0);
  assert.ok(getBallChoices(b).some(x => x.id === 'space-9-portal'));
  chooseBall(b, 'space-9-portal');
  assert.equal(b.path, 'space');
  const low = ready(7), oldForm = low.ballId;
  enhance(low, () => 0); selectPending(low);
  enhance(low, () => .99);
  assert.equal(low.level, 7); assert.equal(low.ballId, oldForm);
});
test('hidden rolls once, replaces the current form, and stays unlocked on later tier choices', () => {
  const b = ready(9);
  let calls = 0;
  enhance(b, () => 0, () => [0, .6][calls++]);
  assert.equal(b.hiddenOffer, 'gravity'); assert.equal(calls, 2);
  assert.throws(() => resolveHidden(b, true));
  chooseClass(b, 'thorn'); assert.throws(() => chooseClass(b, 'bolt'));
  resolveHidden(b, true);
  assert.equal(b.classId, 'gravity'); assert.equal(b.element, 'nature');
  assert.equal(b.ballId, 'hidden-10-gravity');
  selectPending(b);
  enhance(b, () => 0, () => { throw Error('unexpected awakening'); });
  assert.ok(getBallChoices(b).some(x => x.id === 'hidden-9-gravity'));
  chooseBall(b, 'common-9-elastic');
  assert.equal(b.classId, 'elastic'); assert.equal(b.hiddenClass, 'gravity'); assert.equal(b.path, 'nature');
  selectPending(b);
  enhance(b, () => .99);
  assert.equal(b.level, 0); assert.equal(b.ballId, 'core-20'); assert.equal(b.element, 'neutral');
  assert.equal(b.awakeningRolled, true); assert.equal(b.hiddenClass, null); assert.equal(b.traitId, null);
  assert.throws(() => resolveHidden(b, true)); lockBuild(b); assert.throws(() => enhance(b));
});
test('early lock and deadline lock share legal defaults for unfinished choice and awakening', () => {
  const missed = { ...initialBuild(), best: 10, level: 10, pendingChoice: true, hiddenOffer: 'prism' };
  lockBuild(missed);
  assert.equal(missed.path, 'fire'); assert.equal(missed.classId, 'crimson');
  assert.equal(missed.ballId, 'fire-10-crimson'); assert.equal(missed.hiddenDecision, false);
  assert.equal(missed.pendingChoice, false); assert.equal(missed.locked, true);
  const early = { ...initialBuild(), level: 2, best: 2, pendingChoice: true };
  lockBuild(early); assert.equal(getBall(early.ballId).tier, 18); assert.equal(early.path, null);
  const basic = initialBuild(); lockBuild(basic); assert.equal(basic.classId, 'basic'); assert.equal(basic.ballId, 'core-20');
  lockBuild(basic); assert.throws(() => choosePath(basic, 'fire'));
});
test('UTF-8 bank parsing reports original line numbers, unique answers and questions', () => {
  const bank = parseBank('\uFEFF 문제 | 정답 | 보기2 | 보기3 | 보기4 \r\n\r\n문제|1|2|3|4\n문항2|1|2|2|4\n문항3|1|2||4\n문항4|1|2|3|4|5', '수업.txt');
  assert.equal(bank.count, 1); assert.deepEqual(bank.errors.map(x => x.line), [3,4,5,6]);
  const [q] = assignQuestions(bank.items);
  assert.equal(q.correctAnswer.text, '정답');
  assert.deepEqual(Object.keys(publicQuestion(q)).sort(), ['answers','attemptId','id','text']);
});
test('all 20 built-in questions retain distinct private explanations after shuffling', () => {
  const selected = assignQuestions(defaultBank().items);
  assert.equal(selected.length, 20);
  assert.equal(new Set(selected.map(q => q.explanation)).size, 20);
  for (const q of selected) {
    assert.ok(q.explanation?.length > 12);
    assert.equal(publicQuestion(q).explanation, undefined);
  }
  const [custom] = assignQuestions(parseBank('직접 출제|정답|보기2|보기3|보기4').items);
  assert.equal(custom.explanation, undefined);
});
