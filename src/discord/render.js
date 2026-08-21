import { getItem } from '../game/data/items.js';
import { getSkill } from '../game/data/skills.js';
import { getStatus } from '../game/data/statuses.js';
import { GameStatus, getBossIntent, isStunned } from '../game/engine.js';
import { formatReels } from '../game/symbols.js';

const COLORS = Object.freeze({
  active: 0x7c5cff,
  won: 0x3ba55d,
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
  const embed = {
    color: COLORS[state.status] ?? COLORS.active,
    title: titleFor(state),
    description: descriptionFor(state),
    fields: [
      {
        name: `👤 玩家 HP　${state.player.hp}/${state.player.maxHp}`,
        value: healthBar(state.player.hp, state.player.maxHp, '🟩'),
        inline: false,
      },
      {
        name: `👹 ${rankLabel(state.boss.rank)}${state.boss.name} HP　${state.boss.hp}/${state.boss.maxHp}`,
        value: healthBar(state.boss.hp, state.boss.maxHp, '🟥'),
        inline: false,
      },
      {
        name: '本回合資源',
        value: resourceLine(state),
        inline: false,
      },
      {
        name: '攜帶內容',
        value: loadoutLine(state),
        inline: false,
      },
    ],
    footer: { text: '行動點、護甲與法力都會在回合結束時清空' },
  };

  const lastSpin = lastSpinText(state);
  if (lastSpin) {
    embed.fields.push({ name: '🎰 最近一次拉霸', value: lastSpin, inline: false });
  }

  if (state.lastAction && state.lastAction.type !== 'spin') {
    embed.fields.push({
      name: '最近行動',
      value: state.lastAction.text,
      inline: false,
    });
  }

  const lastResolution = lastResolutionText(state);
  if (lastResolution) {
    embed.fields.push({ name: '📜 上回合結果', value: lastResolution, inline: false });
  }

  const statusText = activeStatusText(state);
  if (statusText) {
    embed.fields.push({ name: '狀態', value: statusText, inline: false });
  }

  return {
    embeds: [embed],
    components: buildControls(state),
  };
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
      '選擇會立即保存，並在下一場新戰鬥生效；進行中的戰鬥不會改變。',
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

function buildControls(state) {
  if (state.status !== GameStatus.ACTIVE) {
    return [
      actionRow([
        button({
          customId: gameCustomId(state.id, 'restart'),
          label: '以相同配置再來一場',
          emoji: '🔄',
          style: BUTTON_STYLE.PRIMARY,
        }),
      ]),
    ];
  }

  const stunned = isStunned(state);
  const skill = getSkill(state.player.equippedSkillId ?? state.player.skillIds[0]);
  const consumable = firstConsumable(state);
  const actionComponents = [
    button({
      customId: gameCustomId(state.id, 'wager'),
      label: `投入點數（剩餘 ${state.resources.action}）`,
      emoji: '🎟️',
      style: BUTTON_STYLE.PRIMARY,
      disabled: stunned || state.resources.action < 1,
    }),
    button({
      customId: gameCustomId(state.id, 'skill', skill.id),
      label: `${skill.name}（${skill.cost}法力）`,
      emoji: skill.emoji,
      style: BUTTON_STYLE.SECONDARY,
      disabled: stunned || skillUnavailable(state, skill),
    }),
  ];

  if (consumable) {
    actionComponents.push(button({
      customId: gameCustomId(state.id, 'item', consumable.item.id),
      label: `使用${consumable.item.name} ×${consumable.quantity}`,
      emoji: consumable.item.emoji,
      style: BUTTON_STYLE.SECONDARY,
      disabled: stunned || itemUnavailable(state, consumable.item),
    }));
  }

  return [
    actionRow(actionComponents),
    actionRow([
      button({
        customId: gameCustomId(state.id, 'end'),
        label: '回合結束',
        emoji: '⏹️',
        style: BUTTON_STYLE.SUCCESS,
      }),
      button({
        customId: gameCustomId(state.id, 'abandon'),
        label: '放棄戰鬥',
        emoji: '🏳️',
        style: BUTTON_STYLE.DANGER,
      }),
    ]),
  ];
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

function actionRow(components) {
  return {
    type: COMPONENT_TYPE.ACTION_ROW,
    components,
  };
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

function gameCustomId(gameId, action, value) {
  return ['slotbattle', gameId, action, value].filter(Boolean).join(':');
}

function titleFor(state) {
  if (state.status === GameStatus.WON) return '🏆 戰鬥勝利';
  if (state.status === GameStatus.LOST) return '☠️ 戰鬥失敗';
  if (state.status === GameStatus.ABANDONED) return '🏳️ 已放棄戰鬥';
  return `🎰 拉霸戰鬥｜第 ${state.round} 回合`;
}

function descriptionFor(state) {
  if (state.status === GameStatus.WON) {
    return `你在第 **${state.round}** 回合擊敗了 **${state.boss.name}**。`;
  }
  if (state.status === GameStatus.LOST) {
    return `你在第 **${state.round}** 回合被 **${state.boss.name}** 擊敗。`;
  }
  if (state.status === GameStatus.ABANDONED) return '本場戰鬥已結束。';
  if (isStunned(state)) {
    return [
      '**你陷入暈眩，本回合只能按「回合結束」。**',
      `Boss 行動預告：造成 ${getBossIntent(state)} 點傷害`,
    ].join('\n');
  }
  return [
    `**Boss 行動預告：造成 ${getBossIntent(state)} 點傷害**`,
    '可繼續投入、使用技能／道具，或自行結束回合。',
  ].join('\n');
}

function resourceLine(state) {
  return [
    `🎟️ 行動 **${state.resources.action}**`,
    `🛡️ 護甲 **${state.resources.armor}**`,
    `✨ 法力 **${state.resources.mana}**`,
  ].join('　');
}

function loadoutLine(state) {
  const skill = getSkill(state.player.equippedSkillId ?? state.player.skillIds[0]);
  const equipment = Object.values(state.player.equipment ?? {})
    .map((id) => {
      const item = getItem(id);
      return `${item.emoji}${item.name}（已裝備）`;
    });
  const inventory = (state.player.inventory ?? []).map(({ itemId, quantity }) => {
    const item = getItem(itemId);
    return `${item.emoji}${item.name}×${quantity}`;
  });
  const items = [...equipment, ...inventory];
  return `${skill.emoji}${skill.name}（${skill.cost}法力）\n${items.join('、') || '沒有道具'}`;
}

function lastSpinText(state) {
  if (!state.lastSpin) return null;
  if (state.lastSpin.stunned) {
    return `${formatReels(state.lastSpin.reels)}\n三個不幸：失去本回合資源並陷入暈眩。`;
  }

  const awarded = state.lastSpin.awarded;
  const impact = state.lastImpact ?? {};
  const bonuses = [];
  if (impact.equipmentBonus) bonuses.push(`裝備 +${impact.equipmentBonus}`);
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
  const statusEffects = [...(result.bossStatusEvents ?? []), ...(result.playerStatusEvents ?? [])]
    .map(statusEventText)
    .filter(Boolean);

  return [
    `第 ${result.round} 回合：Boss 攻擊 **${result.bossAttack}**，護甲抵擋 **${result.armorUsed}**，受到 **${result.damageTaken}** 傷害。`,
    discarded.length ? `未使用的${discarded.join('、')}已消失。` : null,
    statusEffects.length ? `狀態效果：${statusEffects.join('、')}` : null,
  ].filter(Boolean).join('\n');
}

function activeStatusText(state) {
  const sides = [
    ['玩家', state.player.activeStatuses],
    [state.boss.name, state.boss.activeStatuses],
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

function firstConsumable(state) {
  const entry = state.player.inventory?.find(({ itemId, quantity }) => (
    quantity > 0 && getItem(itemId).type === 'consumable'
  ));
  return entry ? { item: getItem(entry.itemId), quantity: entry.quantity } : null;
}

function skillUnavailable(state, skill) {
  if (state.resources.mana < skill.cost) return true;
  if (skill.effects.every((effect) => effect.type === 'heal' && effect.target === 'self')) {
    return state.player.hp >= state.player.maxHp;
  }
  const selfStatuses = skill.effects
    .filter((effect) => effect.type === 'apply-status' && effect.target === 'self')
    .map((effect) => effect.statusId);
  return selfStatuses.length > 0 && selfStatuses.every((statusId) => (
    state.player.activeStatuses?.some((active) => active.statusId === statusId)
  ));
}

function itemUnavailable(state, item) {
  return item.effects?.every((effect) => effect.type === 'heal' && effect.target === 'self')
    && state.player.hp >= state.player.maxHp;
}

function statusEventText(event) {
  const status = getStatus(event.statusId);
  if (event.type === 'damage') return `${status.emoji}${status.name}造成 ${event.amount} 傷害`;
  if (event.type === 'heal') return `${status.emoji}${status.name}回復 ${event.amount} HP`;
  return null;
}

function itemTypeLabel(item) {
  if (item.type === 'equipment') return '裝備（開局自動穿戴）';
  return '消耗品（戰鬥中使用）';
}

function rankLabel(rank) {
  if (rank === 'boss') return '【BOSS】';
  if (rank === 'elite') return '【菁英】';
  return '';
}

function healthBar(current, maximum, filledEmoji) {
  const segments = 10;
  const filled = maximum === 0 ? 0 : Math.ceil((current / maximum) * segments);
  return `${filledEmoji.repeat(filled)}${'⬛'.repeat(segments - filled)}`;
}
