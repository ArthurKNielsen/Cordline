// Minimal Discord client: REST + Gateway over a raw websocket.
// Works with both bot tokens ("Bot xxx") and user tokens.
import {EventEmitter} from 'node:events';
import WebSocket from 'ws';

const API = 'https://discord.com/api/v10';
const GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json';

// Intents used for bot tokens: GUILDS | GUILD_MESSAGES | GUILD_MESSAGE_TYPING |
// DIRECT_MESSAGES | DIRECT_MESSAGE_TYPING | MESSAGE_CONTENT
const BOT_INTENTS = (1 << 0) | (1 << 9) | (1 << 11) | (1 << 12) | (1 << 14) | (1 << 15);

const VIEW_CHANNEL = 1n << 10n;
const ADMINISTRATOR = 1n << 3n;

export const ChannelType = {
	TEXT: 0,
	DM: 1,
	VOICE: 2,
	GROUP_DM: 3,
	CATEGORY: 4,
	ANNOUNCEMENT: 5,
	ANNOUNCEMENT_THREAD: 10,
	PUBLIC_THREAD: 11,
	PRIVATE_THREAD: 12,
	STAGE: 13,
	FORUM: 15,
	MEDIA: 16,
};

export const isTextChannel = ch => ch.type === ChannelType.TEXT || ch.type === ChannelType.ANNOUNCEMENT || ch.type === ChannelType.DM || ch.type === ChannelType.GROUP_DM;

export class DiscordError extends Error {
	constructor(status, body) {
		super(body?.message ? `${body.message} (HTTP ${status})` : `HTTP ${status}`);
		this.status = status;
		this.body = body;
	}
}

export function normalizeToken(token, kind) {
	token = token.trim().replace(/^"|"$/g, '');
	if (kind === 'bot' && !/^Bot /i.test(token)) return `Bot ${token}`;
	return token;
}

export class DiscordClient extends EventEmitter {
	constructor(token) {
		super();
		this.token = token;
		this.isBot = /^Bot /i.test(token);
		this.user = null;
		this.guilds = new Map(); // id -> {id, name, ownerId, roles: Map, member, channels: Map}
		this.channels = new Map(); // id -> channel (guild + dm)
		this.dms = new Map(); // id -> dm channel
		this.users = new Map();
		this.ws = null;
		this.seq = null;
		this.sessionId = null;
		this.resumeUrl = null;
		this.heartbeatTimer = null;
		this.closed = false;
		this.lastTyping = 0;
	}

	// ---------- REST ----------

	async api(method, path, body, attempt = 0) {
		let res;
		try {
			res = await fetch(API + path, {
				method,
				headers: {
					Authorization: this.token,
					'Content-Type': 'application/json',
					'User-Agent': this.isBot
						? 'DiscordBot (https://github.com/EnSpecielPerson/Cordline, 2.2.0)'
						: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
				},
				body: body === undefined ? undefined : JSON.stringify(body),
			});
		} catch (err) {
			throw new Error(`Couldn't reach Discord — check your internet connection (${err.cause?.code ?? err.message})`);
		}
		if (res.status === 429 && attempt < 3) {
			const data = await res.json().catch(() => ({}));
			await new Promise(r => setTimeout(r, Math.ceil((data.retry_after ?? 1) * 1000)));
			return this.api(method, path, body, attempt + 1);
		}
		if (res.status === 204) return null;
		const data = await res.json().catch(() => null);
		if (!res.ok) throw new DiscordError(res.status, data);
		return data;
	}

	async getMessages(channelId, limit = 50) {
		const msgs = await this.api('GET', `/channels/${channelId}/messages?limit=${limit}`);
		return msgs.reverse();
	}

	sendMessage(channelId, content) {
		const nonce = String(BigInt(Date.now() - 1420070400000) << 22n);
		return this.api('POST', `/channels/${channelId}/messages`, {content, nonce});
	}

	triggerTyping(channelId) {
		const now = Date.now();
		if (now - this.lastTyping < 8000) return;
		this.lastTyping = now;
		this.api('POST', `/channels/${channelId}/typing`).catch(() => {});
	}

	// ---------- Gateway ----------

	async login() {
		this.user = await this.api('GET', '/users/@me');
		await new Promise((resolve, reject) => {
			this.once('ready', resolve);
			this.once('fatal', reject);
			this.connect(GATEWAY);
		});
		return this.user;
	}

	connect(url, resume = false) {
		const ws = new WebSocket(url);
		this.ws = ws;
		ws.on('message', raw => {
			let packet;
			try {
				packet = JSON.parse(raw.toString());
			} catch {
				return;
			}
			this.onPacket(packet, resume);
		});
		ws.on('close', code => {
			clearInterval(this.heartbeatTimer);
			if (this.closed || ws !== this.ws) return;
			if (code === 4004) {
				this.emit('fatal', new Error('Authentication failed — your token is invalid.'));
				return;
			}
			if ([4010, 4011, 4012, 4013, 4014].includes(code)) {
				this.emit('fatal', new Error(`Gateway closed (${code}). For bots, enable the MESSAGE CONTENT intent in the Developer Portal.`));
				return;
			}
			this.emit('status', 'reconnecting');
			setTimeout(() => {
				const canResume = this.sessionId && code !== 4007 && code !== 4009;
				this.connect(canResume ? `${this.resumeUrl}/?v=10&encoding=json` : GATEWAY, canResume);
			}, 1500);
		});
		ws.on('error', () => {});
	}

	send(op, d) {
		if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({op, d}));
	}

	onPacket({op, d, s, t}, resume) {
		if (s != null) this.seq = s;
		switch (op) {
			case 10: {
				clearInterval(this.heartbeatTimer);
				this.heartbeatTimer = setInterval(() => this.send(1, this.seq), d.heartbeat_interval);
				if (resume) {
					this.send(6, {token: this.token, session_id: this.sessionId, seq: this.seq});
				} else {
					this.identify();
				}
				break;
			}
			case 1:
				this.send(1, this.seq);
				break;
			case 7:
				this.ws.close(4000);
				break;
			case 9:
				this.sessionId = null;
				setTimeout(() => this.identify(), 2000);
				break;
			case 0:
				this.onDispatch(t, d);
				break;
		}
	}

	identify() {
		const payload = {
			token: this.token,
			properties: this.isBot ? {os: process.platform, browser: 'cordline', device: 'cordline'} : {os: 'Linux', browser: 'Chrome', device: '', system_locale: 'en-US'},
		};
		if (this.isBot) payload.intents = BOT_INTENTS;
		this.send(2, payload);
	}

	onDispatch(t, d) {
		switch (t) {
			case 'READY': {
				this.sessionId = d.session_id;
				this.resumeUrl = d.resume_gateway_url;
				this.user = d.user;
				for (const u of d.users ?? []) this.users.set(u.id, u);
				d.guilds.forEach((g, i) => {
					if (g.unavailable) return;
					const member = d.merged_members?.[i]?.find(m => (m.user_id ?? m.user?.id) === d.user.id);
					this.addGuild(g, member);
				});
				for (const ch of d.private_channels ?? []) this.addDM(ch);
				this.emit('ready');
				break;
			}
			case 'RESUMED':
				this.emit('status', 'connected');
				break;
			case 'GUILD_CREATE':
				this.addGuild(
					d,
					d.members?.find(m => m.user?.id === this.user.id),
				);
				this.emit('update');
				break;
			case 'GUILD_DELETE':
				this.guilds.delete(d.id);
				this.emit('update');
				break;
			case 'CHANNEL_CREATE':
			case 'CHANNEL_UPDATE':
				if (d.guild_id) {
					const g = this.guilds.get(d.guild_id);
					if (g) {
						d.guild_id = g.id;
						g.channels.set(d.id, d);
						this.channels.set(d.id, d);
					}
				} else {
					this.addDM(d);
				}
				this.emit('update');
				break;
			case 'CHANNEL_DELETE':
				this.guilds.get(d.guild_id)?.channels.delete(d.id);
				this.channels.delete(d.id);
				this.dms.delete(d.id);
				this.emit('update');
				break;
			case 'MESSAGE_CREATE': {
				const ch = this.channels.get(d.channel_id);
				if (ch) ch.last_message_id = d.id;
				else if (!d.guild_id) this.addDM({id: d.channel_id, type: ChannelType.DM, recipients: [d.author], last_message_id: d.id});
				this.emit('message', d);
				break;
			}
			case 'MESSAGE_UPDATE':
				this.emit('messageUpdate', d);
				break;
			case 'MESSAGE_DELETE':
				this.emit('messageDelete', d);
				break;
			case 'TYPING_START':
				if (d.user_id !== this.user?.id) this.emit('typing', d);
				break;
		}
	}

	addGuild(g, member) {
		const roles = new Map((g.roles ?? []).map(r => [r.id, r]));
		const guild = {
			id: g.id,
			name: g.name ?? g.properties?.name ?? 'Unknown server',
			ownerId: g.owner_id ?? g.properties?.owner_id,
			roles,
			member,
			channels: new Map(),
		};
		for (const ch of [...(g.channels ?? []), ...(g.threads ?? [])]) {
			ch.guild_id = g.id;
			guild.channels.set(ch.id, ch);
			this.channels.set(ch.id, ch);
		}
		this.guilds.set(g.id, guild);
	}

	addDM(ch) {
		if (!ch.recipients && ch.recipient_ids) {
			ch.recipients = ch.recipient_ids.map(id => this.users.get(id)).filter(Boolean);
		}
		this.dms.set(ch.id, ch);
		this.channels.set(ch.id, ch);
	}

	// ---------- Helpers for the UI ----------

	canView(guild, ch) {
		const member = guild.member;
		if (!member || !guild.roles.size) return true;
		const userId = this.user.id;
		if (guild.ownerId === userId) return true;
		const everyone = guild.roles.get(guild.id);
		let perms = BigInt(everyone?.permissions ?? 0);
		for (const roleId of member.roles ?? []) perms |= BigInt(guild.roles.get(roleId)?.permissions ?? 0);
		if (perms & ADMINISTRATOR) return true;
		const overwrites = ch.permission_overwrites ?? [];
		const apply = ow => {
			if (!ow) return;
			perms &= ~BigInt(ow.deny);
			perms |= BigInt(ow.allow);
		};
		apply(overwrites.find(o => o.id === guild.id));
		let allow = 0n;
		let deny = 0n;
		for (const o of overwrites) {
			if (o.type === 0 && o.id !== guild.id && member.roles?.includes(o.id)) {
				allow |= BigInt(o.allow);
				deny |= BigInt(o.deny);
			}
		}
		perms &= ~deny;
		perms |= allow;
		apply(overwrites.find(o => o.type === 1 && o.id === userId));
		return (perms & VIEW_CHANNEL) !== 0n;
	}

	// Channels of a guild, ordered like the Discord sidebar, with category info.
	guildChannels(guildId) {
		const guild = this.guilds.get(guildId);
		if (!guild) return [];
		const all = [...guild.channels.values()].filter(ch => (ch.type !== ChannelType.CATEGORY && ch.type < 10) || ch.type === ChannelType.STAGE || ch.type === ChannelType.FORUM);
		const visible = all.filter(ch => this.canView(guild, ch));
		const categories = [...guild.channels.values()].filter(ch => ch.type === ChannelType.CATEGORY).sort((a, b) => a.position - b.position);
		const byPos = (a, b) => {
			const voiceA = a.type === ChannelType.VOICE || a.type === ChannelType.STAGE;
			const voiceB = b.type === ChannelType.VOICE || b.type === ChannelType.STAGE;
			if (voiceA !== voiceB) return voiceA ? 1 : -1;
			return a.position - b.position;
		};
		const out = visible
			.filter(ch => !ch.parent_id || !guild.channels.has(ch.parent_id))
			.sort(byPos)
			.map(ch => ({...ch, category: null}));
		for (const cat of categories) {
			const kids = visible.filter(ch => ch.parent_id === cat.id).sort(byPos);
			for (const ch of kids) out.push({...ch, category: cat.name});
		}
		return out;
	}

	sortedGuilds() {
		return [...this.guilds.values()];
	}

	sortedDMs() {
		return [...this.dms.values()].sort((a, b) => (BigInt(b.last_message_id ?? 0) > BigInt(a.last_message_id ?? 0) ? 1 : -1));
	}

	dmName(ch) {
		if (ch.name) return ch.name;
		const names = (ch.recipients ?? []).map(u => u.global_name ?? u.username);
		return names.join(', ') || 'Unknown';
	}

	channelName(id) {
		const ch = this.channels.get(id);
		if (!ch) return null;
		return ch.guild_id ? ch.name : this.dmName(ch);
	}

	roleName(guildId, roleId) {
		return this.guilds.get(guildId)?.roles.get(roleId)?.name ?? null;
	}

	destroy() {
		this.closed = true;
		clearInterval(this.heartbeatTimer);
		this.ws?.close(1000);
	}
}
