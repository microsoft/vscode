/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcessWithoutNullStreams } from 'child_process';
import { createInterface } from 'readline';
import { DeferredPromise } from '../../../base/common/async.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { hasKey } from '../../../base/common/types.js';
import { vBoolean, vNumber, vObj, vString, vUnion } from '../../../base/common/validation.js';
import { ILogService } from '../../log/common/log.js';
import { DEV_CONTAINER_GIT_CREDENTIAL_REQUEST_TIMEOUT_MS } from '../common/devContainerAgentHost.js';
import { shellEscape } from './sshRemoteAgentHostHelpers.js';

const MAX_CREDENTIAL_INPUT_LENGTH = 64 * 1024;
const relayMessageValidator = vUnion(vObj({ ready: vBoolean() }), vObj({ id: vNumber(), input: vString() }));

const credentialHelperSource = String.raw`
const net = require('net');
if (process.argv[2] !== 'get') { process.exit(0); }
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
	input += chunk;
	if (input.length > 65536) { process.exit(1); }
});
process.stdin.on('end', () => {
	const socket = net.connect(process.argv[3]);
	socket.setTimeout(${DEV_CONTAINER_GIT_CREDENTIAL_REQUEST_TIMEOUT_MS + 30_000}, () => socket.destroy(new Error('Git credential forwarding timed out')));
	socket.on('connect', () => socket.write(JSON.stringify({ input }) + '\n'));
	let response = '';
	socket.setEncoding('utf8');
	socket.on('data', chunk => response += chunk);
	socket.on('end', () => {
		try {
			const result = JSON.parse(response);
			if (result.error) { throw new Error('Git credential forwarding failed'); }
			process.stdout.write(result.output);
		} catch {
			console.error('Git credential forwarding failed');
			process.exitCode = 1;
		}
	});
	socket.on('error', () => {
		console.error('Git credential forwarding is unavailable');
		process.exitCode = 1;
	});
});
`;

const credentialServerSource = String.raw`
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const readline = require('readline');
const { spawnSync } = require('child_process');
process.umask(0o077);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-git-'));
const socketPath = process.platform === 'win32' ? '\\\\.\\pipe\\vscode-git-' + path.basename(directory) : path.join(directory, 'socket');
const helperPath = path.join(directory, 'helper.cjs');
fs.writeFileSync(helperPath, process.argv[1], { mode: 0o600 });
const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";
const helper = '!f() { ' + quote(process.execPath.replace(/\\/g, '/')) + ' ' + quote(helperPath.replace(/\\/g, '/')) + ' "$1" ' + quote(socketPath) + '; }; f';
const sockets = new Map();
let nextId = 0;
let configured = false;
const cleanup = () => {
	if (configured) {
		const result = spawnSync('git', ['config', '--global', '--fixed-value', '--unset-all', 'credential.helper', helper]);
		if (result.status !== 0 && result.status !== 5) { console.error('Failed to remove Git credential forwarding helper'); }
	}
	fs.rmSync(directory, { recursive: true, force: true });
};
process.on('exit', cleanup);
process.on('SIGTERM', () => process.exit(0));
const server = net.createServer({ allowHalfOpen: true }, socket => {
	const id = ++nextId;
	let input = '';
	let requested = false;
	socket.setEncoding('utf8');
	socket.setTimeout(30000, () => socket.destroy());
	socket.on('error', () => sockets.delete(id));
	socket.on('close', () => sockets.delete(id));
	socket.on('data', chunk => {
		if (requested) { socket.destroy(); return; }
		input += chunk;
		if (input.length > 393216) { socket.destroy(); return; }
		const end = input.indexOf('\n');
		if (end < 0) { return; }
		requested = true;
		socket.setTimeout(${DEV_CONTAINER_GIT_CREDENTIAL_REQUEST_TIMEOUT_MS + 30_000});
		let request;
		try {
			request = JSON.parse(input.slice(0, end));
			if (typeof request.input !== 'string' || request.input.length > 65536) { throw new Error('Invalid request'); }
		} catch {
			socket.destroy();
			return;
		}
		if (sockets.size >= 16) { socket.end(JSON.stringify({ error: true })); return; }
		sockets.set(id, socket);
		process.stdout.write(JSON.stringify({ id, input: request.input }) + '\n');
	});
});
server.on('error', () => {
	console.error('Failed to start Git credential forwarding');
	process.exit(1);
});
const responses = readline.createInterface({ input: process.stdin });
responses.on('line', line => {
	const response = JSON.parse(line);
	const socket = sockets.get(response.id);
	if (socket) {
		sockets.delete(response.id);
		socket.end(JSON.stringify(response));
	}
});
responses.on('close', () => process.exit(0));
server.listen(socketPath, () => {
	const result = spawnSync('git', ['config', '--global', '--add', 'credential.helper', helper]);
	if (result.status !== 0) {
		console.error('Failed to configure Git credential forwarding');
		process.exit(1);
	}
	configured = true;
	process.stdout.write(JSON.stringify({ ready: true }) + '\n');
});
`;

/** Uses the already installed server's Node runtime, without requiring Node on the container's PATH. */
export function buildDevContainerGitCredentialRelayCommand(cliDataDir: string): string {
	const script = getDevContainerGitCredentialRelayArgs().map(shellEscape).join(' ');
	return `for node in ${cliDataDir}/servers/*/server/node; do if test -x "$node"; then exec "$node" ${script}; fi; done; exec node ${script}`;
}

export function getDevContainerGitCredentialRelayArgs(): readonly string[] {
	return ['-e', credentialServerSource, credentialHelperSource];
}

/** Restricts forwarded requests to the HTTPS credential protocol, excluding Git configuration directives. */
export function validateGitCredentialInput(input: string): void {
	if (input.length > MAX_CREDENTIAL_INPUT_LENGTH || input.includes('\0') || input.includes('\r')) {
		throw new Error('Invalid Git credential forwarding input');
	}
	const values = new Map<string, string>();
	for (const line of input.replace(/\n+$/, '').split('\n')) {
		const separator = line.indexOf('=');
		const key = line.slice(0, separator);
		if (separator < 1 || !['protocol', 'host', 'path', 'username', 'wwwauth[]', 'capability[]'].includes(key)) {
			throw new Error('Invalid Git credential forwarding field');
		}
		if (values.has(key) && !key.endsWith('[]')) {
			throw new Error('Duplicate Git credential forwarding field');
		}
		values.set(key, line.slice(separator + 1));
	}
	if (values.get('protocol') !== 'https' || !values.get('host')) {
		throw new Error('Git credential forwarding requires an HTTPS host');
	}
}

/** Carries credential requests over exec stdio; credential values are never written to logs or files. */
export class DevContainerGitCredentialRelay extends Disposable {
	private readonly _ready = new DeferredPromise<void>();
	readonly ready = this._ready.p;
	private _pending = 0;
	private _closed = false;

	constructor(
		private readonly _child: ChildProcessWithoutNullStreams,
		private readonly _readCredential: (input: string) => Promise<string>,
		private readonly _logService: ILogService,
		private readonly _onClose: () => void,
	) {
		super();
		this._register(toDisposable(() => {
			this._closed = true;
			_child.stdin.end();
		}));
		const lines = createInterface({ input: _child.stdout });
		this._register(toDisposable(() => lines.close()));
		const timeout = setTimeout(() => this._fail(new Error('Git credential forwarding startup timed out')), 30_000);
		this._register(toDisposable(() => clearTimeout(timeout)));
		lines.on('line', line => {
			try {
				const result = relayMessageValidator.validate(JSON.parse(line));
				if (result.error) {
					throw new Error('Invalid Git credential forwarding message');
				}
				const message = result.content;
				if (hasKey(message, { ready: true }) && message.ready === true) {
					clearTimeout(timeout);
					void this._ready.complete();
				} else if (hasKey(message, { id: true, input: true }) && Number.isSafeInteger(message.id) && message.id > 0) {
					void this._forward(message.id, message.input);
				} else {
					throw new Error('Invalid Git credential forwarding request');
				}
			} catch {
				this._fail(new Error('Invalid Git credential forwarding message'));
			}
		});
		_child.stderr.on('data', () => this._logService.warn('[DevContainerAgentHost] Git credential relay reported an error'));
		_child.stdin.on('error', () => this._fail(new Error('Git credential forwarding disconnected')));
		_child.on('error', () => this._fail(new Error('Git credential forwarding process failed')));
		_child.on('close', () => this._fail(new Error('Git credential forwarding process closed')));
	}

	private _fail(error: Error): void {
		const wasClosed = this._closed;
		if (!this._closed) {
			this._logService.warn('[DevContainerAgentHost]', error.message);
		}
		if (!this._ready.isSettled) {
			void this._ready.error(error);
		}
		this.dispose();
		if (!wasClosed) {
			this._onClose();
		}
	}

	private async _forward(id: number, input: string): Promise<void> {
		let response: { id: number; output?: string; error?: boolean };
		this._pending++;
		try {
			if (this._closed || this._pending > 16) {
				throw new Error('Git credential forwarding is unavailable');
			}
			validateGitCredentialInput(input);
			response = { id, output: await this._readCredential(`${input.replace(/\n+$/, '')}\n\n`) };
		} catch {
			this._logService.warn('[DevContainerAgentHost] Git credential lookup failed');
			response = { id, error: true };
		} finally {
			this._pending--;
		}
		if (!this._closed) {
			this._child.stdin.write(`${JSON.stringify(response)}\n`);
		}
	}
}
