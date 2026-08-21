import test from 'node:test';
import assert from 'node:assert/strict';

import { drawEncounter } from '../src/game/engines/encounter-engine.js';
import { resolveEvent } from '../src/game/engines/event-engine.js';
import { rollLoot } from '../src/game/engines/loot-engine.js';

test('菁英遭遇表會先依70/30選池，再依單位權重抽選', () => {
  const elite = drawEncounter('ruins-elite-encounter', {
    rng: sequence([0.1, 0]),
  });
  const normal = drawEncounter('ruins-elite-encounter', {
    rng: sequence([0.9, 0]),
  });

  assert.equal(elite.rank, 'elite');
  assert.equal(normal.rank, 'normal');
});

test('事件可透過遭遇表抽出菁英怪', () => {
  const result = resolveEvent('ruins-elite-ambush', {
    rng: sequence([0, 0, 0]),
  });
  assert.equal(result.outcome.encounterTableId, 'ruins-elite-encounter');
  assert.equal(result.unit.id, 'elite-ruins-sentinel');
});

test('掉落表可進行多次抽選並合併相同道具數量', () => {
  const loot = rollLoot('ruins-boss-loot', {
    rng: sequence([0, 0.99, 0.85, 0]),
  });

  assert.deepEqual(loot, [
    { itemId: 'healing-potion', quantity: 2 },
    { itemId: 'flame-sword', quantity: 1 },
  ]);
});

function sequence(values) {
  let index = 0;
  return () => values[index++];
}
