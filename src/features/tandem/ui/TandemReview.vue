<script setup lang="ts">
import { ChevronLeft, ChevronRight, Snowflake, X } from 'lucide-vue-next';
import type { TandemAttempt, TandemFrame } from '../../../shared/types';
import { limbNames } from '../../limbs';
import { climberNames, failureText } from '../lib/mechanics';

defineProps<{ attempt: TandemAttempt; frame: TandemFrame; step: number }>();
defineEmits<{ jump: [index: number]; close: [] }>();
</script>

<template>
  <section class="console-section replay" aria-label="双人回看">
    <div class="section-heading"><h2>双人回看</h2>
      <button class="icon-button" aria-label="关闭回看" @click="$emit('close')"><X :size="17" /></button>
    </div>
    <div class="review-nav">
      <button class="icon-button" aria-label="上一步" :disabled="step === 0" @click="$emit('jump', step - 1)"><ChevronLeft :size="17" /></button>
      <b>第 {{ step + 1 }} / {{ attempt.frames.length }} 步</b>
      <button class="icon-button" aria-label="下一步" :disabled="step === attempt.frames.length - 1" @click="$emit('jump', step + 1)"><ChevronRight :size="17" /></button>
    </div>
    <dl class="action-data">
      <div><dt>出手方</dt><dd>{{ climberNames[frame.move.climber] }} · {{ limbNames[frame.move.limb] }}</dd></div>
      <div><dt>动作</dt><dd>{{ frame.move.from }} → {{ frame.move.target }}</dd></div>
      <div><dt>轴向负载</dt><dd>{{ frame.bar.load }} / {{ frame.peakAfter }} 峰值</dd></div>
      <div><dt>双方体力</dt><dd>甲 {{ frame.energyAfter.a }} · 乙 {{ frame.energyAfter.b }}</dd></div>
      <div><dt>借力轴力</dt><dd>{{ frame.assisted ? frame.force : '无' }}</dd></div>
    </dl>
    <p v-if="frame.failure" class="action-warning" role="status">{{ failureText[frame.failure] }}</p>
    <p v-if="attempt.result !== 'success'" class="frozen-note" role="status">
      <Snowflake :size="14" /> {{ attempt.result === 'fall' ? '坠落已冻结双方；此帧保留导致超限的共同姿态。' : '僵持已冻结双方；此帧是最后可行的共同姿态。' }}
    </p>
  </section>
</template>
