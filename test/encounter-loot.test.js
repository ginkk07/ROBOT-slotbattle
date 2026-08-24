import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bossEncounterChance,
  createAdventureProgress,
  drawNextAdventureNode,
  regionPowerMultiplier,
  scaleEnemyUnit,
} from '../src/game/engines/adventure-engine.js';
import { drawEncounter } from '../src/game/engines/encounter-engine.js';
import { rollRewardChoices } from '../src/game/engines/loot-engine.js';
import { getMonsterActionRule } from '../src/game/data/monster-actions.js';
import { selectMonsterIntent } from '../src/game/engines/monster-action-engine.js';
import { getUnit } from '../src/game/data/units.js';

test('普通與菁英遭遇表只會抽出指定階級', () => {
  const normal = drawEncounter('ruins-normal-encounter', { rng: () => 0 });
  const elite = drawEncounter('ruins-elite-encounter', { rng: () => 0 });

  assert.equal(normal.rank, 'normal');
  assert.equal(elite.rank, 'elite');
});

test('第一次遭遇不會是奇遇，先依12%機率判斷菁英怪', () => {
  const normal = drawNextAdventureNode(createAdventureProgress(), {
    rng: sequence([0.5, 0, 0]),
  });
  const elite = drawNextAdventureNode(createAdventureProgress(), {
    rng: sequence([0.1, 0, 0]),
  });

  assert.equal(normal.type, 'combat');
  assert.equal(normal.enemy.rank, 'normal');
  assert.equal(elite.type, 'combat');
  assert.equal(elite.enemy.rank, 'elite');
});

test('完成4次遭遇後，第5次先以28%機率判定Boss', () => {
  const progress = createAdventureProgress();
  progress.regionProgress = 4;
  progress.completedEncounters = 4;

  assert.equal(bossEncounterChance(progress), 0.28);
  const node = drawNextAdventureNode(progress, {
    rng: sequence([0.279, 0, 0]),
  });
  assert.equal(node.type, 'combat');
  assert.equal(node.enemy.rank, 'boss');
});

test('Boss判定失敗後才以20%機率抽取奇遇，奇遇稀有度固定50/30/20', () => {
  const progress = createAdventureProgress();
  progress.regionProgress = 4;
  progress.completedEncounters = 4;

  const node = drawNextAdventureNode(progress, {
    rng: sequence([0.9, 0.19, 0.79, 0]),
  });
  assert.equal(node.type, 'event');
  assert.equal(node.rarity, 'rare');
  assert.equal(node.event.id, 'ruins-sealed-vault');
});

test('戰鬥獎勵稀有度修正不會改變奇遇稀有度或怪物階級', () => {
  const progress = createAdventureProgress();
  progress.completedEncounters = 1;
  progress.regionProgress = 1;
  progress.modifiers.rewardRarity = {
    rareMultiplier: 0,
    legendaryMultiplier: 10_000,
  };

  const event = drawNextAdventureNode(progress, {
    rng: sequence([0.19, 0.79, 0]),
  });
  assert.equal(event.type, 'event');
  assert.equal(event.rarity, 'rare');

  const combat = drawNextAdventureNode(progress, {
    rng: sequence([0.9, 0.119, 0, 0]),
  });
  assert.equal(combat.type, 'combat');
  assert.equal(combat.enemy.rank, 'elite');
});

test('三個戰鬥獎勵選項會各自獨立抽取稀有度', () => {
  const choices = rollRewardChoices('ruins-common-loot', {
    regionTags: ['ruins'],
    rng: sequence([
      0.1, 0,
      0.8, 0,
      0.99, 0,
    ]),
  });

  assert.deepEqual(choices.map((choice) => choice.rarity), [
    'common',
    'rare',
    'legendary',
  ]);
  assert.equal(choices.length, 3);
});

test('Boss傳說候選不足時會依序向其他稀有度補滿且不重複', () => {
  const choices = rollRewardChoices('ruins-boss-loot', {
    regionTags: ['ruins'],
    rng: sequence([0, 0, 0.5, 0.5, 0.9, 0.9]),
  });

  assert.equal(choices.length, 3);
  assert.deepEqual(
    choices.map((choice) => choice.rarity),
    ['legendary', 'legendary', 'rare'],
  );
  assert.equal(new Set(choices.map((choice) => choice.contentId)).size, 3);
});

test('持有但未滿等的技能可再次出現並升級，滿等後會排除', () => {
  const upgradeChoices = rollRewardChoices('ruins-common-loot', {
    regionTags: ['ruins'],
    rng: () => 0,
    player: {
      skillIds: ['power-strike'],
      skillLevels: { 'power-strike': 1 },
      inventory: [],
      equipment: {},
    },
  });
  const powerStrike = upgradeChoices.find((choice) => (
    choice.contentId === 'power-strike'
  ));
  assert.deepEqual(
    {
      acquisition: powerStrike.acquisition,
      currentLevel: powerStrike.currentLevel,
      targetLevel: powerStrike.targetLevel,
    },
    { acquisition: 'level-up', currentLevel: 1, targetLevel: 2 },
  );

  const maxedChoices = rollRewardChoices('ruins-common-loot', {
    regionTags: ['ruins'],
    rng: () => 0,
    player: {
      skillIds: ['power-strike'],
      skillLevels: { 'power-strike': 3 },
      inventory: [],
      equipment: {},
    },
  });
  assert.equal(
    maxedChoices.some((choice) => choice.contentId === 'power-strike'),
    false,
  );
});

test('技能滿3個後不再出現新技能，但仍可出現未滿等技能升級', () => {
  const choices = rollRewardChoices('ruins-common-loot', {
    regionTags: ['ruins'],
    rng: () => 0,
    player: {
      skillIds: ['power-strike', 'fire-imbue', 'flame-impact'],
      skillLevels: {
        'power-strike': 1,
        'fire-imbue': 1,
        'flame-impact': 1,
      },
      inventory: [],
      equipment: {},
    },
  });

  assert.equal(choices.some((choice) => choice.contentId === 'life-recovery'), false);
  assert.equal(choices.some((choice) => choice.contentId === 'power-strike'), true);
});

test('已持有的裝備與消耗品不會再次出現在獎勵中', () => {
  const legendary = rollRewardChoices('ruins-boss-loot', {
    regionTags: ['ruins'],
    rng: () => 0,
    player: {
      skillIds: [],
      skillLevels: {},
      inventory: [],
      equipment: { weapon: 'flame-sword' },
    },
  });
  assert.equal(legendary.some((choice) => choice.contentId === 'flame-sword'), false);

  const common = rollRewardChoices('ruins-common-loot', {
    regionTags: ['ruins'],
    rng: () => 0,
    player: {
      skillIds: [],
      skillLevels: {},
      inventory: [{ itemId: 'healing-potion', quantity: 1 }],
      equipment: {},
    },
  });
  assert.equal(common.some((choice) => choice.contentId === 'healing-potion'), false);
});

test('換區只線性增加敵人的基礎生命與基礎傷害', () => {
  const base = getUnit('ruins-guardian');
  const scaled = scaleEnemyUnit(base, 3);

  assert.equal(regionPowerMultiplier(3), 1.4);
  assert.equal(scaled.maxHp, 84);
  assert.equal(scaled.baseDamage, 21);
  assert.deepEqual(scaled.damageResistances, base.damageResistances);
});

test('怪物依階級判斷普通攻擊機率，再等機率抽取持有技能', () => {
  assert.equal(getMonsterActionRule('normal').basicAttackChance, 0.6);
  assert.equal(getMonsterActionRule('elite').basicAttackChance, 0.4);
  assert.equal(getMonsterActionRule('boss').basicAttackChance, 0.2);

  const elite = scaleEnemyUnit(getUnit('elite-ruins-sentinel'), 1);
  const basic = selectMonsterIntent(elite, { rng: () => 0.39 });
  const firstSkill = selectMonsterIntent(elite, {
    rng: sequence([0.4, 0]),
  });
  const secondSkill = selectMonsterIntent(elite, {
    rng: sequence([0.4, 0.99]),
  });

  assert.equal(basic.type, 'basic-attack');
  assert.equal(firstSkill.skillId, 'guardian-strike');
  assert.equal(secondSkill.skillId, 'crushing-blow');
});

test('普通怪與Boss在各自機率邊界切換成技能，技能傷害使用基礎傷害倍率', () => {
  const normal = scaleEnemyUnit(getUnit('ruins-sentinel'), 1);
  const boss = scaleEnemyUnit(getUnit('ruins-guardian'), 2);

  assert.equal(selectMonsterIntent(normal, { rng: () => 0.599 }).type, 'basic-attack');
  const normalSkill = selectMonsterIntent(normal, {
    rng: sequence([0.6, 0]),
  });
  assert.equal(normalSkill.type, 'skill');
  assert.equal(normalSkill.damage, Math.ceil(normal.baseDamage * 1.25));

  assert.equal(selectMonsterIntent(boss, { rng: () => 0.199 }).type, 'basic-attack');
  const bossSkill = selectMonsterIntent(boss, {
    rng: sequence([0.2, 0.99]),
  });
  assert.equal(bossSkill.type, 'skill');
  assert.equal(bossSkill.skillId, 'ruin-overload');
  assert.equal(bossSkill.damage, Math.ceil(boss.baseDamage * 1.75));
});

function sequence(values) {
  let index = 0;
  return () => values[index++];
}
