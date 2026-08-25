import { ACHIEVEMENTS } from '../game/data/achievements.js';
import { contentTypeEmoji } from '../game/data/content-types.js';
import { getItem } from '../game/data/items.js';
import { rarityLabel } from '../game/data/rarities.js';
import {
  getSkill,
  getSkillLevelDefinition,
  skillUsageLabel,
} from '../game/data/skills.js';
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
  const selectedSkillIds = profile.lastStartingLoadout?.skillIds ?? [];
  const selectedItemIds = profile.lastStartingLoadout?.itemIds ?? [];
  const selectedSkills = selectedSkillIds.map(getSkill);
  const selectedItems = selectedItemIds.map(getItem);

  const embed = {
    color: COLORS.active,
    title: '🧭 開局配置',
    description: [
      `從下方選單選擇 **${profile.startingSkillSlots} 個技能**與 **${profile.startingItemSlots} 個道具**。`,
      '選擇會立即保存，並在下一場新遊戲生效；進行中的遊戲不會改變。',
    ].join('\n'),
    fields: [
      {
        name: '目前技能',
        value: selectedSkills.length
          ? selectedSkills.map((skill) => (
            `${contentTypeEmoji('skill')} **${skill.name}**｜${skillUsageLabel(skill)}\n${skill.description}`
          )).join('\n')
          : '尚未選擇',
        inline: false,
      },
      {
        name: '目前道具',
        value: selectedItems.length
          ? selectedItems.map((item) => (
            `${contentTypeEmoji(item.type)} **${item.name}**｜${itemTypeLabel(item)}\n${item.description}`
          )).join('\n')
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
      actionRow([skillSelect(profile, selectedSkillIds)]),
      actionRow([itemSelect(profile, selectedItemIds)]),
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
      '',
      '每個玩家最多可以持有3個技能，技能等級上限為3級。',
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
  const enemyField = {
    name: `👹 ${rankLabel(state.enemy.rank)}${state.enemy.name} HP　${state.enemy.hp}/${state.enemy.maxHp}`,
    value: [
      healthBar(state.enemy.hp, state.enemy.maxHp, '🟥'),
      '**敵人狀態**',
      statusListText(state.enemy.activeStatuses),
    ].join('\n'),
    inline: false,
  };
  const playerField = {
    name: `👤 玩家 HP　${state.player.hp}/${state.player.maxHp}`,
    value: [
      healthBar(state.player.hp, state.player.maxHp, '🟩'),
      '**玩家狀態**',
      statusListText(state.player.activeStatuses),
      '',
      resourceLine(state),
    ].join('\n'),
    inline: false,
  };
  const fields = [enemyField];
  const lastSpin = lastSpinText(state);
  if (lastSpin) {
    fields.push({ name: '\u200b', value: lastSpin, inline: false });
  }
  fields.push(playerField);

  const embed = {
    color: state.phase === GamePhase.VICTORY_CONFIRM
      ? COLORS.reward
      : COLORS.active,
    title: `🎰 地區 ${state.adventure.regionDepth}｜第 ${state.round} 回合`,
    description: combatDescription(state),
    fields,
  };

  return { embeds: [embed], components: combatControls(state) };
}

function renderRewardChoice(state) {
  if (state.rewardChoices.length === 0) {
    return {
      embeds: [{
        color: COLORS.reward,
        title: '🏆 戰鬥勝利',
        description: `你擊敗了 **${state.enemy.name}**。目前沒有符合持有與等級規則的新獎勵。`,
        footer: { text: `目前共擊敗 ${state.adventure.defeatedUnitCount} 個單位` },
      }],
      components: [actionRow([
        button({
          customId: gameCustomId(state.id, 'reward-continue'),
          label: '繼續冒險',
          style: BUTTON_STYLE.SUCCESS,
        }),
        abandonButton(state.id),
      ])],
    };
  }
  const fields = state.rewardChoices.map((choice, index) => {
    const content = rewardContent(choice);
    return {
      name: `${index + 1}. 【${rarityLabel(choice.rarity)}】${rewardName(choice, content)}`,
      value: rewardDescription(choice, content),
      inline: false,
    };
  });
  return {
    embeds: [{
      color: COLORS.reward,
      title: '🏆 戰鬥勝利｜選擇獎勵',
      description: `你擊敗了 **${state.enemy.name}**。${state.rewardChoices.length} 個可用選項各自獨立抽取稀有度，請選擇其中一個。`,
      fields,
      footer: { text: `目前共擊敗 ${state.adventure.defeatedUnitCount} 個單位` },
    }],
    components: [
      actionRow(state.rewardChoices.map((choice, index) => button({
        customId: gameCustomId(state.id, 'reward', String(index)),
        label: `${index + 1}. ${rewardName(choice, rewardContent(choice))}`,
        emoji: contentTypeEmoji(
          choice.contentType === 'skill' ? 'skill' : rewardContent(choice).type,
        ),
        style: BUTTON_STYLE.SUCCESS,
      }))),
      actionRow([abandonButton(state.id)]),
    ],
  };
}

function renderEvent(state) {
  const resultStage = state.event.stage === 'result';
  const components = resultStage
    ? [actionRow([
      button({
        customId: gameCustomId(state.id, 'event-continue'),
        label: '繼續冒險',
        style: BUTTON_STYLE.PRIMARY,
      }),
      abandonButton(state.id),
    ])]
    : [
      actionRow(state.event.options.map((option) => button({
        customId: gameCustomId(state.id, 'event-option', option.id),
        label: option.label,
        style: BUTTON_STYLE.PRIMARY,
      }))),
      actionRow([abandonButton(state.id)]),
    ];
  return {
    embeds: [{
      color: COLORS.event,
      title: resultStage ? '奇遇結果' : `【${rarityLabel(state.event.rarity)}】奇遇`,
      description: resultStage ? state.event.result.text : state.event.description,
      fields: [{
        name: '冒險進度',
        value: `地區 ${state.adventure.regionDepth}｜本區完成 ${state.adventure.regionProgress} 次遭遇`,
      }],
      footer: { text: resultStage ? '繼續後會增加一次地區進度' : '奇遇名稱不會顯示' },
    }],
    components,
  };
}

function renderEndSummary(state) {
  const summary = state.endSummary;
  const lost = state.status === GameStatus.LOST;
  const description = lost
    ? `你被 **${summary?.defeatedBy ?? '未知單位'}** 擊敗了。`
    : '你放棄了本次冒險。';
  const equipment = namesFor(summary?.finalEquipmentIds ?? [], getItem);
  const skills = (summary?.finalSkillIds ?? []).map((id) => {
    const skill = getSkill(id);
    const level = summary?.finalSkillLevels?.[id] ?? 1;
    return `${skill.name} Lv.${level}`;
  });
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
  if (state.phase === GamePhase.VICTORY_CONFIRM) {
    return [actionRow([button({
      customId: gameCustomId(state.id, 'victory-confirm'),
      label: '確認',
      style: BUTTON_STYLE.SUCCESS,
    })])];
  }

  const stunned = isStunned(state);
  const actionButtons = [button({
    customId: gameCustomId(state.id, 'wager'),
    label: `投入點數（剩餘 ${state.resources.action}）`,
    emoji: '❇️',
    style: BUTTON_STYLE.PRIMARY,
    disabled: stunned || state.resources.action < 1,
  })];

  for (const skillId of state.player.skillIds) {
    const skill = getSkill(skillId);
    const skillLevel = state.player.skillLevels?.[skillId] ?? 1;
    actionButtons.push(button({
      customId: gameCustomId(state.id, 'detail-skill', skill.id),
      label: `${skill.name} Lv.${skillLevel}`,
      emoji: contentTypeEmoji('skill'),
      style: BUTTON_STYLE.SECONDARY,
    }));
  }

  for (const { itemId, quantity } of state.player.inventory ?? []) {
    const item = getItem(itemId);
    if (quantity < 1) continue;
    actionButtons.push(button({
      customId: gameCustomId(state.id, 'detail-item', item.id),
      label: `${item.name} ×${quantity}`,
      emoji: contentTypeEmoji('consumable'),
      style: BUTTON_STYLE.SECONDARY,
    }));
  }

  const equipmentIds = Object.values(state.player.equipment ?? {});
  const maximumActionRows = equipmentIds.length > 0 ? 3 : 4;
  const rows = chunk(actionButtons, 5).slice(0, maximumActionRows).map(actionRow);
  if (equipmentIds.length > 0) {
    rows.push(actionRow([equipmentSelect(state, equipmentIds)]));
  }
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

function equipmentSelect(state, equipmentIds) {
  return {
    type: COMPONENT_TYPE.STRING_SELECT,
    custom_id: gameCustomId(state.id, 'detail-equipment'),
    placeholder: `查看裝備（${equipmentIds.length}）`,
    min_values: 1,
    max_values: 1,
    options: equipmentIds.slice(0, 25).map((itemId) => {
      const item = getItem(itemId);
      return {
        label: item.name,
        value: item.id,
        description: `${rarityLabel(item.rarity)}｜${item.description}`.slice(0, 100),
        emoji: { name: contentTypeEmoji('equipment') },
      };
    }),
  };
}

function combatDescription(state) {
  if (state.phase === GamePhase.VICTORY_CONFIRM) {
    return `**戰鬥結果：** 已擊敗 ${state.enemy.name}，按下「確認」查看獎勵。`;
  }

  const intent = getEnemyIntent(state);
  const intentText = intent
    ? `${intent.name}，預計造成 ${intent.damage} 點傷害`
    : '尚未決定';
  if (isStunned(state)) {
    return `**行動預告：** ${intentText}｜你目前暈眩，只能結束回合。`;
  }
  return `**行動預告：** ${intentText}`;
}

function skillSelect(profile, selectedIds) {
  return {
    type: COMPONENT_TYPE.STRING_SELECT,
    custom_id: 'slotbattle-profile:skill',
    placeholder: `選擇 ${profile.startingSkillSlots} 個開局技能`,
    min_values: profile.startingSkillSlots,
    max_values: profile.startingSkillSlots,
    options: profile.unlockedStartingSkillIds.map((id) => {
      const skill = getSkill(id);
      return {
        label: skill.name,
        value: id,
        description: `${skillUsageLabel(skill)}｜${skill.description}`.slice(0, 100),
        emoji: { name: contentTypeEmoji('skill') },
        default: selectedIds.includes(id),
      };
    }),
  };
}

function itemSelect(profile, selectedIds) {
  return {
    type: COMPONENT_TYPE.STRING_SELECT,
    custom_id: 'slotbattle-profile:item',
    placeholder: `選擇 ${profile.startingItemSlots} 個開局道具`,
    min_values: profile.startingItemSlots,
    max_values: profile.startingItemSlots,
    options: profile.unlockedStartingItemIds.map((id) => {
      const item = getItem(id);
      return {
        label: item.name,
        value: id,
        description: `${itemTypeLabel(item)}｜${item.description}`.slice(0, 100),
        emoji: { name: contentTypeEmoji(item.type) },
        default: selectedIds.includes(id),
      };
    }),
  };
}

function resourceLine(state) {
  return `❇️ **${state.resources.action}**　🛡️ **${state.resources.armor}**　✨ **${state.resources.mana}**`;
}

function lastSpinText(state) {
  if (!state.lastSpin) return null;
  const reels = [
    '╔═══════════╗',
    `　${formatReels(state.lastSpin.reels)}`,
    '╚═══════════╝',
  ].join('\n');
  if (state.lastSpin.stunned) {
    return `${reels}\n拉霸結果：進入暈眩狀態`;
  }
  const impact = state.lastImpact ?? {};
  const results = [];
  if (impact.attackDamage > 0) results.push(`造成 ${impact.attackDamage} 傷害`);
  if (impact.armorGained > 0) results.push(`護甲 +${impact.armorGained}`);
  if (impact.manaGained > 0) results.push(`法力 +${impact.manaGained}`);
  return `${reels}\n拉霸結果：${results.join('／') || '沒有產生效果'}`;
}

function statusListText(statuses) {
  if (!statuses?.length) return '無';
  return statuses.map((status) => {
    const definition = getStatus(status.statusId);
    if (definition.durationMode === 'until-consumed') {
      return `${definition.emoji}${definition.name}（下次拉霸傷害 ×${status.potency}）`;
    }
    if (definition.stacking.mode === 'stack-countdown') {
      return `${definition.emoji}${definition.name} ×${status.stacks}`;
    }
    const stackText = status.stacks > 1 ? ` ×${status.stacks}` : '';
    return `${definition.emoji}${definition.name}${stackText}（${status.remainingTurns}回合）`;
  }).join('、');
}

function rewardContent(choice) {
  return choice.contentType === 'skill'
    ? getSkill(choice.contentId)
    : getItem(choice.contentId);
}

function rewardDescription(choice, content) {
  if (choice.contentType === 'skill') {
    const definition = getSkillLevelDefinition(content.id, choice.targetLevel ?? 1);
    const acquisition = choice.acquisition === 'level-up'
      ? `技能升級｜Lv.${choice.currentLevel} → Lv.${choice.targetLevel}`
      : `新技能｜Lv.${choice.targetLevel ?? 1}`;
    return `${acquisition}｜${skillUsageLabel(content)}\n${definition.description}`;
  }
  return `${itemTypeLabel(content)}\n${content.description}`;
}

function rewardName(choice, content) {
  if (choice.contentType !== 'skill') return content.name;
  return `${content.name} Lv.${choice.targetLevel ?? 1}`;
}

function itemTypeLabel(item) {
  if (item.type === 'equipment') return '裝備（持有時自動生效）';
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
    ...(emoji ? { emoji: { name: emoji } } : {}),
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
