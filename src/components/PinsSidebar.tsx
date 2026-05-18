import {
    ActiveJoinedThreadsStore,
    ChannelStore,
    GuildChannelStore,
    GuildStore,
    NavigationRouter,
    React,
    ReactDOM,
    ReadStateStore,
    SelectedChannelStore,
    UserGuildSettingsStore,
    UserStore,
} from "@webpack/common";

import {
    ChannelPin,
    debugLog,
    getData,
    getPinsMode,
    isCategoryCollapsedSync,
    PinsData,
    setPinsMode,
    subscribeData,
    subscribePinsMode,
    toggleCategoryCollapsed,
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

function lookupUserName(userId: string): string {
    try {
        const user: any = (UserStore as any).getUser?.(userId);
        return user?.globalName ?? user?.username ?? "";
    } catch {
        return "";
    }
}

function getDisplayName(channel: any): string {
    if (!channel) return "(missing channel)";

    if (channel.type === CHANNEL_TYPE.DM) {
        const recipients = channel.recipients ?? [];
        const rec = recipients[0];
        if (typeof rec === "string") {
            const name = lookupUserName(rec);
            if (name) return name;
        } else if (rec?.username || rec?.globalName) {
            return rec.globalName ?? rec.username;
        }
        return channel.name || "DM";
    }

    if (channel.type === CHANNEL_TYPE.GROUP_DM) {
        if (channel.name) return channel.name;
        const recipients = channel.recipients ?? [];
        const names = recipients
            .map((r: any) => (typeof r === "string" ? lookupUserName(r) : r?.username ?? ""))
            .filter(Boolean)
            .slice(0, 3);
        return names.length > 0 ? `Group: ${names.join(", ")}` : "Group DM";
    }

    return channel.name || "(channel)";
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
    subtitle?: string;
}

function ChannelRow({ channel, guildId, selectedChannelId, showUnpin, subtitle }: ChannelRowProps) {
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

    const displayName = getDisplayName(channel);

    return (
        <div
            className={classes.join(" ")}
            onClick={() => navigate(guildId, channel.id)}
            title={displayName}
        >
            <span className="vc-cp-channel-prefix">{getChannelPrefix(channel.type)}</span>
            <div className="vc-cp-channel-name-wrap">
                <span className="vc-cp-channel-name">{displayName}</span>
                {subtitle && <span className="vc-cp-channel-subtitle">{subtitle}</span>}
            </div>
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
            {sortedCategories.map(([catId, cat]) => {
                const collapsed = isCategoryCollapsedSync(catId);
                const sortedChannels = cat.channels.sort(
                    (a, b) => (a.position ?? 0) - (b.position ?? 0),
                );

                // Aggregate unread/mention for collapsed display
                let catMentions = 0;
                let catUnread = false;
                if (collapsed) {
                    for (const ch of sortedChannels) {
                        try {
                            const rs: any = ReadStateStore as any;
                            catMentions += rs.getMentionCount?.(ch.id) ?? 0;
                            if (!catUnread) catUnread = !!rs.hasUnread?.(ch.id);
                        } catch {
                            // ignore
                        }
                    }
                }

                return (
                    <React.Fragment key={catId}>
                        <div
                            className={"vc-cp-category-header collapsible" + (collapsed ? " collapsed" : "")}
                            onClick={() => toggleCategoryCollapsed(catId)}
                        >
                            <span className="vc-cp-category-chevron">{collapsed ? "▸" : "▾"}</span>
                            <span className="vc-cp-category-name">{cat.name}</span>
                            {collapsed && catMentions > 0 && (
                                <span className="vc-cp-mention-badge">{catMentions}</span>
                            )}
                            {collapsed && catMentions === 0 && catUnread && (
                                <span className="vc-cp-unread-dot" />
                            )}
                        </div>
                        {!collapsed &&
                            sortedChannels.map(ch => (
                                <ChannelRow
                                    key={ch.id}
                                    channel={ch}
                                    guildId={guildId}
                                    selectedChannelId={selectedChannelId}
                                />
                            ))}
                    </React.Fragment>
                );
            })}
        </>
    );
}

interface UnreadEntry {
    channel: ChannelLike;
    guildId: string | null;
    guildName: string;
}

function scanUnread(): UnreadEntry[] {
    const out: UnreadEntry[] = [];
    let guilds: Record<string, any> = {};
    try {
        guilds = (GuildStore as any).getGuilds?.() ?? {};
    } catch {
        return out;
    }

    const ugs: any = UserGuildSettingsStore as any;
    const rs: any = ReadStateStore as any;
    const aj: any = ActiveJoinedThreadsStore as any;

    for (const guildId of Object.keys(guilds)) {
        const guild = guilds[guildId];
        const guildName = guild?.name ?? "(unknown server)";

        try {
            if (ugs.isMuted?.(guildId)) continue;
        } catch {
            // continue scanning even if mute check is unavailable
        }

        let groups: any = {};
        try {
            groups = (GuildChannelStore as any).getChannels?.(guildId) ?? {};
        } catch {
            continue;
        }

        const channels: any[] = (groups.SELECTABLE ?? []).map((c: any) => c.channel);
        for (const ch of channels) {
            if (!ch?.id) continue;
            try {
                if (ugs.isChannelMuted?.(guildId, ch.id)) continue;
            } catch {
                // ignore
            }
            try {
                if (!rs.hasUnread?.(ch.id)) continue;
            } catch {
                continue;
            }
            out.push({ channel: ch, guildId, guildName });
        }

        // joined threads
        try {
            const threadMap = aj.getActiveJoinedThreadsForGuild?.(guildId) ?? {};
            for (const channelThreads of Object.values(threadMap) as any[]) {
                for (const t of Object.values(channelThreads) as any[]) {
                    const ch = t?.channel ?? t;
                    if (!ch?.id) continue;
                    try {
                        if (ugs.isChannelMuted?.(guildId, ch.id)) continue;
                    } catch {
                        // ignore
                    }
                    try {
                        if (!rs.hasUnread?.(ch.id)) continue;
                    } catch {
                        continue;
                    }
                    out.push({ channel: ch, guildId, guildName });
                }
            }
        } catch {
            // ignore thread enumeration errors
        }
    }

    // Sort: mention count desc, then by guild + channel name
    out.sort((a, b) => {
        let am = 0;
        let bm = 0;
        try {
            am = rs.getMentionCount?.(a.channel.id) ?? 0;
            bm = rs.getMentionCount?.(b.channel.id) ?? 0;
        } catch {
            // ignore
        }
        if (am !== bm) return bm - am;
        if (a.guildName !== b.guildName) return a.guildName.localeCompare(b.guildName);
        return (a.channel.name ?? "").localeCompare(b.channel.name ?? "");
    });

    if (out.length > 100) {
        debugLog("unread scan truncated", out.length, "->", 100);
        return out.slice(0, 100);
    }
    return out;
}

export function PinsSidebar() {
    const [visible, setVisible] = React.useState(getPinsMode());
    const [data, setData] = React.useState({ servers: [], channels: [], collapsedCategories: [] } as PinsData);
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
    const unread = scanUnread();

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
                {unread.length > 0 && (
                    <>
                        <div className="vc-cp-section-header">
                            Unread ({unread.length})
                        </div>
                        {unread.map(entry => (
                            <ChannelRow
                                key={`unread-${entry.channel.id}`}
                                channel={entry.channel}
                                guildId={entry.guildId}
                                selectedChannelId={selectedChannelId}
                                subtitle={entry.guildName}
                            />
                        ))}
                    </>
                )}

                {!hasAny && unread.length === 0 && (
                    <div className="vc-cp-empty">
                        Nothing pinned yet, no unread channels.
                        <br />
                        <br />
                        Right-click any <strong>server icon</strong> → "Pin Server to Channel Pins"
                        to mirror the whole server here.
                        <br />
                        <br />
                        Or right-click a <strong>channel</strong> → "Pin Channel to Channel Pins".
                    </div>
                )}

                {!hasAny && unread.length > 0 && (
                    <div className="vc-cp-empty" style={{ padding: "16px" }}>
                        Pin a server or channel below to keep them visible even when read.
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
