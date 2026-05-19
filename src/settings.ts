import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    threadActiveDays: {
        type: OptionType.NUMBER,
        description:
            "Only show threads with activity in the last N days under each parent channel. Lower = less noise. Set to 0 to show all threads.",
        default: 3,
    },
    maxThreadsPerParent: {
        type: OptionType.NUMBER,
        description: "Hard cap on threads rendered under any single parent channel.",
        default: 25,
    },
    backgroundEffect: {
        type: OptionType.SELECT,
        description: "Animated background effect for the pins sidebar.",
        options: [
            { label: "None (plain black)", value: "none" },
            { label: "Aurora (purple/cyan flowing noise)", value: "aurora", default: true },
            { label: "Plasma (classic shifting waves)", value: "plasma" },
            { label: "Stars (slow drifting starfield)", value: "stars" },
            { label: "Liquid (fractal noise drift)", value: "liquid" },
            { label: "Flow (warped color field)", value: "flow" },
        ],
    },
    backgroundOpacity: {
        type: OptionType.NUMBER,
        description: "Background effect opacity (0–100). Lower if rows are hard to read.",
        default: 70,
    },
});

export function getThreadActiveDays(): number {
    const v = settings.store.threadActiveDays;
    return typeof v === "number" && v >= 0 ? v : 3;
}

export function getMaxThreadsPerParent(): number {
    const v = settings.store.maxThreadsPerParent;
    return typeof v === "number" && v > 0 ? v : 25;
}

export function getBackgroundEffect(): string {
    const v = settings.store.backgroundEffect;
    return typeof v === "string" ? v : "aurora";
}

export function getBackgroundOpacity(): number {
    const raw = settings.store.backgroundOpacity;
    if (typeof raw !== "number") return 0.7;
    return Math.max(0, Math.min(1, raw / 100));
}
