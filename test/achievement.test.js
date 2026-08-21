import test from 'node:test';
import assert from 'node:assert/strict';

import { settleRunProfile } from '../src/player/achievement-engine.js';
import { createDefaultProfile } from '../src/player/profile.js';

test('遊戲結束會結算成就並解鎖開局技能與道具', () => {
  const profile = createDefaultProfile('player-1');
  profile.unlockedStartingSkillIds = ['life-recovery'];
  profile.unlockedStartingItemIds = ['healing-potion'];
  const summary = {
    runId: 'run-1',
    defeatedUnitCount: 5,
    defeatedByRank: { normal: 4, elite: 1, boss: 0 },
  };
  const achievements = [{
    id: 'elite-hunter',
    condition: { type: 'run-defeated-rank', rank: 'elite', minimum: 1 },
    unlockSkillIds: ['power-strike'],
    unlockItemIds: ['fire-bomb'],
  }];

  const result = settleRunProfile(profile, summary, { achievements });
  assert.deepEqual(result.newAchievementIds, ['elite-hunter']);
  assert.ok(result.profile.unlockedStartingSkillIds.includes('power-strike'));
  assert.ok(result.profile.unlockedStartingItemIds.includes('fire-bomb'));
  assert.equal(result.profile.lifetimeStats.runsEnded, 1);
  assert.equal(result.profile.lifetimeStats.unitsDefeated, 5);
});

test('相同遊戲結算不會重複增加永久統計', () => {
  const summary = {
    runId: 'run-1',
    defeatedUnitCount: 3,
    defeatedByRank: { normal: 3, elite: 0, boss: 0 },
  };
  const first = settleRunProfile(createDefaultProfile('player-1'), summary);
  const second = settleRunProfile(first.profile, summary);

  assert.equal(second.changed, false);
  assert.equal(second.profile.lifetimeStats.runsEnded, 1);
  assert.equal(second.profile.lifetimeStats.unitsDefeated, 3);
});
