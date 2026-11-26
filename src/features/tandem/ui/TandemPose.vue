<script setup lang="ts">
import { computed } from 'vue';
import type { ClimberId, Limb, Point, TeamContacts } from '../../../shared/types';
import { bodyOf, climberNames, holdOf, type TandemLevel } from '../lib/mechanics';

const props = defineProps<{
  level: TandemLevel;
  team: TeamContacts;
  active: ClimberId;
  limb: Limb;
  attempted?: { climber: ClimberId; limb: Limb; target: string } | null;
}>();

const colors: Record<ClimberId, string> = { a: '#f7d98a', b: '#8fd3c2' };

const poses = computed(() => (['a', 'b'] as ClimberId[]).map(side => {
  const contacts = props.team[side];
  const center = bodyOf(props.level, contacts);
  const joints = (['lh', 'rh', 'lf', 'rf'] as Limb[]).map(limb => {
    const hand = limb.endsWith('h');
    const sideSign = limb.startsWith('l') ? -1 : 1;
    const joint = { x: center.x + sideSign * (hand ? 14 : 9), y: center.y + (hand ? -20 : 20) };
    const end = holdOf(props.level, contacts[limb]);
    const bend: Point = { x: (joint.x + end.x) / 2 + sideSign * 15, y: (joint.y + end.y) / 2 + (hand ? 9 : -9) };
    return {
      limb,
      path: 'M' + joint.x + ' ' + joint.y + ' L' + bend.x + ' ' + bend.y + ' ' + end.x + ' ' + end.y,
      end,
    };
  });
  return { side, center, joints, color: colors[side] };
}));

const rod = computed(() => {
  const a = bodyOf(props.level, props.team.a);
  const b = bodyOf(props.level, props.team.b);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
});

const mark = computed(() => props.attempted ? holdOf(props.level, props.attempted.target) : null);
const markFrom = computed(() => props.attempted ? holdOf(props.level, props.team[props.attempted.climber][props.attempted.limb]) : null);
</script>

<template>
  <g class="tandem-scene" aria-hidden="true">
    <!-- 各自活动区 -->
    <g v-for="side in (['a','b'] as ClimberId[])" :key="side" class="tandem-zone" :class="side">
      <rect :x="level.params.zone[side][0]" :y="level.params.zone[side][2]"
        :width="level.params.zone[side][1] - level.params.zone[side][0]"
        :height="level.params.zone[side][3] - level.params.zone[side][2]" />
      <text :x="level.params.zone[side][0] + 8" :y="level.params.zone[side][2] + 20" class="tandem-zone-label">
        {{ climberNames[side] }} 活动区
      </text>
    </g>
    <!-- 横杆 -->
    <line :x1="rod.x1" :y1="rod.y1" :x2="rod.x2" :y2="rod.y2" class="tandem-rod-shadow" />
    <line :x1="rod.x1" :y1="rod.y1" :x2="rod.x2" :y2="rod.y2" class="tandem-rod" />
    <circle :cx="rod.x1" :cy="rod.y1" r="4" class="tandem-rod-cap a" />
    <circle :cx="rod.x2" :cy="rod.y2" r="4" class="tandem-rod-cap b" />
    <!-- 预演失败的共同姿态 -->
    <g v-if="mark && markFrom">
      <line :x1="markFrom.x" :y1="markFrom.y" :x2="mark.x" :y2="mark.y" class="tandem-attempt-line" />
      <circle :cx="mark.x" :cy="mark.y" r="12" class="tandem-attempt-ring" />
    </g>
    <!-- 两位攀爬者 -->
    <g v-for="pose in poses" :key="pose.side" class="tandem-pose" :class="{ acting: pose.side === active }">
      <g v-for="arm in pose.joints" :key="arm.limb">
        <path :d="arm.path" class="tandem-limb-shadow" />
        <path :d="arm.path" class="tandem-limb" :style="{ stroke: pose.side === active ? pose.color : '#dfe9dc' }" />
        <circle :cx="arm.end.x" :cy="arm.end.y" r="5" class="tandem-contact" :style="{ fill: pose.color }" />
      </g>
      <g :transform="'translate(' + pose.center.x + ' ' + pose.center.y + ')'">
        <path d="M-13-19Q0-24 13-19L10 15Q0 23-10 15Z" fill="#eff0df" stroke="#182d28" stroke-width="2.5" />
        <circle cy="-31" r="10" :fill="pose.side === 'a' ? '#e8b494' : '#dcc7a4'" stroke="#182d28" stroke-width="2.5" />
      </g>
      <text :x="pose.center.x + 16" :y="pose.center.y - 40" class="tandem-name" :style="{ fill: pose.color }">{{ climberNames[pose.side] }}</text>
    </g>
  </g>
</template>
