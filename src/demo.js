// Offline demo client with fake servers, channels and chatter.
// Exposes the same surface the UI uses from DiscordClient.
import {DiscordClient, ChannelType} from './discord.js';

let snowflake = 1n << 40n;
const nextId = () => String((BigInt(Date.now() - 1420070400000) << 22n) + snowflake++);

const users = {
	me: {id: 'u0', username: 'arthur', global_name: 'Arthur'},
	nova: {id: 'u1', username: 'nova', global_name: 'Nova'},
	kai: {id: 'u2', username: 'kai.dev', global_name: 'Kai'},
	mira: {id: 'u3', username: 'mira', global_name: 'Mira'},
	zed: {id: 'u4', username: 'zedd', global_name: 'Zed'},
	bot: {id: 'u5', username: 'MEE6', global_name: 'MEE6', bot: true},
};

const guildDefs = [
	{
		id: 'g1',
		name: 'Gaming Hub',
		categories: {
			c1: 'Information',
			c2: 'Text Channels',
			c3: 'Voice Channels',
		},
		channels: [
			['announcements', ChannelType.ANNOUNCEMENT, 'c1', 'Server news and updates'],
			['rules', ChannelType.TEXT, 'c1', 'Read before chatting'],
			['general', ChannelType.TEXT, 'c2', 'Talk about anything'],
			['clips', ChannelType.TEXT, 'c2', 'Post your best plays'],
			['lfg', ChannelType.TEXT, 'c2', 'Looking for group'],
			['Lounge', ChannelType.VOICE, 'c3'],
			['Ranked Grind', ChannelType.VOICE, 'c3'],
		],
	},
	{
		id: 'g2',
		name: 'Dev Friends',
		categories: {c1: 'Chat', c2: 'Projects'},
		channels: [
			['general', ChannelType.TEXT, 'c1', 'Code, coffee, chaos'],
			['memes', ChannelType.TEXT, 'c1'],
			['javascript', ChannelType.TEXT, 'c2', 'undefined is not a function'],
			['rust', ChannelType.TEXT, 'c2', 'Fearless concurrency'],
			['show-and-tell', ChannelType.TEXT, 'c2'],
		],
	},
	{
		id: 'g3',
		name: 'Lofi Study Club',
		categories: {c1: 'Study'},
		channels: [
			['study-chat', ChannelType.TEXT, 'c1'],
			['resources', ChannelType.TEXT, 'c1'],
			['Focus Room', ChannelType.VOICE, 'c1'],
		],
	},
	{
		id: 'g4',
		name: 'Minecraft SMP',
		categories: {c1: 'Server'},
		channels: [
			['server-status', ChannelType.TEXT, 'c1'],
			['builds', ChannelType.TEXT, 'c1'],
			['trading', ChannelType.TEXT, 'c1'],
		],
	},
];

const scripts = {
	'g1:general': [
		['nova', 'yo who is up for ranked tonight'],
		['kai', 'me fr, need to get out of gold 💀'],
		['mira', 'count me in after 9'],
		['zed', 'bet. lobby at 9:15 then'],
		['nova', 'also did anyone see the new patch notes?? they nerfed the **grappling hook** again'],
		['kai', 'nah thats crazy, every patch bro'],
		['bot', 'GG <@u2>, you just advanced to **level 12**! 🎉'],
		['mira', 'lmaooo the bot always snitching on ur grind'],
		['me', 'im down for 9:15 too'],
		['zed', 'ok we got 5, full squad 🔥'],
	],
	'g2:general': [
		['kai', 'just shipped my first rust crate 🦀'],
		['nova', 'W. whats it do'],
		['kai', 'parses discord timestamps lol. `cargo add tsparse`'],
		['mira', 'peak engineering'],
		['zed', '```js\nconst vibes = await fetch("/api/vibes");\nconsole.log(await vibes.json());\n```'],
		['nova', '> undefined is not a function\nevery single day'],
	],
	'g2:javascript': [
		['zed', 'is bun actually faster or is it just marketing'],
		['kai', 'its faster for installs for sure'],
		['mira', 'node 22 is fine honestly, ||dont tell anyone i said that||'],
	],
};

const chatter = [
	['nova', 'lowkey this server is the only place i talk to people'],
	['kai', 'brb grabbing food'],
	['mira', 'no way 😭'],
	['zed', 'thats actually so real'],
	['nova', 'gng we gotta run it back'],
	['kai', 'who took my spot in the queue 😤'],
	['mira', 'ok that clip was insane ngl'],
];

export class DemoClient extends DiscordClient {
	constructor() {
		super('demo');
		this.isBot = false;
		this.history = new Map();
		this.timer = null;
	}

	async login() {
		await new Promise(r => setTimeout(r, 600));
		this.user = users.me;
		for (const def of guildDefs) {
			const channels = [];
			let pos = 0;
			for (const [catId, catName] of Object.entries(def.categories)) {
				channels.push({id: `${def.id}-${catId}`, name: catName, type: ChannelType.CATEGORY, position: pos++});
			}
			def.channels.forEach(([name, type, cat, topic], i) => {
				channels.push({id: `${def.id}:${name}`, name, type, topic, parent_id: `${def.id}-${cat}`, position: i});
			});
			this.addGuild({id: def.id, name: def.name, channels});
		}
		const dmUsers = [users.nova, users.kai, users.mira];
		dmUsers.forEach((u, i) => this.addDM({id: `dm:${u.id}`, type: ChannelType.DM, recipients: [u], last_message_id: String(100 - i)}));
		this.addDM({id: 'dm:group', type: ChannelType.GROUP_DM, name: 'the squad', recipients: [users.nova, users.kai, users.zed], last_message_id: '50'});
		this.startChatter();
		return this.user;
	}

	makeMessage(channelId, who, content, minutesAgo = 0) {
		const ch = this.channels.get(channelId);
		return {
			id: nextId(),
			channel_id: channelId,
			guild_id: ch?.guild_id,
			author: users[who],
			content,
			timestamp: new Date(Date.now() - minutesAgo * 60000).toISOString(),
			mentions: content.includes('<@u2>') ? [users.kai] : [],
			attachments: [],
			embeds: [],
			type: 0,
		};
	}

	async getMessages(channelId) {
		await new Promise(r => setTimeout(r, 450));
		if (!this.history.has(channelId)) {
			const ch = this.channels.get(channelId);
			let lines = scripts[channelId];
			if (!lines) {
				const dmWith = ch?.recipients?.[0]?.username;
				const who = Object.keys(users).find(k => users[k].username === dmWith) ?? 'nova';
				lines = ch?.guild_id
					? [
							['nova', `welcome to #${ch.name} 👋`],
							['kai', 'first'],
							['mira', 'second ig'],
						]
					: [
							[who, 'yo you there?'],
							['me', 'ya whats up'],
							[who, 'you coming to the lobby later?'],
							['me', 'yeah ill hop on at 9'],
						];
			}
			const msgs = lines.map(([who, text], i) => this.makeMessage(channelId, who, text, (lines.length - i) * 3));
			const picture = (who, text, minutesAgo, file, scene) => ({
				...this.makeMessage(channelId, who, text, minutesAgo),
				attachments: [{id: file, filename: file, size: 2_400_000, width: 1600, height: 900, content_type: 'image/png', url: `https://cdn.discordapp.com/attachments/demo/${file}`, _demo: scene}],
			});
			if (channelId === 'g1:general') msgs.splice(3, 0, picture('mira', 'sunset from my window rn 🌅', 20, 'sunset_from_my_window.png', 'sunset'));
			if (channelId === 'g1:clips') {
				msgs.push(picture('nova', 'new map preview just dropped', 4, 'new_map_preview.png', 'synthwave'));
				msgs.push({
					...this.makeMessage(channelId, 'zed', 'insane 1v4 clutch'),
					attachments: [{filename: 'clutch_1v4.mp4', size: 18_400_000, url: 'https://cdn.discordapp.com/attachments/clutch_1v4.mp4'}],
				});
			}
			this.history.set(channelId, msgs);
		}
		return this.history.get(channelId);
	}

	async sendMessage(channelId, content) {
		const msg = this.makeMessage(channelId, 'me', content);
		this.history.get(channelId)?.push(msg);
		this.emit('message', msg);
		if (/^(hi|hey|yo|sup|hello)\b/i.test(content)) {
			setTimeout(() => this.replyIn(channelId), 1200);
		}
		return msg;
	}

	triggerTyping() {}

	replyIn(channelId) {
		const ch = this.channels.get(channelId);
		const who = ch?.guild_id ? 'nova' : (Object.keys(users).find(k => users[k].id === ch?.recipients?.[0]?.id) ?? 'nova');
		this.emit('typing', {channel_id: channelId, user_id: users[who].id, guild_id: ch?.guild_id, member: null, _user: users[who]});
		setTimeout(() => {
			const msg = this.makeMessage(channelId, who, 'yooo 👋');
			this.history.get(channelId)?.push(msg);
			this.emit('message', msg);
		}, 1800);
	}

	startChatter() {
		// A few pings that arrive right after login so unread badges show up.
		const pings = [
			['g1:clips', 'zed', 'yo who clipped that last round 😭'],
			['g1:clips', 'mira', 'it was me, posting it rn'],
			['g2:rust', 'kai', 'borrow checker beat me again'],
			['dm:u2', 'kai', 'you hopping on tonight?'],
		];
		pings.forEach(([channelId, who, text], n) => setTimeout(() => this.emit('message', this.makeMessage(channelId, who, text)), 1200 + n * 150));
		let i = 0;
		this.timer = setInterval(() => {
			const channelId = i % 3 === 2 ? 'dm:u1' : 'g1:general';
			const [who, text] = chatter[i++ % chatter.length];
			const author = channelId === 'dm:u1' ? 'nova' : who;
			this.emit('typing', {channel_id: channelId, user_id: users[author].id, _user: users[author]});
			setTimeout(() => {
				const msg = this.makeMessage(channelId, author, text);
				this.history.get(channelId)?.push(msg);
				this.emit('message', msg);
			}, 2000);
		}, 9000);
	}

	userById(id) {
		return Object.values(users).find(u => u.id === id);
	}

	destroy() {
		clearInterval(this.timer);
	}
}
