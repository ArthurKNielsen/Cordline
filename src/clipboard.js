// Copy to the system clipboard and open links in the default browser.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function run(cmd, args, input) {
	return new Promise(resolve => {
		try {
			const child = spawn(cmd, args, {stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true});
			child.on('error', () => resolve(false));
			child.on('close', code => resolve(code === 0));
			child.stdin.end(input ?? '');
		} catch {
			resolve(false);
		}
	});
}

// OSC 52 asks the terminal itself to set the clipboard (works over SSH too).
function osc52(text) {
	process.stdout.write(`\x1b]52;c;${Buffer.from(text, 'utf8').toString('base64')}\x07`);
}

export async function copyText(text) {
	let ok = false;
	if (process.platform === 'darwin') ok = await run('pbcopy', [], text);
	else if (process.platform === 'win32') {
		// Write UTF-8 to a temp file so emoji and accents survive.
		const file = path.join(os.tmpdir(), `cordline-clip-${process.pid}.txt`);
		try {
			fs.writeFileSync(file, text, 'utf8');
			ok = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Get-Content -Raw -Encoding UTF8 '${file}' | Set-Clipboard`]);
		} finally {
			fs.rmSync(file, {force: true});
		}
	} else {
		ok = (await run('wl-copy', [], text)) || (await run('xclip', ['-selection', 'clipboard'], text)) || (await run('xsel', ['--clipboard', '--input'], text));
	}
	if (!ok) osc52(text);
	return true;
}

export function openUrl(url) {
	if (!/^https?:\/\//i.test(url)) return false;
	const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]];
	try {
		const child = spawn(cmd, args, {stdio: 'ignore', detached: true, windowsHide: true});
		child.on('error', () => {});
		child.unref();
		return true;
	} catch {
		return false;
	}
}
