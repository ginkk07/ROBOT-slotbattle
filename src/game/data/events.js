import { createCatalog, requireDefinition } from './catalog.js';
import { EventRarity } from './rarities.js';

export const EVENTS = createCatalog([
  {
    id: 'ruins-mysterious-spring',
    name: '神秘泉水',
    rarity: EventRarity.COMMON,
    weight: 100,
    tags: ['ruins'],
    description: '你遇到一座充滿生命力的泉水，是否要取水喝？',
    options: [
      {
        id: 'drink',
        label: '是',
        outcomes: [
          {
            id: 'restored',
            type: 'full-heal',
            weight: 50,
            text: '你覺得身體裡充滿活力，HP 回滿了。',
          },
          {
            id: 'forgotten-skill',
            type: 'forget-random-skill',
            weight: 20,
            text: '泉水的能量讓身體不適，你隨機遺忘了一個技能。',
          },
          {
            id: 'elite-approaches',
            type: 'start-combat',
            rank: 'elite',
            weight: 20,
            text: '你發現有強大生物也在靠近泉水，進入了戰鬥。',
          },
          {
            id: 'quenched',
            type: 'continue',
            weight: 10,
            text: '你只是解了一點渴。',
          },
        ],
      },
      {
        id: 'leave',
        label: '否',
        outcomes: [{
          id: 'left-spring',
          type: 'continue',
          weight: 100,
          text: '你決定不喝泉水，繼續前進。',
        }],
      },
    ],
  },
  {
    id: 'ruins-sealed-vault',
    name: '密封石室',
    rarity: EventRarity.RARE,
    weight: 100,
    tags: ['ruins'],
    description: '你發現一間保存完整的密封石室。',
    options: [{
      id: 'continue',
      label: '繼續',
      outcomes: [{
        id: 'recorded-clue',
        type: 'continue',
        weight: 100,
        text: '你記下石室裡的線索，繼續深入。',
      }],
    }],
  },
  {
    id: 'ruins-abandoned-camp',
    name: '廢棄營地',
    rarity: EventRarity.COMMON,
    weight: 1,
    available: false,
    tags: ['ruins'],
    description: '你調查了一處廢棄營地。',
    options: [{
      id: 'continue',
      label: '繼續',
      outcomes: [{
        id: 'left-camp',
        type: 'continue',
        weight: 100,
        text: '你整理好行囊後繼續前進。',
      }],
    }],
  },
  {
    id: 'ruins-ancient-echo',
    name: '遠古回響',
    rarity: EventRarity.LEGENDARY,
    weight: 100,
    tags: ['ruins'],
    description: '遠古力量在遺跡深處短暫甦醒。',
    options: [{
      id: 'continue',
      label: '繼續',
      outcomes: [{
        id: 'witnessed-echo',
        type: 'continue',
        weight: 100,
        text: '你見證了罕見的異象，繼續前進。',
      }],
    }],
  },
], '事件庫');

export function getEvent(eventId) {
  return requireDefinition(EVENTS, eventId, '事件庫');
}
