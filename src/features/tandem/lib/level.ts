import type { Hold, HoldKind } from '../../../shared/types';
import type { TandemLevel, TandemParams } from './mechanics';

const left: Array<[string, number, number, HoldKind]> = [
  ['L1', 232, 436, 'edge'],   // 甲 左手起攀（外侧）
  ['L2', 312, 430, 'edge'],   // 甲 右手起攀（内侧）
  ['L3', 300, 330, 'jug'],    // 甲 右手内侧中段
  ['L4', 296, 236, 'jug'],    // 甲 终点（内侧高位）
  ['L5', 206, 352, 'slope'],  // 甲 左手外侧中段
  ['L6', 232, 196, 'edge'],   // 甲 左手外侧高位
  ['L7', 206, 486, 'step'],   // 甲 左脚起攀
  ['L8', 308, 488, 'step'],   // 甲 右脚起攀
  ['L9', 286, 392, 'step'],   // 甲 右脚内侧一段
  ['L10', 272, 300, 'step'],  // 甲 右脚内侧二段
  ['L11', 196, 404, 'step'],  // 甲 左脚外侧一段
  ['L12', 210, 300, 'step'],  // 甲 左脚外侧二段
];

function mirror(entries: Array<[string, number, number, HoldKind]>): Hold[] {
  const holds: Hold[] = [];
  entries.forEach(([id, x, y, kind], index) => {
    holds.push({ id, x, y, kind, angle: ((index * 37) % 61) - 30 });
    holds.push({ id: 'R' + id.slice(1), x: 720 - x, y, kind, angle: -(((index * 37) % 61) - 30) });
  });
  return holds;
}

const holds = mirror(left);

const params: TandemParams = {
  tilt: 24,
  energy: 90,
  budget: 14,
  rod: 252,
  tautMin: 186,
  pretension: 5,
  stretchK: 1,
  maxLoad: 90,
  assistK: 13,
  alignMin: 0.25,
  braceMin: 0.1,
  hangPenalty: 3.4,
  assistCost: 2,
  highFree: 44,
  highDiv: 24,
  zone: { a: [50, 352, 50, 548], b: [368, 670, 50, 548] },
};

export const tandemLevel: TandemLevel = {
  id: 'tether',
  name: '连体横杆',
  grade: 'V3+',
  color: '#8fd3c2',
  holds,
  start: {
    a: { lh: 'L1', rh: 'L2', lf: 'L7', rf: 'L8' },
    b: { lh: 'R2', rh: 'R1', lf: 'R8', rf: 'R7' },
  },
  finish: {
    a: { limb: 'rh', hold: 'L4' },
    b: { limb: 'lh', hold: 'R4' },
  },
  params,
};

export const tandemLevels: TandemLevel[] = [tandemLevel];
