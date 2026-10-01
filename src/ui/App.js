import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, useApp, useInput, usePaste, useStdout, useWindowSize} from 'ink';
import {theme} from './theme.js';
import {Banner, MessageView, Picker, PromptInput, Spinner, SystemLine, TypingLine} from './components.js';
import {HOME, MemberList, Panel, ServerRail, Sidebar, sidebarEntries} from './layout.js';
import {Clickable} from './mouse.js';
import {ChannelType, isTextChannel} from '../discord.js';
import {displayName, preview} from '../format.js';

const h = React.createElement;

export const COMMANDS = [
	{name: 'servers', desc: 'Pick a server'},
	{name: 'channels', desc: 'Browse channels in the sidebar (tab)'},
	{name: 'dms', desc: 'Show your direct messages'},
	{name: 'goto', desc: 'Jump to any channel or DM (ctrl+k)', args: '[name]'},
	{name: 'reload', desc: 'Reload messages in the current channel'},
	{name: 'clear', desc: 'Clear the chat view (ctrl+l)'},
	{name: 'whoami', desc: 'Show the account you are logged in as'},
	{name: 'help', desc: 'Show help and keyboard shortcuts'},
	{name: 'logout', desc: 'Forget the saved token and exit'},
	{name: 'exit', desc: 'Exit Cordline'},
];

const SHORTCUTS = [
	['/ for commands', 'ctrl+k to jump anywhere'],
	['tab to browse channels', '←/→ switch server (while browsing)'],
	['alt+↑/↓ prev/next channel', 'pgup/pgdn to scroll'],
	['↑/↓ input history', '\\⏎ for a newline'],
	['esc to cancel / interrupt', 'ctrl+c twice to exit'],
];

const MAX_RENDERED = 60;
let entrySeq = 0;
const entry = (kind, data) => ({id: `e${entrySeq++}`, kind, ...data});

export function App({client, demo, onLogout}) {
	const {exit} = useApp();
	const {stdout} = useStdout();
	const {columns, rows} = useWindowSize();

	const [guildId, setGuildId] = useState(() => client.sortedGuilds()[0]?.id ?? HOME);
	const [current, setCurrent] = useState(null);
	const [focus, setFocus] = useState('input'); // 'input' | 'nav'
	const [navCursor, setNavCursor] = useState(0);
	const [overlay, setOverlay] = useState(null);
	const [value, setValue] = useState('');
	const [cursor, setCursor] = useState(0);
	const [loading, setLoading] = useState(null);
	const [typers, setTypers] = useState({});
	const [unread, setUnread] = useState({});
	const [notice, setNotice] = useState(null);
	const [showHelp, setShowHelp] = useState(false);
	const [acIndex, setAcIndex] = useState(0);
	const [scroll, setScroll] = useState(0);
	const [status, setStatus] = useState('connected');
	const [, setTick] = useState(0);
	const rerender = useCallback(() => setTick(x => x + 1), []);

	const entriesRef = useRef(new Map()); // channelId | 'home' -> entries
	const currentRef = useRef(null);
	const loadRef = useRef(0);
	const pendingRef = useRef(null);
	const historyRef = useRef({list: [], index: -1, draft: ''});
	const ctrlCRef = useRef(0);
	const noticeTimer = useRef(null);

	const flash = useCallback((text, color = theme.brandLight, ms = 6000) => {
		clearTimeout(noticeTimer.current);
		setNotice({text, color});
		noticeTimer.current = setTimeout(() => setNotice(null), ms);
	}, []);

	const push = useCallback(
		(key, ...items) => {
			const k = key ?? 'home';
			entriesRef.current.set(k, [...(entriesRef.current.get(k) ?? []), ...items]);
			rerender();
		},
		[rerender],
	);
	const pushHere = useCallback((...items) => push(currentRef.current, ...items), [push]);

	const channelLabel = useCallback(ch => (!ch ? '' : ch.guild_id ? `#${ch.name}` : `@${client.dmName(ch)}`), [client]);

	const entries = useMemo(() => sidebarEntries(client, guildId), [client, guildId, unread, current]); // eslint-disable-line react-hooks/exhaustive-deps

	// ---------- Gateway events ----------

	useEffect(() => {
		const onMessage = msg => {
			if (msg.author) client.users.set(msg.author.id, msg.author);
			setTypers(t => {
				if (!t[msg.author?.id]) return t;
				const {[msg.author.id]: _, ...rest} = t;
				return rest;
			});
			if (pendingRef.current && msg.channel_id === currentRef.current) {
				pendingRef.current.push(msg);
				return;
			}
			if (entriesRef.current.has(msg.channel_id)) push(msg.channel_id, entry('msg', {msg}));
			if (msg.channel_id === currentRef.current || msg.author?.id === client.user?.id) return;
			setUnread(u => ({...u, [msg.channel_id]: (u[msg.channel_id] ?? 0) + 1}));
			const ch = client.channels.get(msg.channel_id);
			const mentioned = msg.mentions?.some(u => u.id === client.user?.id);
			if (ch && (!ch.guild_id || mentioned)) {
				const where = ch.guild_id ? ` in #${ch.name}` : '';
				flash(`✉ ${displayName(msg.author, msg.member)}${where}: ${preview(msg, 50)}`);
			}
		};
		const onTyping = d => {
			if (d.channel_id !== currentRef.current) return;
			const user = d._user ?? d.member?.user ?? client.users.get(d.user_id);
			setTypers(t => ({...t, [d.user_id]: {name: displayName(user, d.member), until: Date.now() + 10000}}));
		};
		const onStatus = s => setStatus(s);
		const onFatal = err => pushHere(entry('system', {level: 'error', lines: [`⎿  ${err.message}`]}));
		client.on('message', onMessage);
		client.on('typing', onTyping);
		client.on('update', rerender);
		client.on('status', onStatus);
		client.on('fatal', onFatal);
		return () => {
			client.off('message', onMessage);
			client.off('typing', onTyping);
			client.off('update', rerender);
			client.off('status', onStatus);
			client.off('fatal', onFatal);
		};
	}, [client, push, pushHere, rerender, flash]);

	// ---------- Navigation ----------

	const openChannel = useCallback(
		async (channelId, {reload = false} = {}) => {
			const ch = client.channels.get(channelId);
			if (!ch || !isTextChannel(ch)) return;
			const label = channelLabel(ch);
			const gid = ch.guild_id ?? HOME;
			setOverlay(null);
			setFocus('input');
			setGuildId(gid);
			const idx = sidebarEntries(client, gid).findIndex(e => e.id === channelId);
			if (idx >= 0) setNavCursor(idx);
			setCurrent(channelId);
			currentRef.current = channelId;
			setTypers({});
			setScroll(0);
			setUnread(u => {
				const {[channelId]: _, ...rest} = u;
				return rest;
			});
			stdout.write(`\x1b]0;Discord · ${label}\x07`);
			if (entriesRef.current.has(channelId) && !reload) return;
			const token = ++loadRef.current;
			pendingRef.current = [];
			setLoading({label: `Loading ${label}…`, startedAt: Date.now()});
			try {
				const msgs = await client.getMessages(channelId);
				if (token !== loadRef.current) return;
				const seen = new Set(msgs.map(m => m.id));
				const late = pendingRef.current.filter(m => !seen.has(m.id));
				pendingRef.current = null;
				const list = [...msgs, ...late].map(msg => entry('msg', {msg}));
				if (msgs.length < 50) list.unshift(entry('start', {ch}));
				entriesRef.current.set(channelId, list);
			} catch (err) {
				if (token !== loadRef.current) return;
				pendingRef.current = null;
				const text = err.status === 403 ? "You don't have permission to read this channel." : err.message;
				entriesRef.current.set(channelId, [entry('system', {level: 'error', lines: [`⎿  ${text}`]})]);
			} finally {
				if (token === loadRef.current) setLoading(null);
				rerender();
			}
		},
		[client, channelLabel, rerender, stdout],
	);

	const selectGuild = useCallback(
		gid => {
			setGuildId(gid);
			const list = sidebarEntries(client, gid);
			const curIdx = list.findIndex(e => e.id === currentRef.current);
			setNavCursor(
				curIdx >= 0
					? curIdx
					: Math.max(
							list.findIndex(e => e.selectable),
							0,
						),
			);
		},
		[client],
	);

	const railOrder = useMemo(() => [HOME, ...client.sortedGuilds().map(g => g.id)], [client, status]); // eslint-disable-line react-hooks/exhaustive-deps

	const stepChannel = useCallback(
		dir => {
			const list = sidebarEntries(client, guildId);
			let i = list.findIndex(e => e.id === currentRef.current);
			for (let n = 0; n < list.length; n++) {
				i = (i + dir + list.length) % list.length;
				if (list[i]?.selectable) return openChannel(list[i].id);
			}
		},
		[client, guildId, openChannel],
	);

	const openServerPicker = useCallback(() => {
		const guilds = client.sortedGuilds();
		setOverlay({
			title: 'Select a server',
			subtitle: `You are in ${guilds.length} server${guilds.length === 1 ? '' : 's'}`,
			items: guilds.map(g => ({
				key: g.id,
				value: g.id,
				label: g.name,
				hint: `${client.guildChannels(g.id).filter(isTextChannel).length} channels`,
				badge: [...g.channels.keys()].reduce((n, id) => n + (unread[id] ?? 0), 0) || undefined,
			})),
			onSelect: it => {
				setOverlay(null);
				selectGuild(it.value);
				setFocus('nav');
			},
		});
	}, [client, unread, selectGuild]);

	const openSwitcher = useCallback(
		(initialFilter = '') => {
			const list = [];
			for (const dm of client.sortedDMs()) list.push({key: dm.id, value: dm.id, label: client.dmName(dm), icon: '@', group: 'Direct Messages', badge: unread[dm.id]});
			for (const g of client.sortedGuilds()) {
				for (const ch of client.guildChannels(g.id).filter(isTextChannel)) {
					list.push({key: ch.id, value: ch.id, label: ch.name, icon: '#', search: g.name, group: g.name, badge: unread[ch.id]});
				}
			}
			list.sort((a, b) => (b.badge ?? 0) - (a.badge ?? 0));
			setOverlay({title: 'Jump to…', subtitle: 'Search every channel and DM', items: list, onSelect: it => openChannel(it.value), initialFilter});
		},
		[client, openChannel, unread],
	);

	const quit = useCallback(() => {
		client.destroy();
		exit();
	}, [client, exit]);

	// ---------- Commands ----------

	const runCommand = useCallback(
		line => {
			const [cmd, ...rest] = line.slice(1).split(' ');
			const arg = rest.join(' ').trim();
			const echo = entry('system', {title: true, lines: [`> /${cmd}${arg ? ` ${arg}` : ''}`]});
			const reply = (lines, level) => pushHere(echo, entry('system', {level, tight: true, lines}));
			switch (cmd) {
				case 'servers':
				case 's':
					return openServerPicker();
				case 'channels':
				case 'c':
					return setFocus('nav');
				case 'dms':
				case 'dm':
					selectGuild(HOME);
					return setFocus('nav');
				case 'goto':
				case 'switch':
					return openSwitcher(arg);
				case 'reload':
					if (!currentRef.current) return reply(['  ⎿  No channel open — pick one in the sidebar (tab)'], 'error');
					return openChannel(currentRef.current, {reload: true});
				case 'clear':
					entriesRef.current.set(currentRef.current ?? 'home', []);
					return rerender();
				case 'whoami':
					return reply([
						`  ⎿  Logged in as ${client.user.global_name ?? client.user.username} (@${client.user.username}) · ${client.isBot ? 'bot account' : demo ? 'demo account' : 'user account'} · ${client.guilds.size} servers`,
					]);
				case 'help':
					return reply([
						'  ⎿  Commands',
						...COMMANDS.map(c => `       /${(c.name + (c.args ? ` ${c.args}` : '')).padEnd(14)} ${c.desc}`),
						'',
						'     Shortcuts',
						...SHORTCUTS.flat().map(s => `       ${s}`),
					]);
				case 'logout':
					onLogout?.();
					return quit();
				case 'exit':
				case 'quit':
					return quit();
				default:
					return reply([`  ⎿  Unknown command /${cmd} — type /help`], 'error');
			}
		},
		[client, demo, pushHere, openServerPicker, selectGuild, openSwitcher, openChannel, rerender, quit, onLogout],
	);

	const submit = useCallback(async () => {
		const text = value.trim();
		setValue('');
		setCursor(0);
		setShowHelp(false);
		setScroll(0);
		if (!text) return;
		const hist = historyRef.current;
		hist.list.push(text);
		hist.index = -1;
		if (text.startsWith('/')) return runCommand(text);
		const channelId = currentRef.current;
		if (!channelId) {
			pushHere(entry('system', {lines: [`> ${text}`]}), entry('system', {level: 'error', tight: true, lines: ['  ⎿  No channel open yet — press tab to browse, or ctrl+k to jump']}));
			return;
		}
		try {
			await client.sendMessage(channelId, text);
		} catch (err) {
			pushHere(entry('system', {lines: [`> ${text}`]}), entry('system', {level: 'error', tight: true, lines: [`  ⎿  Failed to send: ${err.message}`]}));
		}
	}, [value, client, pushHere, runCommand]);

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

	const handleNav = (input, key) => {
		if (key.escape || key.tab) return setFocus('input');
		if (key.upArrow || key.downArrow) {
			const dir = key.upArrow ? -1 : 1;
			let i = navCursor;
			for (let n = 0; n < entries.length; n++) {
				i += dir;
				if (i < 0 || i >= entries.length) return;
				if (entries[i].selectable) return setNavCursor(i);
			}
			return;
		}
		if (key.leftArrow || key.rightArrow) {
			const idx = railOrder.indexOf(guildId);
			const next = railOrder[(idx + (key.leftArrow ? -1 : 1) + railOrder.length) % railOrder.length];
			return selectGuild(next);
		}
		if (key.return) {
			const e = entries[navCursor];
			if (e?.selectable) openChannel(e.id);
			return;
		}
		if (input && !key.ctrl && !key.meta) {
			setFocus('input');
			insert(input);
		}
	};

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
			if (key.ctrl && input === 'l') {
				entriesRef.current.set(currentRef.current ?? 'home', []);
				return rerender();
			}
			if (key.pageUp) return setScroll(s => s + 5);
			if (key.pageDown) return setScroll(s => Math.max(s - 5, 0));
			if (key.meta && (key.upArrow || key.downArrow)) return stepChannel(key.upArrow ? -1 : 1);
			if (focus === 'nav') return handleNav(input, key);

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
					pushHere(entry('system', {level: 'error', tight: true, lines: ['  ⎿  Interrupted']}));
					return;
				}
				if (showHelp) return setShowHelp(false);
				setScroll(0);
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
					return;
				}
				const idx = entries.findIndex(e => e.id === currentRef.current);
				setNavCursor(
					idx >= 0
						? idx
						: Math.max(
								entries.findIndex(e => e.selectable),
								0,
							),
				);
				return setFocus('nav');
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

	// ---------- Layout ----------

	const ch = current ? client.channels.get(current) : null;
	const guild = ch?.guild_id ? client.guilds.get(ch.guild_id) : null;
	const height = Math.max(rows - 1, 10);
	const railW = columns >= 90 ? 8 : 0;
	const sideW = columns >= 70 ? 28 : 0;
	const membersW = columns >= 125 ? 26 : 0;
	const mainW = columns - railW - sideW - membersW;
	const mainInner = mainW - 2;

	const list = entriesRef.current.get(current ?? 'home') ?? [];
	const end = Math.max(list.length - scroll, 0);
	const shown = list.slice(Math.max(end - MAX_RENDERED, 0), end);
	const hiddenBelow = list.length - end;

	const authors = useMemo(() => {
		const seen = new Map();
		for (const e of list) if (e.kind === 'msg' && e.msg.author && !seen.has(e.msg.author.id)) seen.set(e.msg.author.id, e.msg.author);
		return [...seen.values()];
	}, [list, list.length]); // eslint-disable-line react-hooks/exhaustive-deps

	const unreadByGuild = {};
	let totalUnread = 0;
	for (const [id, n] of Object.entries(unread)) {
		const c = client.channels.get(id);
		const g = c?.guild_id ?? HOME;
		unreadByGuild[g] = (unreadByGuild[g] ?? 0) + n;
		totalUnread += n;
	}

	const renderEntry = (e, i) => {
		if (e.kind === 'msg') {
			const prev = shown[i - 1];
			const p = prev?.kind === 'msg' ? prev.msg : null;
			const compact = Boolean(p && p.author?.id === e.msg.author?.id && new Date(e.msg.timestamp) - new Date(p.timestamp) < 7 * 60000 && !e.msg.referenced_message && e.msg.type === 0);
			return h(MessageView, {key: e.id, msg: e.msg, client, compact});
		}
		if (e.kind === 'start') {
			const label = channelLabel(e.ch);
			return h(
				Box,
				{key: e.id, flexDirection: 'column', marginTop: 1},
				h(Text, {color: theme.brand, bold: true}, e.ch.guild_id ? '  ╭───╮\n  │ # │\n  ╰───╯' : '  ╭───╮\n  │ @ │\n  ╰───╯'),
				h(Text, {bold: true}, `Welcome to ${label}!`),
				h(
					Text,
					{color: theme.subtle},
					e.ch.guild_id ? `This is the start of the ${label} channel.${e.ch.topic ? ` ${e.ch.topic}` : ''}` : `This is the beginning of your direct message history with ${label}.`,
				),
			);
		}
		return h(SystemLine, {key: e.id, item: e});
	};

	const welcome = h(
		Box,
		{flexDirection: 'column', flexGrow: 1, justifyContent: 'center'},
		h(Banner, {columns: mainInner - 1, user: client.user, guildCount: client.guilds.size, dms: client.sortedDMs().map(dm => ({id: dm.id, _label: client.dmName(dm)})), demo}),
	);

	const footer = showHelp
		? h(
				Box,
				{flexDirection: 'column', paddingX: 1},
				...SHORTCUTS.map((row, i) => h(Box, {key: i}, ...row.map((s, j) => h(Box, {key: j, width: Math.floor((mainInner - 2) / 2)}, h(Text, {color: theme.subtle, wrap: 'truncate-end'}, s))))),
			)
		: acMatches.length
			? h(
					Box,
					{flexDirection: 'column', paddingX: 1},
					...acMatches.map((c, i) =>
						h(
							Clickable,
							{
								key: c.name,
								onClick: () => {
									setValue('');
									setCursor(0);
									runCommand(`/${c.name}`);
								},
							},
							hovered => {
								const on = i === acSel || hovered;
								return h(
									Box,
									{backgroundColor: hovered ? theme.hoverBg : undefined, flexGrow: 1},
									h(Box, {width: 20, flexShrink: 0}, h(Text, {color: on ? theme.brandLight : theme.subtle, bold: on}, `/${c.name}${c.args ? ` ${c.args}` : ''}`)),
									h(Text, {color: on ? theme.brandLight : theme.dim, wrap: 'truncate-end'}, c.desc),
								);
							},
						),
					),
				)
			: null;

	const mainTitle = ch ? channelLabel(ch) : 'Cordline';
	const mainRight = ch?.topic ?? (ch && !ch.guild_id ? (ch.type === ChannelType.GROUP_DM ? 'Group DM' : 'Direct message') : guild?.name);
	const placeholder = ch ? `Message ${channelLabel(ch)}` : 'Press tab to browse channels, or ctrl+k to jump anywhere';

	const main = h(
		Panel,
		{
			title: mainTitle,
			titleColor: theme.brandLight,
			right: mainRight && mainRight.length < mainInner - mainTitle.length - 12 ? mainRight : undefined,
			width: mainW,
			height,
			focused: focus === 'input',
		},
		h(
			Clickable,
			{
				flexDirection: 'column',
				flexGrow: 1,
				flexShrink: 1,
				justifyContent: 'flex-end',
				overflow: 'hidden',
				paddingX: 1,
				hoverable: false,
				onClick: () => setFocus('input'),
				onWheel: d => setScroll(sc => Math.min(Math.max(sc - d * 2, 0), Math.max(list.length - 1, 0))),
			},
			!ch && !list.length ? welcome : shown.map((e, i) => h(Box, {key: e.id, flexShrink: 0, flexDirection: 'column'}, renderEntry(e, i))),
		),
		h(
			Box,
			{flexDirection: 'column', flexShrink: 0, paddingX: 1},
			loading ? h(Spinner, {label: loading.label, startedAt: loading.startedAt}) : null,
			hiddenBelow ? h(Text, {color: theme.yellow}, `↓ ${hiddenBelow} newer message${hiddenBelow === 1 ? '' : 's'} · pgdn or esc to jump back`) : null,
			notice && notice.color !== theme.subtle ? h(Box, {marginTop: 1}, h(Text, {color: notice.color, wrap: 'truncate-end'}, notice.text)) : null,
			h(Box, {height: 1}, Object.keys(typers).length ? h(TypingLine, {typers}) : null),
			h(
				Clickable,
				{
					hoverable: false,
					onClick: ({x, rect}) => {
						setFocus('input');
						if (!value.includes('\n')) setCursor(Math.min(Math.max(x - rect.x - 4, 0), value.length));
					},
				},
				h(PromptInput, {value, cursor, placeholder, columns: mainInner - 1}),
			),
		),
		footer,
	);

	const where = ch ? `${guild ? guild.name : 'DMs'} › ${channelLabel(ch)}` : status === 'connected' ? (demo ? 'demo mode' : 'connected') : 'reconnecting…';
	const button = (key, label, onClick, active) =>
		h(Clickable, {key, marginRight: 1, onClick}, hovered =>
			h(Text, {backgroundColor: hovered || active ? theme.brand : '#2B2D31', color: hovered || active ? '#FFFFFF' : theme.subtle, bold: hovered || active}, ` ${label} `),
		);
	const statusBar = h(
		Box,
		{paddingX: 1, justifyContent: 'space-between', width: columns, height: 1},
		h(
			Box,
			{flexShrink: 1},
			button('jump', '⌕ Jump', () => openSwitcher()),
			button('servers', '# Servers', openServerPicker),
			button('dms', '@ DMs', () => {
				selectGuild(HOME);
				setFocus('nav');
			}),
			button('help', '? Help', () => setShowHelp(x => !x), showHelp),
			h(
				Text,
				{color: theme.dim, wrap: 'truncate-end'},
				notice?.color === theme.subtle ? ` ${notice.text}` : focus === 'nav' ? ' ↑/↓ select · enter open · ←/→ server · esc chat' : ' tab browse · ctrl+k jump',
			),
		),
		h(
			Box,
			{flexShrink: 0},
			totalUnread ? h(Clickable, {onClick: () => openSwitcher()}, hovered => h(Text, {color: theme.red, bold: hovered, underline: hovered}, `● ${totalUnread} unread`)) : null,
			h(Text, null, '   '),
			h(Text, {color: status === 'connected' ? theme.green : theme.yellow}, '● '),
			h(Text, {color: theme.subtle, wrap: 'truncate-start'}, where),
		),
	);

	const modalW = Math.min(72, columns - 6);
	return h(
		Box,
		{flexDirection: 'column', width: columns, height: rows},
		h(
			Box,
			{height},
			railW
				? h(ServerRail, {
						client,
						selected: guildId,
						unreadByGuild,
						height,
						onSelect: id => {
							selectGuild(id);
							setFocus('nav');
						},
					})
				: null,
			sideW
				? h(Sidebar, {
						client,
						guildId,
						entries,
						current,
						cursor: navCursor,
						focused: focus === 'nav',
						unread,
						width: sideW,
						height,
						demo,
						onOpen: (id, i) => {
							setNavCursor(i);
							openChannel(id);
						},
						onWheel: d => {
							setFocus('nav');
							setNavCursor(c => {
								for (let i = c + d; i >= 0 && i < entries.length; i += d) if (entries[i].selectable) return i;
								return c;
							});
						},
					})
				: null,
			main,
			membersW ? h(MemberList, {client, channel: ch, authors, width: membersW, height, onOpenDM: id => openChannel(id)}) : null,
		),
		statusBar,
		overlay
			? h(
					Box,
					{position: 'absolute', top: 3, left: Math.floor((columns - modalW) / 2), width: modalW},
					h(Picker, {...overlay, key: overlay.title, rows, width: modalW, backgroundColor: theme.modalBg, onCancel: () => setOverlay(null)}),
				)
			: null,
	);
}
