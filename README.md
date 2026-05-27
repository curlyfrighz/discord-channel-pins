# discord-channel-pins

A [Vencord](https://vencord.dev) **userplugin** that gives you a dedicated, always-visible sidebar of pinned servers + favorited channels — across every server, DM, and group DM you care about, in one view.

Built because Discord's `Inbox > Mentions / Unreads` flow is the only first-party answer to "I care about ~10 channels across ~30 servers," and it's not great.

## The mental model

There are two layers of attention here. Understanding them is most of the README.

### Pins (server-level)

Right-click any server → **Toggle Server Pin**, or right-click any channel inside it → **Toggle Channel Pin** to add the whole server (the channel-level path is a shortcut). A pinned server appears in the sidebar with all its channels (and threads) underneath it.

**Why pin a server instead of pinning channels one by one:** when new channels or threads appear inside a pinned server, they show up automatically in the sidebar. Pin-the-server-once and forget; the plugin keeps up.

### Favorites (channel-level)

Inside the sidebar, every row has a star. Click the star to favorite that channel (or thread, or DM, or group DM). Favorites are the channels you *really* care about — the inner ring inside the broader "I pinned this server" outer ring.

You can favorite without pinning the server first; the plugin's smart enough to surface a favorite wherever it lives. But the canonical workflow is:

1. **Pin** every server that has anything in it relevant to you (be generous — pinning is cheap).
2. **Favorite** the specific channels / threads / DMs you want top-of-mind.
3. Live in **Favorites** view (see next section).

This gives you a tight, curated working set plus a safety net that auto-surfaces new activity in your broader "pinned" universe.

### View modes (the dropdown at the top of the sidebar)

| Mode             | What you see                                                                 |
|------------------|------------------------------------------------------------------------------|
| **All**          | Every pinned server, every channel/thread inside it.                          |
| **Favorites**    | Your favorited channels — **plus any non-favorited channel with unreads** from your pinned servers. So you stay in a focused view while still getting tapped on the shoulder when something fires in the broader pinned set. |
| **Unreads-only** | Only channels with unreads. Mention badges show counts.                       |

**Favorites is the mode most people will live in.** It's the productivity sweet spot — narrow attention by default, but new activity in your other pinned channels still bubbles up.

### DMs and group DMs are first-class

Everything above works for **DMs and group DMs** the same way it works for server channels. Right-click → pin it; star → favorite it. They show up in the sidebar alongside server channels.

### Threads cascade from their parent

If you favorite a text/forum/media channel, every thread under that parent is treated as "effectively favorited" — they show up under their parent in Favorites view without needing to star each thread individually. Star a thread directly if you want to single it out.

## What it does (feature list)

- Always-visible sidebar pinned to the left edge of Discord
- Pin servers + channels + DMs + group DMs from right-click menus
- Favorite (star) any of the above
- View dropdown: All / Favorites / Unreads-only
- Mention badges with counts, red dots for plain unreads
- Threads grouped under their parent channel (configurable: cap + activity window)
- Animated background shader for the sidebar (or for ALL of Discord, optionally)
- Slash command `/pins` to open a popup overview from any channel
- Click any row → jumps you straight to that channel

## Install

You need Vencord installed on Discord desktop *as a dev install* (the regular vencord.dev one-click installer can't load userplugins). If you don't have that yet, follow Vencord's source-install docs: <https://docs.vencord.dev/installing/>.

Then, from your Vencord checkout:

```bash
cd /path/to/Vencord
mkdir -p src/userplugins
cd src/userplugins
git clone https://github.com/curlyfrighz/discord-channel-pins.git ChannelPins
cd ../..
pnpm build
pnpm inject   # only if your Discord isn't already injected with this dev build
```

Restart Discord. In **User Settings → Vencord → Plugins**, find **ChannelPins**, enable it. The sidebar appears on the left edge of Discord; the **/pins** slash command works in any channel.

## Settings (User Settings → Vencord → Plugins → ChannelPins → cog icon)

| Setting | Default | What it does |
|---|---|---|
| `threadActiveDays` | `3` | Only show threads with activity in the last N days. Lower = less noise. `0` = show all threads. |
| `maxThreadsPerParent` | `25` | Hard cap on threads under any single parent channel. |
| `backgroundEffect` | `Aurora` | Animated background shader for the sidebar. Options: **None**, **Aurora** (purple/cyan flowing noise), **Plasma** (classic shifting waves), **Stars** (slow drifting starfield), **Liquid** (fractal noise drift), **Flow** (warped color field). |
| `backgroundOpacity` | `70` | Background effect opacity (0–100). Lower if rows are hard to read. |
| `starsMotion` | `Streak down` | Stars-preset motion mode. **Streak down** = cinematic falling streaks; **Random** = each star drifts its own direction. |
| `discordWideBackground` | `off` | Run the shader behind **all** of Discord, not just the sidebar. Requires a Discord reload to fully apply. |
| `discordLeftShaderIntensity` | `40` | Shader visibility on the left side of Discord (server list + secondary sidebar). 0–100. Used only when `discordWideBackground` is on. |
| `discordRightShaderIntensity` | `20` | Shader visibility on the right side of Discord (chat panel). 0–100. Used only when `discordWideBackground` is on. |

## Caveats

- This is a Discord client modification. Discord's ToS forbids client mods; enforcement against personal Vencord users is effectively nonexistent in practice, but the risk is your account. Don't run it on an account you can't afford to lose.
- Mention/unread counts rely on Discord's internal `ReadStateStore` which moves around between Discord versions. The plugin wraps those calls in try/catch and silently no-ops if the API shape changes. If badges ever look off after a Discord update, file an issue.
- Vencord userplugins can't be installed via the one-click installer — you need a Vencord dev install. See the Install section above.

## Development

```bash
# from this repo (standalone, editor type-checking)
tsc --noEmit
```

The source uses Vencord's internal module paths (`@api/*`, `@utils/*`, `@webpack/common`). `src/vencord-shims.d.ts` provides loose ambient declarations so the source type-checks outside a Vencord checkout. When copied into `Vencord/src/userplugins/ChannelPins/`, Vencord's real type roots take over and the shims become harmless.

## License

MIT.
