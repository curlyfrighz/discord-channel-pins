import { React, ReactDOM } from "@webpack/common";

import {
    getBackgroundEffect,
    getDiscordLeftShaderIntensity,
    getDiscordRightShaderIntensity,
    getDiscordWideBackground,
    getStarsMotion,
} from "../settings";
import { debugLog } from "../store";
import { ShaderBackground } from "./ShaderBackground";

/**
 * Discord's secondary sidebar (server icons + channel list) is roughly the
 * leftmost ~312px of the window. We treat anything left of that as the "left
 * region" (high shader intensity) and anything right as the "right region"
 * (low shader intensity).
 */
const LEFT_REGION_WIDTH_PX = 312;

const STYLE_ID = "vc-cp-discord-wide-style";

function applyTransparencyOverrides() {
    const left = getDiscordLeftShaderIntensity();
    const right = getDiscordRightShaderIntensity();
    const leftBgAlpha = (100 - left) / 100;
    const rightBgAlpha = (100 - right) / 100;

    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        document.head.appendChild(style);
    }

    style.textContent = `
        :root {
            --background-primary: rgba(49, 51, 56, ${rightBgAlpha.toFixed(3)}) !important;
            --background-secondary: rgba(43, 45, 49, ${leftBgAlpha.toFixed(3)}) !important;
            --background-secondary-alt: rgba(35, 36, 41, ${leftBgAlpha.toFixed(3)}) !important;
            --background-tertiary: rgba(30, 31, 34, ${leftBgAlpha.toFixed(3)}) !important;
            --background-floating: rgba(24, 25, 28, 0.92) !important;
        }
        /* Discord paints opaque backgrounds on a bunch of internal containers
           that ignore the CSS variables — drop the most common ones to let the
           shader bleed through. Class names are fuzzy because Discord
           obfuscates, so we target on partial-match. */
        [class*="sidebar_"][class*="contentRegion"],
        [class*="chat_"][class*="chatContent"],
        [class*="chat_"] > [class*="content_"],
        [class*="container_"][class*="chatContainer"] {
            background-color: transparent !important;
        }
    `;
    debugLog("applied discord-wide transparency", { leftBgAlpha, rightBgAlpha });
}

function removeTransparencyOverrides() {
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
}

export function DiscordWideBackground() {
    const [, forceRender] = React.useState(0);
    const enabled = getDiscordWideBackground();

    React.useEffect(() => {
        if (!enabled) {
            removeTransparencyOverrides();
            return;
        }
        applyTransparencyOverrides();
        // Re-apply on window resize since vars are global
        const onResize = () => applyTransparencyOverrides();
        window.addEventListener("resize", onResize);
        return () => {
            window.removeEventListener("resize", onResize);
            removeTransparencyOverrides();
        };
    }, [enabled]);

    // Re-render when ShaderBackground might need to update — minimal poll
    React.useEffect(() => {
        if (!enabled) return;
        const t = setInterval(() => forceRender(n => n + 1), 5000);
        return () => clearInterval(t);
    }, [enabled]);

    if (!enabled) return null;
    if (!ReactDOM || typeof ReactDOM.createPortal !== "function") return null;

    const preset = getBackgroundEffect();
    const motion = getStarsMotion();

    // Single full-window canvas at 100% — per-region intensity comes from
    // Discord's now-translucent background overlays. Keeping it to one canvas
    // (vs. two side-by-side) keeps the shader animation seamless across the
    // 312px boundary.
    const wide = (
        <div
            className="vc-cp-discord-wide-bg"
            style={{
                position: "fixed",
                inset: 0,
                zIndex: -1,
                pointerEvents: "none",
                background: "#000000",
            }}
            data-left-region-px={LEFT_REGION_WIDTH_PX}
        >
            <ShaderBackground
                preset={preset === "none" ? "aurora" : preset}
                opacity={1}
                motion={motion}
                className="vc-cp-discord-wide-canvas"
            />
        </div>
    );

    return ReactDOM.createPortal(wide, document.body);
}
