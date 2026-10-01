// Discord-style panes (server rail, channel sidebar, member list) drawn as
// rounded panels with titles set into the border, ❯ selection markers and
// dim secondary text.
import React from 'react';
import {Box, Text} from 'ink';
import stringWidth from 'string-width';
import {theme, nameColor} from './theme.js';
import {ChannelType} from '../discord.js';
import {Clickable} from './mouse.js';

const h = React.createElement;

export const HOME = '@me';

export function initials(name = '') {
	const words = name
		.replace(/[^\p{L}\p{N} ]/gu, '')
		.split(/\s+/)
		.filter(Boolean);
	if (!words.length) return '??';
	if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
	return (words[0][0] + words[1][0]).toUpperCase();
}

function truncate(text, width) {
	if (width <= 0) return '';
	if (stringWidth(text) <= width) return text;
	let out = '';
	for (const ch of text) {
		if (stringWidth(out + ch) > width - 1) break;
		out += ch;
	}
	return `${out}…`;
}

// A rounded panel whose title sits inside the top border: ╭─ title ─────╮
export function Panel({title, titleColor, width, height, focused, children, right}) {
	const color = focused ? theme.brand : theme.border;
	const label = title ? ` ${title} ` : '';
	const rightLabel = right ? ` ${right} ` : '';
	const fill = Math.max(width - 3 - stringWidth(label) - stringWidth(rightLabel) - 1, 0);
	return h(
		Box,
		{flexDirection: 'column', width, height, flexShrink: 0},
		h(
			Text,
			{wrap: 'truncate-end'},
			h(Text, {color}, '╭─'),
			h(Text, {color: titleColor ?? (focused ? theme.brandLight : theme.text), bold: true}, label),
			h(Text, {color}, '─'.repeat(fill)),
			rightLabel ? h(Text, {color: theme.dim}, rightLabel) : null,
			h(Text, {color}, '─╮'),
		),
		h(Box, {flexDirection: 'column', flexGrow: 1, borderStyle: 'round', borderTop: false, borderColor: color, overflow: 'hidden'}, children),
	);
}

// ---------- Server rail ----------

export function ServerRail({client, selected, unreadByGuild, height, onSelect}) {
	const rows = [];
	const chip = (id, label, {home} = {}) => {
		const active = id === selected;
		const unread = unreadByGuild[id] ?? 0;
		rows.push(
			h(Clickable, {key: id, marginBottom: 1, onClick: () => onSelect?.(id)}, hovered => [
				h(Text, {key: 'p', color: '#FFFFFF'}, active ? '▌' : hovered || unread ? '•' : ' '),
				h(Text, {key: 's'}, ' '),
				h(Text, {key: 'c', backgroundColor: active || home || hovered ? theme.brand : '#313338', color: active || home || hovered ? '#FFFFFF' : theme.text, bold: active || hovered}, ` ${label} `),
				h(Text, {key: 'u', color: theme.red, bold: true}, unread ? '●' : ' '),
			]),
		);
	};
	chip(HOME, 'DM', {home: true});
	rows.push(h(Text, {key: 'sep', color: theme.border}, '  ────'));
	rows.push(h(Text, {key: 'sp'}, ' '));
	for (const g of client.sortedGuilds()) chip(g.id, initials(g.name));
	return h(Box, {flexDirection: 'column', width: 8, height, flexShrink: 0, paddingTop: 1}, ...rows);
}

// ---------- Channel sidebar ----------

export function sidebarEntries(client, guildId) {
	if (guildId === HOME) {
		return client.sortedDMs().map(dm => ({
			id: dm.id,
			label: client.dmName(dm),
			icon: dm.type === ChannelType.GROUP_DM ? '👥' : '@',
			color: dm.type === ChannelType.DM ? nameColor(dm.recipients?.[0]?.id) : undefined,
			selectable: true,
			group: 'DIRECT MESSAGES',
		}));
	}
	return client.guildChannels(guildId).map(ch => {
		const voice = ch.type === ChannelType.VOICE || ch.type === ChannelType.STAGE;
		const forum = ch.type === ChannelType.FORUM || ch.type === ChannelType.MEDIA;
		return {
			id: ch.id,
			label: ch.name,
			icon: voice ? '🔊' : forum ? '💬' : ch.type === ChannelType.ANNOUNCEMENT ? '📣' : '#',
			selectable: !voice && !forum,
			group: ch.category ? ch.category.toUpperCase() : null,
		};
	});
}

export function Sidebar({client, guildId, entries, current, cursor, focused, unread, width, height, demo, onOpen, onWheel}) {
	const inner = width - 2;
	const title = guildId === HOME ? 'Direct Messages' : (client.guilds.get(guildId)?.name ?? '');
	const lines = [];
	let lastGroup;
	let cursorLine = 0;
	entries.forEach((e, i) => {
		if (e.group && e.group !== lastGroup) {
			lastGroup = e.group;
			lines.push(h(Text, {key: `g${i}`, color: theme.dim, bold: true, wrap: 'truncate-end'}, ` ⌄ ${e.group}`));
		}
		const isCurrent = e.id === current;
		const isCursor = focused && i === cursor;
		if (i === cursor) cursorLine = lines.length;
		const count = unread[e.id];
		const badge = count ? ` ${count > 99 ? '99+' : count} ` : '';
		const labelWidth = inner - 5 - stringWidth(badge);
		const color = !e.selectable ? theme.dim : isCurrent ? '#FFFFFF' : count ? '#FFFFFF' : (e.color ?? theme.subtle);
		lines.push(
			h(Clickable, {key: e.id, width: inner, disabled: !e.selectable, onClick: () => onOpen?.(e.id, i)}, hovered => [
				h(
					Text,
					{key: 't', backgroundColor: isCurrent ? '#404249' : hovered ? theme.hoverBg : undefined, wrap: 'truncate-end'},
					h(Text, {color: theme.brandLight, bold: true}, isCursor ? '❯' : ' '),
					h(Text, {color: isCurrent || hovered ? theme.brandLight : theme.dim}, ` ${e.icon} `),
					h(Text, {color: hovered ? '#FFFFFF' : color, bold: isCurrent || Boolean(count)}, truncate(e.label, labelWidth).padEnd(Math.max(labelWidth, 0))),
				),
				badge ? h(Text, {key: 'b', backgroundColor: theme.red, color: '#FFFFFF', bold: true}, badge) : null,
			]),
		);
	});

	// Keep the cursor visible when the list is taller than the pane.
	const available = Math.max(height - 6, 3);
	const start = Math.min(Math.max(cursorLine - Math.floor(available / 2), 0), Math.max(lines.length - available, 0));
	const visible = lines.slice(start, start + available);
	const user = client.user ?? {};

	return h(
		Panel,
		{title: truncate(title, inner - 4), width, height, focused},
		h(Clickable, {flexDirection: 'column', flexGrow: 1, paddingTop: 1, onWheel}, visible.length ? visible : h(Text, {color: theme.dim}, '  Nothing here yet')),
		h(Text, {color: theme.border}, '─'.repeat(inner)),
		h(
			Box,
			{flexDirection: 'column', paddingX: 1},
			h(Text, {wrap: 'truncate-end'}, h(Text, {color: theme.green}, '● '), h(Text, {bold: true}, user.global_name ?? user.username ?? '')),
			h(Text, {color: theme.dim, wrap: 'truncate-end'}, `  @${user.username ?? ''}${demo ? ' · demo' : client.isBot ? ' · bot' : ''}`),
		),
	);
}

// ---------- Member list ----------

export function MemberList({client, channel, authors, width, height, onOpenDM}) {
	const inner = width - 4;
	if (channel && !channel.guild_id) {
		const people = channel.recipients ?? [];
		return h(
			Panel,
			{title: channel.type === ChannelType.GROUP_DM ? `Members — ${people.length + 1}` : 'Profile', width, height},
			h(
				Box,
				{flexDirection: 'column', paddingX: 1, paddingTop: 1},
				...people.map(u =>
					h(
						Box,
						{key: u.id, flexDirection: 'column', marginBottom: 1},
						h(Text, {backgroundColor: nameColor(u.id), color: '#1E1F22', bold: true}, ` ${initials(u.global_name ?? u.username)} `),
						h(Text, {bold: true, color: nameColor(u.id), wrap: 'truncate-end'}, u.global_name ?? u.username),
						h(Text, {color: theme.dim, wrap: 'truncate-end'}, `@${u.username}`),
					),
				),
			),
		);
	}
	const bots = authors.filter(u => u.bot);
	const people = authors.filter(u => !u.bot);
	const row = u => {
		const dm = [...client.dms.values()].find(d => d.type === ChannelType.DM && d.recipients?.[0]?.id === u.id);
		return h(Clickable, {key: u.id, disabled: !dm, onClick: () => dm && onOpenDM?.(dm.id)}, hovered =>
			h(
				Text,
				{wrap: 'truncate-end', backgroundColor: hovered ? theme.hoverBg : undefined},
				h(Text, {color: nameColor(u.id)}, '● '),
				h(Text, {color: hovered ? '#FFFFFF' : theme.text, bold: hovered}, truncate(u.global_name ?? u.username, inner - (u.bot ? 6 : 2))),
				u.bot ? h(Text, {backgroundColor: theme.brand, color: '#FFFFFF', bold: true}, ' BOT') : null,
			),
		);
	};
	return h(
		Panel,
		{title: `In chat — ${authors.length}`, width, height},
		h(
			Box,
			{flexDirection: 'column', paddingX: 1, paddingTop: 1},
			people.length ? h(Text, {color: theme.dim, bold: true}, `PEOPLE — ${people.length}`) : null,
			...people.map(row),
			bots.length ? h(Text, {color: theme.dim, bold: true}, ' ') : null,
			bots.length ? h(Text, {color: theme.dim, bold: true}, `BOTS — ${bots.length}`) : null,
			...bots.map(row),
			!authors.length ? h(Text, {color: theme.dim}, 'Open a channel to see who is talking') : null,
		),
	);
}
