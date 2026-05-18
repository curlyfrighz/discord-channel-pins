import {
    addContextMenuPatch,
    NavContextMenuPatchCallback,
    removeContextMenuPatch,
} from "@api/ContextMenu";
import { ApplicationCommandInputType } from "@api/Commands";
import { openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { Menu, React } from "@webpack/common";

import { PinsModal } from "./components/PinsModal";
import { isPinned, togglePin } from "./store";

function openPinsModal() {
    openModal(modalProps => <PinsModal modalProps={modalProps} />);
}

const ChannelContextPatch: NavContextMenuPatchCallback = (children, props) => {
    const channel = (props as any)?.channel;
    if (!channel) return;

    children.push(
        <Menu.MenuSeparator />,
        <Menu.MenuItem
            id="vc-channelpins-toggle"
            label="Toggle Channel Pin"
            action={async () => {
                await togglePin({
                    guildId: channel.guild_id ?? null,
                    channelId: channel.id,
                });
            }}
        />,
        <Menu.MenuItem
            id="vc-channelpins-open"
            label="Open Channel Pins…"
            action={() => openPinsModal()}
        />,
    );

    // Best-effort: also flag currently-pinned channels in the label.
    isPinned(channel.id).then(pinned => {
        if (!pinned) return;
        // We can't mutate the menu after-the-fact reliably; the click action
        // already toggles. This is just future hookpoint.
    });
};

export default definePlugin({
    name: "ChannelPins",
    description:
        "Flat cross-server list of pinned channels. Right-click any channel → Toggle Channel Pin. Run /pins to open the panel.",
    authors: [{ name: "ianbrent", id: 0n }],

    commands: [
        {
            name: "pins",
            description: "Open the Channel Pins panel",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [],
            execute: () => {
                openPinsModal();
                return { content: "" };
            },
        },
    ],

    start() {
        addContextMenuPatch("channel-context", ChannelContextPatch);
        addContextMenuPatch("thread-context", ChannelContextPatch);
        addContextMenuPatch("gdm-context", ChannelContextPatch);
        addContextMenuPatch("user-context", ChannelContextPatch);
    },

    stop() {
        removeContextMenuPatch("channel-context", ChannelContextPatch);
        removeContextMenuPatch("thread-context", ChannelContextPatch);
        removeContextMenuPatch("gdm-context", ChannelContextPatch);
        removeContextMenuPatch("user-context", ChannelContextPatch);
    },
});
