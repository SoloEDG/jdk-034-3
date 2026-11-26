<script setup lang="ts">
import { computed } from 'vue';
import { Flag, Link2, RotateCcw } from 'lucide-vue-next';
import type { ClimberId, Limb, TeamContacts } from '../../../shared/types';
import HoldMarker from '../../wall/ui/HoldMarker.vue';
import { LIMBS, bodyOf, climberNames, evaluateTandem, type TandemLevel } from '../lib/mechanics';
import TandemPose from './TandemPose.vue';

const props = defineProps<{
  level: TandemLevel;
  team: TeamContacts;
  turn: ClimberId;
  selectedLimb: Limb;
  locked: boolean;
  caption: string;
  reviewTeam?: TeamContacts | null;
  attempted?: { climber: ClimberId; limb: Limb; target: string } | null;
  energy: Record<ClimberId, number>;
}>();
defineEmits<{ choose: [id: string]; reset: [] }>();

const shownTeam = computed<TeamContacts>(() => props.reviewTeam ?? props.team);

const states = computed(() => {
  const map: Record<string, string> = {};
  const occupied = new Set<string>();
  (['a', 'b'] as ClimberId[]).forEach(side => {
    LIMBS.forEach(limb => {
      const id = shownTeam.value[side][limb];
      occupied.add(id);
      map[id] = map[id] === 'occupied' ? 'shared' : 'occupied';
    });
  });
  if (props.locked) return map;
  props.level.holds.forEach(hold => {
    if (occupied.has(hold.id)) return;
    const preview = evaluateTandem(props.level, shownTeam.value, props.energy, props.turn, props.selectedLimb, hold.id);
    map[hold.id] = preview && !preview.failure ? 'available' : 'idle';
  });
  return map;
});

const finishes = computed(() => {
  const set = new Set<string>();
  (['a', 'b'] as ClimberId[]).forEach(side => set.add(props.level.finish[side].hold));
  return set;
});

const rodLoadText = computed(() => {
  const a = bodyOf(props.level, shownTeam.value.a);
  const b = bodyOf(props.level, shownTeam.value.b);
  return Math.round(Math.hypot(a.x - b.x, a.y - b.y));
});
</script>

<template>
  <section class="wall tandem-wall" :style="{ '--route': level.color }" aria-label="连体岩壁">
    <div class="wall-top">
      <div><span class="wall-meta">{{ level.grade }} · 双人连体</span><h1>{{ level.name }}</h1></div>
      <button class="icon-button" aria-label="重开挑战" title="重开挑战" @click="$emit('reset')"><RotateCcw :size="19" /></button>
    </div>
    <svg viewBox="0 0 720 555" class="wall-graphics" aria-label="双人落点图">
      <defs>
        <pattern id="tandem-bolts" width="36" height="36" patternUnits="userSpaceOnUse">
          <circle cx="7" cy="6" r="1.4" fill="#152b28" opacity=".5" />
        </pattern>
        <filter id="tandem-grain"><feTurbulence type="fractalNoise" baseFrequency=".69" numOctaves="2" stitchTiles="stitch" /></filter>
      </defs>
      <rect width="720" height="555" fill="#2c453f" />
      <path d="M0 0H173L203 218 82 432 0 386ZM173 0H512L456 195 203 218ZM512 0H720V276L592 312 456 195Z" fill="#385447" />
      <path d="M0 386 82 432 203 218 456 195 407 422 263 555H0ZM592 312 720 276V555H523L407 422 456 195Z" fill="#425c4f" />
      <path d="M82 432 263 555M203 218 407 422 592 312M173 0 203 218 456 195 512 0M407 422 523 555" fill="none" stroke="#72907b" opacity=".32" stroke-width="2" />
      <rect width="720" height="555" fill="url(#tandem-bolts)" />
      <rect width="720" height="555" opacity=".12" filter="url(#tandem-grain)" pointer-events="none" />
      <!-- 中线 -->
      <line x1="360" y1="40" x2="360" y2="548" class="tandem-divider" />
      <TandemPose :level="level" :team="shownTeam" :active="turn" :limb="selectedLimb" :attempted="attempted ?? null" />
      <HoldMarker v-for="hold in level.holds" :key="hold.id" :hold="hold" :state="states[hold.id] ?? 'idle'"
        :finish="finishes.has(hold.id)" :locked="locked || Boolean(reviewTeam)" @choose="$emit('choose', $event)" />
      <text x="360" y="26" class="tandem-mid-label">共用杆长 {{ level.params.rod }}</text>
    </svg>
    <div class="wall-bottom"><Flag :size="15" /> <span>{{ caption }}</span></div>
    <div class="tandem-readout">
      <span><Link2 :size="13" /> 当前间距 {{ rodLoadText }}</span>
      <span>{{ climberNames[turn] }} 出手</span>
    </div>
  </section>
</template>
