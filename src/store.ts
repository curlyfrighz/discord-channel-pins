import * as DataStore from "@api/DataStore";

export const DEBUG = false;
export function debugLog(...args: any[]) {
    if (DEBUG) console.log("[ChannelPins]", ...args);
}

export interface ChannelPin {
    guildId: string | null;
    channelId: string;
}

export interface PinsData {
    servers: string[];
    channels: ChannelPin[];
    collapsedCategories: string[];
}

const KEY = "ChannelPins_data_v2";
const EMPTY: PinsData = { servers: [], channels: [], collapsedCategories: [] };

let cache: PinsData | null = null;
let pinsModeActive = false;

const dataSubscribers = new Set<() => void>();
const modeSubscribers = new Set<() => void>();

export async function getData(): Promise<PinsData> {
    if (cache) return cache;
    const loaded = (await DataStore.get<PinsData>(KEY)) ?? EMPTY;
    cache = {
        servers: loaded.servers ?? [],
        channels: loaded.channels ?? [],
        collapsedCategories: loaded.collapsedCategories ?? [],
    };
    return cache;
}

export function getDataSync(): PinsData {
    return cache ?? EMPTY;
}

async function persist() {
    await DataStore.set(KEY, cache ?? EMPTY);
    dataSubscribers.forEach(fn => fn());
}

export async function isServerPinned(guildId: string): Promise<boolean> {
    const d = await getData();
    return d.servers.includes(guildId);
}

export async function isChannelPinned(channelId: string): Promise<boolean> {
    const d = await getData();
    return d.channels.some(c => c.channelId === channelId);
}

export async function toggleServerPin(guildId: string) {
    const d = await getData();
    cache = {
        servers: d.servers.includes(guildId)
            ? d.servers.filter(id => id !== guildId)
            : [...d.servers, guildId],
        channels: d.channels,
        collapsedCategories: d.collapsedCategories,
    };
    await persist();
}

export async function toggleChannelPin(pin: ChannelPin) {
    const d = await getData();
    const exists = d.channels.some(c => c.channelId === pin.channelId);
    cache = {
        servers: d.servers,
        channels: exists
            ? d.channels.filter(c => c.channelId !== pin.channelId)
            : [...d.channels, pin],
        collapsedCategories: d.collapsedCategories,
    };
    await persist();
}

export async function toggleCategoryCollapsed(catId: string) {
    const d = await getData();
    const exists = d.collapsedCategories.includes(catId);
    cache = {
        servers: d.servers,
        channels: d.channels,
        collapsedCategories: exists
            ? d.collapsedCategories.filter(id => id !== catId)
            : [...d.collapsedCategories, catId],
    };
    await persist();
}

export function isCategoryCollapsedSync(catId: string): boolean {
    return (cache?.collapsedCategories ?? []).includes(catId);
}

export function subscribeData(fn: () => void): () => void {
    dataSubscribers.add(fn);
    return () => {
        dataSubscribers.delete(fn);
    };
}

export function getPinsMode(): boolean {
    return pinsModeActive;
}

export function setPinsMode(active: boolean) {
    if (pinsModeActive === active) return;
    pinsModeActive = active;
    modeSubscribers.forEach(fn => fn());
}

export function togglePinsMode() {
    setPinsMode(!pinsModeActive);
}

export function subscribePinsMode(fn: () => void): () => void {
    modeSubscribers.add(fn);
    return () => {
        modeSubscribers.delete(fn);
    };
}
