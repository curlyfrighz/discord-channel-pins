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
    isFavoriteSync,
    PinsData,
    reorderSections,
    SECTION_PINNED_CHANNELS,
    SECTION_UNREAD,
    setPinsMode,
    setViewMode,
    subscribeData,
    subscribePinsMode,
    toggleCategoryCollapsed,
    toggleChannelPin,
    toggleFavorite,
    ViewMode,
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

const THREAD_TYPES = [10, 11, 12];

const FORUM_LIKE_TYPES = [CHANNEL_TYPE.GUILD_FORUM, CHANNEL_TYPE.GUILD_MEDIA];

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

// A channel is effectively-favorite if it's directly favorited, OR it's a
// thread whose parent is a forum-like channel and the parent is favorited.
// Text-channel threads do NOT inherit — per spec, favoriting a text channel
// does not cascade to its threads.
function isEffectivelyFavorite(channel: ChannelLike): boolean {
    if (isFavoriteSync(channel.id)) return true;
    if (!THREAD_TYPES.includes(channel.type)) return false;
    const parentId = channel.parent_id;
    if (!parentId) return false;
    const parent: any = ChannelStore.getChannel(parentId);
    if (!parent) return false;
    if (!FORUM_LIKE_TYPES.includes(parent.type)) return false;
    return isFavoriteSync(parentId);
}

function channelHasUnread(channelId: string): boolean {
    try {
        return !!(ReadStateStore as any).hasUnread?.(channelId);
    } catch {
        return false;
    }
}

function shouldShowInView(channel: ChannelLike, viewMode: ViewMode): boolean {
    if (viewMode === "all") return true;
    if (viewMode === "unreads") return channelHasUnread(channel.id);
    if (isEffectivelyFavorite(channel)) return true;
    return channelHasUnread(channel.id);
}

interface ContextMenuState {
    channelId: string;
    guildId: string | null;
    x: number;
    y: number;
    isPinnedDirect: boolean;
}

interface ChannelRowProps {
    channel: ChannelLike;
    guildId: string | null;
    selectedChannelId: string;
    showUnpin?: boolean;
    subtitle?: string;
    indent?: number;
    onContextMenu: (s: ContextMenuState) => void;
}

function ChannelRow({
    channel,
    guildId,
    selectedChannelId,
    showUnpin,
    subtitle,
    indent,
    onContextMenu,
}: ChannelRowProps) {
    let hasUnread = false;
    let mentionCount = 0;
    try {
        const rs: any = ReadStateStore as any;
        hasUnread = !!rs.hasUnread?.(channel.id);
        mentionCount = rs.getMentionCount?.(channel.id) ?? 0;
    } catch {
        // tolerate API drift
    }

    const directlyFav = isFavoriteSync(channel.id);
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
            onContextMenu={(e: any) => {
                e.preventDefault();
                e.stopPropagation();
                onContextMenu({
                    channelId: channel.id,
                    guildId,
                    x: e.clientX,
                    y: e.clientY,
                    isPinnedDirect: !!showUnpin,
                });
            }}
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
            <button
                className={"vc-cp-fav-toggle" + (directlyFav ? " on" : "")}
                title={directlyFav ? "Remove from favorites" : "Add to favorites"}
                onClick={(e: any) => {
                    e.stopPropagation();
                    toggleFavorite(channel.id);
                }}
            >
                {directlyFav ? "★" : "☆"}
            </button>
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
    return snowflakeToMs(thread?.id);
}

function channelLastActivityMs(channel: any): number {
    const fromLast = snowflakeToMs(channel?.lastMessageId);
    if (fromLast > 0) return fromLast;
    return snowflakeToMs(channel?.id);
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
    viewMode: ViewMode,
    onContextMenu: (s: ContextMenuState) => void,
): any {
    const rows: any[] = [];

    const showParent = shouldShowInView(ch, viewMode);
    if (showParent) {
        rows.push(
            <ChannelRow
                key={ch.id}
                channel={ch}
                guildId={guildId}
                selectedChannelId={selectedChannelId}
                onContextMenu={onContextMenu}
            />,
        );
    }

    if (!THREAD_BEARING_TYPES.includes(ch.type)) return rows;

    let threads = lookupThreadsForParent(ch.id);
    if (viewMode !== "all") {
        threads = threads.filter(t => shouldShowInView(t, viewMode));
    }
    if (threads.length === 0) return rows;

    // Ghost parent: parent row was filtered out but child threads survived
    // (e.g. unread threads under an otherwise-quiet forum). Render the parent
    // anyway so the threads have visible context.
    if (!showParent && viewMode !== "all") {
        rows.push(
            <ChannelRow
                key={`${ch.id}-ghost`}
                channel={ch}
                guildId={guildId}
                selectedChannelId={selectedChannelId}
                onContextMenu={onContextMenu}
            />,
        );
    }

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
                onContextMenu={onContextMenu}
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
    viewMode: ViewMode;
    onContextMenu: (s: ContextMenuState) => void;
}

function GuildSection({ guildId, selectedChannelId, viewMode, onContextMenu }: GuildSectionProps) {
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

    const renderedUncategorized = uncategorized
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .flatMap(ch => renderChannelWithThreads(ch, guildId, selectedChannelId, viewMode, onContextMenu))
        .filter(Boolean);

    const renderedCategories = sortedCategories.flatMap(([catId, cat]) => {
        const collapsed = isCategoryCollapsedSync(catId);
        const sortedChannels = cat.channels.sort(
            (a, b) => (a.position ?? 0) - (b.position ?? 0),
        );

        // Drop categories that contribute no visible rows in the current view.
        if (viewMode !== "all") {
            const anyRender = sortedChannels.some(ch => {
                if (shouldShowInView(ch, viewMode)) return true;
                if (THREAD_BEARING_TYPES.includes(ch.type)) {
                    const threads = lookupThreadsForParent(ch.id);
                    return threads.some(t => shouldShowInView(t, viewMode));
                }
                return false;
            });
            if (!anyRender) return [];
        }

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

        return [
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
                        renderChannelWithThreads(ch, guildId, selectedChannelId, viewMode, onContextMenu),
                    )}
            </React.Fragment>,
        ];
    });

    // Suppress the server header entirely when no rows render in the current view.
    if (
        viewMode !== "all" &&
        renderedUncategorized.length === 0 &&
        renderedCategories.length === 0
    ) {
        return null;
    }

    return (
        <>
            <div className="vc-cp-section-header server-divider">{guildName}</div>
            {renderedUncategorized}
            {renderedCategories}
        </>
    );
}

interface UnreadEntry {
    channel: ChannelLike;
    guildId: string | null;
    subtitle: string;
}

function enumerateUnreadChannelIds(): string[] {
    const rs: any = ReadStateStore as any;
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

    // Favorites pinned to the top (each cluster sorted by recency desc).
    out.sort((a, b) => {
        const af = isEffectivelyFavorite(a.channel) ? 1 : 0;
        const bf = isEffectivelyFavorite(b.channel) ? 1 : 0;
        if (af !== bf) return bf - af;

        const at = a.channel.type;
        const bt = b.channel.type;
        const aMs = THREAD_TYPES.includes(at)
            ? threadLastActivityMs(a.channel)
            : channelLastActivityMs(a.channel);
        const bMs = THREAD_TYPES.includes(bt)
            ? threadLastActivityMs(b.channel)
            : channelLastActivityMs(b.channel);
        return bMs - aMs;
    });

    if (out.length > 150) {
        debugLog("unread scan truncated", out.length, "->", 150);
        return out.slice(0, 150);
    }
    return out;
}

interface RowContextMenuProps {
    state: ContextMenuState;
    onClose: () => void;
}

function RowContextMenu({ state, onClose }: RowContextMenuProps) {
    React.useEffect(() => {
        const handler = (e: any) => {
            if (!(e.target as any).closest?.(".vc-cp-row-menu")) onClose();
        };
        const esc = (e: any) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("mousedown", handler, true);
        document.addEventListener("keydown", esc, true);
        return () => {
            document.removeEventListener("mousedown", handler, true);
            document.removeEventListener("keydown", esc, true);
        };
    }, [onClose]);

    const isFav = isFavoriteSync(state.channelId);

    // Clamp position to viewport so the menu doesn't get cut off
    const menuStyle: any = { top: state.y, left: state.x };
    if (state.x > window.innerWidth - 220) menuStyle.left = window.innerWidth - 220;
    if (state.y > window.innerHeight - 120) menuStyle.top = window.innerHeight - 120;

    return (
        <div className="vc-cp-row-menu" style={menuStyle}>
            <button
                className="vc-cp-row-menu-item"
                onClick={() => {
                    toggleFavorite(state.channelId);
                    onClose();
                }}
            >
                {isFav ? "★ Remove from Favorites" : "☆ Add to Favorites"}
            </button>
            {state.isPinnedDirect && (
                <button
                    className="vc-cp-row-menu-item danger"
                    onClick={() => {
                        toggleChannelPin({ guildId: state.guildId, channelId: state.channelId });
                        onClose();
                    }}
                >
                    Unpin Channel
                </button>
            )}
        </div>
    );
}

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
    all: "All Pins",
    favorites: "★ Favorites",
    unreads: "● Unreads",
};

interface ViewModePickerProps {
    viewMode: ViewMode;
    open: boolean;
    setOpen: (v: boolean) => void;
}

function ViewModePicker({ viewMode, open, setOpen }: ViewModePickerProps) {
    React.useEffect(() => {
        if (!open) return;
        const handler = (e: any) => {
            if (!(e.target as any).closest?.(".vc-cp-view-picker")) setOpen(false);
        };
        const esc = (e: any) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", handler, true);
        document.addEventListener("keydown", esc, true);
        return () => {
            document.removeEventListener("mousedown", handler, true);
            document.removeEventListener("keydown", esc, true);
        };
    }, [open, setOpen]);

    const options: ViewMode[] = ["all", "favorites", "unreads"];

    return (
        <div className="vc-cp-view-picker">
            <button
                className={"vc-cp-view-toggle" + (viewMode !== "all" ? " active" : "")}
                title="Change view"
                onClick={() => setOpen(!open)}
            >
                {VIEW_MODE_LABELS[viewMode]} <span className="vc-cp-view-chevron">▾</span>
            </button>
            {open && (
                <div className="vc-cp-view-menu">
                    {options.map(opt => (
                        <button
                            key={opt}
                            className={"vc-cp-view-menu-item" + (opt === viewMode ? " selected" : "")}
                            onClick={() => {
                                setViewMode(opt);
                                setOpen(false);
                            }}
                        >
                            {VIEW_MODE_LABELS[opt]}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export function PinsSidebar() {
    const [visible, setVisible] = React.useState(getPinsMode());
    const [data, setData] = React.useState({
        servers: [],
        channels: [],
        collapsedCategories: [],
        sectionOrder: [],
        favorites: [],
        viewMode: "all",
    } as PinsData);
    const [draggingSection, setDraggingSection] = React.useState("");
    const [selectedChannelId, setSelectedChannelId] = React.useState("");
    const [contextMenu, setContextMenu] = React.useState(null as ContextMenuState | null);
    const [viewMenuOpen, setViewMenuOpen] = React.useState(false);
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

    const viewMode: ViewMode = data.viewMode ?? "all";
    const hasAny = data.channels.length > 0 || data.servers.length > 0;
    const unread = scanUnread(
        data.servers,
        data.channels.map(c => c.channelId),
    );

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
        })
        .filter(({ channel }) => shouldShowInView(channel, viewMode));

    const bgEffect = getBackgroundEffect();
    const bgOpacity = getBackgroundOpacity();

    const openCtx = (s: ContextMenuState) => setContextMenu(s);
    const closeCtx = () => setContextMenu(null);

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
                <div className="vc-cp-header-actions">
                    <ViewModePicker
                        viewMode={viewMode}
                        open={viewMenuOpen}
                        setOpen={setViewMenuOpen}
                    />
                    <button
                        className="vc-cp-sidebar-close"
                        title="Close"
                        onClick={() => setPinsMode(false)}
                    >
                        ✕
                    </button>
                </div>
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
                        if (viewMode === "unreads") return null;
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
                                        onContextMenu={openCtx}
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
                                        onContextMenu={openCtx}
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
                                    viewMode={viewMode}
                                    onContextMenu={openCtx}
                                />
                            </div>
                        );
                    }

                    return null;
                })}
            </div>
            {contextMenu && <RowContextMenu state={contextMenu} onClose={closeCtx} />}
        </div>
    );

    if (ReactDOM && typeof ReactDOM.createPortal === "function") {
        return ReactDOM.createPortal(sidebar, document.body);
    }
    return sidebar;
}
