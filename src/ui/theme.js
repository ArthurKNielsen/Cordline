// Discord "blurple" palette — stands in for Claude Code's orange.
export const theme = {
	brand: '#5865F2',
	brandLight: '#8EA1FF',
	brandDim: '#4752C4',
	text: '#DBDEE1',
	subtle: '#949BA4',
	dim: '#6D6F78',
	border: '#4E5058',
	green: '#23A55A',
	yellow: '#F0B232',
	red: '#F23F43',
	mentionBg: '#3C4270',
	codeBg: '#2B2D31',
	code: '#E9A6FF',
	link: '#00A8FC',
	userBg: '#2B2D31',
	modalBg: '#232428',
};

// Stable per-user name colors (Discord-ish role colors).
const nameColors = ['#8EA1FF', '#57F287', '#FEE75C', '#EB459E', '#F47B67', '#3BA5FF', '#B47CFF', '#45DDC0'];
export function nameColor(id = '') {
	let h = 0;
	for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return nameColors[h % nameColors.length];
}

export const LOGO = [
	'██████╗ ██╗███████╗ ██████╗ ██████╗ ██████╗ ██████╗ ',
	'██╔══██╗██║██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔══██╗',
	'██║  ██║██║███████╗██║     ██║   ██║██████╔╝██║  ██║',
	'██║  ██║██║╚════██║██║     ██║   ██║██╔══██╗██║  ██║',
	'██████╔╝██║███████║╚██████╗╚██████╔╝██║  ██║██████╔╝',
	'╚═════╝ ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝ ',
];

// Gradient from blurple to light periwinkle, one color per logo row.
export const LOGO_COLORS = ['#4752C4', '#5865F2', '#6875F5', '#7984F7', '#8A93FA', '#9AA3FF'];

// Little Clyde-style controller face.
export const MASCOT = ['   ▄▄▄▄     ▄▄▄▄   ', ' ▄███████████████▄ ', '████▀▀▀█████▀▀▀████', '███     ███     ███', '████▄▄▄█████▄▄▄████', ' ▀███████████████▀ ', '   ▀▀▀       ▀▀▀   '];

export const SPINNER = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
