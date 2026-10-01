#!/usr/bin/env node
import {main} from '../src/cli.js';

main(process.argv).catch(err => {
	console.error(err);
	process.exit(1);
});
