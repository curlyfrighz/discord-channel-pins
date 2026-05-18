import * as DataStore from "@api/DataStore";

export interface Pin {
    guildId: string | null;
    channelId: string;
}

const KEY = "ChannelPins_pins_v1";

let cache: Pin[] | null = null;
const subscribers = new Set<() => void>();

export async function getPins(): Promise<Pin[]> {
    if (cache) return cache;
    const loaded = (await DataStore.get<Pin[]>(KEY)) ?? [];
    cache = loaded;
    return loaded;
}

export function getPinsSync(): Pin[] {
    return cache ?? [];
}

async function save() {
    await DataStore.set(KEY, cache ?? []);
    subscribers.forEach(fn => fn());
}

export async function isPinned(channelId: string): Promise<boolean> {
    const pins = await getPins();
    return pins.some(p => p.channelId === channelId);
}

export async function addPin(pin: Pin) {
    const pins = await getPins();
    if (pins.some(p => p.channelId === pin.channelId)) return;
    cache = [...pins, pin];
    await save();
}

export async function removePin(channelId: string) {
    const pins = await getPins();
    cache = pins.filter(p => p.channelId !== channelId);
    await save();
}

export async function togglePin(pin: Pin) {
    if (await isPinned(pin.channelId)) {
        await removePin(pin.channelId);
    } else {
        await addPin(pin);
    }
}

export function subscribe(fn: () => void): () => void {
    subscribers.add(fn);
    return () => {
        subscribers.delete(fn);
    };
}
