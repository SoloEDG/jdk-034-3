<script setup lang="ts">
import { computed } from 'vue';
import { Play, Split, Wand2 } from 'lucide-vue-next';
import type { ClimberId, Limb, Plan, TeamContacts } from '../../../shared/types';
import { evaluateTandem, type TandemLevel } from '../lib/mechanics';

const props = defineProps<{
  level: TandemLevel;
  plans: Plan[];
  planning: boolean;
  turn: ClimberId;
  team: TeamContacts;
  energy: Record<ClimberId, number>;
}>();
defineEmits<{ run: [side: ClimberId, limb: Limb, target: string] }>();

/**
 * 对每条计划，找出「相对当前局面最先仍可执行」的一步的下标。
 * 之前已经执行过的步骤会因为落点被占用而不再可执行，从而被跳过。
 */
const nextIndex = computed(() => props.plans.map(plan => {
  for (let index = 0; index < plan.steps.length; index += 1) {
    const step = plan.steps[index];
    const preview = evaluateTandem(props.level, props.team, props.energy, step.move.climber, step.move.limb, step.move.target);
    if (preview && !preview.failure) return index;
  }
  return -1;
}));

/** 仅当「最先可执行的一步」属于当前出手方时，才允许一键执行。 */
function isRun(index: number, stepIndex: number) {
  const next = nextIndex.value[index];
  if (next !== stepIndex) return false;
  return props.plans[index].steps[stepIndex].move.climber === props.turn;
}

function isDone(index: number, stepIndex: number) {
  const next = nextIndex.value[index];
  return next === -1 ? false : next > stepIndex;
}

function diverged(index: number) {
  const next = nextIndex.value[index];
  if (next === -1) return props.plans[index].steps.length > 0;
  return props.plans[index].steps[next].move.climber !== props.turn;
}
</script>

<template>
  <section class="console-section plan-panel" aria-label="联合解法">
    <h2><Wand2 :size="15" /> 联合解法</h2>
    <p v-if="planning" class="empty">正在搜索预算内的联合解法…</p>
    <template v-else-if="plans.length">
      <div v-for="(plan, index) in plans" :key="plan.objective" class="plan-card">
        <div class="plan-head">
          <b>{{ plan.objective === 'moves' ? '最少动作' : '最小峰值负载' }}</b>
          <span>{{ plan.moves }} 步 · 峰值 {{ plan.peakLoad }} · 末体力 {{ plan.energy.a }}/{{ plan.energy.b }}</span>
        </div>
        <p v-if="diverged(index)" class="plan-diverged"><Split :size="12" /> 当前走法已偏离此计划</p>
        <ol class="plan-steps">
          <li v-for="(step, stepIndex) in plan.steps" :key="stepIndex"
            :class="{ next: isRun(index, stepIndex), done: isDone(index, stepIndex) }">
            <i>{{ stepIndex + 1 }}</i>
            <span>{{ step.move.climber === 'a' ? '甲' : '乙' }} {{ step.move.limb }} {{ step.move.from }}→{{ step.move.target }}</span>
            <em v-if="step.assisted">借力 {{ step.force }}</em>
            <em class="plain">{{ step.bar.load }}</em>
            <button v-if="isRun(index, stepIndex)" class="plan-run" aria-label="执行该步"
              @click="$emit('run', step.move.climber, step.move.limb, step.move.target)">
              <Play :size="11" />
            </button>
          </li>
        </ol>
      </div>
    </template>
    <p v-else class="empty">还没有生成解法</p>
  </section>
</template>
