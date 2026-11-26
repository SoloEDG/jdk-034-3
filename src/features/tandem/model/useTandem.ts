import { computed, ref } from 'vue';
import type {
  ClimberId, Limb, Plan, TeamContacts, TandemAttempt, TandemFrame, TandemPreview,
} from '../../../shared/types';
import { climberDone, evaluateTandem, isFinished, legalMoves, type TandemLevel } from '../lib/mechanics';
import { planTandem } from '../lib/planner';

const storageKey = 'crux-tandem-attempts-v1';

function readAttempts(): TandemAttempt[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]') as TandemAttempt[];
    if (!Array.isArray(raw)) return [];
    return raw.filter(item => item && typeof item.id === 'string' && Array.isArray(item.frames)
      && (item.result === 'success' || item.result === 'fall' || item.result === 'stalemate')).slice(0, 20);
  } catch {
    return [];
  }
}

export function useTandem(level: TandemLevel) {
  const team = ref<TeamContacts>({ a: { ...level.start.a }, b: { ...level.start.b } });
  const energy = ref<Record<ClimberId, number>>({ a: level.params.energy, b: level.params.energy });
  const turn = ref<ClimberId>('a');
  const selectedLimb = ref<Limb>('rh');
  const target = ref<string | null>(null);
  const frames = ref<TandemFrame[]>([]);
  const result = ref<'success' | 'fall' | 'stalemate' | null>(null);
  /** 坠落瞬间冻结的双方姿态 */
  const frozen = ref<TeamContacts | null>(null);
  const peak = ref(0);
  const attempts = ref<TandemAttempt[]>(readAttempts());
  const stored = ref(true);

  /** 计划在首帧之后异步生成，避免阻塞界面 */
  const plans = ref<Plan[]>([]);
  const planning = ref(false);

  const preview = computed<TandemPreview | null>(() => {
    if (!target.value) return null;
    return evaluateTandem(level, team.value, energy.value, turn.value, selectedLimb.value, target.value);
  });

  const locked = computed(() => result.value !== null);

  function reset() {
    team.value = { a: { ...level.start.a }, b: { ...level.start.b } };
    energy.value = { a: level.params.energy, b: level.params.energy };
    turn.value = 'a';
    selectedLimb.value = 'rh';
    target.value = null;
    frames.value = [];
    result.value = null;
    frozen.value = null;
    peak.value = 0;
    plans.value = [];
    planning.value = false;
  }

  function chooseLimb(limb: Limb) {
    if (locked.value) return;
    selectedLimb.value = limb;
    target.value = null;
  }

  function choose(id: string) {
    if (locked.value) return;
    target.value = id;
  }

  function execute() {
    if (locked.value || !preview.value) return;
    commit(preview.value);
  }

  /** 按联合解法的一步执行；只允许当前该出手的一方，且不允许故意失败 */
  function runPlanStep(side: ClimberId, limb: Limb, holdId: string) {
    if (locked.value || side !== turn.value) return false;
    const move = evaluateTandem(level, team.value, energy.value, side, limb, holdId);
    if (!move || move.failure) return false;
    commit(move);
    return true;
  }

  function commit(move: TandemPreview): TandemFrame | null {
    const side = move.move.climber;
    const before: TeamContacts = { a: { ...team.value.a }, b: { ...team.value.b } };
    const energyBefore = { ...energy.value };
    const frame: TandemFrame = {
      ...move,
      before,
      energyBefore,
      energyAfter: { ...energyBefore, [side]: Math.max(0, energyBefore[side] - move.cost) },
      peakBefore: peak.value,
      peakAfter: Math.max(peak.value, move.bar.load),
    };
    frames.value = [...frames.value, frame];
    peak.value = frame.peakAfter;
    target.value = null;

    if (move.failure) {
      // 冻结双方在最末的共同姿态
      result.value = 'fall';
      frozen.value = before;
      record('fall');
      return frame;
    }
    const nextTeam: TeamContacts = { ...team.value, [side]: move.next };
    const nextEnergy = frame.energyAfter;
    team.value = nextTeam;
    energy.value = nextEnergy;
    if (isFinished(level, nextTeam)) {
      result.value = 'success';
      frozen.value = null;
      record('success');
      return frame;
    }
    const other: ClimberId = side === 'a' ? 'b' : 'a';
    const otherCanMove = !climberDone(level, nextTeam, other) && legalMoves(level, nextTeam, nextEnergy, other).length > 0;
    const selfCanMove = !climberDone(level, nextTeam, side) && legalMoves(level, nextTeam, nextEnergy, side).length > 0;
    if (!otherCanMove && !selfCanMove) {
      // 双方都无合法动作，也无法继续推进 —— 视作僵持，同样冻结双方
      result.value = 'stalemate';
      frozen.value = nextTeam;
      record('stalemate');
      return frame;
    }
    turn.value = otherCanMove ? other : side;
    return frame;
  }

  function record(outcome: 'success' | 'fall' | 'stalemate') {
    const attempt: TandemAttempt = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()),
      levelId: level.id,
      result: outcome,
      frames: [...frames.value],
      frozen: frozen.value ? { a: { ...frozen.value.a }, b: { ...frozen.value.b } } : { a: { ...team.value.a }, b: { ...team.value.b } },
      at: Date.now(),
    };
    attempts.value = [attempt, ...attempts.value].slice(0, 20);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(attempts.value));
      stored.value = true;
    } catch {
      stored.value = false;
    }
  }

  /** 生成联合解候选（最少动作 / 最小峰值） */
  function generatePlans() {
    if (planning.value) return;
    planning.value = true;
    // 让首帧先绘制，再执行搜索
    window.setTimeout(() => {
      try {
        plans.value = planTandem(level);
      } finally {
        planning.value = false;
      }
    }, 0);
  }

  return {
    level, team, energy, turn, selectedLimb, target, frames, result, frozen, peak, attempts, stored,
    preview, plans, planning, locked,
    reset, chooseLimb, choose, execute, runPlanStep, generatePlans,
  };
}
