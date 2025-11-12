/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { spawn } from 'child_process';
import * as path from 'path';

const filename = process.argv[2];
if (!filename) {
	console.error('Error: Please provide a filename as an argument');
	process.exit(1);
}

const child = spawn('node', ['--disable-warning=ExperimentalWarning', '--loader', 'ts-node/esm', filename, ...process.argv.slice(3)], {
	env: {
		...process.env,
		TS_NODE_PROJECT: path.join(import.meta.dirname, 'tsconfig.json')
	},
	stdio: 'inherit'
});

child.on('exit', (code) => {
	process.exit(code || 0);
});
