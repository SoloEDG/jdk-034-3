<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronRight, History, Link2, Snowflake } from 'lucide-vue-next';
import type { ClimberId, Limb, TandemAttempt } from '../../../shared/types';
import { balanceOf, climberNames, currentBar, type TandemLevel } from '../lib/mechanics';
import { useTandem } from '../model/useTandem';
import TandemWall from './TandemWall.vue';
import TandemControls from './TandemControls.vue';
import TandemActionPanel from './TandemActionPanel.vue';
import BarGauge from './BarGauge.vue';
import DuoGauges from './DuoGauges.vue';
import PlanPanel from './PlanPanel.vue';
import TandemReview from './TandemReview.vue';

const props = defineProps<{ level: TandemLevel }>();
const emit = defineEmits<{ exit: [] }>();

const state = useTandem(props.level);
const idleBar = computed(() => currentBar(props.level, state.team.value));
const review = ref<TandemAttempt | null>(null);
const reviewStep = ref(0);

const reviewFrame = computed(() => review.value?.frames[reviewStep.value] ?? null);
/** 对局结束后冻结在最后（坠落）或完成（成功）的姿态 */
const frozenTeam = computed(() => {
  if ((state.result.value === 'fall' || state.result.value === 'stalemate') && state.frozen.value) return state.frozen.value;
  if (state.result.value === 'success') return state.team.value;
  return null;
});
const wallTeam = computed(() => review.value ? (reviewTeam.value ?? state.team.value) : (frozenTeam.value ?? state.team.value));
const wallLocked = computed(() => state.locked.value || Boolean(review.value));
const reviewTeam = computed(() => {
  if (!review.value || !reviewFrame.value) return null;
  const frame = reviewFrame.value;
  return frame.failure ? frame.before : { ...frame.before, [frame.move.climber]: frame.next };
});
const caption = computed(() => {
  if (review.value && reviewFrame.value) {
    return '回看 · ' + review.value.frames.length + ' 步 · 第 ' + (reviewStep.value + 1) + ' 步';
  }
  if (state.result.value === 'fall') return '坠落 · 双方已冻结，可在记录中回看';
  if (state.result.value === 'stalemate') return '僵持 · 双方已冻结，可在记录中回看';
  if (state.result.value === 'success') return '完攀 · ' + state.frames.value.length + ' 步';
  return climberNames[state.turn.value] + ' 出手 · ' + state.frames.value.length + ' 步 · 横杆可借用';
});

const margins = computed(() => ({
  a: balanceOf(props.level, state.team.value.a).margin,
  b: balanceOf(props.level, state.team.value.b).margin,
}));

const fallAttempt = computed(() => state.attempts.value.find(item => item.result !== 'success') ?? null);
const lastAttempt = computed(() => state.attempts.value[0] ?? null);

const attempted = computed(() => {
  const frame = reviewFrame.value;
  if (!frame) return null;
  return { climber: frame.move.climber, limb: frame.move.limb, target: frame.move.target };
});

function choose(id: string) {
  if (review.value) return;
  state.choose(id);
}

function switchSide(side: ClimberId) {
  // 只允许在无动作记录时手动切换先手；之后严格交替
  if (state.frames.value.length) return;
  state.turn.value = side;
}

function chooseLimb(limb: Limb) {
  state.chooseLimb(limb);
}

function runStep(side: ClimberId, limb: Limb, target: string) {
  state.runPlanStep(side, limb, target);
}

function execute() {
  state.execute();
}

function openAttempt(attempt: TandemAttempt) {
  review.value = attempt;
  reviewStep.value = attempt.result === 'success' ? 0 : attempt.frames.length - 1;
}

function closeReview() {
  review.value = null;
  reviewStep.value = 0;
}

function jump(index: number) {
  if (!review.value) return;
  if (index >= 0 && index < review.value.frames.length) reviewStep.value = index;
}

function reset() {
  closeReview();
  state.reset();
}

state.generatePlans();
</script>

<template>
  <main class="workspace tandem-workspace">
    <div class="dashboard">
      <aside class="routes" aria-label="双人关卡">
        <h2><Link2 :size="17" /> 连体关卡</h2>
        <button class="route-button current" :style="{ '--route': level.color }" aria-pressed="true">
          <span class="grade">{{ level.grade }}</span>
          <span class="route-caption"><b>{{ level.name }}</b><small>杆长 {{ level.params.rod }} · 负载上限 {{ level.params.maxLoad }}</small></span>
        </button>
      </aside>

      <TandemWall :level="level" :team="wallTeam" :turn="state.turn.value" :selected-limb="state.selectedLimb.value"
        :locked="wallLocked" :caption="caption" :review-team="reviewTeam"
        :attempted="attempted" :energy="state.energy.value" @choose="choose" @reset="reset" />

      <aside class="console" aria-label="双人控制台">
        <div class="console-head"><Link2 :size="18" /><b>连体控制台</b></div>
        <template v-if="review">
          <BarGauge v-if="reviewFrame" :bar="reviewFrame.bar" :level="level" />
          <TandemReview :attempt="review" :frame="reviewFrame!" :step="reviewStep" @jump="jump" @close="closeReview" />
        </template>
        <template v-else>
          <BarGauge :bar="state.preview.value?.bar ?? idleBar" :level="level" />
          <DuoGauges :level="level" :energy="state.energy.value" :turn="state.turn.value" :margin="margins" :locked="state.locked.value" />
          <TandemControls :level="level" :turn="state.turn.value" :selected-limb="state.selectedLimb.value"
            :team="state.team.value" :locked="state.locked.value" @choose-limb="chooseLimb" @choose-side="switchSide" />
          <TandemActionPanel :level="level" :preview="state.preview.value" :side="state.turn.value"
            :team="state.team.value" :energy="state.energy.value"
            :invalid-target="Boolean(state.target.value && !state.preview.value)" :locked="state.locked.value" @execute="execute" />
          <PlanPanel :level="level" :plans="state.plans.value" :planning="state.planning.value" :turn="state.turn.value"
            :team="state.team.value" :energy="state.energy.value" @run="runStep" />
          <p v-if="!state.stored.value" role="status" class="action-warning">浏览器未能保存此次记录</p>
          <button v-if="state.result.value" class="review-button" @click="lastAttempt && openAttempt(lastAttempt)">
            回看本次挑战 <ChevronRight :size="16" />
          </button>
          <button class="review-button ghost" @click="state.generatePlans()">重新计算联合解法</button>
          <button class="exit-button" @click="$emit('exit')">返回单人挑战 <ChevronRight :size="15" /></button>
        </template>
      </aside>
    </div>

    <section class="attempts tandem-attempts" aria-label="连体挑战记录">
      <div class="section-heading"><h2><History :size="17" /> 连体记录</h2><span>{{ state.attempts.value.length }} 次尝试</span></div>
      <p v-if="!state.attempts.value.length" class="empty">还没有完成的尝试</p>
      <div v-else class="attempt-list">
        <button v-for="item in state.attempts.value" :key="item.id" @click="openAttempt(item)">
          <span class="outcome" :class="item.result">{{ item.result === 'success' ? '完攀' : item.result === 'fall' ? '坠落' : '僵持' }}</span>
          <b>{{ level.name }}</b>
          <span>{{ item.frames.length }} 步</span>
          <ChevronRight :size="15" />
        </button>
      </div>
      <p v-if="fallAttempt" class="frozen-note"><Snowflake :size="14" /> 上次坠落冻结了导致超限的共同姿态，可点开回看。</p>
    </section>
  </main>
</template>
