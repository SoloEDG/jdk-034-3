export type Limb = 'lh' | 'rh' | 'lf' | 'rf';
export type Contacts = Record<Limb, string>;
export type HoldKind = 'jug' | 'edge' | 'slope' | 'step';

export interface Point {
  x: number;
  y: number;
}

export interface Hold extends Point {
  id: string;
  kind: HoldKind;
  angle: number;
}

export interface Route {
  id: string;
  name: string;
  grade: string;
  color: string;
  tilt: number;
  energy: number;
  start: Contacts;
  finish: string;
  holds: Hold[];
}

export interface Move {
  limb: Limb;
  target: string;
}

export interface Balance {
  margin: number;
  span: number;
}

export type Failure = 'reach' | 'support' | 'energy';

export interface Preview {
  move: Move;
  next: Contacts;
  cost: number;
  distance: number;
  reach: number;
  support: Balance;
  landing: Balance;
  failure: Failure | null;
}

export interface MoveRecord extends Preview {
  before: Contacts;
  energyBefore: number;
  energyAfter: number;
}

export interface Attempt {
  id: string;
  routeId: string;
  result: 'success' | 'fall';
  moves: MoveRecord[];
  at: number;
}

/* ---------- 双人连体支撑关 ---------- */

export type ClimberId = 'a' | 'b';

/** 双人各自四个肢体落点 */
export type TeamContacts = Record<ClimberId, Contacts>;

export type TandemFailure =
  | 'reach'      // 超出可触及范围
  | 'slack'      // 横杆松弛，无法借力
  | 'align'      // 横杆轴向与失衡方向不一致
  | 'partner'    // 队友支撑不足，无法承担借力
  | 'support'    // 身体支撑不足
  | 'zone'       // 杆端越出活动区
  | 'span'       // 两人间距超出杆长
  | 'load'       // 横杆轴向负载超限
  | 'energy';    // 体力不足

/** 横杆（定长杆）状态 */
export interface BarState {
  /** 当前两人身体距离 */
  sep: number;
  /** 动作过程中两人达到的最大距离（含预演落点） */
  check: number;
  /** 松弛量 = tautMin - sep（负值记为 0） */
  slack: number;
  /** 是否已经绷直（可传力） */
  taut: boolean;
  /** 绷直产生的预张力/弯曲负载 */
  base: number;
  /** 为本次动作额外承担的轴力 */
  force: number;
  /** 总轴向负载 = base + force */
  load: number;
  /** 超出杆长的长度 */
  over: number;
  /** 占用杆长比例 */
  ratio: number;
}

/** 单个攀爬者在双人关的落点 */
export interface TandemMove {
  climber: ClimberId;
  limb: Limb;
  from: string;
  target: string;
}

/** 一次双人动作的完整预演 */
export interface TandemPreview {
  move: TandemMove;
  next: Contacts;
  cost: number;
  distance: number;
  reach: number;
  travel: number;
  /** 离点支撑余量（腾手前的净余量） */
  release: number;
  /** 落点支撑余量 */
  landing: number;
  /** 借力缺口 = max(0, -release) */
  deficit: number;
  /** 横杆轴向对失衡的支援系数 */
  align: number;
  /** 借力需要杆承担的轴力 */
  force: number;
  /** 是否借助横杆腾手 */
  assisted: boolean;
  partnerMargin: number;
  partnerFull: boolean;
  bar: BarState;
  failure: TandemFailure | null;
  bodyNext: Point;
}

/** 联合解中的一步 */
export interface PlanStep extends TandemPreview {
  /** 该步执行后两人的体力 */
  energyAfter: Record<ClimberId, number>;
  /** 到该步为止的峰值负载 */
  peakAfter: number;
}

export interface Plan {
  objective: 'moves' | 'peak';
  steps: PlanStep[];
  moves: number;
  peakLoad: number;
  energy: Record<ClimberId, number>;
}

/** 回看用的一步记录（含坠落前共同姿态） */
export interface TandemFrame extends TandemPreview {
  before: TeamContacts;
  energyBefore: Record<ClimberId, number>;
  energyAfter: Record<ClimberId, number>;
  peakBefore: number;
  peakAfter: number;
}

export interface TandemAttempt {
  id: string;
  levelId: string;
  result: 'success' | 'fall' | 'stalemate';
  frames: TandemFrame[];
  /** 坠落瞬间双方姿态 */
  frozen: TeamContacts;
  at: number;
}
