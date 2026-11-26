<script setup lang="ts">
import { computed } from 'vue';
import { Link2, TriangleAlert } from 'lucide-vue-next';
import type { BarState } from '../../../shared/types';
import { type TandemLevel } from '../lib/mechanics';

const props = defineProps<{ bar: BarState; level: TandemLevel }>();

const loadPercent = computed(() => Math.min(100, props.bar.load / props.level.params.maxLoad * 100));
const spanPercent = computed(() => Math.min(100, props.bar.check / props.level.params.rod * 100));
const band = computed(() => {
  if (props.bar.over > 0 || props.bar.load > props.level.params.maxLoad) return 'over';
  if (spanPercent.value > 88 || loadPercent.value > 82) return 'high';
  if (!props.bar.taut) return 'slack';
  return 'ok';
});
</script>

<template>
  <section class="console-section bar-panel" aria-label="横杆状态">
    <div class="bar-head">
      <span><Link2 :size="15" /> 横杆 · 轴向负载</span>
      <b :class="band">{{ bar.load }}<small> / {{ level.params.maxLoad }}</small></b>
    </div>
    <div class="bar-meter" :class="band" role="meter" aria-label="横杆轴向负载" :aria-valuenow="bar.load" :aria-valuemax="level.params.maxLoad">
      <i :style="{ width: loadPercent + '%' }"></i>
      <em v-if="bar.force" :style="{ left: (bar.load - bar.force) / level.params.maxLoad * 100 + '%', width: bar.force / level.params.maxLoad * 100 + '%' }"></em>
    </div>
    <div class="bar-span">
      <span>间距 {{ bar.sep }} / 杆长 {{ level.params.rod }}</span>
      <span :class="{ warn: bar.over > 0 }">{{ bar.taut ? '绷直' : '松弛 ' + bar.slack }}</span>
    </div>
    <div class="bar-span-sub">
      <span class="span-meter"><i :style="{ width: spanPercent + '%' }"></i></span>
    </div>
    <p v-if="bar.force" class="bar-note"><Link2 :size="13" /> 其中 {{ bar.force }} 来自本步借力</p>
    <p v-if="bar.over > 0" class="action-warning" role="status"><TriangleAlert :size="14" /> 超出杆长 {{ bar.over }}</p>
  </section>
</template>
