// Procedurally drawn pictures for --demo mode (no network needed).
const mix = (a, b, t) => a + (b - a) * t;
const mixC = (c1, c2, t) => [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)];
const clamp = x => Math.min(1, Math.max(0, x));

function hash(x) {
	const s = Math.sin(x * 127.1) * 43758.5453;
	return s - Math.floor(s);
}
function noise(x) {
	const i = Math.floor(x);
	const f = x - i;
	return mix(hash(i), hash(i + 1), f * f * (3 - 2 * f));
}
const ridge = (x, seed) => noise(x * 3 + seed) * 0.55 + noise(x * 7 + seed * 2) * 0.3 + noise(x * 17 + seed * 3) * 0.15;

// Mountains at sunset over a lake.
function sunset(u, v) {
	let c = v < 0.6 ? mixC([255, 120, 90], [70, 40, 120], clamp((0.6 - v) / 0.6) ** 0.8) : [0, 0, 0];
	const sun = Math.hypot((u - 0.62) * 1.6, v - 0.4);
	if (v < 0.6) c = mixC(c, [255, 220, 150], clamp(1 - sun / 0.1) ** 1.2);
	const far = 0.44 + ridge(u, 3) * 0.1;
	const near = 0.5 + ridge(u, 9) * 0.08;
	if (v < 0.6 && v > far) c = mixC([120, 70, 140], [90, 50, 110], clamp((v - far) * 4));
	if (v < 0.6 && v > near) c = mixC([60, 30, 80], [35, 20, 55], clamp((v - near) * 5));
	if (v >= 0.6) {
		const mirror = sunset(u, 1.2 - v);
		const ripple = 0.85 + 0.15 * Math.sin(v * 140 + noise(u * 20) * 4);
		c = mixC(mirror, [30, 25, 70], 0.35).map(x => x * ripple);
	}
	return c;
}

// Synthwave sun and neon grid, like a game screenshot.
function synthwave(u, v) {
	const horizon = 0.58;
	if (v < horizon) {
		let c = mixC([20, 10, 50], [140, 40, 140], clamp(v / horizon) ** 1.4);
		const d = Math.hypot(u - 0.5, (v - 0.4) * 1.1);
		if (d < 0.2) {
			const stripe = v > 0.4 && Math.sin((v - 0.4) * 90) > 0.2 * (1 - (v - 0.4) * 6);
			c = stripe ? c : mixC([255, 230, 90], [255, 60, 150], clamp((v - 0.22) / 0.36));
		} else {
			c = mixC(c, [255, 90, 180], clamp(1 - (d - 0.2) / 0.1) * 0.35);
		}
		if (hash(Math.floor(u * 160) * 7 + Math.floor(v * 90)) > 0.995 && v < 0.35) c = [255, 255, 255];
		const peaks = horizon - 0.07 - ridge(u, 5) * 0.09;
		if (v > peaks) c = mixC([40, 15, 70], [20, 8, 40], clamp((v - peaks) / 0.1));
		return c;
	}
	const z = 1 / (v - horizon + 0.02);
	const gx = Math.abs(((u - 0.5) * z * 0.6) % 1);
	const gz = Math.abs((z * 0.9) % 1);
	const line = Math.min(Math.min(gx, 1 - gx), Math.min(gz, 1 - gz));
	const glow = clamp(1 - line * (6 + z * 0.4));
	return mixC([25, 8, 45], [80, 220, 255], glow * clamp((v - horizon) * 6));
}

const SCENES = {sunset, synthwave};

export function demoImage(name, width, height) {
	const fn = SCENES[name] ?? sunset;
	const data = new Uint8Array(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const [r, g, b] = fn((x + 0.5) / width, (y + 0.5) / height);
			const i = (y * width + x) * 4;
			data[i] = r;
			data[i + 1] = g;
			data[i + 2] = b;
			data[i + 3] = 255;
		}
	}
	return {width, height, data};
}
