# Discord-Terminal

Discord in your terminal, styled after Claude Code but in Discord blurple instead of orange.

![chat view](docs/screenshots/typing.png)

## Features

- **Discord layout.** The full-screen view has a server rail, a channel sidebar with categories, the chat in the middle and a member list on the right. Unread badges appear on servers and channels, plus a "Welcome to #channel!" header at the start of each channel.
- **Claude Code look.** Panels have rounded borders with titles set into the border, and the app uses the `>` prompt box, `/` command autocomplete, `●` message bullets, `❯` selection, the `✻` spinner with "esc to interrupt", and a `? for shortcuts` status line, all in Discord blurple. Your own messages are shown as highlighted `>` lines, the same way Claude Code shows what you typed.
- **Your real Discord.** You can browse servers, channels, DMs and group DMs. Message history loads when you open a channel, and new messages arrive live over the Discord Gateway.
- **Keyboard navigation.** `tab` moves to the sidebar, `←/→` switches servers, `alt+↑/↓` moves to the previous or next channel, `ctrl+k` opens a quick switcher, and `pgup/pgdn` scrolls.
- **Live updates.** You get typing indicators ("Nova is typing..."), DM and mention notifications, and an unread counter.
- **Discord markdown** rendering: **bold**, *italics*, `code`, code blocks, quotes, spoilers, mentions, channel links, custom emoji, timestamps, attachments and embeds.
- **Permission-aware.** Channels you can't see are hidden.
- **Adapts to window size.** The member list and server rail hide themselves in smaller terminals.
- **Demo mode** with fake servers, so you can try it without logging in.

| | |
|---|---|
| ![welcome](docs/screenshots/welcome.png) | ![browse channels](docs/screenshots/browse.png) |
| ![chat](docs/screenshots/chat.png) | ![quick switcher](docs/screenshots/switcher.png) |
| ![code blocks](docs/screenshots/code.png) | ![DMs](docs/screenshots/dm.png) |
| ![commands](docs/screenshots/commands.png) | ![shortcuts](docs/screenshots/shortcuts.png) |
| ![login](docs/screenshots/login.png) | |

## Install

### Option A: download the app (easiest, no Node.js needed)

1. Go to the [**Releases page**](https://github.com/EnSpecielPerson/Discord-Terminal/releases/latest) and download the file for your OS:
   - **Windows:** `discord-terminal-windows-x64.exe`
   - **macOS:** `discord-terminal-darwin-arm64` (M1/M2/M3/M4) or `discord-terminal-darwin-x64` (Intel)
   - **Linux:** `discord-terminal-linux-x64`
2. Run it **from a terminal**. Use Windows Terminal, PowerShell or cmd on Windows, and Terminal on macOS.

**Windows** (in PowerShell, from your Downloads folder):
```powershell
cd ~\Downloads
.\discord-terminal-windows-x64.exe --demo   # try it with fake data
.\discord-terminal-windows-x64.exe          # log in for real
```
Double-clicking the exe also works; it opens in a console window. If Windows SmartScreen warns you, click **More info → Run anyway**. The exe isn't code-signed, which is normal for small open-source apps.

**macOS / Linux:**
```sh
cd ~/Downloads
chmod +x discord-terminal-*
xattr -d com.apple.quarantine discord-terminal-darwin-*   # macOS only, removes the "unidentified developer" block
./discord-terminal-darwin-arm64 --demo
```

For the best look, use a modern terminal such as Windows Terminal, iTerm2, Ghostty or the default macOS Terminal.

### Option B: run from source

Requires **Node.js 22+**.

```sh
git clone https://github.com/enspecielperson/discord-terminal
cd discord-terminal
npm install
npm link            # optional: puts `discord-terminal` on your PATH

discord-terminal --demo   # try it with fake data first
discord-terminal          # log in for real
```

## Logging in

On first launch you choose a login method and paste a token. The token is saved to `~/.config/discord-terminal/config.json` (file mode `600`). Run `/logout` or `discord-terminal --logout` to remove it.

### Option 1: Discord account (user token)

This shows **your** servers, channels and DMs, just like the real app.

> ⚠️ **Read this first.** Logging in to a third-party client with a user token ("self-botting") is **against Discord's Terms of Service**. Discord can flag or ban accounts for it. Use it at your own risk. **Never share your token with anyone.** Anyone who has it has full access to your account. If it leaks, change your password, which resets the token.

To get your token: open Discord in a browser, open DevTools (`F12`), go to the **Network** tab and click any channel. Find a request to `discord.com/api`, then copy the value of its `Authorization` request header.

### Option 2: Bot account (officially supported)

1. Go to <https://discord.com/developers/applications>, create an app, open **Bot**, then **Reset Token**.
2. On the same page, enable the **Message Content Intent**.
3. Invite the bot to your server (**OAuth2 → URL Generator**, with scope `bot` and the permissions *View Channels*, *Send Messages* and *Read Message History*).
4. Choose **Bot account** at login and paste the token.

A bot only sees the servers it has been added to.

You can also pass a token directly: `DISCORD_TOKEN=... discord-terminal`, or `discord-terminal --token <token> [--bot]`.

## Commands and shortcuts

| Command | |
|---|---|
| `/servers` | Pick a server |
| `/channels` | Move to the channel sidebar |
| `/dms` | Show your direct messages in the sidebar |
| `/goto [name]` | Jump to any channel or DM |
| `/reload` | Reload the current channel |
| `/clear` | Clear the chat view |
| `/whoami` | Show the logged-in account |
| `/help` | Help |
| `/logout` | Forget the token and exit |
| `/exit` | Quit |

| Key | |
|---|---|
| `tab` | Move to the channel sidebar (`↑/↓` select, `enter` open, `←/→` switch server, `esc` back) |
| `ctrl+k` | Quick switcher |
| `alt+↑` / `alt+↓` | Previous / next channel |
| `pgup` / `pgdn` | Scroll messages |
| `?` | Show shortcuts |
| `↑` / `↓` | Input history (or move through autocomplete) |
| `\` + `enter` | Newline |
| `esc` | Cancel, interrupt loading, or jump back to the newest message |
| `ctrl+l` | Clear the chat view |
| `ctrl+u` / `ctrl+w` | Clear the line / delete a word |
| `ctrl+c` ×2 | Exit |

## How it works

The app is built with [Ink](https://github.com/vadimdemedes/ink), the React-for-terminals renderer that Claude Code also uses. It has no Discord library dependency. It talks to Discord's REST API (`/api/v10`) and Gateway websocket directly. That keeps it small and lets the same code handle both bot and user tokens.

```
src/
  cli.js          entry point, args, token loading
  discord.js      REST + Gateway client, permission checks
  demo.js         offline fake client for --demo
  format.js       Discord markdown → styled segments
  ui/App.js       main screen: layout, chat, prompt, commands, keys
  ui/layout.js    server rail, channel sidebar, member list, panels
  ui/Login.js     login flow
  ui/components.js banner, picker, prompt box, spinner, messages
  ui/theme.js     blurple palette, ASCII logo + mascot
```

## Building the executables yourself

```sh
npm install
bun scripts/build.js                 # all platforms → dist/
bun scripts/build.js windows-x64     # just the Windows .exe
```

Pushing a `v*` tag (or running the workflow manually from the Actions tab) runs `.github/workflows/release.yml`, which builds every platform and publishes a GitHub Release.
