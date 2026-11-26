<script setup lang="ts">
import type { ClimberId, Limb, TeamContacts } from '../../../shared/types';
import { CLIMBERS, LIMBS, climberNames, type TandemLevel } from '../lib/mechanics';

const props = defineProps<{
  level: TandemLevel;
  turn: ClimberId;
  selectedLimb: Limb;
  team: TeamContacts;
  locked: boolean;
}>();

const limbNames: Record<Limb, string> = { lh: '左手', rh: '右手', lf: '左脚', rf: '右脚' };
const limbTags: Record<Limb, string> = { lh: 'LH', rh: 'RH', lf: 'LF', rf: 'RF' };
const order = LIMBS;
const sides = CLIMBERS;
const emit = defineEmits<{ chooseLimb: [limb: Limb]; chooseSide: [side: ClimberId] }>();

function pickSide(side: ClimberId) {
  if (props.locked || side === props.turn) return;
  emit('chooseSide', side);
}
</script>

<template>
  <section class="console-section" aria-label="出手方与肢体">
    <h2>出手顺序</h2>
    <div class="turn-row">
      <button v-for="side in sides" :key="side" class="turn-chip" :class="{ current: side === turn }"
        :disabled="locked" :aria-pressed="side === turn" @click="pickSide(side)">
        {{ climberNames[side] }}<small>{{ side === turn ? '该你出手' : '交替出手' }}</small>
      </button>
    </div>
    <div class="limb-grid">
      <button v-for="limb in order" :key="limb" class="limb-button"
        :class="{ selected: limb === selectedLimb }" :disabled="locked"
        :aria-pressed="selectedLimb === limb" :aria-label="limbNames[limb]"
        @click="$emit('chooseLimb', limb)">
        <small>{{ limbTags[limb] }}</small><b>{{ limbNames[limb] }}</b><span>{{ team[turn][limb] }}</span>
      </button>
    </div>
  </section>
</template>
