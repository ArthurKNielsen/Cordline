import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = process.env.XDG_CONFIG_HOME ? path.join(process.env.XDG_CONFIG_HOME, 'discord-terminal') : path.join(os.homedir(), '.config', 'discord-terminal');
export const configPath = path.join(dir, 'config.json');

export function loadConfig() {
	try {
		return JSON.parse(fs.readFileSync(configPath, 'utf8'));
	} catch {
		return {};
	}
}

export function saveConfig(config) {
	fs.mkdirSync(dir, {recursive: true, mode: 0o700});
	fs.writeFileSync(configPath, JSON.stringify(config, null, 2), {mode: 0o600});
}

export function clearToken() {
	const config = loadConfig();
	delete config.token;
	saveConfig(config);
}
