import { createApp, reactive } from 'vue';
import HomeScreen from './HomeScreen.vue';
import RankBoard from './RankBoard.vue';
import GameHud from './GameHud.vue';
import GameControls from './GameControls.vue';

const dialog = document.getElementById('rankDialog');
const rank = createApp(RankBoard, { dialog, online: OnlineGame }).mount(dialog);
createApp(HomeScreen, { onShowRanks: rank.open }).mount('#homeMenu');
const state = reactive(readGameHud());
const online = reactive({ standing: null, updateAvailable: false });
const hud = createApp(GameHud, { state, online, formatDistance }).mount('#gameHud');
const controls = createApp(GameControls, {
    state,
    online,
    onlineEnabled: OnlineGame.enabled,
    requestAutoJump,
    onShowRanks: rank.open,
    onUpdateGame: OnlineGame.applyUpdate,
    onToggleMute: toggleMute,
    onToggleHint: toggleLandingHint,
    onConfirmAuto: () => setAutoJump(true),
}).mount('#gameToolbar');
connectGameHud({
    missionPanel: hud.missionPanel,
    missionMap: hud.map,
    controls: controls.toolbar,
    autoJumpDialog: controls.dialog,
    closeSettings: controls.closeSettings,
}, snapshot => Object.assign(state, snapshot));
OnlineGame.observeHud(snapshot => Object.assign(online, snapshot));
