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

let TOKEN = '00000';

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
		case '--connection-token': TOKEN = process.argv[i + 1]; break;
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
serverArgs.push('--connection-token', TOKEN);

// Server should really only listen from localhost
const HOST = 'localhost';
serverArgs.push('--host', HOST);

const env = { ...process.env };
env['VSCODE_AGENT_FOLDER'] = env['VSCODE_AGENT_FOLDER'] || path.join(os.homedir(), '.vscode-server-oss-dev');
env['NODE_ENV'] = 'development';
env['VSCODE_DEV'] = '1';
const entryPoint = path.join(__dirname, '..', '..', '..', 'out', 'vs', 'server', 'main.js');

startServer();

function startServer() {
	console.log('start ' + entryPoint + ' ' + serverArgs.join(' '));
	const proc = cp.spawn(process.execPath, [entryPoint, ...serverArgs], { env });

	proc.stdout.on('data', data => {
		// Log everything
		console.log(data.toString());
	});

	// Log errors
	proc.stderr.on('data', data => {
		console.error(data.toString());
	});

	proc.on('exit', () => process.exit());

	process.on('exit', () => proc.kill());
	process.on('SIGINT', () => {
		proc.kill();
		process.exit(128 + 2); // https://nodejs.org/docs/v14.16.0/api/process.html#process_signal_events
	});
	process.on('SIGTERM', () => {
		proc.kill();
		process.exit(128 + 15); // https://nodejs.org/docs/v14.16.0/api/process.html#process_signal_events
	});

}

if (LAUNCH) {
	opn(`http://${HOST}:${PORT}/?tkn=${TOKEN}`);
}
