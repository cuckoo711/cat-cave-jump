/* Original recording clips are embedded in audio-bank.js for file:// playback. */
"use strict";
const BGM_VOLUME = .22;

const RecordedAudio = {
    ctx: null, master: null, buffers: {}, active: null, previous: {},
    unlocked: false, lastEvent: null, errors: [],
    landingsSinceLine: 0,
    bgmBuffer: null, bgmSource: null, bgmGain: null,
    init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.master = this.ctx.createGain();
            this.master.gain.value = .82;
            this.master.connect(this.ctx.destination);
            const effects = Object.entries(window.GAME_AUDIO_BANK || {}).map(async ([group, clips]) => {
                const eventGroup = group === 'idle' ? 'line' : group;
                this.buffers[eventGroup] = [];
                for (const clip of clips) {
                    try {
                        const buffer = await this.decode(clip.base64);
                        this.buffers[eventGroup].push({ ...clip, buffer });
                    } catch (error) { this.errors.push(clip.id + ': ' + error.message); }
                }
            });
            this.ready = Promise.all([...effects, this.loadBgm()]);
        } catch (error) { this.errors.push(error.message); this.ready = Promise.resolve(); }
    },
    decode(base64) {
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        return this.ctx.decodeAudioData(bytes.buffer);
    },
    async loadBgm() {
        if (!window.GAME_BGM) return;
        try {
            this.bgmBuffer = await this.decode(window.GAME_BGM.base64);
            this.startBgm();
        } catch (error) { this.errors.push('bgm: ' + error.message); }
    },
    startBgm() {
        if (!this.bgmBuffer || this.bgmSource || !this.unlocked || this.ctx.state !== 'running' || document.hidden) return;
        const source = this.ctx.createBufferSource(), gain = this.ctx.createGain();
        const now = this.ctx.currentTime;
        source.buffer = this.bgmBuffer;
        source.loop = true;
        source.loopStart = window.GAME_BGM.start;
        source.loopEnd = Math.min(this.bgmBuffer.duration, window.GAME_BGM.end);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(BGM_VOLUME, now + .15);
        source.connect(gain).connect(this.master);
        this.bgmSource = source;
        this.bgmGain = gain;
        source.start(0, source.loopStart);
    },
    unlock() {
        this.unlocked = true;
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().then(() => this.startBgm()).catch(() => {});
        else this.startBgm();
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
        if (this.master) this.master.gain.value = muted ? 0 : .82;
        if (muted) this.stopVoice();
    },
    land(allowLine) {
        if (allowLine && ++this.landingsSinceLine >= 3 && this.play('line')) {
            this.landingsSinceLine = 0;
            return;
        }
        this.play('meow');
    },
    play(group) {
        if (!this.ctx || this.ctx.state !== 'running' || !this.unlocked || SFX.muted || document.hidden) return false;
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
document.addEventListener('visibilitychange', () => {
    if (document.hidden) RecordedAudio.stopVoice();
    if (RecordedAudio.bgmGain) {
        const now = RecordedAudio.ctx.currentTime;
        const volume = RecordedAudio.bgmGain.gain;
        volume.cancelScheduledValues(now);
        volume.setTargetAtTime(document.hidden ? 0 : BGM_VOLUME, now, .04);
    }
    if (!document.hidden) RecordedAudio.startBgm();
});
