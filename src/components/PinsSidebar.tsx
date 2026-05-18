import {
    ChannelStore,
    GuildChannelStore,
    GuildStore,
    NavigationRouter,
    React,
    ReactDOM,
    ReadStateStore,
    SelectedChannelStore,
} from "@webpack/common";

import {
    ChannelPin,
    getData,
    getPinsMode,
    PinsData,
    setPinsMode,
    subscribeData,
    subscribePinsMode,
    toggleChannelPin,
} from "../store";

interface ChannelLike {
    id: string;
    name: string;
    type: number;
    parent_id?: string | null;
    guild_id?: string | null;
    position?: number;
}

const CHANNEL_TYPE = {
    GUILD_TEXT: 0,
    DM: 1,
    GUILD_VOICE: 2,
    GROUP_DM: 3,
    GUILD_CATEGORY: 4,
    GUILD_ANNOUNCEMENT: 5,
    GUILD_STAGE_VOICE: 13,
    GUILD_FORUM: 15,
    GUILD_MEDIA: 16,
};

function getChannelPrefix(type: number): string {
    switch (type) {
        case CHANNEL_TYPE.GUILD_VOICE:
        case CHANNEL_TYPE.GUILD_STAGE_VOICE:
            return "🔊 ";
        case CHANNEL_TYPE.GUILD_ANNOUNCEMENT:
            return "📢 ";
        case CHANNEL_TYPE.GUILD_FORUM:
        case CHANNEL_TYPE.GUILD_MEDIA:
            return "📋 ";
        case CHANNEL_TYPE.DM:
        case CHANNEL_TYPE.GROUP_DM:
            return "@ ";
        default:
            return "# ";
    }
}

function navigate(guildId: string | null, channelId: string) {
    const path = guildId
        ? `/channels/${guildId}/${channelId}`
        : `/channels/@me/${channelId}`;
    try {
        NavigationRouter.transitionTo(path);
    } catch (err) {
        console.error("[ChannelPins] navigation failed:", err);
    }
}

interface ChannelRowProps {
    channel: ChannelLike;
    guildId: string | null;
    selectedChannelId: string;
    showUnpin?: boolean;
}

function ChannelRow({ channel, guildId, selectedChannelId, showUnpin }: ChannelRowProps) {
    let hasUnread = false;
    let mentionCount = 0;
    try {
        const rs: any = ReadStateStore as any;
        hasUnread = !!rs.hasUnread?.(channel.id);
        mentionCount = rs.getMentionCount?.(channel.id) ?? 0;
    } catch {
        // tolerate API drift
    }

    const active = selectedChannelId === channel.id;
    const classes = ["vc-cp-channel-row"];
    if (hasUnread) classes.push("unread");
    if (active) classes.push("active");

    return (
        <div
            className={classes.join(" ")}
            onClick={() => navigate(guildId, channel.id)}
            title={`#${channel.name}`}
        >
            <span className="vc-cp-channel-prefix">{getChannelPrefix(channel.type)}</span>
            <span className="vc-cp-channel-name">{channel.name}</span>
            {mentionCount > 0 ? (
                <span className="vc-cp-mention-badge">{mentionCount}</span>
            ) : hasUnread ? (
                <span className="vc-cp-unread-dot" />
            ) : null}
            {showUnpin && (
                <button
                    className="vc-cp-unpin-btn"
                    title="Unpin"
                    onClick={(e: any) => {
                        e.stopPropagation();
                        toggleChannelPin({ guildId, channelId: channel.id });
                    }}
                >
                    ✕
                </button>
            )}
        </div>
    );
}

interface GuildSectionProps {
    guildId: string;
    selectedChannelId: string;
}

function GuildSection({ guildId, selectedChannelId }: GuildSectionProps) {
    const guild: any = GuildStore.getGuild(guildId);
    const guildName = guild?.name ?? "(unknown server)";

    let groups: { SELECTABLE?: { channel: ChannelLike }[]; VOCAL?: { channel: ChannelLike }[] } = {};
    try {
        groups = (GuildChannelStore as any).getChannels(guildId) ?? {};
    } catch {
        // ignore
    }

    const selectable = groups.SELECTABLE ?? [];
    const vocal = groups.VOCAL ?? [];

    const allChannels: ChannelLike[] = [
        ...selectable.map(c => c.channel),
        ...vocal.map(c => c.channel),
    ];

    if (allChannels.length === 0) {
        return (
            <>
                <div className="vc-cp-section-header server-divider">{guildName}</div>
                <div className="vc-cp-empty" style={{ padding: "8px 16px", textAlign: "left" }}>
                    No accessible channels.
                </div>
            </>
        );
    }

    // Group by category (parent_id)
    const categories = new Map<string, { name: string; position: number; channels: ChannelLike[] }>();
    const uncategorized: ChannelLike[] = [];

    for (const ch of allChannels) {
        if (ch.type === CHANNEL_TYPE.GUILD_CATEGORY) continue;
        const parentId = ch.parent_id ?? null;
        if (parentId) {
            if (!categories.has(parentId)) {
                const parent: any = ChannelStore.getChannel(parentId);
                categories.set(parentId, {
                    name: parent?.name ?? "(category)",
                    position: parent?.position ?? 0,
                    channels: [],
                });
            }
            categories.get(parentId)!.channels.push(ch);
        } else {
            uncategorized.push(ch);
        }
    }

    const sortedCategories = Array.from(categories.entries()).sort(
        (a, b) => a[1].position - b[1].position,
    );

    return (
        <>
            <div className="vc-cp-section-header server-divider">{guildName}</div>
            {uncategorized
                .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                .map(ch => (
                    <ChannelRow
                        key={ch.id}
                        channel={ch}
                        guildId={guildId}
                        selectedChannelId={selectedChannelId}
                    />
                ))}
            {sortedCategories.map(([catId, cat]) => (
                <React.Fragment key={catId}>
                    <div className="vc-cp-category-header">{cat.name}</div>
                    {cat.channels
                        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                        .map(ch => (
                            <ChannelRow
                                key={ch.id}
                                channel={ch}
                                guildId={guildId}
                                selectedChannelId={selectedChannelId}
                            />
                        ))}
                </React.Fragment>
            ))}
        </>
    );
}

export function PinsSidebar() {
    const [visible, setVisible] = React.useState(getPinsMode());
    const [data, setData] = React.useState({ servers: [], channels: [] } as PinsData);
    const [selectedChannelId, setSelectedChannelId] = React.useState("");
    const [, forceRerender] = React.useState(0);

    React.useEffect(() => {
        return subscribePinsMode(() => setVisible(getPinsMode()));
    }, []);

    React.useEffect(() => {
        let alive = true;
        getData().then(d => {
            if (alive) setData(d);
        });
        const unsub = subscribeData(() => {
            getData().then(d => {
                if (alive) setData(d);
            });
        });
        return () => {
            alive = false;
            unsub();
        };
    }, []);

    // Track selected channel + tick for unread/mention refresh
    React.useEffect(() => {
        if (!visible) return;
        let cancelled = false;
        const tick = () => {
            if (cancelled) return;
            try {
                const id = (SelectedChannelStore as any).getChannelId?.() ?? "";
                setSelectedChannelId(id);
            } catch {
                // ignore
            }
            forceRerender(n => n + 1);
        };
        tick();
        const interval = setInterval(tick, 2000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [visible]);

    if (!visible) return null;

    const hasAny = data.channels.length > 0 || data.servers.length > 0;

    // Resolve pinned-channel rows
    const channelRows = data.channels
        .map((pin: ChannelPin) => {
            const channel: any = ChannelStore.getChannel(pin.channelId);
            if (!channel) {
                return {
                    pin,
                    channel: { id: pin.channelId, name: "(missing channel)", type: 0 } as ChannelLike,
                };
            }
            return { pin, channel: channel as ChannelLike };
        });

    const sidebar = (
        <div className="vc-cp-sidebar">
            <div className="vc-cp-sidebar-header">
                <span>Channel Pins</span>
                <button
                    className="vc-cp-sidebar-close"
                    title="Close"
                    onClick={() => setPinsMode(false)}
                >
                    ✕
                </button>
            </div>
            <div className="vc-cp-sidebar-body">
                {!hasAny && (
                    <div className="vc-cp-empty">
                        Nothing pinned yet.
                        <br />
                        <br />
                        Right-click any <strong>server icon</strong> → "Pin Server to Channel Pins"
                        to mirror the whole server here.
                        <br />
                        <br />
                        Or right-click a <strong>channel</strong> → "Pin Channel to Channel Pins".
                    </div>
                )}

                {channelRows.length > 0 && (
                    <>
                        <div className="vc-cp-section-header">Pinned Channels</div>
                        {channelRows.map(({ pin, channel }) => (
                            <ChannelRow
                                key={pin.channelId}
                                channel={channel}
                                guildId={pin.guildId}
                                selectedChannelId={selectedChannelId}
                                showUnpin
                            />
                        ))}
                    </>
                )}

                {data.servers.map(guildId => (
                    <GuildSection
                        key={guildId}
                        guildId={guildId}
                        selectedChannelId={selectedChannelId}
                    />
                ))}
            </div>
        </div>
    );

    if (ReactDOM && typeof ReactDOM.createPortal === "function") {
        return ReactDOM.createPortal(sidebar, document.body);
    }
    return sidebar;
}
