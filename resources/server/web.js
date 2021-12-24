/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const { spawn } = require('child_process');
const { join } = require('path');

// @ts-check

let cp;
if (process.platform === 'win32') {
	cp = spawn(join(__dirname, 'web.bat'), process.argv.slice(2), { stdio: ['inherit', 'inherit', 'inherit'] });
} else {
	cp = spawn('bash', [join(__dirname, 'web.sh'), ...process.argv.slice(2)], { stdio: ['inherit', 'inherit', 'inherit'] });
}

cp.on('exit', () => process.exit());

process.on('exit', () => cp.kill());
process.on('SIGINT', () => {
	cp.kill();
	process.exit(128 + 2); // https://nodejs.org/docs/v14.16.0/api/process.html#process_signal_events
});
process.on('SIGTERM', () => {
	cp.kill();
	process.exit(128 + 15); // https://nodejs.org/docs/v14.16.0/api/process.html#process_signal_events
});
