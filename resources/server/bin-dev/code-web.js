/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const opn = require('opn');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');

const SELFHOST = process.argv.indexOf('--selfhost') !== -1;

let PORT = 8000;
process.argv.forEach((arg, idx) => {
	if (arg.indexOf('--port') !== -1 && process.argv.length >= idx + 1) {
		PORT = process.argv[idx + 1];
	}
});

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

// Start Server
let serverArgs = process.argv.slice(2);
const proc = path.extname(executable) === '.cmd' || path.extname(executable) === '.bat' ? cp.spawn(executable, serverArgs, { shell: true }) : cp.execFile(executable, serverArgs);

let launched = false;
proc.stdout.on("data", data => {

	// Log everything
	console.log(data.toString());

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

// Log errors
proc.stderr.on("data", data => {
	console.error(data.toString());
});