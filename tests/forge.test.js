import test from 'node:test';
import assert from 'node:assert/strict';
import { SUCCESS_PERCENT, nextChance } from '../packages/content/economy.js';
import { initialBuild, fundBuild, enhance, buyShield, toggleShield, chooseClass, resolveHidden, lockBuild } from '../apps/server/forge.js';
import { defaultBank, parseBank, assignQuestions, publicQuestion } from '../apps/server/quiz.js';

test('target percentages apply at the same threshold the interface displays', () => {
  assert.deepEqual(SUCCESS_PERCENT.slice(10), [85,80,75,70,65,60,50,40,30,20,10]);
  for (let previous = 0; previous < 20; previous++) {
    const setup = () => ({ ...initialBuild(), level: previous, best: previous, tickets: 2 });
    assert.equal(enhance(setup(), () => nextChance(previous) / 100 - 0.000001).success, true);
    if (nextChance(previous) < 100) assert.equal(enhance(setup(), () => nextChance(previous) / 100).success, false);
  }
  assert.throws(() => enhance({ ...initialBuild(), level: 20, tickets: 1 }));
});
test('shields survive success and floor failures, and only absorb a real downgrade', () => {
  const b = initialBuild(); fundBuild(b, 8);
  Object.assign(b, { level: 9, best: 9 }); buyShield(b); toggleShield(b, true);
  assert.equal(enhance(b, () => .99).level, 9);
  assert.equal(b.shields, 1);
  enhance(b, () => 0, () => 0.9);
  assert.equal(b.level, 10); assert.equal(b.shields, 1);
  enhance(b, () => 0.99); assert.equal(b.shields, 1);
  enhance(b, () => 0); assert.equal(b.level, 11);
  assert.equal(enhance(b, () => .99).protected, true);
  assert.equal(b.shields, 0); assert.equal(b.level, 11);
  enhance(b, () => .99); assert.equal(b.level, 10); assert.equal(b.best, 11);
  const empty = { ...b, tickets: 0, shields: 2 };
  assert.throws(() => enhance(empty)); assert.throws(() => buyShield(empty));
});
test('first awakening rolls once, hidden replaces class and retains element; default lock is shared', () => {
  const b = { ...initialBuild(), level: 9, best: 9, tickets: 10 };
  let calls = 0;
  enhance(b, () => 0, () => [0, .6][calls++]);
  assert.equal(b.hiddenOffer, 'gravity'); assert.equal(calls, 2);
  assert.throws(() => resolveHidden(b, true));
  chooseClass(b, 'thorn'); assert.throws(() => chooseClass(b, 'bolt'));
  resolveHidden(b, true); assert.equal(b.classId, 'gravity'); assert.equal(b.element, 'nature');
  enhance(b, () => 0, () => { throw Error('unexpected awakening'); });
  enhance(b, () => .99); assert.equal(b.level, 10);
  assert.throws(() => resolveHidden(b, true)); lockBuild(b); assert.throws(() => enhance(b));
  const missed = { ...initialBuild(), best: 10, level: 10, hiddenOffer: 'prism' };
  lockBuild(missed); assert.equal(missed.classId, 'crimson'); assert.equal(missed.hiddenDecision, false);
  const basic = initialBuild(); lockBuild(basic); assert.equal(basic.classId, 'basic');
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
