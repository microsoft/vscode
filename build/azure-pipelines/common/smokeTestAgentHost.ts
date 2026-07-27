/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ChildProcess, fork } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { setTimeout as delay } from 'timers/promises';

const startupTimeoutMs = 30_000;
const shutdownTimeoutMs = 5_000;
const readyPattern = /Agent host server listening on \S+/;

async function main(serverRoot: string | undefined): Promise<void> {
	if (!serverRoot) {
		throw new Error('Usage: node smokeTestAgentHost.ts <server-root>');
	}

	const nodePath = path.join(serverRoot, process.platform === 'win32' ? 'node.exe' : 'node');
	const bootstrapPath = path.join(serverRoot, 'out', 'bootstrap-fork.js');
	for (const requiredPath of [nodePath, bootstrapPath]) {
		if (!fs.existsSync(requiredPath)) {
			throw new Error(`Packaged Agent Host dependency not found: ${requiredPath}`);
		}
	}

	const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-agent-host-smoke-'));
	const logsPath = path.join(temporaryRoot, 'logs');
	const userDataPath = path.join(temporaryRoot, 'user-data');
	fs.mkdirSync(logsPath, { recursive: true });
	fs.mkdirSync(userDataPath, { recursive: true });

	const child = fork(bootstrapPath, [
		'--type=agentHost',
		'--logsPath', logsPath,
		'--user-data-dir', userDataPath,
		'--disable-telemetry',
	], {
		cwd: serverRoot,
		env: {
			...process.env,
			VSCODE_DEV: undefined,
			VSCODE_ESM_ENTRYPOINT: 'vs/platform/agentHost/node/agentHostMain',
			VSCODE_AGENT_HOST_CONNECTION_TOKEN: undefined,
			VSCODE_AGENT_HOST_HOST: '127.0.0.1',
			VSCODE_AGENT_HOST_PORT: '0',
			VSCODE_AGENT_HOST_SOCKET_PATH: undefined,
			VSCODE_NLS_CONFIG: JSON.stringify({
				userLocale: 'en',
				osLocale: 'en',
				resolvedLanguage: 'en',
				defaultMessagesFile: path.join(serverRoot, 'out', 'nls.messages.json'),
			}),
			VSCODE_PIPE_LOGGING: 'false',
			VSCODE_VERBOSE_LOGGING: 'false',
		},
		execPath: nodePath,
		silent: true,
	});

	try {
		await waitForReady(child);
		console.log('Packaged Agent Host started successfully.');
	} finally {
		await stopProcess(child);
		fs.rmSync(temporaryRoot, { recursive: true, force: true });
	}
}

function waitForReady(child: ChildProcess): Promise<void> {
	return new Promise((resolve, reject) => {
		let output = '';
		let settled = false;

		const finish = (error?: Error) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeout);
			if (error) {
				reject(error);
			} else {
				resolve();
			}
		};

		const appendOutput = (data: Buffer) => {
			const text = data.toString();
			process.stdout.write(text);
			output = `${output}${text}`.slice(-64 * 1024);
			if (readyPattern.test(output)) {
				finish();
			}
		};

		child.stdout?.on('data', appendOutput);
		child.stderr?.on('data', appendOutput);
		child.once('error', error => finish(error));
		child.once('exit', (code, signal) => {
			finish(new Error(`Packaged Agent Host exited before becoming ready (code: ${code}, signal: ${signal}).\n${output}`));
		});

		const timeout = setTimeout(() => {
			finish(new Error(`Timed out after ${startupTimeoutMs}ms waiting for the packaged Agent Host to start.\n${output}`));
		}, startupTimeoutMs);
	});
}

async function stopProcess(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) {
		return;
	}

	const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
	child.kill();
	await Promise.race([exited, delay(shutdownTimeoutMs)]);
	if (child.exitCode === null && child.signalCode === null) {
		child.kill('SIGKILL');
		await exited;
	}
}

main(process.argv[2]).catch(error => {
	console.error(error);
	process.exit(1);
});
