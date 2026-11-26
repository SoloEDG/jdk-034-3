<script setup lang="ts">
import { BatteryMedium, User } from 'lucide-vue-next';
import type { ClimberId } from '../../../shared/types';
import { climberNames, type TandemLevel } from '../lib/mechanics';

defineProps<{
  level: TandemLevel;
  energy: Record<ClimberId, number>;
  turn: ClimberId;
  margin: Record<ClimberId, number>;
  locked: boolean;
}>();
</script>

<template>
  <section class="console-section duo-panel" aria-label="双方体力">
    <h2><BatteryMedium :size="16" /> 双人体力</h2>
    <div class="duo-grid">
      <div v-for="side in (['a','b'] as ClimberId[])" :key="side" class="duo-card" :class="{ active: side === turn && !locked }">
        <div class="duo-head">
          <span><User :size="13" /> {{ climberNames[side] }}<em v-if="side === turn && !locked">行动中</em></span>
          <b>{{ energy[side] }}<small> / {{ level.params.energy }}</small></b>
        </div>
        <div class="duo-meter" role="meter" :aria-label="climberNames[side] + '体力'" :aria-valuenow="energy[side]" :aria-valuemax="level.params.energy">
          <i :style="{ width: energy[side] / level.params.energy * 100 + '%' }"></i>
        </div>
        <div class="duo-sub"><span>支撑余量</span><b :class="{ warn: margin[side] < 1.2 }">{{ margin[side] }}</b></div>
      </div>
    </div>
  </section>
</template>
