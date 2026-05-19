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
    getBackgroundEffect,
    getBackgroundOpacity,
    getMaxThreadsPerParent,
    getStarsMotion,
    getThreadActiveDays,
} from "../settings";
import { ShaderBackground } from "./ShaderBackground";
import {
    ChannelPin,
    debugLog,
    getData,
    getPinsMode,
    isCategoryCollapsedSync,
    PinsData,
    reorderSections,
    SECTION_PINNED_CHANNELS,
    SECTION_UNREAD,
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
    indent?: number;
}

function ChannelRow({ channel, guildId, selectedChannelId, showUnpin, subtitle, indent }: ChannelRowProps) {
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
    const rowStyle = indent && indent > 0 ? { paddingLeft: `${16 + indent * 14}px` } : undefined;

    return (
        <div
            className={classes.join(" ")}
            onClick={() => navigate(guildId, channel.id)}
            title={displayName}
            style={rowStyle}
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

const THREAD_BEARING_TYPES = [
    CHANNEL_TYPE.GUILD_TEXT,
    CHANNEL_TYPE.GUILD_ANNOUNCEMENT,
    CHANNEL_TYPE.GUILD_FORUM,
    CHANNEL_TYPE.GUILD_MEDIA,
];

const DISCORD_EPOCH_MS = 1420070400000;

function snowflakeToMs(snowflake: string | undefined | null): number {
    if (!snowflake) return 0;
    try {
        return Number(BigInt(snowflake) >> 22n) + DISCORD_EPOCH_MS;
    } catch {
        return 0;
    }
}

function threadLastActivityMs(thread: any): number {
    const fromLast = snowflakeToMs(thread?.lastMessageId);
    if (fromLast > 0) return fromLast;
    const fromArchive = thread?.threadMetadata?.archiveTimestamp;
    if (typeof fromArchive === "string") {
        const t = Date.parse(fromArchive);
        if (!Number.isNaN(t)) return t;
    }
    // Fallback to thread id itself (creation timestamp)
    return snowflakeToMs(thread?.id);
}

function lookupThreadsForParent(parentId: string): ChannelLike[] {
    const cs: any = ChannelStore as any;
    let threads: any[] = [];
    try {
        if (typeof cs.getAllThreadsForParent === "function") {
            threads = cs.getAllThreadsForParent(parentId) ?? [];
        }
    } catch {
        threads = [];
    }

    const days = getThreadActiveDays();
    if (days > 0) {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        threads = threads.filter(t => {
            // Always keep threads with unread/mention regardless of cutoff
            try {
                const rs: any = ReadStateStore as any;
                if (rs.hasUnread?.(t.id)) return true;
                if ((rs.getMentionCount?.(t.id) ?? 0) > 0) return true;
            } catch {
                // ignore
            }
            return threadLastActivityMs(t) >= cutoff;
        });
    }

    return threads.slice().sort((a: any, b: any) => {
        const rs: any = ReadStateStore as any;
        let am = 0;
        let bm = 0;
        let au = false;
        let bu = false;
        try {
            am = rs.getMentionCount?.(a.id) ?? 0;
            bm = rs.getMentionCount?.(b.id) ?? 0;
            au = !!rs.hasUnread?.(a.id);
            bu = !!rs.hasUnread?.(b.id);
        } catch {
            // ignore
        }
        if (am !== bm) return bm - am;
        if (au !== bu) return au ? -1 : 1;
        return threadLastActivityMs(b) - threadLastActivityMs(a);
    });
}

function renderChannelWithThreads(
    ch: ChannelLike,
    guildId: string | null,
    selectedChannelId: string,
): any {
    const rows: any[] = [
        <ChannelRow
            key={ch.id}
            channel={ch}
            guildId={guildId}
            selectedChannelId={selectedChannelId}
        />,
    ];

    if (!THREAD_BEARING_TYPES.includes(ch.type)) return rows;

    const threads = lookupThreadsForParent(ch.id);
    if (threads.length === 0) return rows;

    const cap = getMaxThreadsPerParent();
    const visible = threads.slice(0, cap);
    for (const t of visible) {
        rows.push(
            <ChannelRow
                key={`${ch.id}-${t.id}`}
                channel={t}
                guildId={guildId}
                selectedChannelId={selectedChannelId}
                indent={1}
            />,
        );
    }
    if (threads.length > cap) {
        rows.push(
            <div
                key={`${ch.id}-more`}
                className="vc-cp-channel-row"
                style={{ paddingLeft: `${16 + 14}px`, opacity: 0.6, cursor: "default" }}
            >
                <span className="vc-cp-channel-name">
                    +{threads.length - cap} more thread{threads.length - cap === 1 ? "" : "s"}…
                </span>
            </div>,
        );
    }
    return rows;
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
                .map(ch => renderChannelWithThreads(ch, guildId, selectedChannelId))}
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
                            sortedChannels.map(ch =>
                                renderChannelWithThreads(ch, guildId, selectedChannelId),
                            )}
                    </React.Fragment>
                );
            })}
        </>
    );
}

interface UnreadEntry {
    channel: ChannelLike;
    guildId: string | null;
    subtitle: string;
}

const THREAD_TYPES = [10, 11, 12]; // ANNOUNCEMENT_THREAD, PUBLIC_THREAD, PRIVATE_THREAD

function enumerateUnreadChannelIds(): string[] {
    const rs: any = ReadStateStore as any;
    // Discord's ReadStateStore typically exposes one of these enumeration methods.
    // Try each defensively; fall back to empty list if none work.
    for (const method of ["getAllReadStates", "getReadStates", "getMutableBasicGuildChannelIds"]) {
        try {
            if (typeof rs[method] === "function") {
                const result = rs[method]();
                if (Array.isArray(result) && result.length > 0) {
                    const ids: string[] = [];
                    for (const state of result) {
                        const id = state?.channelId ?? state?.channel_id ?? state?.id;
                        if (typeof id === "string") ids.push(id);
                    }
                    if (ids.length > 0) return ids;
                }
            }
        } catch {
            // try next
        }
    }
    return [];
}

function fallbackUnreadChannelIds(): string[] {
    // Fallback: iterate via GuildChannelStore + ActiveJoinedThreadsStore
    const ids: string[] = [];
    try {
        const guilds = (GuildStore as any).getGuilds?.() ?? {};
        for (const guildId of Object.keys(guilds)) {
            try {
                const groups = (GuildChannelStore as any).getChannels?.(guildId) ?? {};
                for (const c of (groups.SELECTABLE ?? []) as any[]) {
                    if (c?.channel?.id) ids.push(c.channel.id);
                }
            } catch {
                // ignore
            }
            try {
                const aj: any = ActiveJoinedThreadsStore as any;
                const threadMap = aj.getActiveJoinedThreadsForGuild?.(guildId) ?? {};
                for (const channelThreads of Object.values(threadMap) as any[]) {
                    for (const t of Object.values(channelThreads) as any[]) {
                        const ch = t?.channel ?? t;
                        if (ch?.id) ids.push(ch.id);
                    }
                }
            } catch {
                // ignore
            }
        }
    } catch {
        // ignore
    }
    return ids;
}

function buildSubtitle(channel: any, guildId: string | null): string {
    if (!guildId) return "Direct Messages";

    const guild: any = (GuildStore as any).getGuild?.(guildId);
    const guildName = guild?.name ?? "(unknown server)";

    // For threads, prepend the parent channel name so the user sees forum context
    if (THREAD_TYPES.includes(channel.type) && channel.parent_id) {
        const parent: any = ChannelStore.getChannel(channel.parent_id);
        if (parent?.name) {
            return `${guildName} • #${parent.name}`;
        }
    }
    return guildName;
}

function scanUnread(pinnedServers: string[], pinnedChannelIds: string[]): UnreadEntry[] {
    const rs: any = ReadStateStore as any;
    const ugs: any = UserGuildSettingsStore as any;

    const pinnedServerSet = new Set(pinnedServers);
    const pinnedChannelSet = new Set(pinnedChannelIds);

    if (pinnedServerSet.size === 0 && pinnedChannelSet.size === 0) return [];

    let ids = enumerateUnreadChannelIds();
    if (ids.length === 0) {
        debugLog("ReadStateStore enumeration unavailable, falling back");
        ids = fallbackUnreadChannelIds();
    }

    const seen = new Set<string>();
    const out: UnreadEntry[] = [];

    for (const channelId of ids) {
        if (seen.has(channelId)) continue;
        seen.add(channelId);

        let unread = false;
        try {
            unread = !!rs.hasUnread?.(channelId);
        } catch {
            unread = false;
        }
        if (!unread) continue;

        const channel: any = ChannelStore.getChannel(channelId);
        if (!channel) continue;

        const guildId: string | null = channel.guild_id ?? null;

        // Scope filter: include only if the channel is individually pinned,
        // its guild is pinned, OR (for threads) the parent channel is
        // individually pinned or in a pinned guild.
        const isThread = THREAD_TYPES.includes(channel.type);
        const parentId: string | null = channel.parent_id ?? null;
        const channelIsPinned = pinnedChannelSet.has(channelId);
        const guildIsPinned = !!guildId && pinnedServerSet.has(guildId);
        const parentIsPinned =
            isThread && parentId
                ? pinnedChannelSet.has(parentId) || (!!guildId && pinnedServerSet.has(guildId))
                : false;
        if (!channelIsPinned && !guildIsPinned && !parentIsPinned) continue;

        if (guildId) {
            try {
                if (ugs.isMuted?.(guildId)) continue;
                if (ugs.isChannelMuted?.(guildId, channelId)) continue;
                // For threads, also honor parent channel mute
                if (isThread && parentId) {
                    if (ugs.isChannelMuted?.(guildId, parentId)) continue;
                }
            } catch {
                // ignore
            }
        }

        out.push({
            channel,
            guildId,
            subtitle: buildSubtitle(channel, guildId),
        });
    }

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
        if (a.subtitle !== b.subtitle) return a.subtitle.localeCompare(b.subtitle);
        return (a.channel.name ?? "").localeCompare(b.channel.name ?? "");
    });

    if (out.length > 150) {
        debugLog("unread scan truncated", out.length, "->", 150);
        return out.slice(0, 150);
    }
    return out;
}

export function PinsSidebar() {
    const [visible, setVisible] = React.useState(getPinsMode());
    const [data, setData] = React.useState({ servers: [], channels: [], collapsedCategories: [], sectionOrder: [] } as PinsData);
    const [draggingSection, setDraggingSection] = React.useState("");
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
    const unread = scanUnread(
        data.servers,
        data.channels.map(c => c.channelId),
    );

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

    const bgEffect = getBackgroundEffect();
    const bgOpacity = getBackgroundOpacity();

    const sidebar = (
        <div className="vc-cp-sidebar">
            {bgEffect !== "none" && (
                <ShaderBackground
                    preset={bgEffect}
                    opacity={bgOpacity}
                    motion={getStarsMotion()}
                />
            )}
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

                {data.sectionOrder.map(sectionId => {
                    const isDragging = draggingSection === sectionId;
                    const dragProps = {
                        draggable: true,
                        onDragStart: (e: any) => {
                            setDraggingSection(sectionId);
                            try {
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData("text/plain", sectionId);
                            } catch {
                                // ignore
                            }
                        },
                        onDragEnd: () => setDraggingSection(""),
                        onDragOver: (e: any) => {
                            if (!draggingSection || draggingSection === sectionId) return;
                            e.preventDefault();
                            try {
                                e.dataTransfer.dropEffect = "move";
                            } catch {
                                // ignore
                            }
                        },
                        onDrop: (e: any) => {
                            e.preventDefault();
                            if (!draggingSection || draggingSection === sectionId) {
                                setDraggingSection("");
                                return;
                            }
                            const order = [...data.sectionOrder];
                            const from = order.indexOf(draggingSection);
                            const to = order.indexOf(sectionId);
                            if (from < 0 || to < 0) {
                                setDraggingSection("");
                                return;
                            }
                            order.splice(from, 1);
                            order.splice(to, 0, draggingSection);
                            reorderSections(order);
                            setDraggingSection("");
                        },
                    };

                    const sectionClass = "vc-cp-section" + (isDragging ? " dragging" : "");

                    if (sectionId === SECTION_UNREAD) {
                        if (unread.length === 0) return null;
                        return (
                            <div key={sectionId} className={sectionClass} {...dragProps}>
                                <div className="vc-cp-section-header">
                                    <span className="vc-cp-drag-handle" title="Drag to reorder">≡</span>
                                    <span>Unread ({unread.length})</span>
                                </div>
                                {unread.map(entry => (
                                    <ChannelRow
                                        key={`unread-${entry.channel.id}`}
                                        channel={entry.channel}
                                        guildId={entry.guildId}
                                        selectedChannelId={selectedChannelId}
                                        subtitle={entry.subtitle}
                                    />
                                ))}
                            </div>
                        );
                    }

                    if (sectionId === SECTION_PINNED_CHANNELS) {
                        if (channelRows.length === 0) return null;
                        return (
                            <div key={sectionId} className={sectionClass} {...dragProps}>
                                <div className="vc-cp-section-header">
                                    <span className="vc-cp-drag-handle" title="Drag to reorder">≡</span>
                                    <span>Pinned Channels</span>
                                </div>
                                {channelRows.map(({ pin, channel }) => (
                                    <ChannelRow
                                        key={pin.channelId}
                                        channel={channel}
                                        guildId={pin.guildId}
                                        selectedChannelId={selectedChannelId}
                                        showUnpin
                                    />
                                ))}
                            </div>
                        );
                    }

                    if (sectionId.startsWith("server:")) {
                        const guildId = sectionId.slice("server:".length);
                        if (!data.servers.includes(guildId)) return null;
                        return (
                            <div key={sectionId} className={sectionClass} {...dragProps}>
                                <div className="vc-cp-server-drag-wrap">
                                    <span className="vc-cp-drag-handle" title="Drag to reorder">≡</span>
                                </div>
                                <GuildSection
                                    guildId={guildId}
                                    selectedChannelId={selectedChannelId}
                                />
                            </div>
                        );
                    }

                    return null;
                })}
            </div>
        </div>
    );

    if (ReactDOM && typeof ReactDOM.createPortal === "function") {
        return ReactDOM.createPortal(sidebar, document.body);
    }
    return sidebar;
}
