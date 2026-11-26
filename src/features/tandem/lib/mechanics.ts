import type {
  BarState, ClimberId, Contacts, Hold, HoldKind, Limb, Point, TeamContacts, TandemFailure, TandemPreview,
} from '../../../shared/types';
import { distance } from '../../../shared/geometry';
import { grip } from '../../wall/lib/holds';
import { isHand } from '../../limbs/lib/reach';
import { moveCost } from '../../stamina/lib/cost';

export const LIMBS: Limb[] = ['lh', 'rh', 'lf', 'rf'];
export const CLIMBERS: ClimberId[] = ['a', 'b'];

export const climberNames: Record<ClimberId, string> = { a: '甲', b: '乙' };

export interface TandemParams {
  tilt: number;
  energy: number;
  budget: number;
  /** 杆的物理长度 */
  rod: number;
  /** 开始绷直（可传力）的间距 */
  tautMin: number;
  /** 绷直后的基础预张力 */
  pretension: number;
  /** 超过 tautMin 后每单位长度增加的负载 */
  stretchK: number;
  /** 横杆最大轴向负载 */
  maxLoad: number;
  /** 每单位支撑缺口需要的轴力系数 */
  assistK: number;
  /** 轴向支援低于此值视为无法借力 */
  alignMin: number;
  /** 队友最低支撑余量，低于则无法承担借力 */
  braceMin: number;
  /** 单独腾手的基础代价 */
  hangPenalty: number;
  /** 借力动作额外体力 */
  assistCost: number;
  /** 手高于身体的免罚距离 */
  highFree: number;
  /** 每超出 1 单位的高位需求 */
  highDiv: number;
  /** 甲乙各自的活动区 [xMin, xMax, yMin, yMax] */
  zone: Record<ClimberId, [number, number, number, number]>;
}

export interface TandemLevel {
  id: string;
  name: string;
  grade: string;
  color: string;
  holds: Hold[];
  start: TeamContacts;
  finish: Record<ClimberId, { limb: Limb; hold: string }>;
  params: TandemParams;
}

export const failureText: Record<TandemFailure, string> = {
  reach: '超出可触及范围',
  slack: '横杆松弛，无法借力',
  align: '杆力方向与失衡不一致',
  partner: '队友支撑不足，无法承担借力',
  support: '身体支撑不足，发生失衡',
  zone: '杆端越出各自活动区',
  span: '两人间距超出杆长',
  load: '横杆轴向负载超限',
  energy: '剩余体力不足',
};

export const failureOrder: TandemFailure[] = ['reach', 'slack', 'align', 'partner', 'support', 'zone', 'span', 'load', 'energy'];

const holdMapCache = new WeakMap<TandemLevel, Map<string, Hold>>();

export function holdMap(level: TandemLevel) {
  let map = holdMapCache.get(level);
  if (!map) {
    map = new Map(level.holds.map(hold => [hold.id, hold]));
    holdMapCache.set(level, map);
  }
  return map;
}

export function holdOf(level: TandemLevel, id: string) {
  const hold = holdMap(level).get(id);
  if (!hold) throw new Error('未知岩点 ' + id);
  return hold;
}

function centroid(points: Point[]): Point {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

/** 身体重心：双手与双脚质心的加权混合，和单人关一致 */
export function bodyOf(level: TandemLevel, contacts: Contacts): Point {
  const hands = centroid([holdOf(level, contacts.lh), holdOf(level, contacts.rh)]);
  const feet = centroid([holdOf(level, contacts.lf), holdOf(level, contacts.rf)]);
  return { x: hands.x * .52 + feet.x * .48, y: hands.y * .53 + feet.y * .47 };
}

export interface BalanceDetail {
  margin: number;
  span: number;
}

/** 支撑余量。released 为即将离点的肢体。 */
export function balanceOf(level: TandemLevel, contacts: Contacts, released?: Limb): BalanceDetail {
  const { params } = level;
  const anchors = LIMBS.filter(limb => limb !== released).map(limb => holdOf(level, contacts[limb]));
  const body = bodyOf(level, contacts);
  const span = Math.max(...anchors.map(anchor => distance(body, anchor)));
  const leverage = Math.abs(body.x - centroid(anchors).x) / 34;
  const strength = anchors.reduce((sum, anchor) => sum + grip[anchor.kind].support, 0);
  const handTop = Math.min(...LIMBS.filter(limb => limb !== released && isHand(limb)).map(limb => holdOf(level, contacts[limb]).y));
  const high = Math.max(0, (body.y - handTop) - params.highFree) / params.highDiv;
  const hang = released && isHand(released) ? params.hangPenalty : 0;
  const demand = 4.1 + params.tilt / 36 + leverage + Math.max(0, span - 106) / 62 + high + hang;
  return { margin: Math.round((strength - demand) * 10) / 10, span: Math.round(span) };
}

export function barOf(level: TandemLevel, team: TeamContacts, force = 0, extraSep = 0): BarState {
  const { params } = level;
  const sep = distance(bodyOf(level, team.a), bodyOf(level, team.b));
  const check = Math.max(sep, extraSep);
  const taut = sep >= params.tautMin;
  const base = taut ? params.pretension + Math.max(0, sep - params.tautMin) * params.stretchK : 0;
  return {
    sep: round1(sep),
    check: round1(check),
    slack: round1(Math.max(0, params.tautMin - sep)),
    taut,
    base: round1(base),
    force: round1(force),
    load: round1(base + force),
    over: round1(Math.max(0, check - params.rod)),
    ratio: Math.round(sep / params.rod * 1000) / 1000,
  };
}

/**
 * 横杆轴向对失衡的支援系数：
 * 杆力沿「自身→队友」方向，与失衡向量同向时才能真正分担体重。
 */
export function alignOf(level: TandemLevel, team: TeamContacts, side: ClimberId, released: Limb): number {
  const other: ClimberId = side === 'a' ? 'b' : 'a';
  const body = bodyOf(level, team[side]);
  const partner = bodyOf(level, team[other]);
  const dx = partner.x - body.x;
  const dy = partner.y - body.y;
  const sep = Math.hypot(dx, dy);
  if (sep < 1) return 0;
  const anchors = LIMBS.filter(limb => limb !== released).map(limb => holdOf(level, team[side][limb]));
  const anchorCenter = centroid(anchors);
  const vx = body.x - anchorCenter.x;
  const vy = body.y - anchorCenter.y;
  const magnitude = Math.hypot(vx, vy);
  if (magnitude < 1e-6) return 0;
  const dot = (dx / sep) * vx + (dy / sep) * vy;
  return Math.round(Math.max(0, dot / magnitude) * 1000) / 1000;
}

export function inZone(level: TandemLevel, side: ClimberId, point: Point) {
  const [xMin, xMax, yMin, yMax] = level.params.zone[side];
  return point.x >= xMin - .5 && point.x <= xMax + .5 && point.y >= yMin && point.y <= yMax;
}

/** 复刻单人关的可触及公式，但取本关的倾角参数。 */
export function reachOf(level: TandemLevel, contacts: Contacts, limb: Limb, target: string, energy: number) {
  const hold = holdOf(level, target);
  const body = bodyOf(level, contacts);
  const hand = isHand(limb);
  const origin = { x: body.x + (limb.startsWith('l') ? -18 : 18), y: body.y + (hand ? -33 : 26) };
  const reach = Math.round((hand ? 169 : 130) + grip[hold.kind].reach - level.params.tilt * .45 - Math.max(0, Math.min(28 - energy, 28)) * .45);
  return {
    distance: Math.round(distance(origin, hold)),
    reach,
    travel: distance(holdOf(level, contacts[limb]), hold),
  };
}

/**
 * 检查单人能否踩到目标点（只校验手/脚类型与占用），返回 false 表示目标本身非法。
 */
export function targetAllowed(level: TandemLevel, team: TeamContacts, side: ClimberId, limb: Limb, target: string) {
  const other: ClimberId = side === 'a' ? 'b' : 'a';
  const hold = holdOf(level, target);
  if (!(hold.id[0] === 'L' ? side === 'a' : hold.id[0] === 'R' ? side === 'b' : true)) return false;
  if (isHand(limb) === (hold.kind === 'step')) return false;
  if (team[side][limb] === target) return false;
  if (Object.values(team[side]).includes(target)) return false;
  if (Object.values(team[other]).includes(target)) return false;
  const finish = level.finish[side];
  if (limb === finish.limb && team[side][limb] === finish.hold) return false;
  return true;
}

/** 完整的双人动作预演：支撑、借力、杆长、负载、活动区。 */
export function evaluateTandem(level: TandemLevel, team: TeamContacts, energy: Record<ClimberId, number>, side: ClimberId, limb: Limb, target: string): TandemPreview | null {
  if (!targetAllowed(level, team, side, limb, target)) return null;
  const { params } = level;
  const other: ClimberId = side === 'a' ? 'b' : 'a';
  const hold = holdOf(level, target);
  const measure = reachOf(level, team[side], limb, target, energy[side]);
  const release = balanceOf(level, team[side], limb).margin;
  const next: Contacts = { ...team[side], [limb]: target };
  const landing = balanceOf(level, next).margin;
  const nextTeam: TeamContacts = { ...team, [side]: next };
  const pre = barOf(level, team);
  const partnerMargin = balanceOf(level, team[other]).margin;
  const partnerFull = new Set(Object.values(team[other])).size === 4;
  const deficit = Math.max(0, -release);
  const align = alignOf(level, team, side, limb);
  let force = 0;
  let reason: TandemFailure | null = null;
  if (deficit > 0) {
    if (!pre.taut) reason = 'slack';
    else if (align < params.alignMin) reason = 'align';
    else if (!partnerFull || partnerMargin < params.braceMin) reason = 'partner';
    else force = Math.ceil(deficit * params.assistK / align);
  }
  const extraSep = distance(bodyOf(level, next), bodyOf(level, team[other]));
  const post = barOf(level, nextTeam, force, extraSep);
  const cost = moveCost(measure.travel, hold.kind as HoldKind, params.tilt, Math.min(release, landing)) + (force > 0 ? params.assistCost : 0);
  const bodyNext = bodyOf(level, next);
  let failure: TandemFailure | null = null;
  if (measure.distance > measure.reach) failure = 'reach';
  else if (reason) failure = reason;
  else if (release < 0 && force <= 0) failure = 'support';
  else if (landing < 0) failure = 'support';
  else if (!inZone(level, side, bodyNext)) failure = 'zone';
  else if (post.check > params.rod) failure = 'span';
  else if (post.load > params.maxLoad) failure = 'load';
  else if (energy[side] < cost) failure = 'energy';
  return {
    move: { climber: side, limb, from: team[side][limb], target },
    next, cost, distance: measure.distance, reach: measure.reach, travel: measure.travel,
    release, landing, deficit: round1(deficit), align, force, assisted: force > 0,
    partnerMargin, partnerFull, bar: post, failure, bodyNext,
  };
}

/** 枚举某一方的所有可行动作（供提示与求解器使用）。 */
export function legalMoves(level: TandemLevel, team: TeamContacts, energy: Record<ClimberId, number>, side: ClimberId) {
  const out: TandemPreview[] = [];
  for (const limb of LIMBS) {
    for (const hold of candidatesOf(level, side, limb)) {
      const preview = evaluateTandem(level, team, energy, side, limb, hold.id);
      if (preview && !preview.failure) out.push(preview);
    }
  }
  return out;
}

const candidateCache = new WeakMap<TandemLevel, Record<ClimberId, Record<Limb, Hold[]>>>();

/**
 * 某侧某肢体可尝试的岩点：只保留本侧活动区所属车道、且手脚类型匹配的岩点。
 * 求解器与 UI 都用它避免枚举明显不可能的落点。
 */
export function candidatesOf(level: TandemLevel, side: ClimberId, limb: Limb): Hold[] {
  let cache = candidateCache.get(level);
  if (!cache) {
    cache = { a: { lh: [], rh: [], lf: [], rf: [] }, b: { lh: [], rh: [], lf: [], rf: [] } };
    for (const climber of CLIMBERS) {
      for (const arm of LIMBS) {
        const hand = isHand(arm);
        cache[climber][arm] = level.holds.filter(hold => {
          const lane = hold.id.startsWith('L') ? 'a' : hold.id.startsWith('R') ? 'b' : null;
          return lane === climber && (hold.kind === 'step') !== hand;
        });
      }
    }
    candidateCache.set(level, cache);
  }
  return cache[side][limb];
}

/** 某一位攀爬者是否已经完成自己的终点动作。 */
export function climberDone(level: TandemLevel, team: TeamContacts, side: ClimberId) {
  const finish = level.finish[side];
  return team[side][finish.limb] === finish.hold;
}

export function isFinished(level: TandemLevel, team: TeamContacts) {
  return CLIMBERS.every(side => team[side][level.finish[side].limb] === level.finish[side].hold);
}

export function teamKey(team: TeamContacts, energy: Record<ClimberId, number>) {
  return CLIMBERS.map(side => LIMBS.map(limb => team[side][limb]).join(',')).join('|') + '|' + energy.a + '|' + energy.b;
}

/** 预演中特别提示「缺少的可行姿态 / 需要先移动的队友」 */
export interface MissingPose {
  /** 接受动作的一方 */
  side: ClimberId;
  /** 当前失败原因 */
  failure: TandemFailure;
  /** 需要的间距调整（若超杆长） */
  over: number;
  /** 需要先移动的队友 */
  teammate: ClimberId | null;
  /** 队友需要达到的最低支撑余量 */
  needMargin: number | null;
  /** 提示用可行落点建议 */
  hint: string;
}

export function diagnose(level: TandemLevel, team: TeamContacts, energy: Record<ClimberId, number>, preview: TandemPreview | null, side: ClimberId): MissingPose | null {
  if (!preview || !preview.failure) return null;
  const other: ClimberId = side === 'a' ? 'b' : 'a';
  const move = preview.move;

  // 先尝试一个具体可执行的补救：队友换一个落点后，这次动作能否成立
  for (const limb of LIMBS) {
    for (const hold of candidatesOf(level, other, limb)) {
      const candidate = evaluateTandem(level, team, energy, other, limb, hold.id);
      if (!candidate || candidate.failure) continue;
      const shifted: TeamContacts = { ...team, [other]: candidate.next };
      const retry = evaluateTandem(level, shifted, energy, side, move.limb, move.target);
      if (!retry || retry.failure) continue;
      const holdInfo = holdOf(level, candidate.move.target);
      return {
        side, failure: preview.failure, over: preview.bar.over,
        teammate: other, needMargin: level.params.braceMin,
        hint: '缺少可行姿态：先让' + climberNames[other] + '把' + limbLabel(candidate.move.limb) + '移到 '
          + candidate.move.target + '（' + holdName(holdInfo) + '），再执行这次 ' + limbLabel(move.limb) + '→' + move.target + '。',
      };
    }
  }

  // 没有一步到位的补救时，给出针对性的方向性提示
  if (preview.failure === 'span') {
    let retreat: { sep: number; text: string } | null = null;
    const currentSep = barOf(level, team).sep;
    for (const limb of LIMBS) {
      for (const hold of candidatesOf(level, other, limb)) {
        const candidate = evaluateTandem(level, team, energy, other, limb, hold.id);
        if (!candidate || candidate.failure) continue;
        const sep = barOf(level, { ...team, [other]: candidate.next }).sep;
        if (sep >= currentSep - 1) continue;
        const text = climberNames[other] + '可把' + limbLabel(candidate.move.limb) + '移到 ' + candidate.move.target
          + '，间距缩到 ' + sep + '。';
        if (!retreat || sep < retreat.sep) retreat = { sep, text };
      }
    }
    const body = retreat
      ? (retreat.sep <= level.params.rod
        ? '先这样缩短间距到杆长以内：' + retreat.text
        : '即使' + retreat.text + '仍超出杆长，需要两边一起向各自外侧退。')
      : climberNames[other] + '也没有能立刻缩短间距的落点，双方需各自向活动区外侧退一步。';
    return {
      side, failure: 'span', over: preview.bar.over,
      teammate: other, needMargin: null,
      hint: '两人间距 ' + preview.bar.check + '，超出杆长 ' + preview.bar.over + '；' + body,
    };
  }
  if (preview.failure === 'load') {
    return {
      side, failure: 'load', over: 0, teammate: other, needMargin: null,
      hint: '轴向负载 ' + preview.bar.load + ' 超出上限 ' + level.params.maxLoad + '；先让' + climberNames[other]
        + '换到与' + climberNames[side] + '高度更接近、杆长伸展更小的岩点，再借力。',
    };
  }
  if (preview.failure === 'partner') {
    return {
      side, failure: 'partner', over: 0, teammate: other,
      needMargin: level.params.braceMin,
      hint: climberNames[other] + '当前支撑余量 ' + preview.partnerMargin + '，低于可借力门槛 ' + level.params.braceMin
        + '；先让' + climberNames[other] + '换到更稳的岩点。',
    };
  }
  if (preview.failure === 'slack') {
    return {
      side, failure: 'slack', over: 0, teammate: other, needMargin: null,
      hint: '横杆仍有 ' + preview.bar.slack + ' 的松弛量，无法传力；需要先让' + climberNames[other] + '向外移动把杆绷直。',
    };
  }
  if (preview.failure === 'align') {
    return {
      side, failure: 'align', over: 0, teammate: other, needMargin: null,
      hint: '杆力方向（轴向支援 ' + preview.align + '，需 ≥ ' + level.params.alignMin + '）与失衡不一致；需要'
        + climberNames[other] + '移到更高或更偏一侧的位置，让杆力真正分担体重。',
    };
  }
  if (preview.failure === 'zone') {
    return {
      side, failure: 'zone', over: 0, teammate: null, needMargin: null,
      hint: climberNames[side] + '的落点会让重心越出自己的活动区；换用更靠内的落点，或先调整双脚位置。',
    };
  }
  if (preview.failure === 'support') {
    return {
      side, failure: 'support', over: 0, teammate: other, needMargin: level.params.braceMin,
      hint: '支撑不足导致失衡；要么改用更稳的落点，要么先让' + climberNames[other] + '调整到杆能对齐的位置再借力。',
    };
  }
  return null;
}

const limbLabels: Record<Limb, string> = { lh: '左手', rh: '右手', lf: '左脚', rf: '右脚' };
const holdLabels: Record<HoldKind, string> = { jug: '把手点', edge: '薄边点', slope: '斜面点', step: '脚点' };

export function limbLabel(limb: Limb) {
  return limbLabels[limb];
}

export function holdName(hold: Hold) {
  return holdLabels[hold.kind];
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

/** 当前双方姿态下的横杆状态（无预演时用于控制台读数）。 */
export function currentBar(level: TandemLevel, team: TeamContacts): BarState {
  return barOf(level, team);
}
