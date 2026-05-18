import * as DataStore from "@api/DataStore";

export interface ChannelPin {
    guildId: string | null;
    channelId: string;
}

export interface PinsData {
    servers: string[];
    channels: ChannelPin[];
}

const KEY = "ChannelPins_data_v2";
const EMPTY: PinsData = { servers: [], channels: [] };

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
    };
    await persist();
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
