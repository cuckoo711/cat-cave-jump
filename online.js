"use strict";

const OnlineGame = (() => {
    const config = window.CAT_CAVE_CONFIG || {};
    let api;
    try {
        const url = new URL(config.apiBase, document.baseURI);
        if (config.apiBase && ["http:", "https:"].includes(url.protocol)) api = url.href.replace(/\/$/, "");
    } catch (_) {}
    if (!api) return { enabled: false, observeHud() {}, recordRun() {}, allowUpdate() {}, setStanding() {} };

    const get = key => {
        try { return localStorage.getItem(key); } catch (_) { return null; }
    };
    function set(key, value) {
        try { localStorage.setItem(key, value); } catch (_) {}
    }
    function getPending() {
        try {
            const saved = JSON.parse(get("cavejump_pending_score"));
            return Array.isArray(saved) ? saved : saved ? [saved] : [];
        } catch (_) { return []; }
    }
    let pending = getPending();
    let availableVersion = null;
    let canUpdate = true;
    let player = get("cavejump_online_player");
    let standingScore = 0, rankRevision = 0, rankTimer = null;
    let standing = null, renderHud;

    function syncHud() {
        renderHud?.({ standing, updateAvailable: canUpdate && Boolean(availableVersion) });
    }

    function formatRank(rank) {
        if (rank <= 100) return "第" + rank + "名";
        return [5000, 1000, 500, 200, 100].find(limit => rank > limit) + "+";
    }

    async function fingerprintSuffix() {
        const size = [screen.width, screen.height].sort((a, b) => a - b);
        const fingerprint = [navigator.userAgent, navigator.language, navigator.platform, ...size,
            Intl.DateTimeFormat().resolvedOptions().timeZone].join("|");
        const bytes = new TextEncoder().encode(fingerprint);
        const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
        return hash.reduce((suffix, byte) => (suffix * 256 + byte) % 1000000, 0);
    }

    async function request(path, options) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        try {
            const response = await fetch(api + path, { cache: "no-store", signal: controller.signal, ...options });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Request failed");
            return result;
        } finally {
            clearTimeout(timer);
        }
    }

    async function post(path, data) {
        player ??= crypto.randomUUID();
        set("cavejump_online_player", player);
        return request(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...data, player, suffix: await fingerprintSuffix() })
        });
    }

    async function refreshStanding() {
        if (!standingScore || document.hidden) return;
        const revision = ++rankRevision;
        try {
            const { rank, gap } = await request("/rank?score=" + standingScore);
            if (revision !== rankRevision) return;
            standing = { place: formatRank(rank), gap };
            syncHud();
        } catch (_) {}
    }

    async function checkVersion() {
        if (document.hidden || !config.version) return;
        try {
            const { version } = await request("/version");
            availableVersion = typeof version === "string" && version !== config.version ? version : null;
            syncHud();
        } catch (_) {}
    }

    checkVersion();
    setInterval(checkVersion, 30000);
    setInterval(refreshStanding, 5000);
    document.addEventListener("visibilitychange", checkVersion);

    return {
        enabled: true,
        formatRank,
        observeHud(render) {
            renderHud = render;
            syncHud();
        },
        applyUpdate() {
            if (!canUpdate || !availableVersion) return;
            const url = new URL(location.href);
            url.searchParams.set("v", availableVersion);
            location.replace(url);
        },
        get hasPending() { return pending.length > 0; },
        loadProfile() { return post("/player", {}); },
        fetchBoard(metric) {
            const query = new URLSearchParams({ metric });
            if (player) query.set("player", player);
            return request("/scores?" + query);
        },
        async saveProfile(name) {
            const submitted = pending;
            const account = submitted.length
                ? await post("/scores", { runs: submitted, name, usedAuto: false })
                : await post("/player", { name });
            if (submitted.length) {
                pending = pending.filter(run => !submitted.includes(run));
                set("cavejump_pending_score", JSON.stringify(pending));
            }
            refreshStanding();
            return account;
        },
        setStanding(score) {
            if (standingScore === score) return;
            standingScore = score;
            rankRevision++;
            clearTimeout(rankTimer);
            if (!score) {
                standing = null;
                syncHud();
            } else rankTimer = setTimeout(refreshStanding, 150);
        },
        recordRun(score, distance, jumps, transfers, durationMs) {
            const distanceCm = Math.round(distance * 100);
            if (score <= 0 || distanceCm <= 0 || jumps <= 0) return;
            const runs = [...pending, { score, distanceCm, jumps, transfers, durationMs }];
            const bestScore = runs.reduce((best, run) => run.score > best.score ||
                (run.score === best.score && run.distanceCm > best.distanceCm) ? run : best);
            function bestBy(field, direction) {
                return runs.reduce((best, run) => run[field] != null &&
                    (!best || direction * (run[field] - best[field]) > 0) ? run : best, null);
            }
            pending = [...new Set([bestScore, bestBy("distanceCm", 1), bestBy("transfers", 1), bestBy("durationMs", -1)].filter(Boolean))];
            set("cavejump_pending_score", JSON.stringify(pending));
        },
        allowUpdate(allowed) {
            if (canUpdate === allowed) return;
            canUpdate = allowed;
            syncHud();
            if (canUpdate) checkVersion();
        }
    };
})();
