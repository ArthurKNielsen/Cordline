import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
const dir = path.join(base, 'cordline');
export const configPath = path.join(dir, 'config.json');
// Config location used before the app was renamed to Cordline.
const legacyPath = path.join(base, 'discord-terminal', 'config.json');

export function loadConfig() {
	for (const file of [configPath, legacyPath]) {
		try {
			return JSON.parse(fs.readFileSync(file, 'utf8'));
		} catch {}
	}
	return {};
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
