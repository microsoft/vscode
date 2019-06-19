/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const opn = require('opn');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');

const SELFHOST = process.argv.indexOf('--selfhost') !== -1;
const HAS_FOLDER = process.argv.indexOf('--folder') !== -1;
const HAS_PORT = process.argv.indexOf('--port') !== -1;

let PORT = SELFHOST ? 9777 : 9888;

if (!HAS_FOLDER) {
	console.log(`Using ${process.cwd()} as workspace. Use --folder <path> to specifcy a different workspace location.`);
	process.argv.push('--folder', process.cwd());
}

if (!HAS_PORT) {
	process.argv.push('--port', new String(PORT));
}

let BROWSER = undefined;
process.argv.forEach((arg, idx) => {
	if (arg.indexOf('--port') !== -1 && process.argv.length >= idx + 1) {
		PORT = process.argv[idx + 1];
	}

	if (arg.indexOf('--browser') !== -1 && process.argv.length >= idx + 1) {
		BROWSER = process.argv[idx + 1];
	}
});

let executable;
if (SELFHOST) {
	const parentFolder = path.dirname(path.dirname(path.dirname(path.dirname(__dirname))));

	const executables = {
		'win32': {
			folder: 'vscode-server-win32-x64-web',
			command: 'server.cmd'
		},
		'darwin': {
			folder: 'vscode-server-darwin-web',
			command: 'server.sh'
		},
		'linux': {
			folder: 'vscode-server-linux-x64-web',
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

function getApp(requestedBrowser) {
	if (typeof requestedBrowser !== 'string') {
		return undefined;
	}

	switch (requestedBrowser.toLowerCase()) {
		case 'chrome':
			return ({
				'win32': 'chrome',
				'darwin': '/Applications/Google Chrome.app',
				'linux': 'google-chrome'
			})[process.platform];

		case 'safari':
			return ({
				'darwin': '/Applications/Safari.app',
			})[process.platform];
	}
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

			opn(url, { app: getApp(BROWSER) }).catch(() => { console.error(`Failed to open ${url} in your browser. Please do so manually.`); });
		}, 100);
	}
});

// Log errors
proc.stderr.on("data", data => {
	console.error(data.toString());
});