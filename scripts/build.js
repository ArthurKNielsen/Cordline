// Builds standalone executables with Bun: `bun scripts/build.js [target...]`
// Targets: windows-x64, linux-x64, linux-arm64, darwin-x64, darwin-arm64 (default: all)
import {mkdirSync} from 'node:fs';

const ALL = ['windows-x64', 'linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'];
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ALL;

// Ink statically imports react-devtools-core (only used when DEV=true); stub it out.
const stubDevtools = {
	name: 'stub-react-devtools',
	setup(build) {
		build.onResolve({filter: /^react-devtools-core$/}, () => ({path: 'react-devtools-core', namespace: 'stub'}));
		build.onLoad({filter: /.*/, namespace: 'stub'}, () => ({contents: 'export default {initialize() {}, connectToDevTools() {}};', loader: 'js'}));
	},
};

mkdirSync('dist', {recursive: true});
for (const target of targets) {
	const outfile = `dist/discord-terminal-${target}${target.startsWith('windows') ? '.exe' : ''}`;
	const result = await Bun.build({
		entrypoints: ['bin/discord-terminal.js'],
		compile: {target: `bun-${target}`, outfile},
		minify: true,
		plugins: [stubDevtools],
		define: {'process.env.DEV': '"false"'},
	});
	if (!result.success) {
		console.error(result.logs.join('\n'));
		process.exit(1);
	}
	console.log(`built ${outfile}`);
}
