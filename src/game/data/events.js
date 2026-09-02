import { createCatalog, requireDefinition } from './catalog.js';
import { EventRarity } from './rarities.js';

export const EVENTS = createCatalog([
  {
    id: 'ruins-mysterious-spring',
    name: '神秘泉水',
    rarity: EventRarity.COMMON,
    weight: 100,
    tags: ['ruins'],
    description: '你在遺跡深處發現一座清澈的泉水。水面泛著微弱光芒，但你無法判斷這股力量究竟是祝福，還是某種危險的誘惑。',
    options: [
      {
        id: 'drink',
        label: '飲用泉水',
        outcomes: [
          {
            id: 'restored',
            type: 'full-heal',
            weight: 50,
            text: '泉水入口後，一股溫暖的力量迅速流遍全身。傷口逐漸癒合，原本累積的疲憊也一掃而空。',
          },
          {
            id: 'sealed-skill',
            type: 'seal-random-skill',
            weight: 20,
            text: '泉水的力量在體內失去控制，冰冷的霧氣逐漸籠罩你的記憶。當不適感退去時，某項熟悉的技藝已經變得模糊不清。',
          },
          {
            id: 'restored-elite-approaches',
            type: 'full-heal-start-combat',
            rank: 'elite',
            weight: 20,
            text: '泉水入口後，一股溫暖的力量迅速流遍全身，你的傷勢也隨之完全恢復。正準備離開時，附近卻傳來沉重的腳步聲。另一個被泉水吸引而來的強大生物，已經發現了你的存在！',
          },
          {
            id: 'quenched',
            type: 'continue',
            weight: 10,
            text: '你喝下泉水，除了稍微解渴以外，身體沒有產生任何變化。',
          },
        ],
      },
      {
        id: 'leave',
        label: '離開泉水',
        outcomes: [{
          id: 'left-spring',
          type: 'continue',
          weight: 100,
          text: '你沒有飲用來歷不明的泉水，轉身繼續深入遺跡。',
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
    description: '你發現一間保存完整的密封石室。石門上的封印仍泛著微光，門後不時傳來金屬碰撞的聲響。',
    options: [
      {
        id: 'blood-unseal',
        label: '以鮮血解除封印',
        outcomes: [{
          id: 'blood-unsealed',
          type: 'blood-unseal',
          weight: 100,
          damageMaxHpRatio: 0.2,
          rewardRarity: 'rare',
          rewardType: 'equipment',
          text: '當鮮血滲入刻紋，封印開始逐漸崩解。你忍著生命被抽離的痛楚推開石門，從塵封的石臺上取走一件保存完好的裝備。',
        }],
      },
      {
        id: 'leave',
        label: '離開石室',
        outcomes: [{
          id: 'left-vault',
          type: 'continue',
          weight: 100,
          text: '你沒有觸碰封印。沉重的石門在身後保持沉默，彷彿什麼都未曾發生。',
        }],
      },
    ],
  },
  {
    id: 'ruins-abandoned-camp',
    name: '廢棄營地',
    rarity: EventRarity.COMMON,
    weight: 1,
    available: false,
    tags: ['ruins'],
    description: '你在斷牆後發現一座廢棄營地。火堆早已熄滅，但破損的帳篷仍勉強能夠遮蔽風雨。連日的戰鬥讓你感到疲憊，也許可以在這裡休息片刻。',
    options: [{
      id: 'rest',
      label: '留下休息',
      outcomes: [
        {
          id: 'fully-rested',
          type: 'full-heal',
          weight: 70,
          text: '你重新點燃火堆，在微弱的火光旁沉沉睡去。當你再次醒來時，身上的疲憊與傷勢已經完全消失。',
        },
        {
          id: 'ambushed',
          type: 'start-combat',
          rank: 'normal',
          weight: 30,
          text: '你才剛閉上雙眼，營地外便傳來踩斷枯枝的聲響。黑暗中的腳步正迅速逼近，你立刻握緊武器起身迎戰！',
        },
      ],
    }],
  },
  {
    id: 'ruins-ancient-echo',
    name: '遠古回響',
    rarity: EventRarity.LEGENDARY,
    weight: 100,
    tags: ['ruins'],
    description: '一道不屬於任何生者的低語在遺跡深處迴盪。那些難以理解的聲音逐漸侵入你的意識，似乎正在尋找可以寄宿的軀體。',
    options: [
      {
        id: 'accept',
        label: '接受回響',
        outcomes: [{
          id: 'accepted-echo',
          type: 'reduce-max-hp-upgrade-skill',
          weight: 100,
          maxHpRatio: 0.8,
          text: '你放棄抵抗，任由遠古的聲音刻入身體。部分生命隨著回響逐漸消逝，但一項熟悉的技藝也開始產生變化。',
        }],
      },
      {
        id: 'resist',
        label: '反抗回響',
        outcomes: [{
          id: 'resisted-echo',
          type: 'start-combat',
          rank: 'elite',
          weight: 100,
          text: '你以意志強行撕裂侵入腦海的低語。四周的陰影受到回響牽引，逐漸凝聚成一名遠古守衛，擋住了你的去路！',
        }],
      },
      {
        id: 'leave',
        label: '切斷聯繫',
        outcomes: [{
          id: 'rejected-echo',
          type: 'continue',
          weight: 100,
          text: '你封閉感知，切斷自己與回響之間的聯繫。低語逐漸消失在遺跡深處，你也毫髮無傷地離開了此處。',
        }],
      },
    ],
  },
  {
    id: 'ruins-mysterious-collector',
    name: '神秘收藏家',
    rarity: EventRarity.LEGENDARY,
    weight: 100,
    available: false,
    tags: ['ruins'],
    description: '你在遺跡深處遇見一名戴著銀色面具的收藏家。他的身旁擺著一只刻滿符文的魔導轉輪匣，匣中陳列著一件傳說裝備，另一側則封存著一段失傳的技藝。「選一樣你想要的，再拿你的一項技能作為賭注。四次轉動之內，讓三枚符文排列一致，它就是你的。」',
    options: [
      {
        id: 'challenge-skill',
        label: '挑戰傳說技能',
        outcomes: [{
          id: 'collector-skill-challenge',
          type: 'collector-challenge',
          rewardType: 'skill',
          weight: 100,
          text: '收藏家向你展示了一項失傳的傳說技能。請選擇一項現有技能作為賭注。',
        }],
      },
      {
        id: 'challenge-item',
        label: '挑戰傳說裝備',
        outcomes: [{
          id: 'collector-item-challenge',
          type: 'collector-challenge',
          rewardType: 'equipment',
          weight: 100,
          text: '收藏家向你展示了一件傳說裝備。請選擇一項現有技能作為賭注。',
        }],
      },
      {
        id: 'leave',
        label: '拒絕賭局',
        outcomes: [{
          id: 'collector-left',
          type: 'continue',
          weight: 100,
          text: '你拒絕拿自己的技藝下注。收藏家沒有挽留，只是收起魔導轉輪匣，無聲地消失在遺跡深處。',
        }],
      },
    ],
  },
], '事件庫');

export function getEvent(eventId) {
  return requireDefinition(EVENTS, eventId, '事件庫');
}
