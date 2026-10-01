# Privacy Statement

_Last updated: October 1, 2026_

Cordline is an open-source Discord client that runs entirely on your own device. This statement explains what information Cordline handles and how.

## Summary

Cordline does not collect, store remotely, sell or share your token, your messages or any other information. The only service it communicates with is Discord.

## Information Cordline handles

| Information | How it is used | Where it goes |
|---|---|---|
| Your Discord token (user or bot) | To sign in to your Discord account | Saved on your device; sent only to Discord's official servers |
| Your servers, channels, direct messages and messages | Displayed in the app while you use it | Received from Discord and held in memory only; never written to disk or sent anywhere else |
| Messages you send | Delivered to the channel you choose | Sent only to Discord |

## Local storage

- Your token is saved in `~/.config/cordline/config.json` (or under `$XDG_CONFIG_HOME/cordline` if that is set).
- On macOS and Linux the file is created with permissions that allow only your user account to read it.
- The token is stored in plain text, not encrypted. Anyone with access to your user account on this device could read it, so protect your device accordingly.
- Messages and other account data are never saved to disk.

## Network connections

Cordline connects only to:

- `https://discord.com/api`, Discord's official API, to load and send messages
- `wss://gateway.discord.gg` (and the gateway URLs Discord provides during a session), Discord's official real-time messaging service

Cordline does not contact any other servers. It contains no analytics, telemetry, crash reporting, advertising or tracking of any kind, and its developers have no servers that could receive your data.

## Demo mode

`cordline --demo` uses built-in sample data and makes no network connections.

## Your control

- Run `/logout` inside the app, or `cordline --logout`, to delete the saved token from your device.
- Deleting the `cordline` configuration folder removes everything Cordline has stored.
- Changing your Discord password invalidates your current token everywhere.

## Your responsibility

Your Discord token gives full access to your account. Never share it with anyone, including people who claim to be from Cordline or Discord. Using a user token with a third-party client is against Discord's Terms of Service and may lead to action against your account. Bot tokens are the officially supported way to use Cordline.

## Verifying these statements

Cordline is open source. All network communication is implemented in [`src/discord.js`](src/discord.js), and local storage is handled in [`src/config.js`](src/config.js).
