import { React, ReactDOM } from "@webpack/common";

import {
    getBackgroundEffect,
    getDiscordLeftShaderIntensity,
    getDiscordRightShaderIntensity,
    getDiscordWideBackground,
    getStarsMotion,
} from "../settings";
import { ShaderBackground } from "./ShaderBackground";

/**
 * Discord's server-icon strip + secondary sidebar is ~312px on standard zoom.
 * Everything to the right of that boundary is the chat panel (right region).
 */
const LEFT_REGION_WIDTH_PX = 312;

export function DiscordWideBackground() {
    const [, forceRender] = React.useState(0);

    // Re-evaluate settings every 2s so toggling the setting takes effect
    // without a full Discord reload.
    React.useEffect(() => {
        const t = setInterval(() => forceRender(n => n + 1), 2000);
        return () => clearInterval(t);
    }, []);

    const enabled = getDiscordWideBackground();
    if (!enabled) return null;
    if (!ReactDOM || typeof ReactDOM.createPortal !== "function") return null;

    const preset = getBackgroundEffect();
    const finalPreset = preset === "none" ? "aurora" : preset;
    const motion = getStarsMotion();
    const left = getDiscordLeftShaderIntensity() / 100;
    const right = getDiscordRightShaderIntensity() / 100;

    // Two canvases, each clipped to its region. mix-blend-mode: screen layers
    // the shader additively over Discord's UI — bright shader pixels brighten
    // what's beneath, black pixels do nothing. pointer-events: none so all
    // clicks pass through.
    const wide = (
        <>
            <div
                className="vc-cp-wide-region"
                style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    width: `${LEFT_REGION_WIDTH_PX}px`,
                    height: "100vh",
                    zIndex: 9998,
                    pointerEvents: "none",
                    mixBlendMode: "screen",
                    opacity: left,
                }}
            >
                <ShaderBackground
                    preset={finalPreset}
                    opacity={1}
                    motion={motion}
                    className="vc-cp-discord-wide-canvas"
                />
            </div>
            <div
                className="vc-cp-wide-region"
                style={{
                    position: "fixed",
                    top: 0,
                    left: `${LEFT_REGION_WIDTH_PX}px`,
                    right: 0,
                    height: "100vh",
                    zIndex: 9998,
                    pointerEvents: "none",
                    mixBlendMode: "screen",
                    opacity: right,
                }}
            >
                <ShaderBackground
                    preset={finalPreset}
                    opacity={1}
                    motion={motion}
                    className="vc-cp-discord-wide-canvas"
                />
            </div>
        </>
    );

    return ReactDOM.createPortal(wide, document.body);
}
