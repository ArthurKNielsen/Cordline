import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Box, Static, Text, useApp, useInput, usePaste, useStdout, useWindowSize} from 'ink';
import {theme} from './theme.js';
import {Banner, ChannelHeader, MessageView, Picker, PromptInput, Spinner, SystemLine, TypingLine} from './components.js';
import {ChannelType, isTextChannel} from '../discord.js';
import {displayName, preview} from '../format.js';

const h = React.createElement;

export const COMMANDS = [
	{name: 'servers', desc: 'Browse your servers and their channels'},
	{name: 'channels', desc: 'Browse channels in the current server'},
	{name: 'dms', desc: 'Browse your direct messages'},
	{name: 'goto', desc: 'Jump to any channel or DM (ctrl+k)', args: '[name]'},
	{name: 'reload', desc: 'Reload messages in the current channel'},
	{name: 'clear', desc: 'Clear the screen (ctrl+l)'},
	{name: 'whoami', desc: 'Show the account you are logged in as'},
	{name: 'help', desc: 'Show help and keyboard shortcuts'},
	{name: 'logout', desc: 'Forget the saved token and exit'},
	{name: 'exit', desc: 'Exit Discord Terminal'},
];

const SHORTCUTS = [
	['/ for commands', 'ctrl+k to jump anywhere', 'esc to cancel / interrupt'],
	['↑/↓ for input history', 'ctrl+l to clear screen', '\\⏎ for a newline'],
	['tab to autocomplete', 'ctrl+u to clear input', 'ctrl+c twice to exit'],
];

let itemSeq = 0;
const item = (kind, data) => ({id: `i${itemSeq++}`, kind, ...data});

export function App({client, demo, onLogout}) {
	const {exit} = useApp();
	const {stdout} = useStdout();
	const {columns, rows} = useWindowSize();

	const [items, setItems] = useState(() => [item('banner', {})]);
	const [staticKey, setStaticKey] = useState(0);
	const [current, setCurrent] = useState(null);
	const [overlay, setOverlay] = useState(null);
	const [value, setValue] = useState('');
	const [cursor, setCursor] = useState(0);
	const [loading, setLoading] = useState(null);
	const [typers, setTypers] = useState({});
	const [unread, setUnread] = useState({});
	const [notice, setNotice] = useState(null);
	const [showHelp, setShowHelp] = useState(false);
	const [acIndex, setAcIndex] = useState(0);
	const [status, setStatus] = useState('connected');
	const [, forceUpdate] = useState(0);

	const currentRef = useRef(null);
	const loadRef = useRef(0);
	const pendingRef = useRef(null);
	const lastMsgRef = useRef(null);
	const historyRef = useRef({list: [], index: -1, draft: ''});
	const ctrlCRef = useRef(0);
	const noticeTimer = useRef(null);

	const flash = useCallback((text, color = theme.brandLight, ms = 6000) => {
		clearTimeout(noticeTimer.current);
		setNotice({text, color});
		noticeTimer.current = setTimeout(() => setNotice(null), ms);
	}, []);

	const push = useCallback((...newItems) => setItems(prev => [...prev, ...newItems]), []);

	const messageItem = useCallback(msg => {
		const last = lastMsgRef.current;
		const t = new Date(msg.timestamp).getTime();
		const compact = Boolean(last && last.channelId === msg.channel_id && last.authorId === msg.author?.id && t - last.time < 7 * 60000 && !msg.referenced_message && msg.type === 0);
		lastMsgRef.current = {channelId: msg.channel_id, authorId: msg.author?.id, time: t};
		return item('message', {msg, compact});
	}, []);

	const channelLabel = useCallback(
		ch => {
			if (!ch) return '';
			if (ch.guild_id) return `#${ch.name}`;
			return `@${client.dmName(ch)}`;
		},
		[client],
	);

	// ---------- Gateway events ----------

	useEffect(() => {
		const onMessage = msg => {
			if (msg.author) client.users.set(msg.author.id, msg.author);
			setTypers(t => {
				if (!t[msg.author?.id]) return t;
				const {[msg.author.id]: _, ...rest} = t;
				return rest;
			});
			if (msg.channel_id === currentRef.current) {
				if (pendingRef.current) pendingRef.current.push(msg);
				else push(messageItem(msg));
				return;
			}
			if (msg.author?.id === client.user?.id) return;
			setUnread(u => ({...u, [msg.channel_id]: (u[msg.channel_id] ?? 0) + 1}));
			const ch = client.channels.get(msg.channel_id);
			const mentioned = msg.mentions?.some(u => u.id === client.user?.id);
			if (ch && (!ch.guild_id || mentioned)) {
				const where = ch.guild_id ? ` in #${ch.name}` : '';
				flash(`✉ ${displayName(msg.author, msg.member)}${where}: ${preview(msg, 50)}  · ctrl+k to jump`);
			}
		};
		const onTyping = d => {
			if (d.channel_id !== currentRef.current) return;
			const user = d._user ?? d.member?.user ?? client.users.get(d.user_id);
			const name = displayName(user, d.member);
			setTypers(t => ({...t, [d.user_id]: {name, until: Date.now() + 10000}}));
		};
		const onUpdate = () => forceUpdate(x => x + 1);
		const onStatus = s => setStatus(s);
		const onFatal = err => push(item('system', {level: 'error', lines: [`⎿  ${err.message}`]}));
		client.on('message', onMessage);
		client.on('typing', onTyping);
		client.on('update', onUpdate);
		client.on('status', onStatus);
		client.on('fatal', onFatal);
		return () => {
			client.off('message', onMessage);
			client.off('typing', onTyping);
			client.off('update', onUpdate);
			client.off('status', onStatus);
			client.off('fatal', onFatal);
		};
	}, [client, push, messageItem, flash]);

	// ---------- Navigation ----------

	const openChannel = useCallback(
		async channelId => {
			const ch = client.channels.get(channelId);
			if (!ch) return;
			const label = channelLabel(ch);
			const guild = ch.guild_id ? client.guilds.get(ch.guild_id) : null;
			setOverlay(null);
			setCurrent(channelId);
			currentRef.current = channelId;
			setTypers({});
			setUnread(u => {
				const {[channelId]: _, ...rest} = u;
				return rest;
			});
			stdout.write(`\x1b]0;Discord · ${label}\x07`);
			const token = ++loadRef.current;
			pendingRef.current = [];
			setLoading({label: `Loading ${label}…`, startedAt: Date.now()});
			try {
				const msgs = await client.getMessages(channelId);
				if (token !== loadRef.current) return;
				const seen = new Set(msgs.map(m => m.id));
				const late = pendingRef.current.filter(m => !seen.has(m.id));
				pendingRef.current = null;
				lastMsgRef.current = null;
				const where = guild ? guild.name : ch.type === ChannelType.GROUP_DM ? 'Group DM' : 'Direct message';
				const detail = [where, `${msgs.length} message${msgs.length === 1 ? '' : 's'} loaded`, ch.topic].filter(Boolean).join(' · ');
				push(item('channel', {label, detail}), ...[...msgs, ...late].map(messageItem));
			} catch (err) {
				if (token !== loadRef.current) return;
				pendingRef.current = null;
				const msg = err.status === 403 ? "You don't have permission to read this channel." : err.message;
				push(item('channel', {label, detail: guild?.name ?? 'Direct message'}), item('system', {level: 'error', tight: true, lines: [`  ⎿  ${msg}`]}));
			} finally {
				if (token === loadRef.current) setLoading(null);
			}
		},
		[client, channelLabel, push, messageItem, stdout],
	);

	const guildUnread = useCallback(guild => [...guild.channels.keys()].reduce((n, id) => n + (unread[id] ?? 0), 0), [unread]);

	const openChannels = useCallback(
		guildId => {
			const guild = client.guilds.get(guildId);
			const channels = client.guildChannels(guildId);
			setOverlay({
				title: `${guild.name} › Select a channel`,
				subtitle: `${channels.filter(isTextChannel).length} text channels`,
				items: channels.map(ch => {
					const voice = ch.type === ChannelType.VOICE || ch.type === ChannelType.STAGE;
					const forum = ch.type === ChannelType.FORUM || ch.type === ChannelType.MEDIA;
					return {
						key: ch.id,
						value: ch.id,
						label: ch.name,
						icon: voice ? '🔊' : forum ? '💬' : ch.type === ChannelType.ANNOUNCEMENT ? '📣' : '#',
						group: ch.category ?? '',
						hint: voice ? 'voice · not supported' : forum ? 'forum · not supported' : ch.id === currentRef.current ? 'current' : undefined,
						disabled: voice || forum,
						badge: unread[ch.id],
					};
				}),
				onSelect: it => openChannel(it.value),
			});
		},
		[client, openChannel, unread],
	);

	const openServers = useCallback(() => {
		const guilds = client.sortedGuilds();
		setOverlay({
			title: 'Select a server',
			subtitle: `You are in ${guilds.length} server${guilds.length === 1 ? '' : 's'}`,
			items: guilds.map(g => ({key: g.id, value: g.id, label: g.name, hint: `${client.guildChannels(g.id).filter(isTextChannel).length} channels`, badge: guildUnread(g) || undefined})),
			onSelect: it => openChannels(it.value),
		});
	}, [client, guildUnread, openChannels]);

	const openDMs = useCallback(() => {
		const dms = client.sortedDMs();
		setOverlay({
			title: 'Direct Messages',
			subtitle: client.isBot ? 'Bots only see DMs that were opened while running' : `${dms.length} conversations`,
			items: dms.map(dm => ({
				key: dm.id,
				value: dm.id,
				label: client.dmName(dm),
				icon: dm.type === ChannelType.GROUP_DM ? '👥' : '@',
				hint: dm.type === ChannelType.GROUP_DM ? `${dm.recipients?.length ?? 0} members` : dm.recipients?.[0]?.username ? `@${dm.recipients[0].username}` : undefined,
				badge: unread[dm.id],
			})),
			onSelect: it => openChannel(it.value),
		});
	}, [client, openChannel, unread]);

	const openSwitcher = useCallback(
		(initialFilter = '') => {
			const list = [];
			for (const dm of client.sortedDMs()) list.push({key: dm.id, value: dm.id, label: client.dmName(dm), icon: '@', hint: 'DM', group: 'Direct Messages', badge: unread[dm.id]});
			for (const g of client.sortedGuilds()) {
				for (const ch of client.guildChannels(g.id).filter(isTextChannel)) {
					list.push({key: ch.id, value: ch.id, label: ch.name, icon: '#', search: g.name, group: g.name, badge: unread[ch.id]});
				}
			}
			list.sort((a, b) => (b.badge ?? 0) - (a.badge ?? 0) || 0);
			setOverlay({title: 'Jump to…', subtitle: 'Search every channel and DM', items: list, onSelect: it => openChannel(it.value), initialFilter});
		},
		[client, openChannel, unread],
	);

	const clearScreen = useCallback(() => {
		stdout.write('\x1b[2J\x1b[3J\x1b[H');
		lastMsgRef.current = null;
		setItems([]);
		setStaticKey(k => k + 1);
	}, [stdout]);

	const quit = useCallback(() => {
		client.destroy();
		exit();
	}, [client, exit]);

	// ---------- Commands ----------

	const runCommand = useCallback(
		line => {
			const [cmd, ...rest] = line.slice(1).split(' ');
			const arg = rest.join(' ').trim();
			push(item('system', {title: true, lines: [`> /${cmd}${arg ? ` ${arg}` : ''}`]}));
			switch (cmd) {
				case 'servers':
				case 's':
					return openServers();
				case 'channels':
				case 'c': {
					const ch = client.channels.get(currentRef.current);
					return ch?.guild_id ? openChannels(ch.guild_id) : openServers();
				}
				case 'dms':
				case 'dm':
					return openDMs();
				case 'goto':
				case 'switch':
					return openSwitcher(arg);
				case 'reload':
					if (!currentRef.current) return push(item('system', {level: 'error', tight: true, lines: ['  ⎿  No channel open — try /servers']}));
					return openChannel(currentRef.current);
				case 'clear':
					return clearScreen();
				case 'whoami':
					return push(
						item('system', {
							tight: true,
							lines: [
								`  ⎿  Logged in as ${client.user.global_name ?? client.user.username} (@${client.user.username}) · ${client.isBot ? 'bot account' : demo ? 'demo account' : 'user account'} · ${client.guilds.size} servers`,
							],
						}),
					);
				case 'help':
					return push(
						item('system', {
							tight: true,
							lines: [
								'  ⎿  Commands',
								...COMMANDS.map(c => `       /${(c.name + (c.args ? ` ${c.args}` : '')).padEnd(14)} ${c.desc}`),
								'',
								'     Shortcuts',
								...SHORTCUTS.flat().map(s => `       ${s}`),
							],
						}),
					);
				case 'logout':
					onLogout?.();
					return quit();
				case 'exit':
				case 'quit':
					return quit();
				default:
					return push(item('system', {level: 'error', tight: true, lines: [`  ⎿  Unknown command /${cmd} — type /help`]}));
			}
		},
		[client, demo, push, openServers, openChannels, openDMs, openSwitcher, openChannel, clearScreen, quit, onLogout],
	);

	const submit = useCallback(async () => {
		const text = value.trim();
		setValue('');
		setCursor(0);
		setShowHelp(false);
		if (!text) return;
		const hist = historyRef.current;
		hist.list.push(text);
		hist.index = -1;
		if (text.startsWith('/')) return runCommand(text);
		const channelId = currentRef.current;
		if (!channelId) {
			push(item('system', {lines: [`> ${text}`]}), item('system', {level: 'error', tight: true, lines: ['  ⎿  No channel open yet — use /servers, /dms or ctrl+k to pick one']}));
			return;
		}
		try {
			await client.sendMessage(channelId, text);
		} catch (err) {
			push(item('system', {lines: [`> ${text}`], tight: false}), item('system', {level: 'error', tight: true, lines: [`  ⎿  Failed to send: ${err.message}`]}));
		}
	}, [value, client, push, runCommand]);

	// ---------- Input ----------

	const acMatches = value.startsWith('/') && !value.includes(' ') ? COMMANDS.filter(c => c.name.startsWith(value.slice(1).toLowerCase())) : [];
	const acSel = Math.min(acIndex, Math.max(acMatches.length - 1, 0));

	const insert = useCallback(
		text => {
			setValue(v => v.slice(0, cursor) + text + v.slice(cursor));
			setCursor(c => c + text.length);
			setAcIndex(0);
			if (currentRef.current && !value.startsWith('/') && !text.startsWith('/')) client.triggerTyping(currentRef.current);
		},
		[cursor, client, value],
	);

	usePaste(text => insert(text.replace(/\r\n?/g, '\n')), {isActive: !overlay});

	useInput(
		(input, key) => {
			if (key.ctrl && input === 'c') {
				if (value) {
					setValue('');
					setCursor(0);
					return;
				}
				if (Date.now() - ctrlCRef.current < 2000) return quit();
				ctrlCRef.current = Date.now();
				flash('Press Ctrl-C again to exit', theme.subtle, 2000);
				return;
			}
			if (key.ctrl && input === 'k') return openSwitcher();
			if (key.ctrl && input === 'l') return clearScreen();
			if (key.ctrl && input === 'u') {
				setValue(v => v.slice(cursor));
				setCursor(0);
				return;
			}
			if (key.ctrl && input === 'w') {
				const before = value.slice(0, cursor).replace(/\S+\s*$/, '');
				setValue(before + value.slice(cursor));
				setCursor(before.length);
				return;
			}
			if (key.ctrl && input === 'a') return setCursor(0);
			if (key.ctrl && input === 'e') return setCursor(value.length);
			if (key.escape) {
				if (loading) {
					loadRef.current++;
					pendingRef.current = null;
					setLoading(null);
					push(item('system', {level: 'error', tight: true, lines: ['  ⎿  Interrupted']}));
					return;
				}
				if (showHelp) return setShowHelp(false);
				setValue('');
				setCursor(0);
				return;
			}
			if (key.return) {
				if (value.endsWith('\\') && cursor === value.length) {
					setValue(v => `${v.slice(0, -1)}\n`);
					return;
				}
				if (acMatches.length && !COMMANDS.some(c => `/${c.name}` === value.trim())) {
					const cmd = acMatches[acSel];
					setValue('');
					setCursor(0);
					historyRef.current.list.push(`/${cmd.name}`);
					return runCommand(`/${cmd.name}`);
				}
				return submit();
			}
			if (key.tab) {
				if (acMatches.length) {
					const v = `/${acMatches[acSel].name} `;
					setValue(v);
					setCursor(v.length);
				}
				return;
			}
			if (key.upArrow || key.downArrow) {
				if (acMatches.length) {
					setAcIndex(i => (key.upArrow ? Math.max(i - 1, 0) : Math.min(i + 1, acMatches.length - 1)));
					return;
				}
				const hist = historyRef.current;
				if (!hist.list.length) return;
				if (key.upArrow) {
					if (hist.index === -1) {
						hist.draft = value;
						hist.index = hist.list.length - 1;
					} else hist.index = Math.max(hist.index - 1, 0);
				} else {
					if (hist.index === -1) return;
					hist.index++;
					if (hist.index >= hist.list.length) hist.index = -1;
				}
				const v = hist.index === -1 ? hist.draft : hist.list[hist.index];
				setValue(v);
				setCursor(v.length);
				return;
			}
			if (key.leftArrow) return setCursor(c => Math.max(c - 1, 0));
			if (key.rightArrow) return setCursor(c => Math.min(c + 1, value.length));
			if (key.home) return setCursor(0);
			if (key.end) return setCursor(value.length);
			if (key.backspace) {
				if (cursor === 0) return;
				setValue(v => v.slice(0, cursor - 1) + v.slice(cursor));
				setCursor(c => c - 1);
				setAcIndex(0);
				return;
			}
			if (key.delete) {
				setValue(v => v.slice(0, cursor) + v.slice(cursor + 1));
				return;
			}
			if (input === '?' && !value) {
				setShowHelp(s => !s);
				return;
			}
			if (input && !key.ctrl && !key.meta) {
				setShowHelp(false);
				insert(input);
			}
		},
		{isActive: !overlay},
	);

	// ---------- Render ----------

	const ch = current ? client.channels.get(current) : null;
	const guild = ch?.guild_id ? client.guilds.get(ch.guild_id) : null;
	const placeholder = ch ? `Message ${channelLabel(ch)}` : 'Type /servers to pick a channel, or press ctrl+k';
	const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);

	const renderItem = it => {
		switch (it.kind) {
			case 'banner': {
				const dms = client.sortedDMs().map(dm => ({id: dm.id, _label: client.dmName(dm)}));
				return h(Banner, {key: it.id, columns, user: client.user, guildCount: client.guilds.size, dms, demo});
			}
			case 'message':
				return h(MessageView, {key: it.id, msg: it.msg, client, compact: it.compact});
			case 'channel':
				return h(ChannelHeader, {key: it.id, item: it});
			default:
				return h(SystemLine, {key: it.id, item: it});
		}
	};

	const footer = showHelp
		? h(
				Box,
				{flexDirection: 'column', paddingX: 2},
				...SHORTCUTS.map((row, i) => h(Box, {key: i}, ...row.map((s, j) => h(Box, {key: j, width: Math.floor((columns - 4) / 3)}, h(Text, {color: theme.subtle}, s))))),
			)
		: acMatches.length
			? h(
					Box,
					{flexDirection: 'column', paddingX: 2},
					...acMatches.map((c, i) =>
						h(
							Box,
							{key: c.name},
							h(Box, {width: 22}, h(Text, {color: i === acSel ? theme.brandLight : theme.subtle, bold: i === acSel}, `/${c.name}${c.args ? ` ${c.args}` : ''}`)),
							h(Text, {color: i === acSel ? theme.brandLight : theme.dim}, c.desc),
						),
					),
				)
			: h(
					Box,
					{paddingX: 2, justifyContent: 'space-between'},
					h(Text, {color: theme.dim}, notice?.color === theme.subtle ? notice.text : '? for shortcuts'),
					h(
						Text,
						null,
						totalUnread ? h(Text, {color: theme.red}, `● ${totalUnread} unread  `) : null,
						h(Text, {color: status === 'connected' ? theme.green : theme.yellow}, '● '),
						ch
							? h(Text, {color: theme.brandLight}, channelLabel(ch), guild ? h(Text, {color: theme.subtle}, ` · ${guild.name}`) : null)
							: h(Text, {color: theme.subtle}, status === 'connected' ? (demo ? 'demo' : 'connected') : 'reconnecting…'),
					),
				);

	return h(
		Box,
		{flexDirection: 'column'},
		h(Static, {key: staticKey, items}, renderItem),
		loading ? h(Spinner, {label: loading.label, startedAt: loading.startedAt}) : null,
		overlay ? h(Picker, {...overlay, key: overlay.title, rows, onCancel: () => setOverlay(null)}) : null,
		notice && notice.color !== theme.subtle ? h(Box, {marginTop: 1, paddingX: 1}, h(Text, {color: notice.color}, notice.text)) : null,
		h(Box, {marginTop: 1, flexDirection: 'column'}, Object.keys(typers).length ? h(TypingLine, {typers}) : null, h(PromptInput, {value, cursor, placeholder, columns})),
		footer,
	);
}
