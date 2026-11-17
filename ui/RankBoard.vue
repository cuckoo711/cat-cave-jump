<script setup>
import { computed, nextTick, ref, shallowRef } from 'vue';

const props = defineProps({
    dialog: { type: HTMLDialogElement, required: true },
    online: { type: Object, required: true },
});
const metrics = [
    { key: 'score', id: 'rankScoreTab', label: '得分' },
    { key: 'distance', id: 'rankDistanceTab', label: '距离' },
    { key: 'transfers', id: 'rankTransfersTab', label: '传送次数' },
    { key: 'duration', id: 'rankDurationTab', label: '任务时长' },
];
const category = shallowRef(metrics[0]);
const scores = ref([]);
const own = ref(null);
const loading = ref(false);
const failed = ref(false);
const nickname = ref('');
const profileReady = ref(false);
const profileStatus = ref('');
const pending = ref(false);
const saving = ref(false);
const closeButton = ref(null);
const scroll = ref(null);
let boardRevision = 0;
let opening = 0;

const groups = computed(() => {
    const grouped = new Map();
    for (const entry of scores.value) {
        if (!grouped.has(entry.rank)) grouped.set(entry.rank, []);
        grouped.get(entry.rank).push(entry);
    }
    return Array.from(grouped.values());
});
const placement = computed(() => {
    if (failed.value) return '暂不可用';
    if (loading.value) return '查询中';
    if (!own.value) return '未上榜';
    const rank = props.online.formatRank(own.value.rank);
    return own.value.rank > 100 ? '未上榜 · ' + rank : rank;
});

function formatValue(value) {
    switch (category.value.key) {
        case 'distance':
            return (value / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) + ' 米';
        case 'transfers':
            return value + ' 次';
        case 'duration': {
            const parts = [Math.floor(value / 3600000), Math.floor(value / 60000) % 60, Math.floor(value / 1000) % 60];
            return parts.map(part => String(part).padStart(2, '0')).join(':') + '.' + String(value % 1000).padStart(3, '0');
        }
        default:
            return value + ' 分';
    }
}

async function loadBoard() {
    const revision = ++boardRevision;
    loading.value = true;
    failed.value = false;
    scores.value = [];
    own.value = null;
    if (scroll.value) scroll.value.scrollTop = 0;
    try {
        const board = await props.online.fetchBoard(category.value.key);
        if (revision !== boardRevision) return;
        scores.value = board.scores;
        own.value = board.own;
    } catch (_) {
        if (revision === boardRevision) failed.value = true;
    } finally {
        if (revision === boardRevision) loading.value = false;
    }
}

async function open() {
    if (props.dialog.open) return;
    props.dialog.showModal();
    closeButton.value?.focus();
    if (!props.online.enabled) return;
    const current = ++opening;
    profileReady.value = false;
    profileStatus.value = '';
    pending.value = props.online.hasPending;
    const account = props.online.loadProfile();
    loadBoard();
    try {
        const profile = await account;
        if (current !== opening || !props.dialog.open) return;
        nickname.value = profile.name;
        pending.value = props.online.hasPending;
        profileReady.value = true;
    } catch (_) {
        if (current === opening && props.dialog.open) profileStatus.value = '昵称暂不可用';
    }
}

async function save() {
    const name = nickname.value.trim();
    if (!name || saving.value) return;
    const current = opening;
    saving.value = true;
    profileStatus.value = '';
    try {
        const account = await props.online.saveProfile(name);
        pending.value = props.online.hasPending;
        if (current !== opening || !props.dialog.open) return;
        nickname.value = account.name;
        await loadBoard();
    } catch (error) {
        if (current === opening && props.dialog.open) {
            profileStatus.value = error.message === 'name_taken' ? '昵称已使用' : '保存失败';
        }
    } finally {
        saving.value = false;
    }
}

function select(metric) {
    if (metric === category.value) return;
    category.value = metric;
    loadBoard();
}
async function moveTab(event) {
    const current = metrics.indexOf(category.value);
    const indexes = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: metrics.length - 1 };
    if (!Object.hasOwn(indexes, event.key)) return;
    event.preventDefault();
    const metric = metrics[(indexes[event.key] + metrics.length) % metrics.length];
    select(metric);
    await nextTick();
    document.getElementById(metric.id)?.focus();
}

defineExpose({ open });
</script>

<template>
    <section class="rank-board">
        <header class="rank-header">
            <h2>排行榜</h2>
            <button id="rankClose" ref="closeButton" type="button" aria-label="关闭" @click="dialog.close()">×</button>
        </header>
        <p v-if="!online.enabled" id="rankStatus" class="rank-message" role="status">离线时无法查看排行榜</p>
        <template v-else>
            <div id="rankTabs" class="rank-tabs" role="tablist" aria-label="排名维度" @keydown="moveTab">
                <button v-for="metric in metrics" :id="metric.id" :key="metric.key" type="button" role="tab"
                    :aria-selected="category === metric" aria-controls="rankPanel"
                    :tabindex="category === metric ? 0 : -1" @click="select(metric)">
                    {{ metric.label }}
                </button>
            </div>
            <section id="rankPanel" class="rank-panel" role="tabpanel" :aria-labelledby="category.id" :aria-busy="loading">
                <div id="rankMyPlace" class="rank-own" role="status">
                    <span>我的名次</span>
                    <strong>{{ placement }}</strong>
                    <span v-if="own" class="rank-own-value">{{ formatValue(own.value) }}</span>
                </div>
                <div ref="scroll" class="rank-scroll">
                    <ol v-if="groups.length" id="rankList" :key="category.key" class="rank-list">
                        <li v-for="group in groups" :key="group[0].rank">
                            <div v-if="group.length === 1" class="rank-row">
                                <span class="rank-index" :data-leading="group[0].rank <= 3" :aria-label="'第 ' + group[0].rank + ' 名'">{{ group[0].rank }}</span>
                                <span class="rank-player">{{ group[0].name }}</span>
                                <strong class="rank-value">{{ formatValue(group[0].value) }}</strong>
                            </div>
                            <details v-else class="rank-tie">
                                <summary class="rank-row">
                                    <span class="rank-index" :data-leading="group[0].rank <= 3" :aria-label="'第 ' + group[0].rank + ' 名'">{{ group[0].rank }}</span>
                                    <span class="rank-player">{{ group.length }} 人并列</span>
                                    <strong class="rank-value">{{ formatValue(group[0].value) }}</strong>
                                </summary>
                                <ul class="rank-tie-players">
                                    <li v-for="entry in group" :key="entry.name">{{ entry.name }}</li>
                                </ul>
                            </details>
                        </li>
                    </ol>
                    <div v-else class="rank-empty">
                        <p id="rankStatus" class="rank-message" role="status">{{ loading ? '加载中…' : failed ? '排行榜暂不可用' : '暂无成绩' }}</p>
                        <button v-if="failed" type="button" @click="loadBoard">重试</button>
                    </div>
                </div>
            </section>
            <form v-if="profileReady" id="rankForm" class="rank-form" @submit.prevent="save">
                <input id="rankName" v-model="nickname" aria-label="昵称" placeholder="昵称" maxlength="16" required>
                <button type="submit" :disabled="saving">{{ pending ? '提交成绩' : '保存昵称' }}</button>
            </form>
            <p v-if="profileStatus" class="rank-feedback" role="status">{{ profileStatus }}</p>
        </template>
    </section>
</template>

<style>
#rankDialog {
    box-sizing: border-box;
    width: min(520px, calc(100% - 32px));
    max-height: calc(100% - 24px);
    max-height: calc(100dvh - 24px);
    padding: 0;
    border: 1px solid #465d5a;
    border-radius: 18px;
    color: #e6f2ef;
    background: #111d20;
    box-shadow: 0 20px 84px #020708bb;
    font: 14px/1.4 'PingFang SC', 'Microsoft YaHei', sans-serif;
    font-variant-numeric: tabular-nums;
    overflow: hidden;
}
#rankDialog::backdrop { background: #050b0dd1; }
.rank-board {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: calc(100dvh - 26px);
    padding: 14px 16px 16px;
}
.rank-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.rank-header h2 { margin: 0; font-size: 22px; letter-spacing: .035em; }
.rank-board button, .rank-board input {
    box-sizing: border-box;
    min-height: 44px;
    border: 1px solid #425753;
    border-radius: 10px;
    background: #1a292c;
    color: #e6f2ef;
    font: inherit;
}
.rank-board button { padding: 6px 10px; cursor: pointer; touch-action: manipulation; }
.rank-board :is(button, input, summary):focus-visible { outline: 2px solid #bcf4e5; outline-offset: -2px; }
.rank-board button:disabled { opacity: .58; cursor: default; }
.rank-header button { min-width: 44px; font-size: 23px; line-height: 1; }
.rank-tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
.rank-tabs button { padding-inline: 2px; font-size: 13px; white-space: nowrap; }
.rank-tabs button[aria-selected="true"] { background: #a9e4d4; border-color: #a9e4d4; color: #122724; font-weight: 700; }
.rank-panel { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.rank-own { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; padding: 10px 12px; border-radius: 10px; background: #1d302f; }
.rank-own span { color: #b5c8c2; }
.rank-own strong { color: #bef0e0; }
.rank-own-value { margin-left: auto; }
.rank-scroll {
    min-height: 0;
    max-height: 50dvh;
    overflow: auto;
    overscroll-behavior: contain;
    touch-action: pan-y;
}
.rank-list { margin: 0; padding: 0; list-style: none; }
.rank-list > li + li { border-top: 1px solid #2b3d3e; }
.rank-row {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    gap: 8px;
    min-height: 46px;
    align-items: center;
    padding: 4px;
}
.rank-index {
    display: grid;
    place-items: center;
    min-height: 27px;
    border-radius: 8px;
    color: #c0d3ce;
    background: #253334;
    font-size: 13px;
}
.rank-index[data-leading="true"] { color: #edce96; background: #403729; }
.rank-player, .rank-tie-players { overflow-wrap: anywhere; }
.rank-value { white-space: nowrap; }
.rank-tie summary { list-style: none; cursor: pointer; touch-action: pan-y; }
.rank-tie summary::-webkit-details-marker { display: none; }
.rank-tie .rank-player::after {
    content: '';
    display: inline-block;
    margin: 0 0 3px 7px;
    width: 5px;
    height: 5px;
    border: solid #9ab1ab;
    border-width: 0 1px 1px 0;
    transform: rotate(45deg);
}
.rank-tie[open] .rank-player::after { transform: rotate(225deg); }
.rank-tie-players { list-style: none; margin: 0; padding: 0 12px 8px 44px; color: #b5c8c2; }
.rank-tie-players li + li { margin-top: 5px; }
.rank-empty { text-align: center; padding: 20px 0; }
.rank-message, .rank-feedback { margin: 0; color: #b5c8c2; }
.rank-empty button { margin-top: 8px; }
.rank-feedback { font-size: 13px; }
.rank-form { display: flex; gap: 8px; }
.rank-form input { flex: 1; min-width: 0; padding: 8px 10px; user-select: text; -webkit-user-select: text; font-size: 16px; }
.rank-form button { white-space: nowrap; }
@media (max-width: 600px) and (orientation: portrait) {
    #rankDialog { margin: auto auto 0; width: 100%; max-width: 100%; border-radius: 20px 20px 0 0; border-bottom: 0; }
    .rank-board {
        padding-inline: max(14px, env(safe-area-inset-left)) max(14px, env(safe-area-inset-right));
        padding-bottom: max(12px, env(safe-area-inset-bottom));
    }
    .rank-scroll { max-height: 55dvh; }
}
</style>
