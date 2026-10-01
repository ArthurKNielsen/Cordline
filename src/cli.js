import React, {useState} from 'react';
import {render} from 'ink';
import {App} from './ui/App.js';
import {Login} from './ui/Login.js';
import {DiscordClient} from './discord.js';
import {DemoClient} from './demo.js';
import {loadConfig, saveConfig, clearToken, configPath} from './config.js';

const h = React.createElement;

const HELP = `discord-terminal — Discord, but in your terminal

Usage
  discord-terminal              log in (or reuse the saved token)
  discord-terminal --demo       try it with fake servers, no account needed
  discord-terminal --logout     forget the saved token

Options
  --token <token>     use this token (also: DISCORD_TOKEN env var)
  --bot               treat the token as a bot token
  -h, --help          show this help

Config is stored at ${configPath}`;

function Root({initialClient, demo}) {
	const [client, setClient] = useState(initialClient);
	if (!client) {
		return h(Login, {
			onDone: (c, token) => {
				saveConfig({...loadConfig(), token});
				setClient(c);
			},
		});
	}
	return h(App, {client, demo, onLogout: () => !demo && clearToken()});
}

export async function main(argv) {
	const args = argv.slice(2);
	if (args.includes('-h') || args.includes('--help')) {
		console.log(HELP);
		return;
	}
	if (args.includes('--logout')) {
		clearToken();
		console.log('Logged out — saved token removed.');
		return;
	}
	if (!process.stdin.isTTY) {
		console.error('discord-terminal needs an interactive terminal (TTY).');
		process.exit(1);
	}

	const demo = args.includes('--demo');
	let client = null;
	if (demo) {
		client = new DemoClient();
		await client.login();
	} else {
		const i = args.indexOf('--token');
		let token = (i >= 0 ? args[i + 1] : null) ?? process.env.DISCORD_TOKEN ?? loadConfig().token;
		if (token && args.includes('--bot') && !/^Bot /i.test(token)) token = `Bot ${token}`;
		if (token) {
			process.stdout.write('\x1b[38;2;88;101;242m✻\x1b[0m Connecting to Discord…\n');
			const c = new DiscordClient(token);
			try {
				await c.login();
				client = c;
			} catch (err) {
				c.destroy();
				process.stdout.write(`\x1b[31m  ⎿  ${err.message}\x1b[0m\n`);
			}
		}
	}

	const instance = render(h(Root, {initialClient: client, demo}), {exitOnCtrlC: false, alternateScreen: true, incrementalRendering: true});
	await instance.waitUntilExit();
	process.stdout.write('\x1b]0;\x07');
	process.exit(0);
}
