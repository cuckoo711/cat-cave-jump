"use strict";

const OnlineGame = (() => {
    const rankButton = document.getElementById("rankButton");
    const updateButton = document.getElementById("updateButton");
    const dialog = document.getElementById("rankDialog");
    const list = document.getElementById("rankList");
    const form = document.getElementById("rankForm");
    const name = document.getElementById("rankName");
    const status = document.getElementById("rankStatus");
    const config = window.CAT_CAVE_CONFIG || {};
    let api;
    try {
        const url = new URL(config.apiBase, document.baseURI);
        if (config.apiBase && ["http:", "https:"].includes(url.protocol)) api = url.href.replace(/\/$/, "");
    } catch (_) {}
    if (!api) return { recordRun() {}, allowUpdate() {} };

    const get = key => {
        try { return localStorage.getItem(key); } catch (_) { return null; }
    };
    function set(key, value) {
        try { localStorage.setItem(key, value); } catch (_) {}
    }
    function getPending() {
        try { return JSON.parse(get("cavejump_pending_score")); } catch (_) { return null; }
    }
    let pending = getPending();
    let availableVersion = null;
    let canUpdate = true;
    let player = get("cavejump_online_player");

    async function request(path, options) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        try {
            const response = await fetch(api + path, { cache: "no-store", signal: controller.signal, ...options });
            if (!response.ok) throw new Error("Request failed");
            return await response.json();
        } finally {
            clearTimeout(timer);
        }
    }

    async function refreshScores() {
        try {
            const { scores } = await request("/scores");
            list.replaceChildren(...scores.map(entry => {
                const row = document.createElement("li");
                const playerName = document.createElement("span");
                const points = document.createElement("strong");
                playerName.textContent = entry.name;
                points.textContent = String(entry.score);
                row.append(playerName, points);
                return row;
            }));
            status.textContent = scores.length ? "" : "暂无成绩";
        } catch (_) {
            status.textContent = "排行榜暂不可用";
        }
    }

    async function checkVersion() {
        if (document.hidden || !config.version) return;
        try {
            const { version } = await request("/version");
            availableVersion = typeof version === "string" && version !== config.version ? version : null;
            updateButton.hidden = !canUpdate || !availableVersion;
        } catch (_) {}
    }

    rankButton.hidden = false;
    rankButton.addEventListener("click", () => {
        name.value = get("cavejump_online_name") || "";
        form.hidden = !pending;
        dialog.showModal();
        refreshScores();
    });
    document.getElementById("rankClose").addEventListener("click", () => dialog.close());
    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!pending || !name.value.trim()) return;
        const submit = form.querySelector("button");
        const submitted = pending;
        submit.disabled = true;
        try {
            player ??= crypto.randomUUID();
            set("cavejump_online_player", player);
            const nickname = name.value.trim();
            await request("/scores", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...submitted, player, name: nickname, usedAuto: false })
            });
            set("cavejump_online_name", nickname);
            if (pending === submitted) {
                pending = null;
                set("cavejump_pending_score", "null");
                form.hidden = true;
            }
            await refreshScores();
        } catch (_) {
            status.textContent = "提交失败";
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
    document.addEventListener("visibilitychange", checkVersion);

    return {
        recordRun(score, distance, jumps) {
            const distanceCm = Math.round(distance * 100);
            if (score <= 0 || distanceCm <= 0 || jumps <= 0) return;
            if (pending && (pending.score > score || (pending.score === score && pending.distanceCm >= distanceCm))) return;
            pending = { score, distanceCm, jumps };
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
