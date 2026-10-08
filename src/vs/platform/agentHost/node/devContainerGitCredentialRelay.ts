/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcessWithoutNullStreams } from 'child_process';
import { createInterface } from 'readline';
import { DeferredPromise, raceCancellationError } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { Disposable, DisposableMap, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { hasKey } from '../../../base/common/types.js';
import { vBoolean, vNumber, vObj, vString, vUnion } from '../../../base/common/validation.js';
import { ILogService } from '../../log/common/log.js';
import { shellEscape } from './sshRemoteAgentHostHelpers.js';

const MAX_CREDENTIAL_INPUT_LENGTH = 64 * 1024;
const relayMessageValidator = vUnion(vObj({ ready: vBoolean() }), vObj({ id: vNumber(), input: vString() }), vObj({ canceled: vNumber() }));

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
	socket.setTimeout(30000, () => socket.destroy(new Error('Git credential forwarding timed out')));
	socket.on('connect', () => { socket.setTimeout(0); socket.write(JSON.stringify({ input }) + '\n'); });
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
	socket.on('error', error => {
		if (error.code === 'ENOENT' || error.code === 'ECONNREFUSED') { return; }
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
const getSocketPath = directory => process.platform === 'win32' ? '\\\\.\\pipe\\vscode-git-' + path.basename(directory) : path.join(directory, 'socket');
const socketPath = getSocketPath(directory);
const helperPath = path.join(directory, 'helper.cjs');
fs.writeFileSync(helperPath, process.argv[1], { mode: 0o600 });
const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";
const makeHelper = (nodePath, helperPath, socketPath, guarded = true) => {
	const command = quote(nodePath) + ' ' + quote(helperPath) + ' "$1" ' + quote(socketPath);
	return '!f() { ' + (guarded ? 'if test -f ' + quote(helperPath) + '; then ' + command + '; fi' : command) + '; }; f';
};
const helper = makeHelper(process.execPath.replace(/\\/g, '/'), helperPath.replace(/\\/g, '/'), socketPath);
const retryDelay = new Int32Array(new SharedArrayBuffer(4));
const gitConfig = (args, expected = [0]) => {
	let result;
	for (let attempt = 0; attempt < 20; attempt++) {
		result = spawnSync('git', ['config', '--global', ...args], { encoding: 'utf8' });
		if (expected.includes(result.status) || result.error) { return result; }
		if (attempt < 19) { Atomics.wait(retryDelay, 0, 0, 50); }
	}
	return result;
};
const parseManagedHelper = value => {
	if (!value.startsWith('!f() { ')) { return; }
	const parts = [...value.matchAll(/'(?<value>(?:[^']|'\\'')*)'/g)].map(match => match.groups.value.replace(/'\\''/g, "'"));
	if (parts.length !== 3 && parts.length !== 4) { return; }
	const guarded = parts.length === 4;
	const [nodePath, script, socket] = parts.slice(-3);
	if (guarded && parts[0] !== script) { return; }
	if (makeHelper(nodePath, script, socket, guarded) !== value
		|| !path.isAbsolute(script) || path.basename(script) !== 'helper.cjs'
		|| !/^vscode-git-[A-Za-z0-9]{6}$/.test(path.basename(path.dirname(script)))
		|| getSocketPath(path.dirname(script)) !== socket) { return; }
	return { script, socket };
};
const isRelayAvailable = socketPath => new Promise(resolve => {
	const socket = net.connect(socketPath);
	const finish = available => { socket.destroy(); resolve(available); };
	socket.setTimeout(1000, () => {
		console.error('Could not verify a previous Git credential relay');
		finish(true);
	});
	socket.on('connect', () => finish(true));
	socket.on('error', error => {
		if (error.code === 'ENOENT' || error.code === 'ECONNREFUSED') { finish(false); }
		else { console.error('Could not verify a previous Git credential relay'); finish(true); }
	});
});
const removeStaleHelpers = async () => {
	const result = spawnSync('git', ['config', '--global', '--null', '--get-all', 'credential.helper'], { encoding: 'utf8' });
	if (result.status !== 0 && result.status !== 1) { throw new Error('Could not read Git credential helpers'); }
	for (const value of result.stdout.split('\0')) {
		const managed = parseManagedHelper(value);
		if (!managed) { continue; }
		let scriptExists = true;
		try { fs.statSync(managed.script); }
		catch (error) {
			if (error.code === 'ENOENT') { scriptExists = false; }
			else { console.error('Could not inspect a previous Git credential helper'); continue; }
		}
		if (scriptExists && await isRelayAvailable(managed.socket)) { continue; }
		const removed = gitConfig(['--fixed-value', '--unset-all', 'credential.helper', value], [0, 5]);
		if (removed.status !== 0 && removed.status !== 5) { throw new Error('Could not remove a stale Git credential helper'); }
	}
};
const sockets = new Map();
let nextId = 0;
let configured = false;
const cleanup = () => {
	if (configured) {
		const result = gitConfig(['--fixed-value', '--unset-all', 'credential.helper', helper], [0, 5]);
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
	socket.on('error', () => socket.destroy());
	socket.on('end', () => socket.destroy());
	socket.on('close', () => {
		if (sockets.delete(id)) { process.stdout.write(JSON.stringify({ canceled: id }) + '\n'); }
	});
	socket.on('data', chunk => {
		if (requested) { socket.destroy(); return; }
		input += chunk;
		if (input.length > 393216) { socket.destroy(); return; }
		const end = input.indexOf('\n');
		if (end < 0) { return; }
		requested = true;
		socket.setTimeout(0);
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
server.listen(socketPath, async () => {
	try {
		await removeStaleHelpers();
		const result = gitConfig(['--add', 'credential.helper', helper]);
		if (result.status !== 0) { throw new Error('Could not configure Git credential forwarding'); }
		configured = true;
		process.stdout.write(JSON.stringify({ ready: true }) + '\n');
	} catch {
		console.error('Failed to configure Git credential forwarding');
		process.exit(1);
	}
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
	private readonly _requests = this._register(new DisposableMap<number, IDisposable>());
	private _closed = false;

	constructor(
		private readonly _child: ChildProcessWithoutNullStreams,
		private readonly _readCredential: (input: string, token: CancellationToken) => Promise<string>,
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
					if (this._requests.has(message.id)) {
						throw new Error('Duplicate Git credential forwarding request');
					}
					void this._forward(message.id, message.input);
				} else if (hasKey(message, { canceled: true }) && Number.isSafeInteger(message.canceled) && message.canceled > 0) {
					this._requests.deleteAndDispose(message.canceled);
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
		try {
			if (this._closed || this._requests.size >= 16) {
				throw new Error('Git credential forwarding is unavailable');
			}
			validateGitCredentialInput(input);
			const tokenSource = new CancellationTokenSource();
			this._requests.set(id, toDisposable(() => tokenSource.dispose(true)));
			response = { id, output: await raceCancellationError(this._readCredential(`${input.replace(/\n+$/, '')}\n\n`, tokenSource.token), tokenSource.token) };
		} catch (error) {
			if (!isCancellationError(error)) {
				this._logService.warn('[DevContainerAgentHost] Git credential lookup failed');
			}
			response = { id, error: true };
		} finally {
			this._requests.deleteAndDispose(id);
		}
		if (!this._closed) {
			this._child.stdin.write(`${JSON.stringify(response)}\n`);
		}
	}
}
