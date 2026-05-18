import {
    ModalCloseButton,
    ModalContent,
    ModalHeader,
    ModalProps,
    ModalRoot,
    ModalSize,
} from "@utils/modal";
import {
    Button,
    ChannelStore,
    GuildStore,
    NavigationRouter,
    ReadStateStore,
    React,
    Text,
} from "@webpack/common";

import { getPins, Pin, removePin, subscribe } from "../store";

interface PinRowMeta {
    pin: Pin;
    channelName: string;
    guildName: string;
    mentionCount: number;
    hasUnread: boolean;
}

function describePin(pin: Pin): PinRowMeta {
    const channel: any = ChannelStore.getChannel(pin.channelId);
    const guild: any = pin.guildId ? GuildStore.getGuild(pin.guildId) : null;
    const channelName = channel?.name ?? "(unknown channel)";
    const guildName = guild?.name ?? (pin.guildId ? "(unknown server)" : "Direct Messages");

    let mentionCount = 0;
    let hasUnread = false;
    try {
        const rs: any = ReadStateStore as any;
        if (typeof rs.getMentionCount === "function") {
            mentionCount = rs.getMentionCount(pin.channelId) ?? 0;
        }
        if (typeof rs.hasUnread === "function") {
            hasUnread = !!rs.hasUnread(pin.channelId);
        } else if (typeof rs.getUnreadCount === "function") {
            hasUnread = (rs.getUnreadCount(pin.channelId) ?? 0) > 0;
        }
    } catch {
        // best-effort; Discord internals shift, never block render on this
    }

    return { pin, channelName, guildName, mentionCount, hasUnread };
}

export function PinsModal({ modalProps }: { modalProps: ModalProps }) {
    const [rows, setRows] = React.useState([] as PinRowMeta[]);

    const refresh = React.useCallback(async () => {
        const pins = await getPins();
        setRows(pins.map(describePin));
    }, []);

    React.useEffect(() => {
        refresh();
        return subscribe(() => {
            refresh();
        });
    }, [refresh]);

    const sorted = React.useMemo(() => {
        return [...rows].sort((a, b) => {
            if (a.mentionCount !== b.mentionCount) return b.mentionCount - a.mentionCount;
            if (a.hasUnread !== b.hasUnread) return a.hasUnread ? -1 : 1;
            return a.guildName.localeCompare(b.guildName) || a.channelName.localeCompare(b.channelName);
        });
    }, [rows]);

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader>
                <Text variant="heading-lg/semibold">Channel Pins</Text>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent>
                {sorted.length === 0 && (
                    <Text variant="text-md/normal" style={{ padding: "16px 0" }}>
                        No pinned channels yet. Right-click any channel in the sidebar and pick
                        <em> "Toggle Channel Pin"</em>.
                    </Text>
                )}
                {sorted.map((row: PinRowMeta) => (
                    <div
                        key={row.pin.channelId}
                        onClick={() => {
                            const path = row.pin.guildId
                                ? `/channels/${row.pin.guildId}/${row.pin.channelId}`
                                : `/channels/@me/${row.pin.channelId}`;
                            NavigationRouter.transitionTo(path);
                            modalProps.onClose();
                        }}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            padding: "10px 12px",
                            margin: "4px 0",
                            borderRadius: 6,
                            cursor: "pointer",
                            background: row.hasUnread
                                ? "var(--background-modifier-selected, rgba(255,255,255,0.06))"
                                : "transparent",
                        }}
                    >
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <Text variant="text-md/semibold">
                                #{row.channelName}
                            </Text>
                            <Text variant="text-xs/normal" style={{ opacity: 0.7 }}>
                                {row.guildName}
                            </Text>
                        </div>
                        {row.mentionCount > 0 && (
                            <span
                                style={{
                                    background: "var(--status-danger, #ed4245)",
                                    color: "white",
                                    borderRadius: 10,
                                    padding: "2px 8px",
                                    fontSize: 11,
                                    fontWeight: 700,
                                }}
                            >
                                {row.mentionCount}
                            </span>
                        )}
                        <Button
                            size={Button.Sizes.SMALL}
                            color={Button.Colors.TRANSPARENT}
                            onClick={(e: any) => {
                                e.stopPropagation();
                                removePin(row.pin.channelId);
                            }}
                        >
                            Unpin
                        </Button>
                    </div>
                ))}
            </ModalContent>
        </ModalRoot>
    );
}
