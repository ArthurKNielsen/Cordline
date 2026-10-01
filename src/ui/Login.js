import React, {useState} from 'react';
import {Box, Text, useApp, useInput, usePaste, useWindowSize} from 'ink';
import {theme} from './theme.js';
import {Logo, PromptInput, Spinner} from './components.js';
import {DiscordClient, normalizeToken} from '../discord.js';

const h = React.createElement;

const METHODS = [
	{kind: 'user', label: 'Discord account', hint: 'log in with your user token — see your own servers, channels & DMs'},
	{kind: 'bot', label: 'Bot account', hint: 'log in with a bot token from the Developer Portal (officially supported)'},
];

export function Login({onDone, initialError}) {
	const {exit} = useApp();
	const {columns} = useWindowSize();
	const [step, setStep] = useState('method');
	const [sel, setSel] = useState(0);
	const [token, setToken] = useState('');
	const [error, setError] = useState(initialError ?? null);
	const [startedAt, setStartedAt] = useState(0);
	const method = METHODS[sel];

	const tryLogin = async () => {
		setStep('validating');
		setStartedAt(Date.now());
		setError(null);
		const full = normalizeToken(token, method.kind);
		const client = new DiscordClient(full);
		try {
			await client.login();
			onDone(client, full);
		} catch (err) {
			client.destroy();
			setError(err.status === 401 ? 'That token was rejected by Discord (401 Unauthorized).' : err.message);
			setStep('token');
		}
	};

	usePaste(text => setToken(t => t + text.trim()), {isActive: step === 'token'});

	useInput((input, key) => {
		if (key.ctrl && input === 'c') return exit();
		if (step === 'method') {
			if (key.upArrow) setSel(s => Math.max(s - 1, 0));
			else if (key.downArrow) setSel(s => Math.min(s + 1, METHODS.length - 1));
			else if (input === '1' || input === '2') setSel(Number(input) - 1);
			else if (key.return) setStep('token');
			return;
		}
		if (step === 'token') {
			if (key.escape) {
				setToken('');
				setError(null);
				setStep('method');
			} else if (key.return) {
				if (token.trim()) tryLogin();
			} else if (key.backspace || key.delete) setToken(t => t.slice(0, -1));
			else if (input && !key.ctrl && !key.meta) setToken(t => t + input.trim());
		}
	});

	return h(
		Box,
		{flexDirection: 'column', paddingTop: 1},
		h(Logo, {columns}),
		h(
			Box,
			{flexDirection: 'column', marginTop: 1, paddingX: 1},
			h(Text, {bold: true}, 'Welcome to ', h(Text, {color: theme.brandLight}, 'Cordline')),
			h(Text, {color: theme.subtle}, 'Discord, but it lives in your terminal.'),
		),
		step === 'method'
			? h(
					Box,
					{flexDirection: 'column', marginTop: 1, paddingX: 1},
					h(Text, {bold: true}, 'Select login method:'),
					h(Text, null, ' '),
					...METHODS.map((m, i) =>
						h(
							Box,
							{key: m.kind, flexDirection: 'column', marginBottom: 1},
							h(Text, {color: i === sel ? theme.brandLight : theme.text}, i === sel ? '❯ ' : '  ', `${i + 1}. `, h(Text, {bold: i === sel}, m.label)),
							h(Text, {color: theme.dim}, `     ${m.hint}`),
						),
					),
					h(Text, {color: theme.dim}, '↑/↓ to select · enter to continue · ctrl+c to quit'),
				)
			: h(
					Box,
					{flexDirection: 'column', marginTop: 1, paddingX: 1},
					h(Text, {bold: true}, method.kind === 'bot' ? 'Paste your bot token:' : 'Paste your Discord token:'),
					method.kind === 'user'
						? h(
								Box,
								{flexDirection: 'column', marginTop: 1, borderStyle: 'round', borderColor: theme.yellow, paddingX: 1},
								h(Text, {color: theme.yellow, bold: true}, '⚠ Heads up'),
								h(Text, {color: theme.subtle}, 'Using a user token in a third-party client ("self-botting") is against Discord\'s Terms of'),
								h(Text, {color: theme.subtle}, 'Service and can get your account flagged or banned. Never share your token with anyone —'),
								h(Text, {color: theme.subtle}, 'it is a full password for your account. It stays on this machine only.'),
							)
						: h(Text, {color: theme.subtle}, 'discord.com/developers → your app → Bot → Reset Token. Enable the MESSAGE CONTENT intent.'),
					h(Box, {marginTop: 1}, h(PromptInput, {value: token, cursor: token.length, placeholder: 'Token goes here…', columns: Math.min(columns, 100), masked: true})),
					error ? h(Text, {color: theme.red}, `  ⎿  ${error}`) : null,
					step === 'validating'
						? h(Spinner, {label: 'Connecting to Discord…', startedAt})
						: h(Text, {color: theme.dim}, '  enter to log in · esc to go back · token is saved to ~/.config/cordline'),
				),
	);
}
