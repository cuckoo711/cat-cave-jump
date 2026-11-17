<script setup>
defineEmits(['showRanks']);
</script>

<template>
    <div class="home-layout">
        <div class="home-cavity" aria-hidden="true">
            <canvas id="coverPlayer" class="home-player"></canvas>
        </div>
        <div class="home-actions">
            <button id="startButton" type="button">开始游戏</button>
            <button id="homeRankButton" type="button" aria-haspopup="dialog" @click="$emit('showRanks')">排行榜</button>
        </div>
    </div>
</template>

<style>
#homeMenu:not([hidden]) {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: max(16px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right))
        max(16px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
    background:
        radial-gradient(ellipse at 50% 43%, #243b3b19, #071013cf 84%),
        linear-gradient(0deg, #070d10e6, #101c2254 62%, #0d191d79),
        var(--home-strata, none) center / cover #17262a;
}
.home-layout {
    display: grid;
    justify-items: center;
    gap: clamp(26px, 6.2dvh, 62px);
    width: min(100%, 296px);
}
.home-cavity {
    position: relative;
    isolation: isolate;
    width: clamp(154px, 55vw, 270px);
    width: clamp(130px, min(62vw, 42dvh), 300px);
    aspect-ratio: 1 / .91;
    border-radius: 47% 53% 49% 51% / 53% 48% 52% 47%;
    border: 1px solid #6d827c;
    background: radial-gradient(ellipse at 53% 79%, #293f40 0, #152226 36%, #080e12 70%);
    box-shadow: 0 0 0 4px #161f22, 0 0 0 6px #53676794, 0 16px 56px #03090bd9,
        inset 0 -9px 22px #526c654d, inset 0 12px 25px #010406;
}
.home-cavity::before {
    content: '';
    position: absolute;
    inset: 8px;
    border-radius: inherit;
    border-top: 1px solid #89a8a147;
    transform: rotate(-12deg);
}
.home-cavity::after {
    content: '';
    position: absolute;
    left: 28%;
    right: 28%;
    bottom: 10%;
    height: 9%;
    z-index: -1;
    border-radius: 50%;
    background: radial-gradient(ellipse, #76918e8c, #435a5780 43%, #30464600 74%);
}
.home-player {
    position: absolute;
    left: 50%;
    bottom: 14%;
    transform: translateX(-50%);
    height: 64%;
    width: auto;
    filter: drop-shadow(0 3px 5px #000);
}
.home-actions { display: grid; width: 100%; gap: 10px; }
.home-actions button {
    min-height: 54px;
    padding: 10px 14px;
    border: 1px solid #67807c;
    border-radius: 12px;
    background: #142124f2;
    color: #e9f5f1;
    font: 600 17px/1.3 'PingFang SC', 'Microsoft YaHei', sans-serif;
    cursor: pointer;
    touch-action: manipulation;
}
.home-actions #startButton {
    color: #102421;
    background: #a9e4d4;
    border-color: #c7f2e5;
    box-shadow: 0 4px 20px #050c1173;
}
.home-actions button:focus-visible { outline: 2px solid #bdf5e4; outline-offset: 3px; }
.home-actions button:active { filter: brightness(.9); }
@media (hover: hover) {
    .home-actions button:hover { border-color: #d6f9ef; }
}
@media (max-height: 450px) and (orientation: landscape) {
    .home-layout { grid-template-columns: 1fr 1fr; align-items: center; width: min(100%, 490px); gap: 30px; }
    .home-cavity { width: clamp(100px, 54dvh, 185px); }
    .home-actions button { min-height: 44px; }
}
</style>
