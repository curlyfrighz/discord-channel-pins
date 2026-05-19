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
});

export function getThreadActiveDays(): number {
    const v = settings.store.threadActiveDays;
    return typeof v === "number" && v >= 0 ? v : 3;
}

export function getMaxThreadsPerParent(): number {
    const v = settings.store.maxThreadsPerParent;
    return typeof v === "number" && v > 0 ? v : 25;
}
