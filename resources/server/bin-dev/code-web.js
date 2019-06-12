/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const opn = require('opn');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');

const VERBOSE = process.argv.indexOf('--verbose') !== -1;
const SELFHOST = process.argv.indexOf('--selfhost') !== -1;

const SELFHOST_PORT = 9777;
const DEVELOPMENT_PORT = 9888;
const PORT = SELFHOST ? SELFHOST_PORT : DEVELOPMENT_PORT;

let executable;
if (SELFHOST) {
	const parentFolder = path.dirname(path.dirname(path.dirname(path.dirname(__dirname))));

	const executables = {
		'win32': {
			folder: 'vscode-server-win32-x64',
			command: 'server.cmd'
		},
		'darwin': {
			folder: 'vscode-server-darwin',
			command: 'server.sh'
		},
		'linux': {
			folder: 'vscode-server-linux-x64',
			command: 'server.sh'
		}
	};

	executable = path.join(parentFolder, executables[process.platform].folder, executables[process.platform].command);

	if (!fs.existsSync(executable)) {
		console.error(`Unable to find ${executable}. Make sure to download the server first.`);
	}
} else {
	executable = path.join(__dirname, process.platform === 'win32' ? 'server.bat' : 'server.sh');
}

const proc = path.extname(executable) === '.cmd' || path.extname(executable) === '.bat' ? cp.spawn(executable, process.argv, { shell: true }) : cp.execFile(executable, process.argv);

let launched = false;
proc.stdout.on("data", data => {

	// Respect --verbose
	if (VERBOSE) {
		console.log(data.toString());
	}

	// Bring up web URL when we detect the server is ready
	if (!launched && data.toString().indexOf(`Extension host agent listening on ${PORT}`) >= 0) {
		launched = true;

		setTimeout(() => {
			const url = `http://127.0.0.1:${PORT}`;

			console.log(`Opening ${url} in your browser...`);

			opn(url).catch(() => { console.error(`Failed to open ${url} in your browser. Please do so manually.`); });
		}, 100);
	}
});