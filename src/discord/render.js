import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';

import { DEFAULT_CONFIG } from '../game/config.js';
import { getItem } from '../game/data/items.js';
import { getSkill } from '../game/data/skills.js';
import { getStatus } from '../game/data/statuses.js';
import { GameStatus, getBossIntent } from '../game/engine.js';
import { formatReels } from '../game/symbols.js';

const COLORS = Object.freeze({
  active: 0x7c5cff,
  won: 0x3ba55d,
  lost: 0xed4245,
  abandoned: 0x747f8d,
});

export function renderGame(state) {
  const embed = new EmbedBuilder()
    .setColor(COLORS[state.status] ?? COLORS.active)
    .setTitle(titleFor(state))
    .setDescription(descriptionFor(state))
    .addFields(
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
    )
    .setFooter({ text: '行動點與所有指令點都不會保留到下一回合' });

  const lastSpin = lastSpinText(state);
  if (lastSpin) {
    embed.addFields({ name: '🎰 最近一次拉霸', value: lastSpin, inline: false });
  }

  const lastResolution = lastResolutionText(state);
  if (lastResolution) {
    embed.addFields({ name: '📜 上回合結算', value: lastResolution, inline: false });
  }

  const statusText = activeStatusText(state);
  if (statusText) {
    embed.addFields({ name: '狀態', value: statusText, inline: false });
  }

  return {
    embeds: [embed],
    components: buildControls(state),
  };
}

export function renderProfile(profileRecord) {
  const profile = profileRecord.profile ?? profileRecord;
  const skills = profile.unlockedStartingSkillIds.map((id) => getSkill(id).name);
  const items = profile.unlockedStartingItemIds.map((id) => getItem(id).name);
  const loadoutSkills = profile.lastStartingLoadout?.skillIds
    ?.map((id) => getSkill(id).name) ?? [];
  const loadoutItems = profile.lastStartingLoadout?.itemIds
    ?.map((id) => getItem(id).name) ?? [];

  const embed = new EmbedBuilder()
    .setColor(COLORS.active)
    .setTitle('🧭 Roguelike 玩家資料')
    .setDescription('永久資料只影響開局選擇；冒險中的生命與道具會在該次冒險結束後清除。')
    .addFields(
      {
        name: `技能欄位　${profile.startingSkillSlots}`,
        value: loadoutSkills.length ? loadoutSkills.join('、') : '尚未選擇',
        inline: true,
      },
      {
        name: `道具欄位　${profile.startingItemSlots}`,
        value: loadoutItems.length ? loadoutItems.join('、') : '尚未選擇',
        inline: true,
      },
      {
        name: '已解鎖初始技能',
        value: skills.join('、') || '無',
        inline: false,
      },
      {
        name: '已解鎖初始道具',
        value: items.join('、') || '無',
        inline: false,
      },
    )
    .setFooter({ text: `存檔版本 ${profile.saveVersion}` });

  return { embeds: [embed] };
}

export function renderRules() {
  const embed = new EmbedBuilder()
    .setColor(COLORS.active)
    .setTitle('🎰 拉霸戰鬥規則')
    .setDescription([
      `每回合取得 **${DEFAULT_CONFIG.actionPointsPerRound}點行動點**，最多拉霸 **${DEFAULT_CONFIG.maxSpinsPerRound}次**。你可以分批投入，也可以一次全押。`,
      '',
      '每格機率：⚔️攻擊30%／🛡️防禦30%／✨技能30%／🍀幸運5%／💀不幸5%。',
      '',
      '同類圖示的基礎值為：1個＝1點、2個＝3點、3個＝9點，再乘上本次投入的行動點。',
      '',
      '🍀幸運會將相同的基礎值同時加到攻擊、防禦、技能。三個💀會讓玩家本回合暈眩，所有資源消失並承受Boss完整攻擊。',
      '',
      `⚔️每點造成1傷害；🛡️每點抵銷1傷害；✨${DEFAULT_CONFIG.commands.skill.description}`,
      '',
      '所有行動點與指令點都只在當回合有效。',
    ].join('\n'));

  return { embeds: [embed] };
}

function buildControls(state) {
  if (state.status !== GameStatus.ACTIVE) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(customId(state.id, 'restart'))
          .setLabel('再來一場')
          .setEmoji('🔄')
          .setStyle(ButtonStyle.Primary),
      ),
    ];
  }

  const action = state.resources.action;
  const noSpinsLeft = state.spinsUsed >= state.config.maxSpinsPerRound;

  const wagerRow = new ActionRowBuilder().addComponents(
    wagerButton(state.id, 1, action < 1 || noSpinsLeft),
    wagerButton(state.id, 2, action < 2 || noSpinsLeft),
    wagerButton(state.id, 3, action < 3 || noSpinsLeft),
    new ButtonBuilder()
      .setCustomId(customId(state.id, 'bet', 'all'))
      .setLabel(`全部投入（${action}）`)
      .setEmoji('🔥')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(action < 1 || noSpinsLeft),
  );

  const utilityRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId(state.id, 'end'))
      .setLabel('結束抽選')
      .setEmoji('⏹️')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(customId(state.id, 'abandon'))
      .setLabel('放棄戰鬥')
      .setEmoji('🏳️')
      .setStyle(ButtonStyle.Danger),
  );

  return [wagerRow, utilityRow];
}

function wagerButton(gameId, wager, disabled) {
  return new ButtonBuilder()
    .setCustomId(customId(gameId, 'bet', String(wager)))
    .setLabel(`投入${wager}點`)
    .setEmoji('🎟️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled);
}

function customId(gameId, action, value) {
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

  if (state.status === GameStatus.ABANDONED) {
    return '本場測試已結束。';
  }

  return [
    `**Boss 行動預告：本回合將造成 ${getBossIntent(state)} 點傷害**`,
    `本回合還能抽選 ${state.config.maxSpinsPerRound - state.spinsUsed} 次。`,
  ].join('\n');
}

function resourceLine(state) {
  return [
    `🎟️ 行動 **${state.resources.action}**`,
    `⚔️ 攻擊 **${state.resources.attack}**`,
    `🛡️ 防禦 **${state.resources.defense}**`,
    `✨ ${state.config.commands.skill.name} **${state.resources.skill}**`,
  ].join('　');
}

function lastSpinText(state) {
  if (!state.lastSpin) return null;

  if (state.lastSpin.stunned) {
    return `${formatReels(state.lastSpin.reels)}\n三個不幸：本回合暈眩。`;
  }

  const awarded = state.lastSpin.awarded;
  return [
    formatReels(state.lastSpin.reels),
    `投入 **${state.lastSpin.wager}** 點 → ⚔️ +${awarded.attack}　🛡️ +${awarded.defense}　✨ +${awarded.skill}`,
  ].join('\n');
}

function lastResolutionText(state) {
  const result = state.lastResolution;
  if (!result) return null;

  if (result.stunned) {
    return `第${result.round}回合暈眩，未執行任何指令，受到 **${result.damageTaken}** 點傷害。`;
  }

  const discarded = result.discardedAction > 0
    ? `；未使用行動點 ${result.discardedAction} 點已消失`
    : '';

  return [
    `造成 **${result.attackDamage + (result.skillDamage ?? 0)}** 傷害；恢復 **${result.healing}** 生命。`,
    `防禦 **${result.defense}**／Boss攻擊 **${result.bossAttack}**／受到 **${result.damageTaken}** 傷害${discarded}。`,
  ].join('\n');
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
      return `${definition.emoji}${definition.name}×${status.stacks}（${status.remainingTurns}回合）`;
    }).join('、');
    return `${label}：${text}`;
  });

  return lines.length ? lines.join('\n') : null;
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
