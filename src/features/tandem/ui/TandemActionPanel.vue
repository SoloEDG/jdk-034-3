<script setup lang="ts">
import { computed } from 'vue';
import { ArrowUpRight, Link2, MoveUpRight, TriangleAlert } from 'lucide-vue-next';
import type { ClimberId, TandemPreview, TeamContacts } from '../../../shared/types';
import { limbNames } from '../../limbs';
import { climberNames, diagnose, failureText, type MissingPose, type TandemLevel } from '../lib/mechanics';

const props = defineProps<{
  level: TandemLevel;
  preview: TandemPreview | null;
  side: ClimberId;
  team: TeamContacts;
  energy: Record<ClimberId, number>;
  invalidTarget: boolean;
  locked: boolean;
}>();
defineEmits<{ execute: [] }>();

const pose = computed<MissingPose | null>(() => props.preview
  ? diagnose(props.level, props.team, props.energy, props.preview, props.side)
  : null);
</script>

<template>
  <section class="console-section action-panel" aria-label="双人动作预览">
    <h2>动作预览 · {{ climberNames[side] }}</h2>
    <dl v-if="preview" class="action-data">
      <div><dt>{{ limbNames[preview.move.limb] }} → {{ preview.move.target }}</dt><dd>−{{ preview.cost }} 体力</dd></div>
      <div><dt>距离 / 可触及</dt><dd>{{ preview.distance }} / {{ preview.reach }}</dd></div>
      <div><dt>离点 / 落点支撑余量</dt><dd>{{ preview.release }} / {{ preview.landing }}</dd></div>
      <div><dt>轴向支援 / 借力轴力</dt><dd>{{ preview.align }} / {{ preview.assisted ? preview.force : '—' }}</dd></div>
      <div><dt>队友支撑余量</dt><dd :class="{ warn: preview.partnerMargin < 1.2 }">{{ preview.partnerMargin }}</dd></div>
    </dl>
    <div v-else class="no-action"><MoveUpRight :size="18" />{{ invalidTarget ? '岩点已占用、跨区或与肢体不匹配' : '尚未选择岩点' }}</div>
    <p v-if="preview?.assisted" class="bar-note"><Link2 :size="13" /> {{ climberNames[side] }}借横杆腾手，横杆承担 {{ preview.force }} 轴力</p>
    <p v-if="preview?.failure" class="action-warning" role="status">
      <TriangleAlert :size="15" /> {{ failureText[preview.failure] }}
    </p>
    <p v-if="pose" class="pose-hint" role="status">{{ pose.hint }}</p>
    <button class="execute" :class="{ risky: Boolean(preview?.failure) }" :disabled="!preview || locked" @click="$emit('execute')">
      {{ preview?.failure ? '强行执行 · 会坠落' : '执行动作' }} <ArrowUpRight :size="17" />
    </button>
  </section>
</template>
