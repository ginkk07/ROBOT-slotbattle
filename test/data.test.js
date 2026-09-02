import test from 'node:test';
import assert from 'node:assert/strict';

import { getItem } from '../src/game/data/items.js';
import { EVENT_RULES } from '../src/game/data/event-rules.js';
import { getMonsterActionRule } from '../src/game/data/monster-actions.js';
import {
  getMonsterSkill,
  MonsterSkillActivation,
} from '../src/game/data/monster-skills.js';
import { PLAYER_PROGRESSION_RULES } from '../src/game/data/player-progression.js';
import { getRegion } from '../src/game/data/regions.js';
import { SHOP_RULES } from '../src/game/data/shop-rules.js';
import {
  PassiveSkillTrigger,
  SkillActivation,
} from '../src/game/data/skill-effects.js';
import {
  SKILLS,
  getSkill,
  getSkillLevelDefinition,
  skillCost,
} from '../src/game/data/skills.js';
import { getStatus } from '../src/game/data/statuses.js';
import { getUnit } from '../src/game/data/units.js';
import { validateGameData } from '../src/game/data/validate.js';

test('所有遊戲資料庫的交叉引用都有效', () => {
  assert.equal(validateGameData(), true);
});

test('單位以rank與tags區分普通、菁英與Boss', () => {
  const normal = getUnit('ruins-sentinel');
  const elite = getUnit('elite-ruins-sentinel');
  const boss = getUnit('ruins-guardian');

  assert.equal(normal.skillIds.length, 1);
  assert.equal(elite.rank, 'elite');
  assert.equal(elite.skillIds.filter((skillId) => (
    getMonsterSkill(skillId).activation === MonsterSkillActivation.ACTIVE
  )).length, 2);
  assert.ok(elite.skillIds.includes('armor-reinforcement'));
  assert.deepEqual(elite.damageResistances, {});
  assert.ok(elite.tags.includes('elite'));
  assert.equal(boss.rank, 'boss');
  assert.ok(boss.tags.includes('construct'));
  assert.equal(boss.skillIds.filter((skillId) => (
    getMonsterSkill(skillId).activation === MonsterSkillActivation.ACTIVE
  )).length, 3);
  assert.ok(boss.skillIds.includes('armor-reinforcement'));
  assert.deepEqual(boss.damageResistances, {});
  assert.equal(boss.lootTableId, 'ruins-boss-loot');
});

test('玩家技能與道具共用effects，怪物技能使用獨立資料庫', () => {
  assert.deepEqual(getSkillLevelDefinition('life-recovery', 1).effects[0], {
    type: 'heal',
    amount: 5,
    target: 'self',
  });
  assert.equal(getSkill('power-strike').cost, 2);
  assert.deepEqual(
    getSkill('power-strike').levels.map((level) => level.effects[0].potency),
    [2, 3, 4],
  );
  assert.deepEqual(
    getSkill('life-recovery').levels.map((level) => level.effects[0].amount),
    [5, 10, 15],
  );
  assert.deepEqual(
    getSkill('fire-imbue').levels.map((level) => level.effects[0].potency),
    [1, 2, 3],
  );
  assert.equal(getItem('fire-bomb').effects[1].statusId, 'burning');
  assert.equal(getItem('fire-bomb').effects[1].stacks, 3);
  assert.deepEqual(
    getSkill('flame-impact').levels.map((level) => level.effects[0].amount),
    [5, 5, 5],
  );
  assert.deepEqual(
    getSkill('flame-impact').levels.map((level) => level.effects[1].chance),
    [0.6, 0.6, 0.6],
  );
  assert.deepEqual(
    getSkill('flame-impact').levels.map((level) => level.effects[1].stacks),
    [5, 10, 15],
  );
  assert.match(getSkillLevelDefinition('flame-impact', 3).description, /15 層燃燒/);
  assert.equal(getItem('healing-potion').actionCost, 0);
  assert.equal(getItem('sword').type, 'equipment');
  assert.equal(
    getItem('sword').equipmentEffects[0].effects[0].statusId,
    'attack-up',
  );
  assert.equal(getItem('flame-sword').type, 'equipment');
  assert.equal(getItem('flame-sword').rarity, 'legendary');
  assert.equal(getSkill('life-recovery').rarity, 'common');
  assert.equal(getSkill('flame-impact').rarity, 'legendary');
  assert.equal(getItem('fire-bomb').rarity, 'rare');
  assert.equal(getSkill('mana-armor').rarity, 'rare');
  assert.equal(getSkill('mana-armor').activation, SkillActivation.PASSIVE);
  assert.deepEqual(
    [1, 2, 3].map((level) => (
      getSkillLevelDefinition('mana-armor', level)
        .passiveEffects[0].damagePerMana
    )),
    [1, 2, 3],
  );
  assert.equal(
    getSkillLevelDefinition('mana-armor', 1).passiveEffects[0].trigger,
    PassiveSkillTrigger.BEFORE_DAMAGE_TAKEN,
  );
  assert.deepEqual(
    getSkill('shield-block').levels.map((level) => level.effects[0].amount),
    [2, 4, 6],
  );
  assert.deepEqual(
    getSkill('flame-cover').levels.map((level) => level.effects[1].potency),
    [1, 2, 3],
  );
  assert.deepEqual(
    getSkill('shield-throw').levels.map((level) => level.effects[0].potency),
    [1, 2, 3],
  );
  assert.deepEqual(
    getSkill('shield-bash').levels.map((level) => level.effects[0].multiplier),
    [1, 2, 3],
  );
  assert.deepEqual(
    [1, 2, 3].map((level) => skillCost('holy-shield', level)),
    [5, 4, 3],
  );
  for (const skill of Object.values(SKILLS)) {
    assert.equal(Object.hasOwn(skill, 'description'), false);
    assert.equal(Object.hasOwn(skill, 'effects'), false);
    assert.equal(Object.hasOwn(skill, 'passiveEffects'), false);
  }
  assert.equal(getItem('rune-cube').equipmentEffects[0].amount, 4);
  assert.equal(getItem('thorns').rarity, 'common');
  assert.equal(getItem('magic-stone').rarity, 'common');
  assert.equal(getItem('diamond').rarity, 'legendary');
  assert.equal(
    getItem('summer-gift-anchor').description,
    '如果本回合沒有造成傷害，本場戰鬥❇️上限＋1，最多＋5；造成傷害時清除累積。',
  );
  assert.equal(getItem('cursed-snake-scale').type, 'equipment');
  assert.equal(getMonsterSkill('guardian-strike').power, 1.25);
  assert.equal(
    getMonsterSkill('armor-reinforcement').activation,
    MonsterSkillActivation.PASSIVE,
  );
  assert.equal(getStatus('armor-reinforcement').durationMode, 'battle');
  assert.equal(
    getStatus('armor-reinforcement').effect.amountPerPotency,
    0.2,
  );
  assert.equal(getStatus('attack-up').stacking.mode, 'stack-potency');
  assert.equal(getStatus('burning').trigger, 'turn-start');
  assert.equal(getStatus('burning').stacking.mode, 'stack-countdown');
  assert.equal(getStatus('damage-reflection').durationMode, 'battle');
  assert.equal(getStatus('curse').effect.type, 'share-damage');
});

test('資料定義為唯讀，戰鬥不能誤改原始資料庫', () => {
  assert.equal(Object.isFrozen(getUnit('ruins-guardian')), true);
  assert.equal(Object.isFrozen(getUnit('ruins-guardian').tags), true);
});

test('可調整的全域平衡規則集中在資料層', () => {
  const region = getRegion('ruins');

  assert.deepEqual(EVENT_RULES.rarityWeights, {
    common: 60,
    rare: 30,
    legendary: 10,
  });
  assert.equal(getMonsterActionRule('normal').basicAttackChance, 0.6);
  assert.equal(getMonsterActionRule('boss').requiredSkillCount, 3);
  assert.equal(region.encounterRules.boss.minimumCompletedEncounters, 8);
  assert.equal(region.encounterRules.boss.chancePerCompletedEncounter, 0.05);
  assert.equal(region.encounterRules.boss.restorePlayerHpAfterVictory, true);
  assert.equal(region.encounterRules.event.chance, 0.2);
  assert.equal(region.encounterRules.elite.baseChance, 0.12);
  assert.equal(region.scaling.maxHpPerDepth, 0.5);
  assert.equal(region.scaling.baseDamagePerDepth, 0.5);
  assert.equal(SHOP_RULES.pricing.basePrice, 38);
  assert.equal(SHOP_RULES.pricing.regionMultiplier, 1.66);
  assert.equal(SHOP_RULES.pricing.purchaseMultiplier, 1.77);
  assert.equal(PLAYER_PROGRESSION_RULES.startingSkillSlots, 1);
  assert.equal(PLAYER_PROGRESSION_RULES.startingItemSlots, 1);
  assert.deepEqual(
    PLAYER_PROGRESSION_RULES.defaultUnlockedStartingItemIds,
    ['sword', 'lucky-clover', 'shuriken'],
  );
  assert.equal(PLAYER_PROGRESSION_RULES.maxHeldSkills, 3);
  assert.equal(PLAYER_PROGRESSION_RULES.maxSkillLevel, 3);
});
