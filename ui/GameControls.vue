<script setup>
import { onMounted, onUnmounted, ref } from 'vue';

const props = defineProps({
    state: Object,
    online: Object,
    onlineEnabled: Boolean,
    requestAutoJump: Function,
});
const emit = defineEmits(['showRanks', 'updateGame', 'toggleMute', 'toggleHint', 'confirmAuto']);
const toolbar = ref(null);
const settings = ref(null);
const settingsOpen = ref(false);
const dialog = ref(null);
const runScope = ref('本局');

function closeSettings() {
    if (!settingsOpen.value) return false;
    settingsOpen.value = false;
    return true;
}

function closeOnOutsideClick(event) {
    if (!settings.value.contains(event.target) && !dialog.value.contains(event.target)) closeSettings();
}

function askAutoJump() {
    const scope = props.requestAutoJump();
    if (!scope) return;
    runScope.value = scope;
    dialog.value.returnValue = 'cancel';
    dialog.value.showModal();
}

function confirmAutoJump() {
    if (dialog.value.returnValue === 'confirm') emit('confirmAuto');
}

onMounted(() => document.addEventListener('click', closeOnOutsideClick));
onUnmounted(() => document.removeEventListener('click', closeOnOutsideClick));

defineExpose({ toolbar, dialog, closeSettings });
</script>

<template>
    <div id="gameControls" ref="toolbar">
        <div id="gameActions">
            <button v-if="onlineEnabled" id="rankButton" type="button" aria-haspopup="dialog" @click="$emit('showRanks')">排行榜</button>
            <button v-if="online.updateAvailable" id="updateButton" type="button" @click="$emit('updateGame')">更新</button>
        </div>
        <div id="gameSettings" ref="settings">
            <button id="settingsButton" type="button" aria-label="游戏设置" :aria-expanded="settingsOpen"
                aria-controls="settingsOptions" @click="settingsOpen = !settingsOpen">···</button>
            <div v-show="settingsOpen" id="settingsOptions">
                <button id="muteButton" type="button" :aria-pressed="state.muted" @click="$emit('toggleMute')">
                    {{ state.muted || state.soundNeedsStart ? '开启声音' : '静音' }}
                </button>
                <button id="landingHintButton" type="button" :aria-pressed="state.landingHint" @click="$emit('toggleHint')">
                    落点提示：{{ state.landingHint ? '开' : '关' }}
                </button>
                <button id="autoJumpButton" type="button" :aria-pressed="state.autoJump" @click="askAutoJump">
                    自动跳：{{ state.autoJump ? '开' : '关' }}
                </button>
            </div>
        </div>
    </div>
    <dialog id="autoJumpDialog" ref="dialog" aria-labelledby="autoJumpWarning" @close="confirmAutoJump">
        <p id="autoJumpWarning">开启自动跳后，{{ runScope }}得分不计入排行榜。</p>
        <form method="dialog">
            <button value="cancel" autofocus>取消</button>
            <button value="confirm">开启</button>
        </form>
    </dialog>
</template>

<style>
    #gameControls {
        position: fixed; z-index: 2;
        display: flex; justify-content: space-between; align-items: flex-end; gap: 8px;
        bottom: max(12px, env(safe-area-inset-bottom));
        left: max(12px, env(safe-area-inset-left));
        right: max(12px, env(safe-area-inset-right));
        pointer-events: none;
    }
    #gameControls button {
        min-width: 112px; min-height: 44px;
        padding: 8px 12px; border: 1px solid #68737d; border-radius: 10px;
        background: #20262de6; color: #eef3f8;
        font: 14px "Microsoft YaHei", sans-serif; touch-action: manipulation;
        pointer-events: auto; cursor: pointer;
    }
    #gameControls button:focus-visible { outline: 2px solid #7ef0c8; outline-offset: 3px; }
    #gameActions { display: flex; gap: 8px; }
    #gameSettings { position: relative; margin-left: auto; }
    #gameSettings #settingsButton {
        box-sizing: border-box; min-width: 48px; display: grid; place-items: center;
        font-size: 21px;
    }
    #gameSettings > div {
        position: absolute; right: 0; bottom: calc(100% + 8px);
        display: grid; gap: 6px; min-width: 112px;
    }
    #autoJumpDialog {
        box-sizing: border-box; width: min(420px, calc(100vw - 24px)); max-height: 85dvh;
        padding: 14px; border: 1px solid #445954; border-radius: 12px;
        background: #101b1b; color: #e6f1ef; font: 15px/1.4 "Microsoft YaHei", sans-serif;
        touch-action: pan-y;
    }
    #autoJumpDialog::backdrop { background: #080c0caa; }
    #autoJumpDialog button {
        min-height: 44px; padding: 6px 10px; border: 1px solid #68737d; border-radius: 8px;
        background: #20262d; color: #eef3f8; font: inherit;
    }
    #autoJumpDialog p { margin: 0 0 14px; }
    #autoJumpDialog form { display: flex; justify-content: flex-end; gap: 8px; }
    #autoJumpDialog button { min-width: 72px; }
    @media (max-width: 600px) and (orientation: portrait) {
        #gameControls { left: max(10px, env(safe-area-inset-left)); right: max(10px, env(safe-area-inset-right)); }
        #gameControls button { min-width: 0; padding-inline: 8px; }
    }
</style>
