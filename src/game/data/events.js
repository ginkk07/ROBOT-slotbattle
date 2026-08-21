import { createCatalog, requireDefinition } from './catalog.js';
import { EventRarity } from './rarities.js';

export const EVENTS = createCatalog([
  {
    id: 'ruins-abandoned-camp',
    name: '廢棄營地',
    rarity: EventRarity.COMMON,
    weight: 100,
    tags: ['ruins'],
    description: '你調查了一處廢棄營地，整理好行囊後繼續前進。',
    outcomes: [
      { type: 'continue', weight: 100 },
    ],
  },
  {
    id: 'ruins-sealed-vault',
    name: '密封石室',
    rarity: EventRarity.RARE,
    weight: 100,
    tags: ['ruins'],
    description: '你發現一間保存完整的密封石室，記下線索後繼續深入。',
    outcomes: [
      { type: 'continue', weight: 100 },
    ],
  },
  {
    id: 'ruins-ancient-echo',
    name: '遠古回響',
    rarity: EventRarity.LEGENDARY,
    weight: 100,
    tags: ['ruins'],
    description: '遠古力量短暫甦醒，你見證了遺跡深處罕見的異象。',
    outcomes: [
      { type: 'continue', weight: 100 },
    ],
  },
], '事件庫');

export function getEvent(eventId) {
  return requireDefinition(EVENTS, eventId, '事件庫');
}
