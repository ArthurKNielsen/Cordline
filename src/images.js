// Renders images in the terminal with half-block characters: each cell shows two
// vertically stacked pixels (▀ with a foreground and a background color).
import pngjs from 'pngjs';
import jpeg from 'jpeg-js';
import {demoImage} from './demo-images.js';

const {PNG} = pngjs;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;
const BG = [30, 31, 34];

// Every displayable image in a message: attachments plus embed images.
export function imageSources(msg) {
	const out = [];
	for (const a of msg.attachments ?? []) {
		const isImage = a.content_type?.startsWith('image/') || IMAGE_EXT.test(a.filename ?? '');
		const isVideo = a.content_type?.startsWith('video/');
		if ((!isImage && !a._demo) || isVideo) continue;
		out.push({key: a.id ?? a.filename, url: a.url, proxyUrl: a.proxy_url ?? a.url, width: a.width, height: a.height, name: a.filename, video: isVideo, demo: a._demo});
	}
	for (const [i, e] of (msg.embeds ?? []).entries()) {
		const img = e.image ?? e.thumbnail;
		// Only load through Discord's media proxy so no third-party site is contacted.
		if (!img?.proxy_url) continue;
		out.push({key: `e${i}`, url: e.url ?? img.url, proxyUrl: img.proxy_url, width: img.width, height: img.height, name: e.title ?? 'image'});
	}
	return out;
}

// Size in cells that fits within maxCols x maxRows while keeping the aspect ratio.
export function fitCells(width, height, maxCols, maxRows) {
	const w = width || 16;
	const h = height || 9;
	let cols = Math.max(4, Math.floor(maxCols));
	let rows = Math.max(1, Math.round((cols * h) / w / 2));
	if (rows > maxRows) {
		rows = Math.max(1, Math.floor(maxRows));
		cols = Math.max(4, Math.min(cols, Math.round((rows * 2 * w) / h)));
	}
	return {cols, rows};
}

function decode(buf) {
	if (buf[0] === 0x89 && buf[1] === 0x50) {
		const png = PNG.sync.read(buf);
		return {width: png.width, height: png.height, data: png.data};
	}
	if (buf[0] === 0xff && buf[1] === 0xd8) {
		const img = jpeg.decode(buf, {useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256});
		return {width: img.width, height: img.height, data: img.data};
	}
	throw new Error('Unsupported image format');
}

// Area-average resample to exactly w x h, blending transparency onto the background.
function resample(img, w, h) {
	const out = new Float32Array(w * h * 3);
	const sx = img.width / w;
	const sy = img.height / h;
	for (let y = 0; y < h; y++) {
		const y0 = Math.floor(y * sy);
		const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
		for (let x = 0; x < w; x++) {
			const x0 = Math.floor(x * sx);
			const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
			let r = 0;
			let g = 0;
			let b = 0;
			let n = 0;
			for (let yy = y0; yy < y1 && yy < img.height; yy++) {
				for (let xx = x0; xx < x1 && xx < img.width; xx++) {
					const i = (yy * img.width + xx) * 4;
					const a = img.data[i + 3] / 255;
					r += img.data[i] * a + BG[0] * (1 - a);
					g += img.data[i + 1] * a + BG[1] * (1 - a);
					b += img.data[i + 2] * a + BG[2] * (1 - a);
					n++;
				}
			}
			const o = (y * w + x) * 3;
			out[o] = r / n;
			out[o + 1] = g / n;
			out[o + 2] = b / n;
		}
	}
	return out;
}

function toAnsiLines(pixels, cols, rows) {
	const lines = [];
	const px = (x, y) => {
		const o = (y * cols + x) * 3;
		return `${Math.round(pixels[o])};${Math.round(pixels[o + 1])};${Math.round(pixels[o + 2])}`;
	};
	for (let row = 0; row < rows; row++) {
		let line = '';
		let last = '';
		for (let x = 0; x < cols; x++) {
			const code = `\x1b[38;2;${px(x, row * 2)};48;2;${px(x, row * 2 + 1)}m`;
			line += (code === last ? '' : code) + '▀';
			last = code;
		}
		lines.push(`${line}\x1b[0m`);
	}
	return lines;
}

const cache = new Map();

// Resolves to an array of ANSI strings (one per terminal row).
export function loadImage(src, cols, rows) {
	const key = `${src.demo ?? src.proxyUrl}|${cols}x${rows}`;
	if (!cache.has(key)) {
		const job = (async () => {
			let img;
			if (src.demo) {
				img = demoImage(src.demo, cols * 2, rows * 4);
			} else {
				const u = new URL(src.proxyUrl);
				u.searchParams.set('format', 'png');
				u.searchParams.set('width', String(cols * 2));
				u.searchParams.set('height', String(rows * 4));
				const res = await fetch(u);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				img = decode(Buffer.from(await res.arrayBuffer()));
			}
			return toAnsiLines(resample(img, cols, rows * 2), cols, rows);
		})();
		job.catch(() => cache.delete(key));
		cache.set(key, job);
	}
	return cache.get(key);
}
