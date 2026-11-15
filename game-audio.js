/* Original recording clips are embedded in audio-bank.js for file:// playback. */
"use strict";
const RecordedAudio = {
    ctx: null, master: null, buffers: {}, active: null, previous: {},
    unlocked: false, muted: false, lastEvent: null, errors: [],
    landingsSinceLine: 0,
    bgm: null, bgmLoading: true,
    init() {
        const music = GameAssets.loadScript('assets/cave-bgm.js').then(() => this.initBgm());
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.master = this.ctx.createGain();
            this.master.gain.value = .82;
            this.master.connect(this.ctx.destination);
            const effects = GameAssets.loadScript('audio-bank.js').then(() => this.loadEffects());
            this.ready = Promise.all([music, effects]);
        } catch (error) { this.errors.push(error.message); this.ready = music; }
    },
    loadEffects() {
        return Promise.all(Object.entries(window.GAME_AUDIO_BANK || {}).map(async ([group, clips]) => {
            const eventGroup = group === 'idle' ? 'line' : group;
            this.buffers[eventGroup] = [];
            for (const clip of clips) {
                try {
                    const buffer = await this.decode(clip.base64);
                    this.buffers[eventGroup].push({ ...clip, buffer });
                } catch (error) { this.errors.push(clip.id + ': ' + error.message); }
            }
        }));
    },
    decode(base64) {
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        return this.ctx.decodeAudioData(bytes.buffer);
    },
    initBgm() {
        this.bgmLoading = false;
        const notify = () => document.dispatchEvent(new Event('bgmstatechange'));
        if (!window.GAME_BGM) { notify(); return; }
        const audio = new Audio('data:audio/mp4;base64,' + window.GAME_BGM.base64);
        audio.preload = 'auto';
        audio.loop = true;
        audio.muted = this.muted;
        this.bgm = audio;
        for (const event of ['playing', 'pause', 'error']) audio.addEventListener(event, notify);
        if (navigator.audioSession) {
            try { navigator.audioSession.type = 'playback'; } catch (_) {}
        }
        this.startBgm();
        notify();
    },
    startBgm() {
        if (!this.bgm || this.bgm.muted || !this.bgm.paused) return;
        this.bgm.play().catch(error => {
            if (error.name !== 'NotAllowedError' && error.name !== 'AbortError') {
                this.errors.push('bgm: ' + error.message);
            }
            document.dispatchEvent(new Event('bgmstatechange'));
        });
    },
    unlock() {
        this.unlocked = true;
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        this.startBgm();
    },
    stopVoice(keepLine = false) {
        if (!this.active || (keepLine && this.active.group === 'line')) return;
        const current = this.active;
        this.active = null;
        const t = this.ctx.currentTime;
        current.gain.gain.cancelScheduledValues(t);
        current.gain.gain.setValueAtTime(current.gain.gain.value, t);
        current.gain.gain.linearRampToValueAtTime(0, t + .012);
        try { current.source.stop(t + .015); } catch (_) {}
    },
    setMuted(muted) {
        this.muted = muted;
        if (this.master) this.master.gain.value = muted ? 0 : .82;
        if (muted) this.stopVoice();
        if (this.bgm) {
            this.bgm.muted = muted;
            if (muted) this.bgm.pause();
            else this.startBgm();
        }
    },
    land(allowLine) {
        if (allowLine && ++this.landingsSinceLine >= 3 && this.play('line')) {
            this.landingsSinceLine = 0;
            return;
        }
        this.play('meow');
    },
    play(group) {
        if (!this.ctx || this.ctx.state !== 'running' || !this.unlocked || this.muted || document.hidden) return false;
        if (this.active?.group === 'line') return false;
        const clips = this.buffers[group] || [];
        if (!clips.length) return false;
        const choices = clips.filter(c => clips.length === 1 || c.id !== this.previous[group]);
        const clip = group === 'line'
            ? clips[(clips.findIndex(c => c.id === this.previous.line) + 1) % clips.length]
            : choices[Math.floor(Math.random() * choices.length)];
        this.stopVoice();
        const source = this.ctx.createBufferSource(), gain = this.ctx.createGain();
        source.buffer = clip.buffer;
        source.connect(gain).connect(this.master);
        const voice = { source, gain, group };
        this.active = voice;
        source.onended = () => {
            source.disconnect(); gain.disconnect();
            if (this.active === voice) this.active = null;
        };
        this.previous[group] = clip.id;
        this.lastEvent = { group, id: clip.id, at: performance.now() };
        source.start();
        return true;
    }
};
RecordedAudio.init();
document.addEventListener('click', event => {
    if (!event.target?.closest?.('#muteButton')) RecordedAudio.startBgm();
}, true);
document.addEventListener('keydown', event => {
    if (event.code !== 'KeyM' && !event.target?.closest?.('#muteButton')) RecordedAudio.startBgm();
}, true);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) RecordedAudio.stopVoice();
});
