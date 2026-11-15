"use strict";

const OnlineGame = (() => {
    const rankButton = document.getElementById("rankButton");
    const updateButton = document.getElementById("updateButton");
    const dialog = document.getElementById("rankDialog");
    const list = document.getElementById("rankList");
    const rankTabs = document.getElementById("rankTabs");
    const rankPanel = document.getElementById("rankPanel");
    const myPlace = document.getElementById("rankMyPlace");
    const tabs = Array.from(rankTabs.querySelectorAll("[data-metric]"));
    const form = document.getElementById("rankForm");
    const name = document.getElementById("rankName");
    const status = document.getElementById("rankStatus");
    const liveRank = document.getElementById("liveRank");
    const livePlace = document.getElementById("livePlace");
    const rankGap = document.getElementById("rankGap");
    const submit = form.querySelector("button");
    const config = window.CAT_CAVE_CONFIG || {};
    let api;
    try {
        const url = new URL(config.apiBase, document.baseURI);
        if (config.apiBase && ["http:", "https:"].includes(url.protocol)) api = url.href.replace(/\/$/, "");
    } catch (_) {}
    if (!api) return { recordRun() {}, allowUpdate() {}, setStanding() {} };

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
    let metric = "score", boardRevision = 0;

    function formatRank(rank) {
        if (rank <= 100) return "第" + rank + "名";
        return [5000, 1000, 500, 200, 100].find(limit => rank > limit) + "+";
    }

    function formatValue(value) {
        if (metric === "distance") return (value / 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 }) + " 米";
        if (metric === "transfers") return value + " 次";
        if (metric === "duration") {
            const parts = [Math.floor(value / 3600000), Math.floor(value / 60000) % 60, Math.floor(value / 1000) % 60];
            return parts.map(part => String(part).padStart(2, "0")).join(":") + "." + String(value % 1000).padStart(3, "0");
        }
        return value + " 分";
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
            livePlace.textContent = formatRank(rank);
            rankGap.textContent = gap === null ? "" : "距离上一名还差 " + gap + " 分";
            liveRank.hidden = false;
        } catch (_) {}
    }

    async function refreshScores() {
        const revision = ++boardRevision;
        myPlace.textContent = "我的名次　查询中";
        try {
            const query = new URLSearchParams({ metric });
            if (player) query.set("player", player);
            const { scores, own } = await request("/scores?" + query);
            if (revision !== boardRevision) return;
            const placement = own ? (own.rank > 100 ? "未上榜 · " : "") + formatRank(own.rank) : "未上榜";
            myPlace.textContent = "我的名次　" + placement + (own ? "　" + formatValue(own.value) : "");
            const groups = new Map();
            scores.forEach(entry => {
                const entries = groups.get(entry.rank) || [];
                entries.push(entry);
                groups.set(entry.rank, entries);
            });
            list.replaceChildren(...Array.from(groups.values(), entries => {
                const first = entries[0];
                const row = document.createElement("li");
                if (entries.length === 1) {
                    row.textContent = formatRank(first.rank) + "　" + first.name;
                    const points = document.createElement("strong");
                    points.textContent = formatValue(first.value);
                    row.append(points);
                } else {
                    const details = document.createElement("details");
                    const summary = document.createElement("summary");
                    summary.textContent = formatRank(first.rank) + "　" + formatValue(first.value) + "　" + entries.length + " 人并列";
                    details.append(summary);
                    entries.forEach(entry => {
                        const member = document.createElement("div");
                        member.textContent = entry.name;
                        details.append(member);
                    });
                    row.append(details);
                }
                return row;
            }));
            status.textContent = scores.length ? "" : "暂无成绩";
        } catch (_) {
            if (revision !== boardRevision) return;
            myPlace.textContent = "我的名次　暂不可用";
            status.textContent = "排行榜暂不可用";
        }
    }

    function selectTab(tab) {
        if (tab.dataset.metric === metric) return;
        metric = tab.dataset.metric;
        for (const item of tabs) {
            item.setAttribute("aria-selected", String(item === tab));
            item.tabIndex = item === tab ? 0 : -1;
        }
        rankPanel.setAttribute("aria-labelledby", tab.id);
        list.replaceChildren();
        status.textContent = "";
        refreshScores();
    }
    for (const tab of tabs) tab.addEventListener("click", () => selectTab(tab));
    rankTabs.addEventListener("keydown", event => {
        const current = tabs.indexOf(event.target);
        if (current < 0) return;
        const keys = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: tabs.length - 1 };
        if (!Object.hasOwn(keys, event.key)) return;
        event.preventDefault();
        const next = tabs[(keys[event.key] + tabs.length) % tabs.length];
        selectTab(next);
        next.focus();
    });

    async function checkVersion() {
        if (document.hidden || !config.version) return;
        try {
            const { version } = await request("/version");
            availableVersion = typeof version === "string" && version !== config.version ? version : null;
            updateButton.hidden = !canUpdate || !availableVersion;
        } catch (_) {}
    }

    rankButton.hidden = false;
    rankButton.addEventListener("click", async () => {
        form.hidden = true;
        dialog.showModal();
        player ??= crypto.randomUUID();
        set("cavejump_online_player", player);
        const scores = refreshScores();
        try {
            const account = await post("/player", {});
            name.value = account.name;
            submit.textContent = pending.length ? "提交成绩" : "保存昵称";
            form.hidden = false;
        } catch (_) {
            await scores;
            status.textContent = "昵称暂不可用";
        }
    });
    document.getElementById("rankClose").addEventListener("click", () => dialog.close());
    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!name.value.trim()) return;
        const submitted = pending;
        submit.disabled = true;
        try {
            const nickname = name.value.trim();
            const account = submitted.length ? await post("/scores", { runs: submitted, name: nickname, usedAuto: false })
                : await post("/player", { name: nickname });
            name.value = account.name;
            if (submitted.length) {
                pending = pending.filter(run => !submitted.includes(run));
                set("cavejump_pending_score", JSON.stringify(pending));
            }
            submit.textContent = pending.length ? "提交成绩" : "保存昵称";
            await refreshScores();
            refreshStanding();
        } catch (error) {
            status.textContent = error.message === "name_taken" ? "昵称已使用" : "保存失败";
        } finally {
            submit.disabled = false;
        }
    });
    updateButton.addEventListener("click", () => {
        if (!canUpdate || !availableVersion) return;
        const url = new URL(location.href);
        url.searchParams.set("v", availableVersion);
        location.replace(url);
    });
    checkVersion();
    setInterval(checkVersion, 30000);
    setInterval(refreshStanding, 5000);
    document.addEventListener("visibilitychange", checkVersion);

    return {
        setStanding(score) {
            if (standingScore === score) return;
            standingScore = score;
            rankRevision++;
            clearTimeout(rankTimer);
            if (!score) liveRank.hidden = true;
            else rankTimer = setTimeout(refreshStanding, 150);
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
            updateButton.hidden = !canUpdate || !availableVersion;
            if (canUpdate) checkVersion();
        }
    };
})();
