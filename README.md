# discord-channel-pins

A [Vencord](https://vencord.dev) **userplugin** that gives you a single flat
list of "pinned" channels from many Discord servers in one view — the thing
stock Discord (and Vencord stable, as of writing) doesn't ship.

Built because Discord's `Inbox > Mentions` / `Unreads` flow is the only
first-party answer to "I care about ~10 channels across ~30 servers," and it's
not great.

## What it does

- Right-click any channel (text, thread, GDM, DM) → **Toggle Channel Pin**.
- Run `/pins` in any channel, or pick **Open Channel Pins…** from the same
  context menu, to open a popup listing every pinned channel.
- Each row shows `#channel` + server name. Unread channels float above read
  ones. Mention counts show as a red badge.
- Click a row → jumps to that channel. Replies are sent as you, in the real
  channel. Discord's native notification settings still apply.
- Pins persist via Vencord's `DataStore` (IndexedDB), so they survive
  reloads and Vencord updates.

## Why it's safe(r) than self-bots

This is a **client mod**, not a self-bot. It runs inside the official Discord
client, logged in as you, and does only what you could do by clicking around
manually. It does not poll the Discord API on your behalf, scrape DMs, or
relay messages anywhere.

That said, **any** Discord client modification is technically against ToS.
Enforcement against personal Vencord users is effectively nonexistent in
practice, but the risk is your account. Don't run it on an account you can't
afford to lose.

## Install

You need Vencord already installed on Discord desktop. If you don't, follow
the official guide first: <https://vencord.dev/download>.

Then:

```bash
# from a Vencord source checkout
cd /path/to/Vencord
mkdir -p src/userplugins
cd src/userplugins
git clone https://github.com/<you>/discord-channel-pins.git ChannelPins
cd ../..
pnpm build
pnpm inject  # if you have a stock Discord install; skip if already injected
```

Restart Discord. In **Settings → Vencord → Plugins**, find **ChannelPins**
and enable it.

> **Note:** Vencord requires building from source to load userplugins; the
> drag-and-drop installer can't load them. Their docs cover the source path:
> <https://docs.vencord.dev/installing/>.

## Usage

| Action                         | How                                       |
|--------------------------------|-------------------------------------------|
| Pin a channel                  | Right-click channel → Toggle Channel Pin  |
| Open the pins panel            | `/pins` in any channel, or context menu   |
| Jump to a pinned channel       | Click its row in the panel                |
| Unpin                          | "Unpin" button on the row                 |

## v0.1 scope

What's in:
- Toggle pin via context menu
- Slash command `/pins` to open panel
- Flat list, sorted: mentions → unread → name
- Persistence
- Click-to-navigate

What's not (yet):
- Always-visible sidebar section (you have to open the panel — `/pins`).
  v0.2 candidate: inject above the DM list.
- Drag-to-reorder
- Per-pin custom labels
- Folders / grouping
- Keyboard shortcut to toggle the panel
- Mention/unread counts via Discord's own stores work best-effort — the
  internal `ReadStateStore` API moves around between Discord versions, so
  the badge logic is wrapped in try/catch and silently no-ops if the API
  shape changes.

## Development

```bash
# this repo (standalone, editor type-checking)
tsc --noEmit
```

The source uses Vencord's internal module paths (`@api/*`, `@utils/*`,
`@webpack/common`). `src/vencord-shims.d.ts` provides loose ambient
declarations so the source type-checks outside a Vencord checkout. When
copied into `Vencord/src/userplugins/ChannelPins/`, Vencord's real type roots
take over and the shims are harmless.

## License

MIT.
