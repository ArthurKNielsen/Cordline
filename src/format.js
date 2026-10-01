// Turns Discord message markdown into styled segments the UI can render.
import {theme} from './ui/theme.js';

const INLINE =
	/(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\|\|[^|]+\|\|)|(\*[^*\s][^*\n]*\*)|(\b_[^_\s][^_\n]*_\b)|(<@!?\w+>)|(<@&\d+>)|(<#\d+>)|(<a?:\w+:\d+>)|(<t:-?\d+(?::\w)?>)|(https?:\/\/[^\s<>]+)|(@everyone|@here)/g;

export function displayName(user, member) {
	return member?.nick ?? user?.global_name ?? user?.username ?? 'Unknown';
}

export function formatTime(iso) {
	const d = new Date(iso);
	const now = new Date();
	const time = d.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
	if (d.toDateString() === now.toDateString()) return `Today at ${time}`;
	const y = new Date(now);
	y.setDate(now.getDate() - 1);
	if (d.toDateString() === y.toDateString()) return `Yesterday at ${time}`;
	return `${d.toLocaleDateString('en-US')} ${time}`;
}

function timestampTag(unix, style) {
	const d = new Date(Number(unix) * 1000);
	switch (style) {
		case 't':
			return d.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
		case 'd':
			return d.toLocaleDateString('en-US');
		case 'R': {
			const s = Math.round((d - Date.now()) / 1000);
			const rtf = new Intl.RelativeTimeFormat('en', {numeric: 'auto'});
			const abs = Math.abs(s);
			if (abs < 60) return rtf.format(s, 'second');
			if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
			if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
			return rtf.format(Math.round(s / 86400), 'day');
		}
		default:
			return d.toLocaleString('en-US', {dateStyle: 'medium', timeStyle: 'short'});
	}
}

export function parseInline(text, ctx) {
	const out = [];
	let last = 0;
	for (const m of text.matchAll(INLINE)) {
		if (m.index > last) out.push({text: text.slice(last, m.index)});
		last = m.index + m[0].length;
		const tok = m[0];
		if (m[1]) out.push({text: tok.slice(1, -1), color: theme.code, bg: theme.codeBg});
		else if (m[2]) out.push({text: tok.slice(2, -2), bold: true});
		else if (m[3]) out.push({text: tok.slice(2, -2), underline: true});
		else if (m[4]) out.push({text: tok.slice(2, -2), strike: true});
		else if (m[5]) out.push({text: tok.slice(2, -2), inverse: true, dim: true});
		else if (m[6] || m[7]) out.push({text: tok.slice(1, -1), italic: true});
		else if (m[8]) {
			const id = tok.replace(/[<@!>]/g, '');
			const user = ctx.msg?.mentions?.find(u => u.id === id) ?? ctx.client?.users?.get(id);
			const isMe = id === ctx.client?.user?.id;
			out.push({text: `@${user ? displayName(user, user.member) : 'unknown-user'}`, color: theme.brandLight, bg: theme.mentionBg, bold: isMe});
		} else if (m[9]) {
			const name = ctx.client?.roleName(ctx.msg?.guild_id, tok.slice(3, -1));
			out.push({text: `@${name ?? 'role'}`, color: theme.brandLight, bg: theme.mentionBg});
		} else if (m[10]) {
			const name = ctx.client?.channelName(tok.slice(2, -1));
			out.push({text: `#${name ?? 'unknown'}`, color: theme.brandLight, bg: theme.mentionBg});
		} else if (m[11]) out.push({text: `:${tok.split(':')[1]}:`, color: theme.yellow});
		else if (m[12]) {
			const [, unix, style] = tok.slice(1, -1).split(':');
			out.push({text: timestampTag(unix, style), bg: theme.codeBg});
		} else if (m[13]) out.push({text: tok, color: theme.link, underline: true});
		else if (m[14]) out.push({text: tok, color: theme.brandLight, bg: theme.mentionBg});
	}
	if (last < text.length) out.push({text: text.slice(last)});
	return out;
}

// Returns blocks: {type: 'text'|'quote', segments} | {type: 'code', lang, code}
export function parseContent(content, ctx) {
	const blocks = [];
	const pushText = chunk => {
		const lines = chunk.split('\n');
		let buf = [];
		let quoted = false;
		const flush = () => {
			if (!buf.length) return;
			const text = buf.join('\n');
			if (text.trim() || quoted) blocks.push({type: quoted ? 'quote' : 'text', segments: parseInline(text, ctx)});
			buf = [];
		};
		for (const line of lines) {
			const isQuote = /^>\s?/.test(line);
			if (isQuote !== quoted) {
				flush();
				quoted = isQuote;
			}
			buf.push(isQuote ? line.replace(/^>\s?/, '') : line);
		}
		flush();
	};
	let last = 0;
	for (const m of content.matchAll(/```(\w*)\n?([\s\S]*?)```/g)) {
		if (m.index > last) pushText(content.slice(last, m.index).replace(/^\n+|\n+$/g, ''));
		blocks.push({type: 'code', lang: m[1], code: m[2].replace(/\n$/, '')});
		last = m.index + m[0].length;
	}
	if (last < content.length) pushText(content.slice(last).replace(/^\n+/, ''));
	return blocks;
}

export function formatBytes(n) {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// One-line plain preview of a message (for replies / notifications).
export function preview(msg, max = 60) {
	let text = (msg?.content ?? '').replace(/\s+/g, ' ').replace(/<a?:(\w+):\d+>/g, ':$1:');
	if (!text && msg?.attachments?.length) text = `📎 ${msg.attachments[0].filename}`;
	if (!text && msg?.embeds?.length) text = '[embed]';
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
