import { createCatalog, requireDefinition } from './catalog.js';

export const EVENTS = createCatalog([
  {
    id: 'ruins-elite-ambush',
    name: '菁英警戒區',
    tags: ['ruins', 'combat', 'elite-biased'],
    description: '這個區域會以較高機率遭遇菁英怪。',
    outcomes: [
      { type: 'encounter', encounterTableId: 'ruins-elite-encounter', weight: 100 },
    ],
  },
], '事件庫');

export function getEvent(eventId) {
  return requireDefinition(EVENTS, eventId, '事件庫');
}
