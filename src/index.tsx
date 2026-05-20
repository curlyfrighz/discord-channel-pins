import "./styles.css";

import {
    addContextMenuPatch,
    NavContextMenuPatchCallback,
    removeContextMenuPatch,
} from "@api/ContextMenu";
import {
    addServerListElement,
    removeServerListElement,
    ServerListRenderPosition,
} from "@api/ServerList";
import {
    closeModal,
    ModalContent,
    ModalFooter,
    ModalHeader,
    ModalRoot,
    ModalSize,
    openModal,
} from "@utils/modal";
import definePlugin from "@utils/types";
import {
    Button,
    ChannelStore,
    GuildChannelStore,
    Menu,
    React,
    Text,
} from "@webpack/common";

import { DiscordWideBackground } from "./components/DiscordWideBackground";
import { PinsSidebar } from "./components/PinsSidebar";
import { ServerListButton } from "./components/ServerListButton";
import { settings } from "./settings";
import {
    addServerPin,
    ChannelPin,
    getData,
    isServerPinned,
    pinAndFavoriteChannel,
    removeServerPin,
    toggleChannelPin,
    toggleServerPin,
} from "./store";

// Walks a server's channel tree and returns every channelId reachable through
// that server's SELECTABLE/VOCAL groups, so we can detect which currently-
// favorited channels live inside the server being unpinned.
function channelIdsInGuild(guildId: string): Set<string> {
    const out = new Set<string>();
    try {
        const groups: any = (GuildChannelStore as any).getChannels?.(guildId) ?? {};
        const sources = [groups.SELECTABLE ?? [], groups.VOCAL ?? []];
        for (const list of sources) {
            for (const entry of list as any[]) {
                const id = entry?.channel?.id;
                if (id) out.add(id);
            }
        }
        // Threads under any of those parents — only the threads currently
        // resident in the client cache count, since dormant ones can't be
        // favorited.
        const cs: any = ChannelStore as any;
        if (typeof cs.getAllThreadsForGuild === "function") {
            const threads = cs.getAllThreadsForGuild(guildId) ?? [];
            for (const t of threads) {
                if (t?.id) out.add(t.id);
            }
        }
    } catch {
        // ignore
    }
    return out;
}

async function handleGuildUnpin(guildId: string, guildName: string) {
    const d = await getData();
    const scopeIds = channelIdsInGuild(guildId);
    const affectedFavorites = d.favorites.filter(id => scopeIds.has(id));

    if (affectedFavorites.length === 0) {
        await toggleServerPin(guildId);
        return;
    }

    const affectedPins: ChannelPin[] = affectedFavorites.map(channelId => {
        const ch: any = ChannelStore.getChannel(channelId);
        return { guildId: ch?.guild_id ?? guildId, channelId };
    });

    const key = openModal(props => (
        <ModalRoot {...props} size={ModalSize.SMALL}>
            <ModalHeader>
                <Text variant="heading-md/semibold">Unpin "{guildName}"?</Text>
            </ModalHeader>
            <ModalContent>
                <Text variant="text-md/normal" style={{ marginTop: 8 }}>
                    You have <strong>{affectedFavorites.length}</strong> favorited
                    channel{affectedFavorites.length === 1 ? "" : "s"} in this server.
                    Keep them as individual pins, or remove them along with the server?
                </Text>
            </ModalContent>
            <ModalFooter>
                <Button
                    color={(Button as any).Colors?.BRAND ?? undefined}
                    onClick={() => {
                        removeServerPin(guildId, affectedPins, affectedFavorites);
                        closeModal(key);
                    }}
                >
                    Keep favorites
                </Button>
                <Button
                    color={(Button as any).Colors?.RED ?? undefined}
                    look={(Button as any).Looks?.LINK ?? undefined}
                    onClick={() => {
                        removeServerPin(guildId, [], affectedFavorites);
                        closeModal(key);
                    }}
                    style={{ marginRight: 8 }}
                >
                    Remove all
                </Button>
                <Button
                    look={(Button as any).Looks?.LINK ?? undefined}
                    onClick={() => closeModal(key)}
                    style={{ marginRight: 8 }}
                >
                    Cancel
                </Button>
            </ModalFooter>
        </ModalRoot>
    ));
}

const ChannelContextPatch: NavContextMenuPatchCallback = (children, props) => {
    const channel = (props as any)?.channel;
    if (!channel) return;

    const guildId: string | null = channel.guild_id ?? null;
    const pin: ChannelPin = { guildId, channelId: channel.id };

    children.push(
        <Menu.MenuSeparator />,
        <Menu.MenuItem
            id="vc-cp-toggle-channel"
            label="Pin Channel to Channel Pins"
            action={async () => {
                await toggleChannelPin(pin);
            }}
        />,
        <Menu.MenuItem
            id="vc-cp-pin-favorite-channel"
            label="Pin & Favorite Channel"
            action={async () => {
                await pinAndFavoriteChannel(pin);
            }}
        />,
    );
};

const GuildContextPatch: NavContextMenuPatchCallback = (children, props) => {
    const guild = (props as any)?.guild;
    if (!guild?.id) return;

    children.push(
        <Menu.MenuSeparator />,
        <Menu.MenuItem
            id="vc-cp-toggle-server"
            label="Pin Server to Channel Pins"
            action={async () => {
                const pinned = await isServerPinned(guild.id);
                if (pinned) {
                    await handleGuildUnpin(guild.id, guild.name ?? "this server");
                } else {
                    await addServerPin(guild.id);
                }
            }}
        />,
    );
};

function SidebarMount() {
    return <PinsSidebar />;
}

export default definePlugin({
    name: "ChannelPins",
    description:
        "Cross-server pinned channel/server view. Adds a 'Channel Pins' button to the server list that toggles a custom sidebar listing pinned servers (live channel tree) and individually pinned channels, all clickable for native read/write.",
    authors: [{ name: "ianbrent", id: 0n }],
    dependencies: ["ServerListAPI", "ContextMenuAPI"],
    settings,

    start() {
        addServerListElement(ServerListRenderPosition.Above, ServerListButton);
        addServerListElement(ServerListRenderPosition.Above, SidebarMount);
        addServerListElement(ServerListRenderPosition.Above, DiscordWideBackground);

        addContextMenuPatch("channel-context", ChannelContextPatch);
        addContextMenuPatch("thread-context", ChannelContextPatch);
        addContextMenuPatch("gdm-context", ChannelContextPatch);
        addContextMenuPatch("user-context", ChannelContextPatch);
        addContextMenuPatch("guild-context", GuildContextPatch);
    },

    stop() {
        removeServerListElement(ServerListRenderPosition.Above, ServerListButton);
        removeServerListElement(ServerListRenderPosition.Above, SidebarMount);
        removeServerListElement(ServerListRenderPosition.Above, DiscordWideBackground);

        removeContextMenuPatch("channel-context", ChannelContextPatch);
        removeContextMenuPatch("thread-context", ChannelContextPatch);
        removeContextMenuPatch("gdm-context", ChannelContextPatch);
        removeContextMenuPatch("user-context", ChannelContextPatch);
        removeContextMenuPatch("guild-context", GuildContextPatch);
    },
});
