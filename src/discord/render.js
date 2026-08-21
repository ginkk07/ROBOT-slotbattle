import { ACHIEVEMENTS } from '../game/data/achievements.js';
import { getItem } from '../game/data/items.js';
import { rarityLabel } from '../game/data/rarities.js';
import { getSkill } from '../game/data/skills.js';
import { getStatus } from '../game/data/statuses.js';
import {
  GamePhase,
  GameStatus,
  getEnemyIntent,
  isStunned,
} from '../game/engine.js';
import { formatReels } from '../game/symbols.js';

const COLORS = Object.freeze({
  active: 0x7c5cff,
  reward: 0x3ba55d,
  event: 0xfee75c,
  lost: 0xed4245,
  abandoned: 0x747f8d,
});

const COMPONENT_TYPE = Object.freeze({
  ACTION_ROW: 1,
  BUTTON: 2,
  STRING_SELECT: 3,
  TEXT_INPUT: 4,
});

const BUTTON_STYLE = Object.freeze({
  PRIMARY: 1,
  SECONDARY: 2,
  SUCCESS: 3,
  DANGER: 4,
});

const TEXT_INPUT_STYLE = Object.freeze({ SHORT: 1 });

export const WAGER_INPUT_ID = 'wager';

export function renderGame(state) {
  if (state.status !== GameStatus.ACTIVE) return renderEndSummary(state);
  if (state.phase === GamePhase.REWARD_CHOICE) return renderRewardChoice(state);
  if (state.phase === GamePhase.EVENT) return renderEvent(state);
  return renderCombat(state);
}

export function renderProfile(profileRecord) {
  const profile = profileRecord.profile ?? profileRecord;
  const selectedSkillId = profile.lastStartingLoadout?.skillIds?.[0];
  const selectedItemId = profile.lastStartingLoadout?.itemIds?.[0];
  const selectedSkill = selectedSkillId ? getSkill(selectedSkillId) : null;
  const selectedItem = selectedItemId ? getItem(selectedItemId) : null;

  const embed = {
    color: COLORS.active,
    title: '🧭 開局配置',
    description: [
      '從下方選單各選 **1 個技能**與 **1 個道具**。',
      '選擇會立即保存，並在下一場新遊戲生效；進行中的遊戲不會改變。',
    ].join('\n'),
    fields: [
      {
        name: '目前技能',
        value: selectedSkill
          ? `${selectedSkill.emoji} **${selectedSkill.name}**｜${selectedSkill.cost} 法力\n${selectedSkill.description}`
          : '尚未選擇',
        inline: false,
      },
      {
        name: '目前道具',
        value: selectedItem
          ? `${selectedItem.emoji} **${selectedItem.name}**｜${itemTypeLabel(selectedItem)}\n${selectedItem.description}`
          : '尚未選擇',
        inline: false,
      },
      {
        name: '永久紀錄',
        value: `成就 ${profile.achievementIds?.length ?? 0}｜結束遊戲 ${profile.lifetimeStats?.runsEnded ?? 0}｜擊敗單位 ${profile.lifetimeStats?.unitsDefeated ?? 0}`,
        inline: false,
      },
    ],
    footer: {
      text: `玩家存檔 v${profile.saveVersion}${profileRecord.revision ? `｜資料版本 ${profileRecord.revision}` : ''}`,
    },
  };

  return {
    embeds: [embed],
    components: [
      actionRow([skillSelect(profile, selectedSkillId)]),
      actionRow([itemSelect(profile, selectedItemId)]),
    ],
  };
}

export function renderRules() {
  const embed = {
    color: COLORS.active,
    title: '🎰 拉霸戰鬥｜怎麼玩',
    description: [
      '每回合開始時會獲得行動點。',
      '',
      '按下「投入點數」後，輸入本次想投入的數量。你可以一次投入，也可以拆成多次拉霸。',
      '',
      '牌面會出現 ⚔️｜🛡️｜✨｜🍀｜💀。相同圖案越多、投入點數越多，產生的效果就越強。',
      '',
      '每次拉霸都會立即結算：⚔️會直接對敵人造成傷害、🛡️會轉化成本回合的護甲、✨會累積法力；🍀則會同時獲得上述全部效果。如果一次轉出三個💀就會進入暈眩狀態。',
      '',
      '結束回合後，未使用的行動點與法力不會保留。敵人的攻擊會先由本回合累積的護甲抵擋。',
      '',
      '使用 `/slotbattle profile`，可以各選擇開局技能與道具。',
    ].join('\n'),
  };

  return { embeds: [embed] };
}

export function renderWagerModal(state) {
  const maximum = state.resources.action;
  return {
    custom_id: gameCustomId(state.id, 'wager-submit'),
    title: '投入行動點',
    components: [
      actionRow([{
        type: COMPONENT_TYPE.TEXT_INPUT,
        custom_id: WAGER_INPUT_ID,
        style: TEXT_INPUT_STYLE.SHORT,
        label: `輸入投入點數（1～${maximum}）`,
        placeholder: `目前有 ${maximum} 點行動點`,
        min_length: 1,
        max_length: String(maximum).length,
        required: true,
      }]),
    ],
  };
}

function renderCombat(state) {
  const embed = {
    color: COLORS.active,
    title: `🎰 地區 ${state.adventure.regionDepth}｜第 ${state.round} 回合`,
    description: combatDescription(state),
    fields: [
      {
        name: `👤 玩家 HP　${state.player.hp}/${state.player.maxHp}`,
        value: healthBar(state.player.hp, state.player.maxHp, '🟩'),
        inline: false,
      },
      {
        name: `👹 ${rankLabel(state.enemy.rank)}${state.enemy.name} HP　${state.enemy.hp}/${state.enemy.maxHp}`,
        value: healthBar(state.enemy.hp, state.enemy.maxHp, '🟥'),
        inline: false,
      },
      {
        name: '冒險進度',
        value: `本區完成 ${state.adventure.regionProgress} 次遭遇｜總擊敗 ${state.adventure.defeatedUnitCount} 個單位`,
        inline: false,
      },
      { name: '本回合資源', value: resourceLine(state), inline: false },
      { name: '目前配置', value: loadoutLine(state), inline: false },
    ],
    footer: { text: '行動點、護甲與法力都會在回合結束時清空' },
  };

  const lastSpin = lastSpinText(state);
  if (lastSpin) embed.fields.push({ name: '🎰 最近一次拉霸', value: lastSpin });
  if (state.lastAction && state.lastAction.type !== 'spin') {
    embed.fields.push({ name: '最近行動', value: state.lastAction.text });
  }
  const lastResolution = lastResolutionText(state);
  if (lastResolution) embed.fields.push({ name: '📜 上回合結果', value: lastResolution });
  const statusText = activeStatusText(state);
  if (statusText) embed.fields.push({ name: '狀態', value: statusText });

  return { embeds: [embed], components: combatControls(state) };
}

function renderRewardChoice(state) {
  const fields = state.rewardChoices.map((choice, index) => {
    const content = rewardContent(choice);
    return {
      name: `${index + 1}. 【${rarityLabel(choice.rarity)}】${content.name}`,
      value: rewardDescription(choice, content),
      inline: false,
    };
  });
  return {
    embeds: [{
      color: COLORS.reward,
      title: '🏆 戰鬥勝利｜選擇獎勵',
      description: `你擊敗了 **${state.enemy.name}**。三個選項會各自獨立抽取稀有度，請選擇其中一個。`,
      fields,
      footer: { text: `目前共擊敗 ${state.adventure.defeatedUnitCount} 個單位` },
    }],
    components: [
      actionRow(state.rewardChoices.map((choice, index) => button({
        customId: gameCustomId(state.id, 'reward', String(index)),
        label: `${index + 1}. ${rewardContent(choice).name}`,
        emoji: rewardContent(choice).emoji,
        style: BUTTON_STYLE.SUCCESS,
      }))),
      actionRow([abandonButton(state.id)]),
    ],
  };
}

function renderEvent(state) {
  return {
    embeds: [{
      color: COLORS.event,
      title: `【${rarityLabel(state.event.rarity)}奇遇】${state.event.name}`,
      description: state.event.description,
      fields: [{
        name: '冒險進度',
        value: `地區 ${state.adventure.regionDepth}｜本區完成 ${state.adventure.regionProgress} 次遭遇`,
      }],
      footer: { text: '完成奇遇會增加一次地區進度' },
    }],
    components: [actionRow([
      button({
        customId: gameCustomId(state.id, 'event-continue'),
        label: '完成奇遇並繼續',
        emoji: '🧭',
        style: BUTTON_STYLE.PRIMARY,
      }),
      abandonButton(state.id),
    ])],
  };
}

function renderEndSummary(state) {
  const summary = state.endSummary;
  const lost = state.status === GameStatus.LOST;
  const description = lost
    ? `你被 **${summary?.defeatedBy ?? '未知單位'}** 擊敗了。`
    : '你放棄了本次冒險。';
  const equipment = namesFor(summary?.finalEquipmentIds ?? [], getItem);
  const skills = namesFor(summary?.finalSkillIds ?? [], getSkill);
  const achievements = (summary?.newAchievementIds ?? [])
    .map((id) => ACHIEVEMENTS[id]?.name ?? id);
  const unlocks = [
    ...namesFor(summary?.newUnlockSkillIds ?? [], getSkill),
    ...namesFor(summary?.newUnlockItemIds ?? [], getItem),
  ];

  return {
    embeds: [{
      color: COLORS[state.status] ?? COLORS.abandoned,
      title: '冒險結束',
      description,
      fields: [
        { name: '擊敗單位', value: String(summary?.defeatedUnitCount ?? 0) },
        { name: '最後裝備配置', value: equipment.join('、') || '沒有裝備' },
        { name: '最後技能配置', value: skills.join('、') || '沒有技能' },
        { name: '本次達成成就', value: achievements.join('、') || '沒有新成就' },
        { name: '新解鎖開局內容', value: unlocks.join('、') || '沒有新解鎖' },
      ],
      footer: { text: '本輪取得的技能、道具與地區進度已清除' },
    }],
    components: [actionRow([button({
      customId: gameCustomId(state.id, 'restart'),
      label: '開始新遊戲',
      emoji: '🔄',
      style: BUTTON_STYLE.PRIMARY,
    })])],
  };
}

function combatControls(state) {
  const stunned = isStunned(state);
  const actionButtons = [button({
    customId: gameCustomId(state.id, 'wager'),
    label: `投入點數（剩餘 ${state.resources.action}）`,
    emoji: '🎟️',
    style: BUTTON_STYLE.PRIMARY,
    disabled: stunned || state.resources.action < 1,
  })];

  for (const skillId of state.player.skillIds) {
    const skill = getSkill(skillId);
    actionButtons.push(button({
      customId: gameCustomId(state.id, 'skill', skill.id),
      label: `${skill.name}（${skill.cost}法力）`,
      emoji: skill.emoji,
      style: BUTTON_STYLE.SECONDARY,
      disabled: stunned || skillUnavailable(state, skill),
    }));
  }
  for (const { itemId, quantity } of state.player.inventory ?? []) {
    const item = getItem(itemId);
    if (item.type !== 'consumable' || quantity < 1) continue;
    const actionCost = item.actionCost ?? 0;
    actionButtons.push(button({
      customId: gameCustomId(state.id, 'item', item.id),
      label: `使用${item.name}${actionCost ? `（${actionCost}行動）` : ''} ×${quantity}`,
      emoji: item.emoji,
      style: BUTTON_STYLE.SECONDARY,
      disabled: stunned || itemUnavailable(state, item),
    }));
  }

  const rows = chunk(actionButtons, 5).slice(0, 4).map(actionRow);
  rows.push(actionRow([
    button({
      customId: gameCustomId(state.id, 'end'),
      label: '回合結束',
      emoji: '⏹️',
      style: BUTTON_STYLE.SUCCESS,
    }),
    abandonButton(state.id),
  ]));
  return rows;
}

function combatDescription(state) {
  const intent = getEnemyIntent(state);
  const intentText = intent
    ? `${intent.name}，預計造成 ${intent.damage} 點傷害`
    : '尚未決定';
  if (isStunned(state)) {
    return [
      '**你陷入暈眩，本回合只能按「回合結束」。**',
      `敵人行動預告：${intentText}`,
    ].join('\n');
  }
  return [
    `**敵人行動預告：${intentText}**`,
    '可繼續投入、使用技能／道具，或自行結束回合。',
  ].join('\n');
}

function skillSelect(profile, selectedId) {
  return {
    type: COMPONENT_TYPE.STRING_SELECT,
    custom_id: 'slotbattle-profile:skill',
    placeholder: '選擇 1 個開局技能',
    min_values: 1,
    max_values: 1,
    options: profile.unlockedStartingSkillIds.map((id) => {
      const skill = getSkill(id);
      return {
        label: skill.name,
        value: id,
        description: `${skill.cost} 法力｜${skill.description}`.slice(0, 100),
        emoji: { name: skill.emoji },
        default: id === selectedId,
      };
    }),
  };
}

function itemSelect(profile, selectedId) {
  return {
    type: COMPONENT_TYPE.STRING_SELECT,
    custom_id: 'slotbattle-profile:item',
    placeholder: '選擇 1 個開局道具',
    min_values: 1,
    max_values: 1,
    options: profile.unlockedStartingItemIds.map((id) => {
      const item = getItem(id);
      return {
        label: item.name,
        value: id,
        description: `${itemTypeLabel(item)}｜${item.description}`.slice(0, 100),
        emoji: { name: item.emoji },
        default: id === selectedId,
      };
    }),
  };
}

function resourceLine(state) {
  return [
    `🎟️ 行動 **${state.resources.action}**`,
    `🛡️ 護甲 **${state.resources.armor}**`,
    `✨ 法力 **${state.resources.mana}**`,
  ].join('　');
}

function loadoutLine(state) {
  const skills = state.player.skillIds.map((id) => {
    const skill = getSkill(id);
    return `${skill.emoji}${skill.name}（${skill.cost}法力）`;
  });
  const equipment = Object.values(state.player.equipment ?? {}).map((id) => {
    const item = getItem(id);
    return `${item.emoji}${item.name}（已裝備）`;
  });
  const inventory = (state.player.inventory ?? []).map(({ itemId, quantity }) => {
    const item = getItem(itemId);
    return `${item.emoji}${item.name}×${quantity}`;
  });
  return [
    `技能：${skills.join('、') || '沒有技能'}`,
    `道具：${[...equipment, ...inventory].join('、') || '沒有道具'}`,
  ].join('\n');
}

function lastSpinText(state) {
  if (!state.lastSpin) return null;
  if (state.lastSpin.stunned) {
    return `${formatReels(state.lastSpin.reels)}\n三個不幸：失去本回合資源並陷入暈眩。`;
  }
  const awarded = state.lastSpin.awarded;
  const impact = state.lastImpact ?? {};
  const bonuses = [];
  if (impact.statusBonus) bonuses.push(`狀態 +${impact.statusBonus}`);
  return [
    formatReels(state.lastSpin.reels),
    `投入 **${state.lastSpin.wager}** 點｜⚔️ ${awarded.attack}　🛡️ ${awarded.defense}　✨ ${awarded.skill}`,
    `立即結果：${state.lastAction?.text ?? '沒有產生效果'}${bonuses.length ? `（${bonuses.join('、')}）` : ''}`,
  ].join('\n');
}

function lastResolutionText(state) {
  const result = state.lastResolution;
  if (!result) return null;
  const discarded = [];
  if (result.discardedAction) discarded.push(`行動 ${result.discardedAction}`);
  if (result.discardedMana) discarded.push(`法力 ${result.discardedMana}`);
  const statusEffects = [
    ...(result.enemyStatusEvents ?? result.bossStatusEvents ?? []),
    ...(result.playerStatusEvents ?? []),
  ].map(statusEventText).filter(Boolean);
  return [
    `第 ${result.round} 回合：${result.enemyAction?.name ?? '敵人攻擊'} **${result.enemyAttack ?? result.bossAttack}**，護甲抵擋 **${result.armorUsed}**，受到 **${result.damageTaken}** 傷害。`,
    discarded.length ? `未使用的${discarded.join('、')}已消失。` : null,
    statusEffects.length ? `狀態效果：${statusEffects.join('、')}` : null,
  ].filter(Boolean).join('\n');
}

function activeStatusText(state) {
  const sides = [
    ['玩家', state.player.activeStatuses],
    [state.enemy.name, state.enemy.activeStatuses],
  ];
  const lines = sides.flatMap(([label, statuses]) => {
    if (!statuses?.length) return [];
    const text = statuses.map((status) => {
      const definition = getStatus(status.statusId);
      const stackText = status.stacks > 1 ? `×${status.stacks}` : '';
      return `${definition.emoji}${definition.name}${stackText}（${status.remainingTurns}回合）`;
    }).join('、');
    return `${label}：${text}`;
  });
  return lines.length ? lines.join('\n') : null;
}

function skillUnavailable(state, skill) {
  if (state.resources.mana < skill.cost) return true;
  if (skill.effects.every((effect) => effect.type === 'heal' && effect.target === 'self')) {
    return state.player.hp >= state.player.maxHp;
  }
  const selfStatuses = skill.effects
    .filter((effect) => effect.type === 'apply-status' && effect.target === 'self')
    .map((effect) => effect.statusId);
  return selfStatuses.length > 0 && selfStatuses.every((statusId) => {
    const active = state.player.activeStatuses
      ?.find((status) => status.statusId === statusId);
    if (!active) return false;
    const definition = getStatus(statusId);
    if (definition.stacking.mode === 'refresh-duration') return true;
    return Number(active.stacks ?? 1) >= definition.stacking.maxStacks;
  });
}

function itemUnavailable(state, item) {
  const lacksAction = state.resources.action < (item.actionCost ?? 0);
  const onlyHealsFullHealth = item.effects
    ?.every((effect) => effect.type === 'heal' && effect.target === 'self')
    && state.player.hp >= state.player.maxHp;
  return lacksAction || onlyHealsFullHealth;
}

function rewardContent(choice) {
  return choice.contentType === 'skill'
    ? getSkill(choice.contentId)
    : getItem(choice.contentId);
}

function rewardDescription(choice, content) {
  if (choice.contentType === 'skill') {
    return `技能｜法力消耗 ${content.cost}\n${content.description}`;
  }
  return `${itemTypeLabel(content)}\n${content.description}`;
}

function statusEventText(event) {
  const status = getStatus(event.statusId);
  if (event.type === 'damage') return `${status.emoji}${status.name}造成 ${event.amount} 傷害`;
  if (event.type === 'heal') return `${status.emoji}${status.name}回復 ${event.amount} HP`;
  return null;
}

function itemTypeLabel(item) {
  if (item.type === 'equipment') return '裝備（戰鬥開始時自動生效）';
  return '消耗品（戰鬥中使用）';
}

function rankLabel(rank) {
  if (rank === 'boss') return '【BOSS】';
  if (rank === 'elite') return '【菁英】';
  return '【普通】';
}

function healthBar(current, maximum, filledEmoji) {
  const segments = 10;
  const filled = maximum === 0 ? 0 : Math.ceil((current / maximum) * segments);
  return `${filledEmoji.repeat(filled)}${'⬛'.repeat(segments - filled)}`;
}

function actionRow(components) {
  return { type: COMPONENT_TYPE.ACTION_ROW, components };
}

function button({ customId, label, emoji, style, disabled = false }) {
  return {
    type: COMPONENT_TYPE.BUTTON,
    custom_id: customId,
    label,
    emoji: { name: emoji },
    style,
    disabled,
  };
}

function abandonButton(gameId) {
  return button({
    customId: gameCustomId(gameId, 'abandon'),
    label: '放棄遊戲',
    emoji: '🏳️',
    style: BUTTON_STYLE.DANGER,
  });
}

function gameCustomId(gameId, action, value) {
  return ['slotbattle', gameId, action, value].filter((entry) => (
    entry !== undefined && entry !== null && entry !== ''
  )).join(':');
}

function chunk(values, size) {
  return Array.from(
    { length: Math.ceil(values.length / size) },
    (_, index) => values.slice(index * size, (index + 1) * size),
  );
}

function namesFor(ids, resolver) {
  return ids.map((id) => resolver(id).name);
}
