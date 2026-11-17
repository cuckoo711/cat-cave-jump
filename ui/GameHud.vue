<script setup>
import { computed, ref } from 'vue';

const props = defineProps({ state: Object, online: Object, formatDistance: Function });
const missionPanel = ref(null);
const map = ref(null);
const phases = { outbound: '去程', return: '返程', complete: '往返完成' };
const hearts = computed(() => '♥'.repeat(props.state.landingCorrections) +
    '♡'.repeat(props.state.correctionLimit - props.state.landingCorrections));
const heartsLabel = computed(() => '师傅修正剩余 ' + props.state.landingCorrections + ' 次');

defineExpose({ missionPanel, map });
</script>

<template>
    <div id="ui">
        <div>得分 <span id="score">{{ state.score }}</span></div>
        <small id="best">最佳 {{ state.best }}</small>
        <div class="landingBudget">
            <small class="correctionLabel" aria-hidden="true">师傅修正</small>
            <span id="lives" role="img" :aria-label="heartsLabel" :title="heartsLabel">{{ hearts }}</span>
        </div>
    </div>
    <section id="missionHud" ref="missionPanel" aria-label="往返任务与小地图">
        <div v-if="online.standing" id="liveRank">
            <strong id="livePlace">{{ online.standing.place }}</strong>
            <span v-if="online.standing.gap !== null" id="rankGap">距离上一名还差 {{ online.standing.gap }} 分</span>
        </div>
        <dl>
            <div><dt>距目标</dt><dd id="missionRemaining">{{ formatDistance(state.remaining) }}</dd></div>
            <div><dt>已掘进</dt><dd id="missionDistance">{{ formatDistance(state.distance) }}</dd></div>
            <div><dt>上一跳</dt><dd id="missionJump">{{ formatDistance(state.lastJump) }}</dd></div>
        </dl>
        <canvas id="missionMap" ref="map" width="540" height="116" role="img" aria-label="任务路线俯视图"></canvas>
        <footer>
            <strong id="missionPhase" role="status">{{ phases[state.phase] }}</strong>
            <span id="missionDepth">相对深度 {{ state.depth }} m</span>
            <span id="missionCorrection" :data-active="state.corrected">{{ state.corrected ? '已矫正 · ' : '航向矫正 ' }}{{ state.corrections }} 次</span>
        </footer>
    </section>
</template>

<style>
    #ui {
        position: absolute;
        top: max(16px, env(safe-area-inset-top));
        left: max(18px, env(safe-area-inset-left));
        color: #eef3f8;
        font: bold 26px/1.2 "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
        text-shadow: 0 2px 6px rgba(0,0,0,.85);
        pointer-events: none;
        letter-spacing: 1px;
    }
    #ui small { display: block; font-size: 14px; font-weight: normal; opacity: .65; margin-top: 4px; letter-spacing: 2px; }
    #ui .correctionLabel { margin-top: 9px; }
    #lives { display: block; margin-top: 2px; font-size: 26px; color: #f28e9b; letter-spacing: 5px; }
    #missionHud {
        position: fixed; z-index: 1; pointer-events: none;
        top: max(12px, env(safe-area-inset-top)); right: max(12px, env(safe-area-inset-right));
        box-sizing: border-box; width: min(298px, calc(100vw - 118px));
        padding: 11px 12px 9px; border-radius: 12px; border: 1px solid #445954;
        background: #101b1bed; color: #e6f1ef;
        font: 12px/1.4 "PingFang SC", "Microsoft YaHei", sans-serif;
        font-variant-numeric: tabular-nums;
    }
    #missionHud footer, #missionHud dl { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
    #missionPhase { font-size: 13px; font-weight: 700; color: #a6ebd8; }
    #missionHud footer, #missionHud dt { color: #b0c0bc; }
    #missionHud dl { margin: 0 0 6px; }
    #missionHud dd { margin: 0; font-size: clamp(14px, 2.8vw, 20px); font-weight: 700; white-space: nowrap; }
    #missionMap { display: block; width: 100%; height: 58px; }
    #missionCorrection[data-active="true"] { color: #ffcb86; }
    #liveRank { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 10px; }
    #liveRank { color: #a6ebd8; margin-bottom: 5px; }
    @media (max-width: 600px), (max-height: 500px) {
        #ui { font-size: 22px; }
        #ui small { font-size: 12px; }
        #missionHud { padding: 7px 8px; }
    }
    @media (max-width: 600px) {
        #ui { max-width: 86px; }
        #score { display: block; }
        #ui small { letter-spacing: .5px; }
    }
    @media (max-height: 500px) {
        #missionHud { width: min(248px, calc(100vw - 118px)); }
        #missionMap { height: 46px; }
    }
    @media (max-width: 600px) and (orientation: portrait) {
        #ui, #missionHud {
            left: max(10px, env(safe-area-inset-left)); right: max(10px, env(safe-area-inset-right));
        }
        #ui {
            top: max(8px, env(safe-area-inset-top)); z-index: 1;
            display: flex; justify-content: space-between; align-items: center; gap: 6px;
            max-width: none; padding: 0 10px; height: 36px;
            border: 1px solid #445954; border-radius: 10px; background: #101b1bed;
            font-size: 15px; letter-spacing: 0; font-variant-numeric: tabular-nums;
        }
        #ui small { margin: 0; letter-spacing: 0; }
        #score { display: inline; }
        #ui .landingBudget { display: flex; align-items: center; gap: 5px; }
        #ui .correctionLabel { margin: 0; }
        #lives { margin: 0; font-size: 18px; letter-spacing: 2px; }
        #missionHud { top: calc(max(8px, env(safe-area-inset-top)) + 44px); width: auto; padding: 7px 9px; }
        #missionHud dd { font-size: 16px; }
        #missionHud dl { margin-bottom: 4px; }
        #missionMap { height: 46px; }
    }
</style>
