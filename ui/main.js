import { createApp } from 'vue';
import HomeScreen from './HomeScreen.vue';
import RankBoard from './RankBoard.vue';

const dialog = document.getElementById('rankDialog');
const rank = createApp(RankBoard, { dialog, online: OnlineGame }).mount(dialog);
createApp(HomeScreen, { onShowRanks: rank.open }).mount('#homeMenu');
document.getElementById('rankButton').addEventListener('click', rank.open);
