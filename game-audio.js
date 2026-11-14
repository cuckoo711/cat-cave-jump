/* Original recording clips are embedded in audio-bank.js for file:// playback. */
"use strict";
const RecordedAudio = {
    ctx: null, master: null, buffers: {}, active: null, previous: {},
    unlocked: false, nextIdle: Infinity, nextChatter: 0, lastEvent: null, errors: [],
    init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.master = this.ctx.createGain();
            this.master.gain.value = .82;
            this.master.connect(this.ctx.destination);
            this.ready = Promise.all(Object.entries(window.GAME_AUDIO_BANK || {}).map(async ([group, clips]) => {
                this.buffers[group] = [];
                for (const clip of clips) {
                    try {
                        const raw = Uint8Array.from(atob(clip.base64), c => c.charCodeAt(0));
                        const buffer = await this.ctx.decodeAudioData(raw.buffer);
                        this.buffers[group].push({ ...clip, buffer });
                    } catch (error) { this.errors.push(clip.id + ': ' + error.message); }
                }
            })).then(() => {
                this.buffers.caution = (this.buffers.idle || []).filter(c => c.id === 'idle_05');
                this.buffers.idle = (this.buffers.idle || []).filter(c => c.id !== 'idle_05');
            });
        } catch (error) { this.errors.push(error.message); this.ready = Promise.resolve(); }
    },
    unlock() {
        this.unlocked = true;
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        this.deferIdle();
    },
    deferIdle() { this.nextIdle = performance.now() + 8000 + Math.random() * 7000; },
    stopVoice() {
        const subtitle = document.getElementById('voiceSubtitle');
        if (subtitle) subtitle.textContent = '';
        if (!this.active) return;
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
        this.deferIdle();
    },
    play(group) {
        if (!this.ctx || this.ctx.state !== 'running' || !this.unlocked || SFX.muted || document.hidden) return false;
        const clips = this.buffers[group] || [];
        if (!clips.length) return false;
        const choices = clips.filter(c => clips.length === 1 || c.id !== this.previous[group]);
        const clip = choices[Math.floor(Math.random() * choices.length)];
        this.stopVoice();
        const source = this.ctx.createBufferSource(), gain = this.ctx.createGain();
        source.buffer = clip.buffer;
        gain.gain.value = group === 'idle' ? .68 : 1;
        source.connect(gain).connect(this.master);
        const voice = { source, gain, group, id: clip.id };
        this.active = voice;
        const subtitle = document.getElementById('voiceSubtitle');
        if (subtitle && group === 'caution') subtitle.textContent = '不急，等我指示';
        source.onended = () => {
            source.disconnect(); gain.disconnect();
            if (this.active === voice) {
                this.active = null;
                if (subtitle) subtitle.textContent = '';
                if (voice.followup) this.play(voice.followup);
            }
        };
        this.previous[group] = clip.id;
        this.lastEvent = { group, id: clip.id, at: performance.now() };
        source.start();
        this.deferIdle();
        return true;
    },
    afterLandingCaution() {
        // Let the landing meow finish before the complete spoken sentence.
        if (this.active && this.active.group === 'meow') this.active.followup = 'caution';
        else this.play('caution');
    },
    afterLandingChatter() {
        const now = performance.now();
        if (document.hidden || SFX.muted || !this.unlocked || now < this.nextChatter) return;
        // Never replace a current sentence or a higher-priority landing cue.
        if (this.active && (this.active.group !== 'meow' || this.active.followup)) return;
        if (Math.random() >= .3) return;
        this.nextChatter = now + 12000 + Math.random() * 6000;
        if (this.active) this.active.followup = 'idle';
        else this.play('idle');
    },
    tick(isIdle) {
        if (!isIdle || document.hidden || !this.unlocked || SFX.muted) {
            this.deferIdle(); return;
        }
        if (!this.active && performance.now() >= this.nextIdle) {
            this.play('idle'); this.deferIdle();
        }
    }
};
RecordedAudio.init();
document.addEventListener('visibilitychange', () => {
    if (document.hidden) RecordedAudio.stopVoice();
    RecordedAudio.deferIdle();
});
