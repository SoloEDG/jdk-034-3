import type { ClimberId, Plan, PlanStep, TeamContacts, TandemPreview } from '../../../shared/types';
import { LIMBS, candidatesOf, evaluateTandem, holdOf, isFinished, teamKey, type TandemLevel } from './mechanics';

interface Node {
  team: TeamContacts;
  energy: Record<ClimberId, number>;
  turn: ClimberId;
}

interface SearchResult {
  key: string;
  moves: number;
  parent: Map<string, string | null>;
  chosen: Map<string, TandemPreview>;
}

export interface PlanOptions {
  /** 单个搜索的状态扩展上限 */
  maxNodes?: number;
  /** 规划总耗时上限（毫秒），保证 UI 不会被阻塞太久 */
  maxMs?: number;
  /**
   * 只走「上升」动作（落点更高，或直接到终点）。
   * 攀岩计划天然单调，开启后搜索量下降一个数量级；关闭则允许先退再进。
   */
  monotone?: boolean;
}

/**
 * 分层 BFS：每层代表一个动作数，按回合交替扩展甲乙的动作。
 * 只保留「每个状态的最少动作数」，并以峰值负载上限 cap 剪枝。
 * 动作成本恒正，第一次到达终点即为该上限下的最少动作解。
 */
function searchWithinCap(level: TandemLevel, cap: number, budget: number, deadline: number, maxNodes: number, monotone: boolean): SearchResult | null {
  const start: Node = {
    team: { a: { ...level.start.a }, b: { ...level.start.b } },
    energy: { a: level.params.energy, b: level.params.energy },
    turn: 'a',
  };
  const startKey = keyOf(start);
  const visited = new Map<string, number>([[startKey, 0]]);
  const parent = new Map<string, string | null>([[startKey, null]]);
  const chosen = new Map<string, TandemPreview>();

  let moves = 0;
  let layer: Array<{ key: string; node: Node }> = [{ key: startKey, node: start }];
  let expanded = 0;

  while (layer.length && moves < budget) {
    const next: Array<{ key: string; node: Node }> = [];
    for (const item of layer) {
      if ((visited.get(item.key) ?? Infinity) < moves) continue;
      if (isFinished(level, item.node.team)) return { key: item.key, moves, parent, chosen };
      expanded += 1;
      if (expanded > maxNodes) return null;
      if ((expanded & 255) === 0 && Date.now() > deadline) return null;

      const side = item.node.turn;
      for (const limb of LIMBS) {
        const current = holdOf(level, item.node.team[side][limb]);
        for (const hold of candidatesOf(level, side, limb)) {
          if (monotone && !(hold.y < current.y - 0.5 || hold.id === level.finish[side].hold)) continue;
          const preview = evaluateTandem(level, item.node.team, item.node.energy, side, limb, hold.id);
          if (!preview || preview.failure) continue;
          if (preview.bar.load > cap) continue;
          const nextEnergy = item.node.energy[side] - preview.cost;
          if (nextEnergy < 0) continue;
          const nextNode: Node = {
            team: { ...item.node.team, [side]: preview.next },
            energy: { ...item.node.energy, [side]: nextEnergy },
            turn: side === 'a' ? 'b' : 'a',
          };
          const nextKey = keyOf(nextNode);
          if ((visited.get(nextKey) ?? Infinity) <= moves + 1) continue;
          visited.set(nextKey, moves + 1);
          parent.set(nextKey, item.key);
          chosen.set(nextKey, preview);
          next.push({ key: nextKey, node: nextNode });
        }
      }
    }
    layer = next;
    moves += 1;
  }
  return null;
}

function keyOf(node: Node) {
  return teamKey(node.team, node.energy) + '|' + node.turn;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function signature(plan: Plan) {
  return plan.steps.map(step => step.move.climber + step.move.limb + step.move.from + step.move.target).join('>');
}

function pathOf(result: SearchResult) {
  const path: TandemPreview[] = [];
  let cursor: string | null = result.key;
  while (cursor) {
    const preview = result.chosen.get(cursor);
    if (preview) path.push(preview);
    cursor = result.parent.get(cursor) ?? null;
  }
  return path.reverse();
}

function peakOf(result: SearchResult) {
  return round1(pathOf(result).reduce((peak, preview) => Math.max(peak, preview.bar.load), 0));
}

function toPlan(level: TandemLevel, result: SearchResult, objective: Plan['objective']): Plan {
  const path = pathOf(result);
  let peak = 0;
  const energy: Record<ClimberId, number> = { a: level.params.energy, b: level.params.energy };
  const steps: PlanStep[] = path.map(preview => {
    const side = preview.move.climber;
    energy[side] = Math.max(0, energy[side] - preview.cost);
    peak = Math.max(peak, preview.bar.load);
    return { ...preview, energyAfter: { ...energy }, peakAfter: round1(peak) };
  });
  return { objective, steps, moves: steps.length, peakLoad: round1(peak), energy: { ...energy } };
}

function refinePeak(level: TandemLevel, seed: Plan, budget: number, deadline: number, maxNodes: number, monotone: boolean) {
  let low = 0;
  let high = seed.peakLoad;
  let best: SearchResult | null = null;
  while (high - low > 0.4 && Date.now() < deadline) {
    const probe = Math.round(((low + high) / 2) * 2) / 2;
    const attempt = searchWithinCap(level, probe, budget, deadline, maxNodes, monotone);
    if (attempt) {
      best = attempt;
      high = Math.min(high, peakOf(attempt));
    } else {
      low = probe + 0.5;
    }
  }
  return best;
}

/**
 * 返回候选联合解：
 *  - 最少动作：预算内动作数最少的计划
 *  - 最小峰值：对其峰值上限二分，取仍能在预算内完成的最紧上限
 * 若两者序列相同则只保留一条。
 */
export function planTandem(level: TandemLevel, options: PlanOptions = {}): Plan[] {
  const { maxNodes = 20000, maxMs = 700, monotone = true } = options;
  const deadline = Date.now() + maxMs;
  const budget = level.params.budget;

  const fastest = searchWithinCap(level, Infinity, budget, deadline, maxNodes, monotone)
    ?? searchWithinCap(level, Infinity, budget, deadline, maxNodes, false);
  if (!fastest) return [];
  const minMovesPlan = toPlan(level, fastest, 'moves');

  let lightest = refinePeak(level, minMovesPlan, budget, deadline, maxNodes, monotone);
  if (!lightest && monotone) lightest = refinePeak(level, minMovesPlan, budget, deadline, maxNodes, false);
  if (!lightest) return [minMovesPlan];
  const lightestPlan = toPlan(level, lightest, 'peak');
  if (signature(lightestPlan) === signature(minMovesPlan)) return [minMovesPlan];
  return [minMovesPlan, lightestPlan];
}
