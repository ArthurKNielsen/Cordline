import React, {useEffect, useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {theme, LOGO, LOGO_COLORS, MASCOT, SPINNER, nameColor} from './theme.js';
import {Clickable} from './mouse.js';
import {parseContent, displayName, formatTime, formatBytes, preview} from '../format.js';
import {fitCells, imageSources, loadImage} from '../images.js';

const h = React.createElement;
export const VERSION = '2.2.0';

// ---------- Logo + welcome banner ----------

export function Logo({columns}) {
	if (columns < LOGO[0].length + 4) {
		return h(Box, {paddingLeft: 1}, h(Text, {color: theme.brand, bold: true}, '◆ C O R D L I N E'));
	}
	return h(
		Box,
		{flexDirection: 'column', paddingLeft: 1},
		...LOGO.map((line, i) => h(Text, {key: i, color: LOGO_COLORS[i]}, line)),
		h(Text, {color: theme.subtle}, '  ', h(Text, {color: theme.brandLight}, '▸'), ' Discord, in your terminal · ', h(Text, {color: theme.dim}, `v${VERSION}`)),
	);
}

export function Banner({columns, user, guildCount, dms, demo}) {
	const width = Math.min(Math.max(columns - 1, 40), 110);
	const title = ` Cordline v${VERSION} `;
	const top = `╭───${title}${'─'.repeat(Math.max(width - title.length - 5, 0))}╮`;
	const name = user?.global_name ?? user?.username ?? 'friend';
	const wide = width >= 70;
	const leftWidth = wide ? Math.floor(width * 0.46) : width - 4;
	const recent = dms.slice(0, 3);

	const left = h(
		Box,
		{flexDirection: 'column', alignItems: 'center', width: leftWidth, paddingY: 1},
		h(Text, {bold: true}, `Welcome back ${name}!`),
		h(Box, {flexDirection: 'column', marginY: 1}, ...MASCOT.map((line, i) => h(Text, {key: i, color: theme.brand}, line))),
		h(Text, {color: theme.subtle}, `@${user?.username ?? '?'} · ${guildCount} servers · ${dms.length} DMs`),
		demo ? h(Text, {color: theme.yellow}, 'demo mode — fake data') : null,
	);

	const right = h(
		Box,
		{flexDirection: 'column', flexGrow: 1, paddingX: 1, paddingY: 1, borderStyle: 'single', borderColor: theme.brandDim, borderTop: false, borderRight: false, borderBottom: false},
		h(Text, {color: theme.brandLight, bold: true}, 'Tips for getting started'),
		h(Text, null, 'Run ', h(Text, {color: theme.brandLight}, '/servers'), ' to browse your servers and channels'),
		h(Text, null, 'Press ', h(Text, {color: theme.brandLight}, 'ctrl+k'), ' to jump to any channel or DM'),
		h(Text, null, 'Type ', h(Text, {color: theme.brandLight}, '?'), ' for shortcuts, ', h(Text, {color: theme.brandLight}, '/'), ' for commands'),
		h(Text, {color: theme.brandDim}, '─'.repeat(Math.max(Math.min(width - leftWidth - 8, 50), 10))),
		h(Text, {color: theme.brandLight, bold: true}, 'Recent DMs'),
		recent.length ? recent.map(dm => h(Text, {key: dm.id, color: theme.subtle}, '• ', dm._label)) : h(Text, {color: theme.dim}, 'No recent DMs'),
	);

	return h(
		Box,
		{flexDirection: 'column', marginBottom: 1},
		h(Logo, {columns}),
		h(Text, null, ' '),
		h(Text, {color: theme.brand}, top),
		h(Box, {width, borderStyle: 'round', borderColor: theme.brand, borderTop: false, flexDirection: wide ? 'row' : 'column'}, left, wide ? right : null),
	);
}

// ---------- Spinner ----------

export function useTicker(ms, active = true) {
	const [tick, setTick] = useState(0);
	useEffect(() => {
		if (!active) return;
		const t = setInterval(() => setTick(x => x + 1), ms);
		return () => clearInterval(t);
	}, [ms, active]);
	return tick;
}

export function Spinner({label, startedAt}) {
	const tick = useTicker(120);
	const secs = Math.floor((Date.now() - startedAt) / 1000);
	return h(
		Box,
		{marginTop: 1},
		h(Text, {color: theme.brand}, SPINNER[tick % SPINNER.length], ' '),
		h(Text, {color: theme.brandLight}, label),
		h(Text, {color: theme.dim}, ` (${secs}s · `, h(Text, {bold: true}, 'esc'), ' to interrupt)'),
	);
}

export function TypingLine({typers}) {
	const tick = useTicker(400);
	const now = Date.now();
	const names = Object.values(typers)
		.filter(t => t.until > now)
		.map(t => t.name);
	if (!names.length) return null;
	const who = names.length > 2 ? 'Several people are' : `${names.join(' and ')} ${names.length > 1 ? 'are' : 'is'}`;
	return h(Text, {color: theme.subtle}, '  ', h(Text, {color: theme.brandLight}, '✎ '), `${who} typing`, '.'.repeat((tick % 3) + 1));
}

// ---------- Prompt input ----------

export function PromptInput({value, cursor, placeholder, columns, masked}) {
	const shown = masked ? '•'.repeat(value.length) : value;
	let body;
	if (!value) {
		body = h(Text, null, h(Text, {inverse: true, color: theme.dim}, placeholder[0] ?? ' '), h(Text, {color: theme.dim}, placeholder.slice(1)));
	} else {
		const before = shown.slice(0, cursor);
		const at = shown[cursor] ?? ' ';
		const after = shown.slice(cursor + 1);
		body = h(Text, null, before, h(Text, {inverse: true}, at === '\n' ? ' \n' : at), after);
	}
	return h(Box, {borderStyle: 'round', borderColor: theme.border, paddingX: 1, width: Math.max(columns - 1, 20)}, h(Text, {color: theme.subtle, bold: true}, '> '), h(Box, {flexGrow: 1}, body));
}

// ---------- Selection list (servers / channels / DMs / switcher) ----------

export function Picker({title, subtitle, items, onSelect, onCancel, rows, initialFilter = '', width, backgroundColor}) {
	const [filter, setFilter] = useState(initialFilter);
	const [index, setIndex] = useState(0);
	const q = filter.toLowerCase();
	const filtered = items.filter(it => !q || `${it.label} ${it.group ?? ''} ${it.search ?? ''}`.toLowerCase().includes(q));
	const sel = Math.min(index, Math.max(filtered.length - 1, 0));

	useInput((input, key) => {
		if (key.escape) return onCancel();
		if (key.upArrow || (key.ctrl && input === 'p')) return setIndex(Math.max(sel - 1, 0));
		if (key.downArrow || (key.ctrl && input === 'n')) return setIndex(Math.min(sel + 1, filtered.length - 1));
		if (key.pageUp) return setIndex(Math.max(sel - 8, 0));
		if (key.pageDown) return setIndex(Math.min(sel + 8, filtered.length - 1));
		if (key.return) {
			const it = filtered[sel];
			if (it && !it.disabled) onSelect(it);
			return;
		}
		if (key.backspace || key.delete) {
			setFilter(f => f.slice(0, -1));
			setIndex(0);
			return;
		}
		if (input && !key.ctrl && !key.meta && !key.tab) {
			setFilter(f => f + input);
			setIndex(0);
		}
	});

	const maxVisible = Math.max(Math.min(12, rows - 14), 4);
	const start = Math.min(Math.max(sel - Math.floor(maxVisible / 2), 0), Math.max(filtered.length - maxVisible, 0));
	const visible = filtered.slice(start, start + maxVisible);
	const lines = [];
	let lastGroup;
	visible.forEach((it, i) => {
		const n = start + i;
		if (it.group !== undefined && it.group !== lastGroup) {
			lastGroup = it.group;
			if (it.group) lines.push(h(Text, {key: `g${n}`, color: theme.dim, bold: true}, `   ⌄ ${it.group.toUpperCase()}`));
		}
		const active = n === sel;
		lines.push(
			h(Clickable, {key: it.key ?? n, layer: 1, disabled: it.disabled, onClick: () => onSelect(it)}, hovered =>
				h(
					Box,
					{backgroundColor: hovered ? theme.hoverBg : undefined, flexGrow: 1},
					h(
						Text,
						{color: active || hovered ? theme.brandLight : theme.text, dimColor: it.disabled},
						active ? '❯ ' : '  ',
						h(Text, {color: theme.dim}, `${n + 1}. `),
						it.icon ? `${it.icon} ` : '',
						h(Text, {bold: active || hovered}, it.label),
					),
					it.hint ? h(Text, {color: theme.dim}, `  ${it.hint}`) : null,
					it.badge ? h(Text, {color: theme.red, bold: true}, `  ● ${it.badge}`) : null,
				),
			),
		);
	});

	return h(
		Clickable,
		{
			layer: 1,
			hoverable: false,
			onClick: () => {},
			onOutside: onCancel,
			onWheel: d => setIndex(Math.min(Math.max(sel + d, 0), Math.max(filtered.length - 1, 0))),
			flexDirection: 'column',
			borderStyle: 'round',
			borderColor: theme.brand,
			paddingX: 1,
			width,
			backgroundColor,
		},
		h(Text, {color: theme.brandLight, bold: true}, title),
		subtitle ? h(Text, {color: theme.subtle}, subtitle) : null,
		h(Text, null, ' '),
		filtered.length ? lines : h(Text, {color: theme.dim}, '  No matches'),
		h(Text, null, ' '),
		h(
			Text,
			{color: theme.dim},
			filter ? h(Text, null, 'Filter: ', h(Text, {color: theme.text}, filter), '  ·  ') : 'Type to filter · ',
			'↑/↓ or click · enter select · esc cancel',
			filtered.length > maxVisible ? `  (${sel + 1}/${filtered.length})` : '',
		),
	);
}

// ---------- Transcript items ----------

function Segments({segments, color}) {
	return h(
		Text,
		{color, wrap: 'wrap'},
		...segments.map((s, i) =>
			s.bold || s.italic || s.underline || s.strike || s.color || s.bg || s.inverse || s.dim
				? h(Text, {key: i, bold: s.bold, italic: s.italic, underline: s.underline, strikethrough: s.strike, color: s.color, backgroundColor: s.bg, inverse: s.inverse, dimColor: s.dim}, s.text)
				: s.text,
		),
	);
}

function Content({msg, client, color}) {
	const blocks = parseContent(msg.content ?? '', {client, msg});
	return h(
		Box,
		{flexDirection: 'column'},
		...blocks.map((b, i) => {
			if (b.type === 'code') {
				return h(
					Box,
					{key: i, flexDirection: 'column', borderStyle: 'round', borderColor: theme.border, paddingX: 1},
					b.lang ? h(Text, {color: theme.dim}, b.lang) : null,
					h(Text, {color: theme.code}, b.code),
				);
			}
			if (b.type === 'quote') {
				return h(Box, {key: i, borderStyle: 'bold', borderColor: theme.dim, borderTop: false, borderRight: false, borderBottom: false, paddingLeft: 1}, h(Segments, {segments: b.segments, color}));
			}
			return h(Segments, {key: i, segments: b.segments, color});
		}),
	);
}

// An image drawn with half-blocks. Click it to open the full-size viewer.
export function ImagePreview({src, maxCols, maxRows, onOpen}) {
	const {cols, rows} = fitCells(src.width, src.height, maxCols, maxRows);
	const [state, setState] = useState({lines: null, error: null});
	useEffect(() => {
		let alive = true;
		setState({lines: null, error: null});
		loadImage(src, cols, rows).then(
			lines => alive && setState({lines, error: null}),
			err => alive && setState({lines: null, error: err.message}),
		);
		return () => {
			alive = false;
		};
	}, [src.proxyUrl, src.demo, cols, rows]); // eslint-disable-line react-hooks/exhaustive-deps
	const body = state.lines
		? state.lines.map((line, i) => h(Text, {key: i}, line))
		: h(
				Box,
				{height: rows, width: cols, backgroundColor: '#2B2D31', alignItems: 'center', justifyContent: 'center'},
				h(Text, {color: state.error ? theme.red : theme.dim}, state.error ? `⚠ couldn't load image` : '⧗ loading image…'),
			);
	return h(Clickable, {flexDirection: 'column', width: Math.max(cols, 24), marginTop: 1, onClick: () => onOpen?.(src)}, hovered => [
		h(Box, {key: 'img', flexDirection: 'column'}, body),
		h(Text, {key: 'cap', color: hovered ? theme.brandLight : theme.dim, wrap: 'truncate-end'}, hovered ? '🔍 click to view full size' : `🖼  ${src.name ?? 'image'}`),
	]);
}

function Extras({msg, onOpenImage, imageCols = 48}) {
	const lines = [];
	const images = imageSources(msg);
	for (const src of images) lines.push(h(ImagePreview, {key: `img-${src.key}`, src, maxCols: imageCols, maxRows: 12, onOpen: onOpenImage}));
	const shown = new Set(images.map(i => i.key));
	for (const a of msg.attachments ?? []) {
		if (shown.has(a.id ?? a.filename)) continue;
		lines.push(
			h(
				Text,
				{key: a.id ?? a.filename, color: theme.subtle},
				'⎿  📎 ',
				h(Text, {color: theme.text}, a.filename),
				h(Text, {color: theme.dim}, `  ${formatBytes(a.size ?? 0)}  `),
				h(Text, {color: theme.link}, a.url),
			),
		);
	}
	for (const [i, e] of (msg.embeds ?? []).entries()) {
		if (!e.title && !e.description) continue;
		const bar = e.color ? `#${e.color.toString(16).padStart(6, '0')}` : theme.brand;
		lines.push(
			h(
				Box,
				{key: `e${i}`, flexDirection: 'column', borderStyle: 'bold', borderColor: bar, borderTop: false, borderRight: false, borderBottom: false, paddingLeft: 1},
				e.author?.name ? h(Text, {color: theme.subtle}, e.author.name) : null,
				e.title ? h(Text, {bold: true, color: e.url ? theme.link : theme.text}, e.title) : null,
				e.description ? h(Text, {color: theme.subtle}, e.description.length > 300 ? `${e.description.slice(0, 300)}…` : e.description) : null,
			),
		);
	}
	for (const s of msg.sticker_items ?? []) lines.push(h(Text, {key: s.id, color: theme.subtle}, `⎿  [sticker: ${s.name}]`));
	if (msg.edited_timestamp) lines.push(h(Text, {key: 'ed', color: theme.dim}, '(edited)'));
	return lines.length ? h(Box, {flexDirection: 'column'}, ...lines) : null;
}

const SYSTEM_TYPES = {
	7: m => `→ ${displayName(m.author, m.member)} joined the server`,
	8: m => `🚀 ${displayName(m.author, m.member)} boosted the server`,
	6: m => `📌 ${displayName(m.author, m.member)} pinned a message`,
	1: m => `${displayName(m.author, m.member)} added someone to the group`,
	2: m => `${displayName(m.author, m.member)} left the group`,
	3: m => `📞 ${displayName(m.author, m.member)} started a call`,
	18: m => `🧵 ${displayName(m.author, m.member)} started a thread: ${m.content}`,
};

export function MessageView({msg, client, compact, onOpenImage, imageCols}) {
	if (SYSTEM_TYPES[msg.type]) {
		return h(Box, {paddingLeft: 2, marginTop: 1}, h(Text, {color: theme.dim}, SYSTEM_TYPES[msg.type](msg)));
	}
	const mine = msg.author?.id === client.user?.id;
	const ref = msg.referenced_message;
	const replyLine = ref ? h(Text, {color: theme.dim}, '  ╭─ ', h(Text, {color: nameColor(ref.author?.id), dimColor: true}, `@${displayName(ref.author, ref.member)}`), ` ${preview(ref)}`) : null;

	if (mine) {
		// Your own messages render as a highlighted prompt line.
		return h(
			Box,
			{flexDirection: 'column', marginTop: compact ? 0 : 1},
			replyLine,
			h(
				Box,
				{backgroundColor: theme.userBg, paddingRight: 1},
				h(Text, {color: theme.subtle}, '> '),
				h(Box, {flexDirection: 'column', flexGrow: 1}, h(Content, {msg, client, color: theme.text}), h(Extras, {msg, onOpenImage, imageCols})),
			),
		);
	}

	const color = nameColor(msg.author?.id);
	const mentioned = msg.mentions?.some(u => u.id === client.user?.id) || msg.mention_everyone;
	return h(
		Box,
		{flexDirection: 'column', marginTop: compact ? 0 : 1},
		replyLine,
		compact
			? null
			: h(
					Text,
					null,
					h(Text, {color}, '● '),
					h(Text, {color, bold: true}, displayName(msg.author, msg.member)),
					msg.author?.bot ? h(Text, {backgroundColor: theme.brand, color: '#FFFFFF', bold: true}, ' BOT ') : null,
					h(Text, {color: theme.dim}, `  ${formatTime(msg.timestamp)}`),
				),
		h(
			Box,
			{
				paddingLeft: 2,
				flexDirection: 'column',
				...(mentioned ? {borderStyle: 'bold', borderColor: theme.yellow, borderTop: false, borderRight: false, borderBottom: false, paddingLeft: 1, marginLeft: 1} : {}),
			},
			h(Content, {msg, client, color: theme.text}),
			h(Extras, {msg, onOpenImage, imageCols}),
		),
	);
}

export function ChannelHeader({item}) {
	return h(
		Box,
		{flexDirection: 'column', marginTop: 1},
		h(
			Text,
			null,
			h(Text, {color: theme.brand}, '● '),
			h(Text, {bold: true}, 'Open'),
			h(Text, {color: theme.subtle}, '('),
			h(Text, {color: theme.brandLight, bold: true}, item.label),
			h(Text, {color: theme.subtle}, ')'),
		),
		h(Text, {color: theme.dim}, '  ⎿  ', item.detail),
	);
}

export function SystemLine({item}) {
	const color = item.level === 'error' ? theme.red : item.level === 'ok' ? theme.green : theme.subtle;
	return h(Box, {flexDirection: 'column', marginTop: item.tight ? 0 : 1}, ...item.lines.map((line, i) => h(Text, {key: i, color: i === 0 && item.title ? undefined : color}, line)));
}
