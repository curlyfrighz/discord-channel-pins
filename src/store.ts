import * as DataStore from "@api/DataStore";

export const DEBUG = false;
export function debugLog(...args: any[]) {
    if (DEBUG) console.log("[ChannelPins]", ...args);
}

export interface ChannelPin {
    guildId: string | null;
    channelId: string;
}

export type ViewMode = "all" | "favorites";

export interface PinsData {
    servers: string[];
    channels: ChannelPin[];
    collapsedCategories: string[];
    sectionOrder: string[];
    favorites: string[];
    viewMode: ViewMode;
}

export const SECTION_UNREAD = "unread";
export const SECTION_PINNED_CHANNELS = "pinned-channels";
export function serverSectionId(guildId: string): string {
    return `server:${guildId}`;
}

const KEY = "ChannelPins_data_v2";
const EMPTY: PinsData = {
    servers: [],
    channels: [],
    collapsedCategories: [],
    sectionOrder: [],
    favorites: [],
    viewMode: "all",
};

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
    const viewMode: ViewMode = loaded.viewMode === "favorites" ? "favorites" : "all";
    cache = {
        servers,
        channels: loaded.channels ?? [],
        collapsedCategories: loaded.collapsedCategories ?? [],
        sectionOrder: reconcileOrder(loaded.sectionOrder ?? [], servers),
        favorites: loaded.favorites ?? [],
        viewMode,
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
        ...d,
        servers: newServers,
        sectionOrder: reconcileOrder(d.sectionOrder, newServers),
    };
    await persist();
}

export async function addServerPin(guildId: string) {
    const d = await getData();
    if (d.servers.includes(guildId)) return;
    const newServers = [...d.servers, guildId];
    cache = {
        ...d,
        servers: newServers,
        sectionOrder: reconcileOrder(d.sectionOrder, newServers),
    };
    await persist();
}

// Removes a server pin. Favorited channels inside the server's scope are
// either preserved as individual channel pins (keepFavoriteChannelIds) or
// dropped from favorites entirely. allFavoriteChannelIdsInScope is the full
// list of currently-favorited channels the caller identified as belonging to
// this server — used to scrub favorites that are NOT being kept.
export async function removeServerPin(
    guildId: string,
    keepFavoriteChannelIds: ChannelPin[],
    allFavoriteChannelIdsInScope: string[],
) {
    const d = await getData();
    const newServers = d.servers.filter(id => id !== guildId);

    const keepSet = new Set(keepFavoriteChannelIds.map(p => p.channelId));
    const scopeSet = new Set(allFavoriteChannelIdsInScope);

    const existingChannelIds = new Set(d.channels.map(c => c.channelId));
    const channelsToAppend = keepFavoriteChannelIds.filter(
        p => !existingChannelIds.has(p.channelId),
    );

    const newChannels = [...d.channels, ...channelsToAppend];
    const newFavorites = d.favorites.filter(id => keepSet.has(id) || !scopeSet.has(id));

    cache = {
        ...d,
        servers: newServers,
        channels: newChannels,
        favorites: newFavorites,
        sectionOrder: reconcileOrder(d.sectionOrder, newServers),
    };
    await persist();
}

export async function toggleChannelPin(pin: ChannelPin) {
    const d = await getData();
    const exists = d.channels.some(c => c.channelId === pin.channelId);
    const newChannels = exists
        ? d.channels.filter(c => c.channelId !== pin.channelId)
        : [...d.channels, pin];

    // Unpinning a directly-pinned channel also scrubs its favorite. Favorites
    // inherited via server-pin are independent and stay until the server is
    // unpinned (handled via removeServerPin).
    let newFavorites = d.favorites;
    if (exists && !d.servers.includes(pin.guildId ?? "")) {
        newFavorites = d.favorites.filter(id => id !== pin.channelId);
    }

    cache = {
        ...d,
        channels: newChannels,
        favorites: newFavorites,
    };
    await persist();
}

export async function pinAndFavoriteChannel(pin: ChannelPin) {
    const d = await getData();
    const channelExists = d.channels.some(c => c.channelId === pin.channelId);
    const favExists = d.favorites.includes(pin.channelId);
    if (channelExists && favExists) return;

    cache = {
        ...d,
        channels: channelExists ? d.channels : [...d.channels, pin],
        favorites: favExists ? d.favorites : [...d.favorites, pin.channelId],
    };
    await persist();
}

export async function toggleFavorite(channelId: string) {
    const d = await getData();
    const exists = d.favorites.includes(channelId);
    cache = {
        ...d,
        favorites: exists
            ? d.favorites.filter(id => id !== channelId)
            : [...d.favorites, channelId],
    };
    await persist();
}

export async function toggleCategoryCollapsed(catId: string) {
    const d = await getData();
    const exists = d.collapsedCategories.includes(catId);
    cache = {
        ...d,
        collapsedCategories: exists
            ? d.collapsedCategories.filter(id => id !== catId)
            : [...d.collapsedCategories, catId],
    };
    await persist();
}

export async function reorderSections(newOrder: string[]) {
    const d = await getData();
    cache = {
        ...d,
        sectionOrder: reconcileOrder(newOrder, d.servers),
    };
    await persist();
}

export async function setViewMode(mode: ViewMode) {
    const d = await getData();
    if (d.viewMode === mode) return;
    cache = { ...d, viewMode: mode };
    await persist();
}

export function isCategoryCollapsedSync(catId: string): boolean {
    return (cache?.collapsedCategories ?? []).includes(catId);
}

export function isFavoriteSync(channelId: string): boolean {
    return (cache?.favorites ?? []).includes(channelId);
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
