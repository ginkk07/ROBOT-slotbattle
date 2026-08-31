import { contentTypeEmoji, contentTypeMeta } from '../game/data/content-types.js';
import { getItem } from '../game/data/items.js';
import { rarityLabel } from '../game/data/rarities.js';
import { SkillActivation } from '../game/data/skill-effects.js';
import {
  getSkill,
  getSkillLevelDefinition,
  skillActivation,
  skillCost,
} from '../game/data/skills.js';
import {
  itemActionAvailability,
  skillActionAvailability,
} from '../game/engines/action-availability.js';
import { equippedItemIds } from '../game/engines/equipment-engine.js';
import { playerSkillLevel } from '../game/engines/skill-progression.js';

const COMPONENT_TYPE = Object.freeze({ ACTION_ROW: 1, BUTTON: 2 });
const BUTTON_STYLE = Object.freeze({ PRIMARY: 1, SECONDARY: 2 });
const DETAIL_COLOR = 0x5865f2;

/**
 * 戰鬥面板的技能／道具詳情卡。
 *
 * 卡片會暫時取代原本的戰鬥面板。可使用時才建立「使用」按鈕，
 * 否則只保留「關閉」，讓玩家仍能查看目前無法使用的內容。
 */
export function renderContentDetail(state, contentType, contentId) {
  if (contentType === 'skill') return renderSkillDetail(state, contentId);
  if (contentType === 'item') return renderItemDetail(state, contentId);
  throw new RangeError(`不存在的詳情類型：${contentType}`);
}

function renderSkillDetail(state, skillId) {
  const level = playerSkillLevel(state.player, skillId);
  if (level < 1) throw new Error('這個技能不在目前持有的技能中');

  const skill = getSkill(skillId);
  const definition = getSkillLevelDefinition(skillId, level);
  const availability = skillActionAvailability(state, skillId);
  const passive = skillActivation(skill) === SkillActivation.PASSIVE;
  return detailPayload({
    state,
    title: `${contentTypeEmoji('skill')} ${skill.name} Lv.${level}`,
    fields: [
      { name: '稀有度', value: rarityLabel(skill.rarity), inline: true },
      passive
        ? { name: '技能類型', value: '被動技能', inline: true }
        : { name: '法力消耗', value: String(skillCost(skill, level)), inline: true },
      { name: '效果', value: definition.description, inline: false },
      availabilityField(availability),
    ],
    useAction: availability.usable ? 'skill' : null,
    contentId: skillId,
  });
}

function renderItemDetail(state, itemId) {
  const item = getItem(itemId);
  const equipped = equippedItemIds(state.player).includes(itemId);
  const stack = state.player.inventory?.find((entry) => entry.itemId === itemId);
  if (!equipped && (!stack || stack.quantity < 1)) {
    throw new Error('這個道具不在目前持有的道具中');
  }

  const availability = itemActionAvailability(state, itemId);
  const holding = equipped ? '已裝備' : `持有 ${stack.quantity} 個`;
  return detailPayload({
    state,
    title: `${contentTypeEmoji(item.type)} ${item.name}`,
    fields: [
      { name: '分類', value: contentTypeMeta(item.type).label, inline: true },
      { name: '稀有度', value: rarityLabel(item.rarity), inline: true },
      { name: '目前持有', value: holding, inline: true },
      { name: '效果', value: item.description, inline: false },
      availabilityField(availability),
    ],
    useAction: availability.usable ? 'item' : null,
    contentId: itemId,
  });
}

function detailPayload({ state, title, fields, useAction, contentId }) {
  const controls = [];
  if (useAction) {
    controls.push(button({
      customId: gameCustomId(state.id, useAction, contentId),
      label: '使用',
      style: BUTTON_STYLE.PRIMARY,
    }));
  }
  controls.push(button({
    customId: gameCustomId(state.id, 'detail-close'),
    label: '關閉',
    style: BUTTON_STYLE.SECONDARY,
  }));

  return {
    embeds: [{ color: DETAIL_COLOR, title, fields }],
    components: [actionRow(controls)],
  };
}

function availabilityField(availability) {
  return {
    name: '目前狀態',
    value: availability.usable ? '可以使用' : `無法使用：${availability.reason}`,
    inline: false,
  };
}

function actionRow(components) {
  return { type: COMPONENT_TYPE.ACTION_ROW, components };
}

function button({ customId, label, style }) {
  return {
    type: COMPONENT_TYPE.BUTTON,
    custom_id: customId,
    label,
    style,
  };
}

function gameCustomId(gameId, action, value) {
  return ['slotbattle', gameId, action, value].filter((entry) => (
    entry !== undefined && entry !== null && entry !== ''
  )).join(':');
}
