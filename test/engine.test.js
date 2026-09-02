import test from 'node:test';
import assert from 'node:assert/strict';

import { DamageSource } from '../src/game/data/damage-sources.js';
import {
  abandonGame,
  activateSkill,
  chooseEventSkill,
  chooseEventOption,
  chooseReward,
  completeEvent,
  confirmCombatVictory,
  createGame,
  endPlayerTurn,
  GamePhase,
  GameStatus,
  isStunned,
  placeBet,
  spinCollectorEvent,
  upgradeGameState,
  useItem,
} from '../src/game/engine.js';
import { SymbolId } from '../src/game/symbols.js';
import { getEvent } from '../src/game/data/events.js';
import { getItem } from '../src/game/data/items.js';

const { ATTACK, DEFENSE, SKILL, UNLUCKY } = SymbolId;
const zero = () => 0;

function game({
  enemy = {},
  initialEnemyUnitId = 'ruins-sentinel',
  ...config
} = {}) {
  return createGame({
    id: 'test-game',
    ownerId: 'player-1',
    config: {
      // 通用引擎測試固定使用無減傷的普通怪；BOSS規則由專用案例驗證。
      initialEnemyUnitId,
      initialEnemyOverrides: { maxHp: 60, baseDamage: 15, ...enemy },
      ...config,
    },
    worldRng: zero,
    monsterRng: zero,
  });
}

function springEventState(skillIds = ['power-strike']) {
  return eventState('ruins-mysterious-spring', skillIds);
}

function eventState(eventId, skillIds = ['power-strike']) {
  const state = createGame({
    id: `${eventId}-test`,
    ownerId: 'player-1',
    config: { initialEnemyUnitId: 'ruins-sentinel' },
    loadout: { skillIds, itemIds: [] },
    monsterRng: zero,
  });
  const event = getEvent(eventId);
  state.phase = GamePhase.EVENT;
  state.enemy = null;
  state.event = {
    eventId: event.id,
    name: event.name,
    rarity: event.rarity,
    description: event.description,
    stage: 'choice',
    options: event.options.map(({ id, label }) => ({ id, label })),
    result: null,
  };
  return state;
}

test('新戰鬥取得4點行動點，護甲與法力從0開始', () => {
  const state = game();
  assert.equal(state.schemaVersion, 5);
  assert.equal(state.phase, GamePhase.PLAYER_TURN);
  assert.deepEqual(state.resources, { action: 4, armor: 0, mana: 0 });
});

test('每次拉霸會立即攻擊並累積本回合護甲與法力', () => {
  const state = placeBet(game(), 2, {
    reels: [ATTACK, ATTACK, DEFENSE],
  });

  assert.equal(state.enemy.hp, 54);
  assert.deepEqual(state.resources, { action: 2, armor: 2, mana: 0 });
  assert.deepEqual(state.lastImpact, {
    attackDamage: 6,
    spinDamage: 6,
    additionalDamage: 0,
    curseDamage: 0,
    reflectionDamage: 0,
    skillDamage: 0,
    armorGained: 2,
    manaGained: 0,
    equipmentBonus: 0,
    statusBonus: 0,
    damageMultiplier: 1,
  });
});

test('可將4點行動拆成4次投入，且不會自動結束回合', () => {
  let state = game();
  for (let index = 0; index < 4; index += 1) {
    state = placeBet(state, 1, { reels: [ATTACK, DEFENSE, SKILL] });
  }

  assert.equal(state.round, 1);
  assert.equal(state.phase, GamePhase.PLAYER_TURN);
  assert.deepEqual(state.resources, { action: 0, armor: 4, mana: 4 });
  assert.equal(state.enemy.hp, 56);
});

test('玩家手動結束回合，護甲抵擋已顯示的怪物行動', () => {
  let state = placeBet(game(), 2, {
    reels: [ATTACK, ATTACK, DEFENSE],
  });
  state = endPlayerTurn(state, { monsterRng: zero });

  assert.equal(state.round, 2);
  assert.equal(state.player.hp, 32);
  assert.equal(state.lastResolution.enemyAction.name, '普通攻擊');
  assert.equal(state.lastResolution.armorUsed, 2);
  assert.equal(state.lastResolution.damageTaken, 13);
  assert.equal(state.lastResolution.discardedAction, 2);
  assert.deepEqual(state.resources, { action: 4, armor: 0, mana: 0 });
});

test('治癒技能消耗3點法力並立即恢復5點生命', () => {
  let state = game();
  state.player.hp = 38;
  state = placeBet(state, 1, { reels: [SKILL, SKILL, ATTACK] });
  state = activateSkill(state, 'life-recovery');

  assert.equal(state.player.hp, 43);
  assert.equal(state.resources.mana, 0);
  assert.match(state.lastAction.text, /回復 5 HP/);
});

test('治癒技能會依等級回復5、10、15點生命', () => {
  for (const [level, expectedHealing] of [[1, 5], [2, 10], [3, 15]]) {
    let state = createGame({
      id: `healing-level-${level}`,
      ownerId: 'player-1',
      config: { initialEnemyUnitId: 'ruins-sentinel' },
      loadout: { skillIds: ['life-recovery'], itemIds: [] },
      monsterRng: zero,
    });
    state.player.skillLevels['life-recovery'] = level;
    state.player.hp = 20;
    state = placeBet(state, 1, { reels: [SKILL, SKILL, SKILL] });
    state = activateSkill(state, 'life-recovery');

    assert.equal(state.player.hp, 20 + expectedHealing);
  }
});

test('強擊狀態會跨回合保留，並使下一次拉霸攻擊造成2倍傷害', () => {
  let state = createGame({
    id: 'power-strike-test',
    ownerId: 'player-1',
    config: {
      initialEnemyUnitId: 'ruins-sentinel',
      initialEnemyOverrides: { maxHp: 200, baseDamage: 0 },
    },
    loadout: { skillIds: ['power-strike'], itemIds: ['healing-potion'] },
    monsterRng: zero,
  });
  state = placeBet(state, 1, { reels: [SKILL, SKILL, DEFENSE] });
  state = activateSkill(state, 'power-strike');
  assert.equal(state.enemy.hp, 200);
  assert.equal(state.resources.mana, 1);
  assert.equal(state.player.activeStatuses[0].statusId, 'power-strike-ready');

  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.player.activeStatuses[0].statusId, 'power-strike-ready');
  state = placeBet(state, 3, { reels: [ATTACK, ATTACK, ATTACK] });

  assert.equal(state.lastImpact.attackDamage, 54);
  assert.equal(state.lastImpact.damageMultiplier, 2);
  assert.equal(state.enemy.hp, 146);
  assert.equal(
    state.player.activeStatuses.some((status) => status.statusId === 'power-strike-ready'),
    false,
  );
});

test('重複取得強擊會提升技能等級，最高可使用對應倍率', () => {
  let state = createGame({
    id: 'power-strike-upgrade',
    ownerId: 'player-1',
    config: { initialEnemyUnitId: 'ruins-sentinel' },
    loadout: { skillIds: ['power-strike'], itemIds: [] },
    monsterRng: zero,
  });
  state.phase = GamePhase.REWARD_CHOICE;
  state.rewardChoices = [{
    contentType: 'skill',
    contentId: 'power-strike',
    rarity: 'common',
    acquisition: 'level-up',
    currentLevel: 1,
    targetLevel: 2,
  }];
  state = chooseReward(state, 0, {
    worldRng: sequence([0.99, 0.99, 0, 0]),
    monsterRng: zero,
  });

  assert.equal(state.player.skillLevels['power-strike'], 2);
});

test('火焰附加使後續有攻擊的拉霸額外造成1點傷害', () => {
  let state = createGame({
    id: 'fire-imbue-test',
    ownerId: 'player-1',
    config: {
      initialEnemyUnitId: 'ruins-sentinel',
      initialEnemyOverrides: { maxHp: 60 },
    },
    loadout: { skillIds: ['fire-imbue'], itemIds: ['healing-potion'] },
    monsterRng: zero,
  });
  state = placeBet(state, 1, { reels: [SKILL, SKILL, DEFENSE] });
  state = activateSkill(state, 'fire-imbue');
  state = placeBet(state, 1, { reels: [ATTACK, DEFENSE, SKILL] });

  assert.equal(state.lastImpact.attackDamage, 2);
  assert.equal(state.lastImpact.statusBonus, 1);
  assert.equal(state.enemy.hp, 58);
});

test('火焰附加會依等級使拉霸攻擊額外造成1、2、3點傷害', () => {
  for (const [level, expectedBonus] of [[1, 1], [2, 2], [3, 3]]) {
    let state = createGame({
      id: `fire-imbue-level-${level}`,
      ownerId: 'player-1',
      config: {
        initialEnemyUnitId: 'ruins-sentinel',
        initialEnemyOverrides: { maxHp: 100, damageResistances: {} },
      },
      loadout: { skillIds: ['fire-imbue'], itemIds: [] },
      monsterRng: zero,
    });
    state.player.skillLevels['fire-imbue'] = level;
    state = placeBet(state, 1, { reels: [SKILL, SKILL, DEFENSE] });
    state = activateSkill(state, 'fire-imbue');
    state = placeBet(state, 1, { reels: [ATTACK, DEFENSE, SKILL] });

    assert.equal(state.lastImpact.statusBonus, expectedBonus);
    assert.equal(state.lastImpact.attackDamage, 1 + expectedBonus);
  }
});

test('消耗品可在戰鬥中使用並從背包扣除', () => {
  let state = createGame({
    id: 'potion-test',
    ownerId: 'player-1',
    config: { initialEnemyUnitId: 'ruins-sentinel' },
    loadout: { skillIds: ['life-recovery'], itemIds: ['healing-potion'] },
    monsterRng: zero,
  });
  state.player.hp = 35;
  state = useItem(state, 'healing-potion');

  assert.equal(state.player.hp, 45);
  assert.equal(state.resources.action, 4);
  assert.deepEqual(state.player.inventory, []);
});

test('劍在每場戰鬥開始時取得攻擊力狀態並持續3回合', () => {
  let state = createGame({
    id: 'equipment-test',
    ownerId: 'player-1',
    config: {
      playerMaxHp: 100,
      initialEnemyUnitId: 'ruins-sentinel',
      initialEnemyOverrides: { maxHp: 100, baseDamage: 0 },
    },
    loadout: { skillIds: ['life-recovery'], itemIds: ['sword'] },
    monsterRng: zero,
  });
  const attackUp = state.player.activeStatuses.find((status) => (
    status.statusId === 'attack-up'
  ));

  assert.deepEqual(state.player.equipment, ['sword']);
  assert.deepEqual(attackUp, {
    statusId: 'attack-up',
    sourceUnitId: 'wanderer',
    remainingTurns: 3,
    stacks: 1,
    potency: 1,
  });

  state = placeBet(state, 1, { reels: [ATTACK, DEFENSE, SKILL] });
  assert.equal(state.lastImpact.statusBonus, 1);
  assert.equal(state.enemy.hp, 98);

  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.player.activeStatuses[0].remainingTurns, 2);
  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.player.activeStatuses[0].remainingTurns, 1);
  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(
    state.player.activeStatuses.some((status) => status.statusId === 'attack-up'),
    false,
  );
});

test('火焰炸彈附加3層燃燒，傷害後燃燒層數除以2並在低於1時解除', () => {
  let state = createGame({
    id: 'bomb-test',
    ownerId: 'player-1',
    config: {
      initialEnemyUnitId: 'ruins-sentinel',
      initialEnemyOverrides: {
        maxHp: 100,
        baseDamage: 0,
        damageResistances: {},
      },
    },
    loadout: { skillIds: ['life-recovery'], itemIds: ['fire-bomb'] },
    monsterRng: zero,
  });
  state = useItem(state, 'fire-bomb', { rng: zero });
  assert.equal(state.enemy.hp, 92);
  assert.equal(state.enemy.activeStatuses[0].stacks, 3);
  assert.equal(state.history.at(-1).events[0].damageSource, DamageSource.EXTRA);

  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.enemy.hp, 89);
  assert.equal(state.enemy.activeStatuses[0].stacks, 1);
  assert.equal(
    state.lastResolution.enemyStatusEvents[0].damageSource,
    DamageSource.EXTRA,
  );
  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.enemy.hp, 88);
  assert.equal(state.enemy.activeStatuses.length, 0);
});

test('火焰衝擊立即造成5點額外傷害並以60%機率附加5層燃燒', () => {
  let state = createGame({
    id: 'flame-impact-test',
    ownerId: 'player-1',
    config: {
      initialEnemyUnitId: 'ruins-sentinel',
      initialEnemyOverrides: {
        maxHp: 100,
        baseDamage: 0,
        damageResistances: {},
      },
    },
    loadout: { skillIds: ['flame-impact'], itemIds: ['healing-potion'] },
    monsterRng: zero,
  });
  state = placeBet(state, 1, { reels: [SKILL, SKILL, SKILL] });
  state = activateSkill(state, 'flame-impact', { rng: () => 0.59 });

  assert.equal(state.enemy.hp, 95);
  assert.equal(state.enemy.activeStatuses[0].stacks, 5);
  assert.equal(state.resources.mana, 6);
  assert.equal(state.history.at(-1).events[0].damageSource, DamageSource.EXTRA);
  assert.equal(state.combatModifiers.damageDealtBySource.extra, 5);
});

test('火焰衝擊會依等級附加5、10、15層燃燒', () => {
  for (const [level, expectedStacks] of [[1, 5], [2, 10], [3, 15]]) {
    let state = createGame({
      id: `flame-impact-level-${level}`,
      ownerId: 'player-1',
      config: {
        initialEnemyUnitId: 'ruins-sentinel',
        initialEnemyOverrides: {
          maxHp: 100,
          baseDamage: 0,
          damageResistances: {},
        },
      },
      loadout: { skillIds: ['flame-impact'], itemIds: [] },
      monsterRng: zero,
    });
    state.player.skillLevels['flame-impact'] = level;
    state = placeBet(state, 1, { reels: [SKILL, SKILL, SKILL] });
    state = activateSkill(state, 'flame-impact', { rng: () => 0.59 });

    assert.equal(state.enemy.hp, 95);
    assert.equal(state.enemy.activeStatuses[0].stacks, expectedStacks);
  }
});

test('三個不幸不會自動換回合，玩家只能手動結束', () => {
  let state = placeBet(game(), 1, { reels: [ATTACK, ATTACK, DEFENSE] });
  state = placeBet(state, 1, { reels: [UNLUCKY, UNLUCKY, UNLUCKY] });

  assert.equal(state.round, 1);
  assert.equal(state.enemy.hp, 57);
  assert.equal(state.player.hp, 45);
  assert.equal(isStunned(state), true);
  assert.deepEqual(state.resources, { action: 2, armor: 1, mana: 0 });
  assert.throws(() => placeBet(state, 1), /暈眩/);

  state = endPlayerTurn(state, { monsterRng: zero });
  assert.equal(state.round, 2);
  assert.equal(state.player.hp, 31);
  assert.equal(isStunned(state), false);
});

test('擊敗怪物後先等待玩家確認，再進入獨立獎勵選擇', () => {
  let state = placeBet(game({ enemy: { maxHp: 3, baseDamage: 999 } }), 1, {
    reels: [ATTACK, ATTACK, DEFENSE],
    rewardRng: zero,
  });

  assert.equal(state.status, GameStatus.ACTIVE);
  assert.equal(state.phase, GamePhase.VICTORY_CONFIRM);
  assert.equal(state.enemy.hp, 0);
  assert.equal(state.player.hp, 45);
  assert.equal(state.rewardChoices.length, 0);
  assert.equal(state.adventure.defeatedUnitCount, 0);

  state = confirmCombatVictory(state, { rewardRng: zero });
  assert.equal(state.phase, GamePhase.REWARD_CHOICE);
  assert.equal(state.rewardChoices.length, 3);
  assert.equal(state.adventure.defeatedUnitCount, 1);
});

test('擊敗地區BOSS時生命回滿，普通敵人不觸發', () => {
  let bossState = game({
    initialEnemyUnitId: 'ruins-guardian',
    enemy: { maxHp: 1 },
  });
  bossState.player.hp = 7;
  bossState = placeBet(bossState, 1, {
    reels: [ATTACK, DEFENSE, SKILL],
  });

  assert.equal(bossState.phase, GamePhase.VICTORY_CONFIRM);
  assert.equal(bossState.player.hp, bossState.player.maxHp);

  let normalState = game({
    initialEnemyUnitId: 'ruins-sentinel',
    enemy: { maxHp: 1 },
  });
  normalState.player.hp = 7;
  normalState = placeBet(normalState, 1, {
    reels: [ATTACK, DEFENSE, SKILL],
  });

  assert.equal(normalState.phase, GamePhase.VICTORY_CONFIRM);
  assert.equal(normalState.player.hp, 7);
});

test('選擇Boss獎勵後換區，敵人生命與基礎傷害提高20%', () => {
  let state = placeBet(game({
    initialEnemyUnitId: 'ruins-guardian',
    enemy: { maxHp: 2 },
  }), 1, {
    reels: [ATTACK, ATTACK, DEFENSE],
    rewardRng: zero,
  });
  state = confirmCombatVictory(state, { rewardRng: zero });
  state = chooseReward(state, 0, {
    worldRng: sequence([0.99, 0.99, 0, 0]),
    monsterRng: zero,
  });

  assert.equal(state.adventure.regionDepth, 2);
  assert.equal(state.adventure.regionProgress, 0);
  assert.equal(state.enemy.rank, 'normal');
  assert.equal(state.enemy.maxHp, 36);
  assert.equal(state.enemy.baseDamage, 10);
});

test('完成奇遇會增加地區進度並繼續下一次遭遇', () => {
  let state = game();
  state.phase = GamePhase.EVENT;
  state.enemy = null;
  state.event = {
    eventId: 'ruins-abandoned-camp',
    name: '廢棄營地',
    rarity: 'common',
    description: '測試',
    stage: 'choice',
    options: [{ id: 'continue', label: '繼續' }],
    result: null,
  };
  state.adventure.regionProgress = 1;
  state.adventure.completedEncounters = 1;

  state = completeEvent(state, {
    worldRng: sequence([0, 0.99, 0.99, 0, 0]),
    monsterRng: zero,
  });
  assert.equal(state.adventure.regionProgress, 2);
  assert.equal(state.adventure.completedEncounters, 2);
  assert.equal(state.phase, GamePhase.PLAYER_TURN);
});

test('神秘泉水選擇喝水後有50%機率回滿HP並顯示結果', () => {
  let state = springEventState();
  state.player.hp = 5;
  state = chooseEventOption(state, 'drink', { eventRng: zero });

  assert.equal(state.player.hp, state.player.maxHp);
  assert.equal(state.phase, GamePhase.EVENT);
  assert.equal(state.event.stage, 'result');
  assert.match(state.event.result.text, /傷口逐漸癒合/);
});

test('神秘泉水有20%機率封印下一場戰鬥的一個技能', () => {
  let state = springEventState(['power-strike', 'life-recovery']);
  state.player.skillLevels['power-strike'] = 2;
  state = chooseEventOption(state, 'drink', {
    eventRng: sequence([0.5, 0]),
  });

  assert.deepEqual(state.player.skillIds, ['power-strike', 'life-recovery']);
  assert.deepEqual(state.player.pendingSealedSkillIds, ['power-strike']);
  assert.match(state.event.result.text, /「強擊」在下一場戰鬥中遭到封印/);

  state = completeEvent(state, {
    worldRng: sequence([0.99, 0.99, 0, 0]),
    monsterRng: zero,
  });
  assert.deepEqual(state.player.pendingSealedSkillIds, []);
  assert.deepEqual(state.combatModifiers.sealedSkillIds, ['power-strike']);
  assert.throws(() => activateSkill(state, 'power-strike'), /遭到封印/);
});

test('神秘泉水有20%機率回滿生命後進入菁英戰鬥，整個奇遇只計一次進度', () => {
  let state = springEventState();
  state.player.hp = 5;
  state = chooseEventOption(state, 'drink', {
    eventRng: sequence([0.7, 0, 0]),
    monsterRng: zero,
  });

  assert.equal(state.phase, GamePhase.PLAYER_TURN);
  assert.equal(state.enemy.rank, 'elite');
  assert.equal(state.player.hp, state.player.maxHp);
  assert.equal(state.adventure.regionProgress, 0);
  assert.match(state.lastAction.text, /強大生物/);

  state.enemy.hp = 1;
  state = placeBet(state, 1, {
    reels: [ATTACK, ATTACK, DEFENSE],
    rewardRng: zero,
  });
  assert.equal(state.phase, GamePhase.VICTORY_CONFIRM);
  state = confirmCombatVictory(state, { rewardRng: zero });
  assert.equal(state.adventure.regionProgress, 1);
  assert.equal(state.adventure.completedEncounters, 1);
});

test('密封石室最多扣除最大生命20%且最低保留1HP，並取得未持有的稀有裝備', () => {
  let state = eventState('ruins-sealed-vault');
  state.player.hp = 8;
  state = chooseEventOption(state, 'blood-unseal', {
    eventRng: sequence([0, 0]),
  });

  assert.equal(state.player.hp, 1);
  assert.equal(state.player.equipment.length, 1);
  assert.equal(getItem(state.player.equipment[0]).rarity, 'rare');
  assert.match(state.event.result.text, /失去 7 點生命/);
});

test('廢棄營地伏擊會直接進入普通戰鬥且不恢復生命', () => {
  let state = eventState('ruins-abandoned-camp');
  state.player.hp = 9;
  state = chooseEventOption(state, 'rest', {
    eventRng: sequence([0.9, 0, 0]),
    monsterRng: zero,
  });

  assert.equal(state.phase, GamePhase.PLAYER_TURN);
  assert.equal(state.enemy.rank, 'normal');
  assert.equal(state.player.hp, 9);
});

test('遠古回響降低20%最大生命並讓玩家選擇一項未滿級技能提升', () => {
  let state = eventState('ruins-ancient-echo', [
    'power-strike',
    'life-recovery',
  ]);
  state.player.skillLevels['life-recovery'] = 3;
  state = chooseEventOption(state, 'accept', { eventRng: zero });

  assert.equal(state.player.maxHp, 36);
  assert.equal(state.event.stage, 'skill-upgrade-choice');
  assert.deepEqual(state.event.skillChoices, ['power-strike']);

  state = chooseEventSkill(state, 'power-strike');
  assert.equal(state.player.skillLevels['power-strike'], 2);
  assert.equal(state.event.stage, 'result');
  assert.match(state.event.result.text, /強擊.*Lv\.2/);
});

test('神秘收藏家轉出三個相同符文時取得傳說裝備並保留賭注技能', () => {
  let state = eventState('ruins-mysterious-collector');
  state = chooseEventOption(state, 'challenge-item', {
    eventRng: sequence([0, 0]),
  });
  assert.equal(state.event.stage, 'collector-wager-choice');

  state = chooseEventSkill(state, 'power-strike', {
    eventRng: sequence([0, 0, 0]),
  });
  assert.equal(state.event.stage, 'result');
  assert.equal(state.player.skillIds.includes('power-strike'), true);
  assert.equal(state.player.equipment.length, 1);
  assert.equal(getItem(state.player.equipment[0]).rarity, 'legendary');
});

test('神秘收藏家可鎖定一格重轉，第四次仍失敗會永久失去賭注技能', () => {
  let state = eventState('ruins-mysterious-collector');
  state = chooseEventOption(state, 'challenge-skill', {
    eventRng: sequence([0, 0]),
  });
  state = chooseEventSkill(state, 'power-strike', {
    eventRng: sequence([0, 0.4, 0.7]),
  });
  assert.equal(state.event.stage, 'collector-spin');

  state = spinCollectorEvent(state, 0, { eventRng: sequence([0.4, 0.7]) });
  state = spinCollectorEvent(state, 0, { eventRng: sequence([0.4, 0.7]) });
  state = spinCollectorEvent(state, 0, { eventRng: sequence([0.4, 0.7]) });

  assert.equal(state.event.stage, 'result');
  assert.equal(state.player.skillIds.includes('power-strike'), false);
  assert.match(state.event.result.text, /永久失去/);
});

test('戰敗會立即結束遊戲並清除本輪資料，只保留結算快照', () => {
  const state = endPlayerTurn(game({
    initialEnemyUnitId: 'ruins-guardian',
    enemy: { baseDamage: 999 },
  }), {
    monsterRng: zero,
  });

  assert.equal(state.status, GameStatus.LOST);
  assert.equal(state.phase, GamePhase.ENDED);
  assert.equal(state.endSummary.defeatedBy, '遺跡守衛');
  assert.equal(state.endSummary.defeatedUnitCount, 0);
  assert.deepEqual(state.endSummary.finalSkillIds, ['life-recovery']);
  assert.equal(state.adventure, null);
  assert.deepEqual(state.player.skillIds, []);
});

test('玩家主動放棄也會結束整場遊戲並建立結算資料', () => {
  const state = abandonGame(game());
  assert.equal(state.status, GameStatus.ABANDONED);
  assert.equal(state.phase, GamePhase.ENDED);
  assert.equal(state.endSummary.defeatedBy, null);
  assert.deepEqual(state.resources, { action: 0, armor: 0, mana: 0 });
});

test('投入點數必須是剩餘行動點範圍內的整數', () => {
  assert.throws(() => placeBet(game(), 0), /1～4/);
  assert.throws(() => placeBet(game(), 5), /1～4/);
  assert.throws(() => placeBet(game(), 1.5), /1～4/);
});

test('舊版Boss戰存檔會升級為冒險格式', () => {
  const current = game({ initialEnemyUnitId: 'ruins-guardian' });
  const legacy = {
    ...structuredClone(current),
    schemaVersion: 2,
    boss: structuredClone(current.enemy),
  };
  delete legacy.enemy;
  legacy.resources = { action: 1, attack: 6, defense: 3, skill: 2 };
  const upgraded = upgradeGameState(legacy);

  assert.equal(upgraded.schemaVersion, 5);
  assert.equal(upgraded.enemy.hp, 54);
  assert.deepEqual(upgraded.resources, { action: 1, armor: 3, mana: 2 });
  assert.equal(upgraded.adventure.regionDepth, 1);
});

function sequence(values) {
  let index = 0;
  return () => values[index++];
}
