import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES } from '../packages/content/classes.js';
import { PATHS, BALL_CATALOG, BALLS, getBallChoices, levelOf } from '../packages/content/balls.js';

test('all 508 tier forms have unique IDs and valid combat/portrait definitions', () => {
  assert.equal(BALL_CATALOG.length, 508);
  assert.equal(Object.keys(BALLS).length, BALL_CATALOG.length);
  assert.equal(new Set(BALL_CATALOG.map(b => b.name)).size, BALL_CATALOG.length);
  assert.equal(Object.keys(CLASSES).length, 50);
  for (const ball of BALL_CATALOG) {
    assert.ok(CLASSES[ball.classId], ball.id);
    assert.equal(ball.portraitKey, CLASSES[ball.classId].portraitKey);
    assert.ok(ball.name && ball.description && ball.trigger && ball.weakness && ball.glyph && ball.color);
    assert.ok(ball.tier >= 1 && ball.tier <= 20);
    for (const scale of Object.values(ball.modifiers)) assert.ok(Number.isFinite(scale) && scale > 0 && scale < 1.1);
  }
});
test('every required early tier and every advanced path has distinct eligible choices', () => {
  for (let tier = 18; tier >= 11; tier--) {
    const choices = getBallChoices({ level: levelOf(tier), pendingChoice: true });
    assert.ok(choices.length >= 2);
    assert.ok(new Set(choices.map(b => b.classId)).size >= 2);
    assert.ok(choices.every(b => b.tier === tier));
  }
  assert.equal(Object.keys(PATHS).length, 8);
  for (let tier = 10; tier >= 1; tier--) {
    for (const path of Object.keys(PATHS)) {
      const choices = getBallChoices({ level: levelOf(tier), path, pendingChoice: true });
      assert.equal(choices.length, 11, `${path}/${tier}`);
      assert.equal(choices.filter(b => b.path === path).length, 5);
      assert.equal(choices.filter(b => b.common).length, 6);
      assert.ok(choices.every(b => b.tier === tier && !b.hidden));
      const hidden = getBallChoices({ level: levelOf(tier), path, pendingChoice: true, hiddenClass: 'prism' });
      assert.equal(hidden.filter(b => b.hidden).length, 1);
      assert.equal(hidden[0].id, `hidden-${tier}-prism`);
    }
  }
  assert.deepEqual(getBallChoices({ level: 10, pendingChoice: true }), []);
  assert.deepEqual(getBallChoices({ level: 10, path: 'fire', pendingChoice: false }), []);
});
