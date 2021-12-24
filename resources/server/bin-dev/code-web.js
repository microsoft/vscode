/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const cp = require('child_process');
const path = require('path');
const os = require('os');
const opn = require('opn');

const serverArgs = [];

// Server Config
let PORT = 9888;
let DRIVER = undefined;
let LOGS_PATH = undefined;
let LAUNCH = false;

// Workspace Config
let FOLDER = undefined;
let WORKSPACE = undefined;

// Settings Sync Config
let GITHUB_AUTH_TOKEN = undefined;
let ENABLE_SYNC = false;

for (let i = 0; i <= process.argv.length; i++) {
	const arg = process.argv[i];
	switch (arg) {
		case '--port': PORT = Number(process.argv[i + 1]); break;
		case '--folder': FOLDER = process.argv[i + 1]; break;
		case '--workspace': WORKSPACE = process.argv[i + 1]; break;
		case '--driver': DRIVER = process.argv[i + 1]; break;
		case '--github-auth': GITHUB_AUTH_TOKEN = process.argv[i + 1]; break;
		case '--logsPath': LOGS_PATH = process.argv[i + 1]; break;
		case '--enable-sync': ENABLE_SYNC = true; break;
		case '--launch': LAUNCH = true; break;
	}
}

serverArgs.push('--port', String(PORT));
if (FOLDER) {
	serverArgs.push('--folder', FOLDER);
}
if (WORKSPACE) {
	serverArgs.push('--workspace', WORKSPACE);
}
if (DRIVER) {
	serverArgs.push('--driver', DRIVER);

	// given a DRIVER, we auto-shutdown when tests are done
	serverArgs.push('--enable-remote-auto-shutdown', '--remote-auto-shutdown-without-delay');
}
if (LOGS_PATH) {
	serverArgs.push('--logsPath', LOGS_PATH);
}
if (GITHUB_AUTH_TOKEN) {
	serverArgs.push('--github-auth', GITHUB_AUTH_TOKEN);
}
if (ENABLE_SYNC) {
	serverArgs.push('--enable-sync', true);
}

// Connection Token
const TOKEN = '00000';
serverArgs.push('--connection-token', TOKEN);

// Server should really only listen from localhost
const HOST = '127.0.0.1';
serverArgs.push('--host', HOST);

const env = { ...process.env };
env['VSCODE_AGENT_FOLDER'] = env['VSCODE_AGENT_FOLDER'] || path.join(os.homedir(), '.vscode-web-dev');
const entryPoint = path.join(__dirname, '..', '..', '..', 'out', 'vs', 'server', 'main.js');

startServer();

function startServer() {
	const proc = cp.spawn(process.execPath, [entryPoint, ...serverArgs], { env });

	proc.stdout.on('data', data => {
		// Log everything
		console.log(data.toString());
	});

	// Log errors
	proc.stderr.on('data', data => {
		console.error(data.toString());
	});
}

if (LAUNCH) {
	opn(`http://${HOST}:${PORT}/?tkn=${TOKEN}`);
}
