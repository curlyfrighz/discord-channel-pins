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
import definePlugin from "@utils/types";
import { Menu, React } from "@webpack/common";

import { PinsSidebar } from "./components/PinsSidebar";
import { ServerListButton } from "./components/ServerListButton";
import { settings } from "./settings";
import {
    isChannelPinned,
    isServerPinned,
    toggleChannelPin,
    toggleServerPin,
} from "./store";

const ChannelContextPatch: NavContextMenuPatchCallback = (children, props) => {
    const channel = (props as any)?.channel;
    if (!channel) return;

    const guildId: string | null = channel.guild_id ?? null;

    children.push(
        <Menu.MenuSeparator />,
        <Menu.MenuItem
            id="vc-cp-toggle-channel"
            label="Pin Channel to Channel Pins"
            action={async () => {
                await toggleChannelPin({ guildId, channelId: channel.id });
            }}
        />,
    );

    isChannelPinned(channel.id).then(pinned => {
        // best-effort relabel hookpoint (no-op for now; user sees toggle semantics)
        void pinned;
    });
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
                await toggleServerPin(guild.id);
            }}
        />,
    );

    isServerPinned(guild.id).then(pinned => {
        void pinned;
    });
};

// Render hook for the always-on overlay sidebar. addServerListElement renders
// once at the top of the server-list strip — we use it as a stable mount point
// for the portal-less overlay component (the component renders itself absolutely
// positioned, so visual placement is decoupled from the mount point).
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

        addContextMenuPatch("channel-context", ChannelContextPatch);
        addContextMenuPatch("thread-context", ChannelContextPatch);
        addContextMenuPatch("gdm-context", ChannelContextPatch);
        addContextMenuPatch("user-context", ChannelContextPatch);
        addContextMenuPatch("guild-context", GuildContextPatch);
    },

    stop() {
        removeServerListElement(ServerListRenderPosition.Above, ServerListButton);
        removeServerListElement(ServerListRenderPosition.Above, SidebarMount);

        removeContextMenuPatch("channel-context", ChannelContextPatch);
        removeContextMenuPatch("thread-context", ChannelContextPatch);
        removeContextMenuPatch("gdm-context", ChannelContextPatch);
        removeContextMenuPatch("user-context", ChannelContextPatch);
        removeContextMenuPatch("guild-context", GuildContextPatch);
    },
});
