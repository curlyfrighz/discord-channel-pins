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
    sectionOrder: string[];
}

export const SECTION_UNREAD = "unread";
export const SECTION_PINNED_CHANNELS = "pinned-channels";
export function serverSectionId(guildId: string): string {
    return `server:${guildId}`;
}

const KEY = "ChannelPins_data_v2";
const EMPTY: PinsData = { servers: [], channels: [], collapsedCategories: [], sectionOrder: [] };

function computeDefaultOrder(servers: string[]): string[] {
    return [
        SECTION_UNREAD,
        SECTION_PINNED_CHANNELS,
        ...servers.map(serverSectionId),
    ];
}

function reconcileOrder(stored: string[], servers: string[]): string[] {
    const defaults = computeDefaultOrder(servers);
    if (stored.length === 0) return defaults;

    const validIds = new Set(defaults);
    const kept = stored.filter(id => validIds.has(id));
    // Append any defaults that aren't yet in stored (e.g., a newly added server)
    for (const id of defaults) {
        if (!kept.includes(id)) kept.push(id);
    }
    return kept;
}

let cache: PinsData | null = null;
let pinsModeActive = false;

const dataSubscribers = new Set<() => void>();
const modeSubscribers = new Set<() => void>();

export async function getData(): Promise<PinsData> {
    if (cache) return cache;
    const loaded = (await DataStore.get<PinsData>(KEY)) ?? EMPTY;
    const servers = loaded.servers ?? [];
    cache = {
        servers,
        channels: loaded.channels ?? [],
        collapsedCategories: loaded.collapsedCategories ?? [],
        sectionOrder: reconcileOrder(loaded.sectionOrder ?? [], servers),
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
    const newServers = d.servers.includes(guildId)
        ? d.servers.filter(id => id !== guildId)
        : [...d.servers, guildId];
    cache = {
        servers: newServers,
        channels: d.channels,
        collapsedCategories: d.collapsedCategories,
        sectionOrder: reconcileOrder(d.sectionOrder, newServers),
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
        sectionOrder: d.sectionOrder,
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
        sectionOrder: d.sectionOrder,
    };
    await persist();
}

export async function reorderSections(newOrder: string[]) {
    const d = await getData();
    cache = {
        servers: d.servers,
        channels: d.channels,
        collapsedCategories: d.collapsedCategories,
        sectionOrder: reconcileOrder(newOrder, d.servers),
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
