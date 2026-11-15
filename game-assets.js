"use strict";

const GameAssets = (() => {
    const config = window.CAT_CAVE_CONFIG || {};
    let cdn;
    try {
        const url = new URL(config.staticCdn);
        if (url.protocol === "https:" && /^[a-f0-9]{16}$/.test(config.version)) cdn = url.origin;
    } catch (_) {}

    function cdnUrl(path) {
        if (!cdn) return null;
        const file = path.replace(/^assets\//, "");
        const url = new URL("/assets/cdn/" + file, cdn);
        url.searchParams.set("v", config.version);
        return url.href;
    }

    function loadImage(path, onload, onerror) {
        const image = new Image();
        const remote = cdnUrl(path);
        image.onload = () => onload(image);
        image.onerror = () => {
            if (remote && image.src === remote) {
                image.removeAttribute("crossorigin");
                image.src = path;
            } else if (onerror) onerror();
        };
        if (remote) image.crossOrigin = "anonymous";
        image.src = remote || path;
        return image;
    }

    function tryScript(src, remote) {
        return new Promise(resolve => {
            const script = document.createElement("script");
            script.onload = () => resolve(true);
            script.onerror = () => { script.remove(); resolve(false); };
            if (remote) script.crossOrigin = "anonymous";
            script.src = src;
            document.head.append(script);
        });
    }

    async function loadScript(path) {
        const remote = cdnUrl(path);
        if (remote && await tryScript(remote, true)) return;
        await tryScript(path, false);
    }

    return { loadImage, loadScript };
})();
