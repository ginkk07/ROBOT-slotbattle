import test from 'node:test';
import assert from 'node:assert/strict';

import { drawSymbol } from '../src/game/random.js';
import { COMBO_VALUE, scoreSpin } from '../src/game/scoring.js';
import { ALL_SYMBOLS, SymbolId } from '../src/game/symbols.js';

const { ATTACK, DEFENSE, SKILL, LUCKY, UNLUCKY } = SymbolId;

test('30/30/30/5/5 權重邊界正確', () => {
  const counts = Object.fromEntries(ALL_SYMBOLS.map((symbol) => [symbol, 0]));

  for (let roll = 0; roll < 100; roll += 1) {
    counts[drawSymbol(() => roll)] += 1;
  }

  assert.deepEqual(counts, {
    attack: 30,
    defense: 30,
    skill: 30,
    lucky: 5,
    unlucky: 5,
  });
});

test('攻擊、防禦、技能各一個時各獲得1點', () => {
  const result = scoreSpin([ATTACK, DEFENSE, SKILL], 1);
  assert.deepEqual(result.awarded, { attack: 1, defense: 1, skill: 1 });
});

test('兩攻擊一防禦時套用3/1組合值', () => {
  const result = scoreSpin([ATTACK, ATTACK, DEFENSE], 1);
  assert.deepEqual(result.awarded, { attack: 3, defense: 1, skill: 0 });
});

test('三攻擊時獲得9點攻擊', () => {
  const result = scoreSpin([ATTACK, ATTACK, ATTACK], 1);
  assert.deepEqual(result.awarded, { attack: 9, defense: 0, skill: 0 });
});

test('幸運同時增加三種指令點', () => {
  assert.deepEqual(
    scoreSpin([ATTACK, DEFENSE, LUCKY], 1).awarded,
    { attack: 2, defense: 2, skill: 1 },
  );
  assert.deepEqual(
    scoreSpin([LUCKY, LUCKY, UNLUCKY], 1).awarded,
    { attack: 3, defense: 3, skill: 3 },
  );
  assert.deepEqual(
    scoreSpin([LUCKY, LUCKY, LUCKY], 1).awarded,
    { attack: 9, defense: 9, skill: 9 },
  );
});

test('三個不幸造成暈眩且不產生指令點', () => {
  const result = scoreSpin([UNLUCKY, UNLUCKY, UNLUCKY], 6);
  assert.equal(result.stunned, true);
  assert.deepEqual(result.awarded, { attack: 0, defense: 0, skill: 0 });
});

test('投入行動點會乘上拉霸基礎結果', () => {
  const result = scoreSpin([ATTACK, ATTACK, DEFENSE], 4);
  assert.deepEqual(result.awarded, { attack: 12, defense: 4, skill: 0 });
});

test('所有125種排列都符合按數量計算的規則', () => {
  for (const first of ALL_SYMBOLS) {
    for (const second of ALL_SYMBOLS) {
      for (const third of ALL_SYMBOLS) {
        const reels = [first, second, third];
        const result = scoreSpin(reels, 1);
        const count = (symbol) => reels.filter((item) => item === symbol).length;

        if (count(UNLUCKY) === 3) {
          assert.equal(result.stunned, true);
          continue;
        }

        const lucky = COMBO_VALUE[count(LUCKY)];
        assert.deepEqual(result.awarded, {
          attack: COMBO_VALUE[count(ATTACK)] + lucky,
          defense: COMBO_VALUE[count(DEFENSE)] + lucky,
          skill: COMBO_VALUE[count(SKILL)] + lucky,
        });
      }
    }
  }
});
