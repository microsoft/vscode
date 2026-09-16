/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fork } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { createInterface } from 'readline';

/** Adapts the shipped IPC Agent Host to the smoke fixture's standalone startup contract. */
function main(): void {
	const [bootstrap, tokenFile, userDataPath] = process.argv.slice(2);
	if (!bootstrap || !tokenFile || !userDataPath) {
		throw new Error('Expected bootstrap-fork path, connection-token file, and isolated user-data path.');
	}
	const token = readFileSync(tokenFile, 'utf8').trim();
	if (!/^[0-9a-zA-Z_-]+$/.test(token)) {
		throw new Error('Invalid fixture Agent Host connection token.');
	}
	const child = fork(bootstrap, [
		'--type=agentHost',
		'--user-data-dir', userDataPath,
		'--log', 'trace',
		'--telemetry-level', 'off',
	], {
		execPath: process.execPath,
		execArgv: [],
		stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
		env: {
			...process.env,
			VSCODE_ESM_ENTRYPOINT: 'vs/platform/agentHost/node/agentHostMain',
			VSCODE_AGENT_HOST_PORT: '0',
			VSCODE_AGENT_HOST_HOST: '127.0.0.1',
			VSCODE_AGENT_HOST_CONNECTION_TOKEN: token,
			VSCODE_AGENT_HOST_LAUNCH_KIND: 'vscode_cli',
			VSCODE_PARENT_PID: String(process.pid),
			VSCODE_PIPE_LOGGING: 'false',
			VSCODE_HANDLES_UNCAUGHT_ERRORS: 'true',
			VSCODE_NLS_CONFIG: JSON.stringify({
				userLocale: 'en',
				osLocale: 'en',
				resolvedLanguage: 'en',
				defaultMessagesFile: join(dirname(bootstrap), 'nls.messages.json'),
			}),
		},
	});
	let stopping = false;
	const stop = () => {
		if (!stopping) {
			stopping = true;
			if (child.connected) {
				child.disconnect();
			}
			child.kill();
		}
	};
	const output = createInterface({ input: child.stdout! });
	output.on('line', line => {
		const port = /^Agent host server listening on 127\.0\.0\.1:(?<port>\d+)$/.exec(line)?.groups?.port;
		if (port) {
			process.stdout.write(`READY:${port}\n`);
			process.stdout.write(`ws://127.0.0.1:${port}?tkn=${token}\n`);
		} else {
			process.stdout.write(`${line}\n`);
		}
	});
	child.stderr!.pipe(process.stderr);
	child.on('error', error => {
		console.error(error);
		process.exitCode = 1;
		stop();
	});
	child.on('close', code => {
		output.close();
		process.stdin.pause();
		process.exitCode = stopping ? 0 : code ?? 1;
	});
	process.stdin.resume();
	process.stdin.on('end', stop);
	process.on('SIGINT', stop);
	process.on('SIGTERM', stop);
	process.on('exit', () => child.kill());
}

main();
