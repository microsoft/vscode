/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import type { WebSocket, WebSocketServer } from 'ws';
import type { AddressInfo } from 'net';
import type { IncomingMessage } from 'http';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { generateUuid, isUUID } from '../../../base/common/uuid.js';
import { isAbsolute } from '../../../base/common/path.js';
import { INativeCliLifecycleEvent, INativeCliLifecycleLaunch, NativeCliActivity, sanitizeNativeCliTitle } from '../common/nativeCliLifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { DeferredPromise, RunOnceScheduler } from '../../../base/common/async.js';
import { CancellationError } from '../../../base/common/errors.js';

interface IRpcMessage {
	readonly id?: number | string;
	readonly method?: string;
	readonly params?: {
		readonly threadId?: string;
		readonly ephemeral?: boolean;
		readonly name?: string;
		readonly threadName?: string;
		readonly status?: IThreadStatus;
		readonly turn?: { readonly status?: string };
		readonly willRetry?: boolean;
		readonly input?: readonly { readonly type?: string; readonly text?: string }[];
	};
	readonly result?: { readonly thread?: IThread };
	readonly error?: { readonly code?: number; readonly message?: string };
}

/** Validates the one boundary that reads untrusted JSON straight off a stream. */
function isRpcMessage(value: unknown): value is IRpcMessage {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const message = value as IRpcMessage;
	return (message.id === undefined || typeof message.id === 'number' || typeof message.id === 'string')
		&& (message.method === undefined || typeof message.method === 'string')
		&& (message.params === undefined || typeof message.params === 'object' && message.params !== null)
		&& (message.result === undefined || typeof message.result === 'object' && message.result !== null)
		&& (message.error === undefined || typeof message.error === 'object' && message.error !== null);
}

interface IThreadStatus {
	readonly type?: string;
	readonly activeFlags?: readonly string[];
}

interface IThread {
	readonly id: string;
	readonly cwd: string;
	readonly name?: string | null;
	readonly preview?: string;
	readonly status?: IThreadStatus;
}

export function getNativeCodexBackendArguments(args: readonly string[]): string[] {
	const options = args[0] === 'resume' ? args.slice(args[1] && !args[1].startsWith('-') ? 2 : 1) : args;
	const result = ['app-server'];
	for (let i = 0; i < options.length; i += 2) {
		const flag = options[i];
		const value = options[i + 1];
		if (value === undefined || !['--model', '-c', '--config'].includes(flag)) {
			throw new Error(`Unsupported Codex backend option: ${flag}`);
		}
		result.push('-c', flag === '--model' ? `model=${JSON.stringify(value)}` : value);
	}
	return result;
}

/** Observes only the owned TUI connection, not broadcasts from other Codex clients. */
export class NativeCodexLifecycleTracker {
	private readonly _requests = new Map<number | string, string>();
	private readonly _turnRequests = new Map<number | string, string>();
	private _thread: IThread | undefined;

	constructor(private readonly _onEvent: (event: INativeCliLifecycleEvent) => void) { }

	forgetRequest(id: number | string): void {
		this._requests.delete(id);
		this._turnRequests.delete(id);
	}

	request(message: IRpcMessage): void {
		const method = message.method;
		if (message.id !== undefined && method && ['thread/start', 'thread/resume', 'thread/fork'].includes(method) && message.params?.ephemeral !== true) {
			this._requests.set(message.id, method);
		}
		if (method === 'turn/start' && this._thread && message.params?.threadId === this._thread.id) {
			if (message.id !== undefined) {
				this._turnRequests.set(message.id, this._thread.id);
			}
			const title = message.params.input?.filter(input => input.type === 'text').map(input => input.text ?? '').join(' ');
			this._emit('prompt', 'working', title);
		}
	}

	response(message: IRpcMessage): void {
		// Server-originated requests carry both a `method` and an id drawn from the
		// server's own id space, which overlaps the router's. Correlating those would
		// delete live turn state, so only true responses reach the request maps.
		if (message.method === undefined) {
			const turnThread = message.id !== undefined ? this._turnRequests.get(message.id) : undefined;
			if (turnThread && message.id !== undefined) {
				this._turnRequests.delete(message.id);
				if (message.error && turnThread === this._thread?.id) {
					this._emit('activity', 'error');
				}
				return;
			}
			const request = message.id !== undefined ? this._requests.get(message.id) : undefined;
			if (request && message.id !== undefined) {
				this._requests.delete(message.id);
				const thread = message.result?.thread;
				// `cwd` must be absolute: the shared validator rejects anything else, and a
				// single bad thread would invalidate every later event for this session.
				if (thread && typeof thread.id === 'string' && isUUID(thread.id) && typeof thread.cwd === 'string' && isAbsolute(thread.cwd)) {
					const source = !this._thread ? 'startup' : request === 'thread/resume' ? 'resume' : request === 'thread/fork' ? 'fork' : 'new';
					this._thread = thread;
					this._emit('start', this._activity(thread.status), thread.name ?? thread.preview, source);
				}
			}
			return;
		}
		if (!this._thread || message.params?.threadId !== this._thread.id) {
			return;
		}
		switch (message.method) {
			case 'thread/status/changed':
				this._emit('activity', this._activity(message.params.status));
				break;
			case 'thread/name/updated':
				this._emit('title', undefined, message.params.threadName ?? message.params.name);
				break;
			case 'turn/started':
				this._emit('activity', 'working');
				break;
			case 'turn/completed':
				this._emit('activity', message.params.turn?.status === 'failed' ? 'error' : 'idle');
				break;
			case 'error':
				if (!message.params.willRetry) {
					this._emit('activity', 'error');
				}
				break;
		}
	}

	private _activity(status: IThreadStatus | undefined): NativeCliActivity {
		if (status?.type === 'systemError') {
			return 'error';
		}
		if (status?.type === 'active') {
			return status.activeFlags?.some(flag => flag === 'waitingOnApproval' || flag === 'waitingOnUserInput') ? 'input' : 'working';
		}
		return 'idle';
	}

	private _emit(event: INativeCliLifecycleEvent['event'], activity?: NativeCliActivity, title?: string | null, source?: string): void {
		if (this._thread) {
			this._onEvent({
				event, sessionId: this._thread.id, cwd: this._thread.cwd, timestamp: Date.now(),
				...(activity ? { activity } : {}),
				...(source ? { source } : {}),
				...(title ? { title: sanitizeNativeCliTitle(title) } : {}),
			});
		}
	}
}

/** The native resume picker opens an auxiliary client; all clients share the owned stdio backend. */
export class NativeCodexConnectionRouter {
	private readonly _clients = new Set<number>();
	private readonly _pending = new Map<number, { clientId: number; message: IRpcMessage }>();
	private readonly _serverRequests = new Map<number | string, number>();
	private readonly _threadOwners = new Map<string, number>();
	private readonly _initializers: { clientId: number; id: number | string }[] = [];
	private _initializeResponse: IRpcMessage | undefined;
	private _initializing = false;
	private _initializedNotification = false;
	private _nextId = 0;
	private _activeClient: number | undefined;

	constructor(
		private readonly _tracker: NativeCodexLifecycleTracker,
		private readonly _sendToServer: (message: IRpcMessage) => void,
		private readonly _sendToClient: (clientId: number, message: IRpcMessage) => void,
	) { }

	addClient(clientId: number): void {
		this._clients.add(clientId);
		this._activeClient ??= clientId;
	}

	removeClient(clientId: number): void {
		this._clients.delete(clientId);
		if (this._activeClient === clientId) {
			this._activeClient = undefined;
		}
		for (const [id, pending] of this._pending) {
			if (pending.clientId === clientId && pending.message.method !== 'initialize') {
				this._pending.delete(id);
				this._tracker.forgetRequest(id);
			}
		}
		for (const [id, owner] of this._serverRequests) {
			if (owner === clientId) {
				this._serverRequests.delete(id);
				this._sendToServer({ id, error: { code: -32000, message: 'Native CLI connection closed' } });
			}
		}
		for (const [thread, owner] of this._threadOwners) {
			if (owner === clientId) {
				this._threadOwners.delete(thread);
			}
		}
	}

	request(clientId: number, message: IRpcMessage): void {
		if (message.method === 'initialize' && message.id !== undefined) {
			if (this._initializeResponse) {
				this._sendToClient(clientId, { ...this._initializeResponse, id: message.id });
				return;
			}
			this._initializers.push({ clientId, id: message.id });
			if (this._initializing) {
				return;
			}
			this._initializing = true;
		}
		if (message.method === 'initialized') {
			if (this._initializedNotification) {
				return;
			}
			this._initializedNotification = true;
		}
		if (message.method && message.id !== undefined) {
			const id = ++this._nextId;
			this._pending.set(id, { clientId, message });
			const request = { ...message, id };
			this._tracker.request(request);
			if (message.method === 'turn/start' && message.params?.threadId) {
				this._threadOwners.set(message.params.threadId, clientId);
				this._activeClient = clientId;
			}
			this._sendToServer(request);
		} else {
			if (!message.method && message.id !== undefined) {
				if (this._serverRequests.get(message.id) !== clientId) {
					throw new Error('Unexpected native Codex client response');
				}
				this._serverRequests.delete(message.id);
			}
			this._sendToServer(message);
		}
	}

	response(message: IRpcMessage): void {
		if (message.method) {
			this._tracker.response(message);
			if (message.id !== undefined) {
				const owner = message.params?.threadId ? this._threadOwners.get(message.params.threadId) : undefined;
				const clientId = owner ?? this._activeClient;
				if (clientId === undefined || !this._clients.has(clientId)) {
					this._sendToServer({ id: message.id, error: { code: -32000, message: 'Native CLI is not connected' } });
					return;
				}
				this._serverRequests.set(message.id, clientId);
				this._sendToClient(clientId, message);
			} else {
				for (const clientId of this._clients) {
					this._sendToClient(clientId, message);
				}
			}
			return;
		}
		const pending = typeof message.id === 'number' ? this._pending.get(message.id) : undefined;
		if (!pending || typeof message.id !== 'number') {
			return;
		}
		this._pending.delete(message.id);
		if (pending.message.method === 'initialize') {
			this._initializeResponse = message;
			for (const initializer of this._initializers.splice(0)) {
				if (this._clients.has(initializer.clientId)) {
					this._sendToClient(initializer.clientId, { ...message, id: initializer.id });
				}
			}
			return;
		}
		this._tracker.response(message);
		const thread = message.result?.thread;
		if (thread && pending.message.params?.ephemeral !== true && ['thread/start', 'thread/resume', 'thread/fork'].includes(pending.message.method ?? '')) {
			this._activeClient = pending.clientId;
			this._threadOwners.set(thread.id, pending.clientId);
		}
		this._sendToClient(pending.clientId, { ...message, id: pending.message.id });
	}
}

export class NativeCodexLifecycleBridge extends Disposable {
	private _server: WebSocketServer | undefined;
	private readonly _sockets = new Map<number, WebSocket>();
	private _nextClientId = 0;
	private readonly _tracker: NativeCodexLifecycleTracker;
	private _closed = false;

	constructor(
		onEvent: (event: INativeCliLifecycleEvent) => void,
		private readonly _onClose: () => void,
		private readonly _logService: ILogService,
	) {
		super();
		this._tracker = new NativeCodexLifecycleTracker(onEvent);
	}

	async start(launch: INativeCliLifecycleLaunch): Promise<{ args: readonly string[]; env: Readonly<Record<string, string>> }> {
		const { WebSocketServer } = await import('ws');
		const token = `${generateUuid()}${generateUuid()}`;
		const server = this._server = new WebSocketServer({
			host: '127.0.0.1', port: 0, maxPayload: 32 * 1024 * 1024,
			verifyClient: (info: { req: IncomingMessage }) => info.req.headers.authorization === `Bearer ${token}`,
		});
		const listening = new DeferredPromise<void>();
		server.once('listening', () => listening.complete());
		// `on`, not `once`: a later server error would otherwise reach an emitter with no
		// listener and throw as an uncaught exception in the agent host.
		server.on('error', error => {
			if (!listening.isSettled) {
				void listening.error(error);
			} else {
				this._logService.error('Native Codex lifecycle bridge failed', error);
				this.dispose();
			}
		});
		this._register(toDisposable(() => server.close()));
		await listening.p;
		if (this._closed) {
			throw new CancellationError();
		}
		const environment = Object.fromEntries(Object.entries(launch.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
		const process = spawn(launch.executable, getNativeCodexBackendArguments(launch.args), { cwd: launch.cwd, env: environment, windowsHide: true, stdio: 'pipe' });
		this._register(toDisposable(() => {
			process.stdin.destroy();
			process.stdout.destroy();
			process.stderr.destroy();
			process.kill();
		}));
		const spawned = new DeferredPromise<void>();
		process.once('spawn', () => spawned.complete());
		process.on('error', error => {
			void spawned.error(error);
			this._logService.error('Native Codex app-server failed', error);
			this.dispose();
		});
		process.stdin.on('error', error => {
			if (!this._closed) {
				this._logService.warn('Native Codex app-server input closed', error);
				this.dispose();
			}
		});
		let stderr = '';
		process.stderr.setEncoding('utf8');
		process.stderr.on('data', (chunk: string) => stderr = `${stderr}${chunk}`.slice(-4096));
		process.on('exit', code => {
			if (!this._closed && code !== 0) {
				this._logService.warn(`Native Codex app-server exited (${code}): ${stderr}`);
			}
			this.dispose();
		});
		const router = new NativeCodexConnectionRouter(
			this._tracker,
			message => process.stdin.write(`${JSON.stringify(message)}\n`),
			(clientId, message) => {
				const socket = this._sockets.get(clientId);
				if (socket?.readyState === 1) {
					socket.send(JSON.stringify(message));
				}
			},
		);
		let pending = '';
		process.stdout.setEncoding('utf8');
		process.stdout.on('data', (chunk: string) => {
			pending += chunk;
			if (pending.length > 32 * 1024 * 1024) {
				this._logService.error('Native Codex app-server message exceeded its limit');
				this.dispose();
				return;
			}
			let newline: number;
			while ((newline = pending.indexOf('\n')) >= 0) {
				const line = pending.slice(0, newline);
				pending = pending.slice(newline + 1);
				if (line) {
					let message: unknown;
					try {
						message = JSON.parse(line);
					} catch (error) {
						// Framing corruption: the stream can no longer be trusted.
						this._logService.error('Invalid native Codex app-server response', error);
						this.dispose();
						return;
					}
					if (!isRpcMessage(message)) {
						this._logService.warn('Ignoring a malformed native Codex app-server message');
						continue;
					}
					try {
						router.response(message);
					} catch (error) {
						this._logService.error('Could not route a native Codex app-server response', error);
					}
				}
			}
		});
		const connectionTimeout = setTimeout(() => {
			if (!this._sockets.size) {
				this.dispose();
			}
		}, 60_000);
		this._register(toDisposable(() => clearTimeout(connectionTimeout)));
		const disconnect = this._register(new RunOnceScheduler(() => this.dispose(), 5000));
		server.on('connection', socket => {
			if (this._closed) {
				socket.close(1008, 'This terminal has closed');
				return;
			}
			clearTimeout(connectionTimeout);
			disconnect.cancel();
			const clientId = ++this._nextClientId;
			this._sockets.set(clientId, socket);
			router.addClient(clientId);
			socket.on('message', data => {
				const line = data.toString();
				let message: unknown;
				try {
					message = JSON.parse(line);
				} catch (error) {
					this._logService.warn('Invalid native Codex terminal request', error);
					socket.close(1008, 'Malformed request');
					return;
				}
				if (!isRpcMessage(message)) {
					this._logService.warn('Ignoring a malformed native Codex terminal request');
					return;
				}
				try {
					router.request(clientId, message);
				} catch (error) {
					// A protocol fault belongs to this client, not to the whole session.
					this._logService.warn('Could not route a native Codex terminal request', error);
					socket.close(1008, 'Unexpected request');
				}
			});
			socket.on('error', error => this._logService.warn('Native Codex terminal connection failed', error));
			socket.once('close', () => {
				this._sockets.delete(clientId);
				if (!this._closed) {
					router.removeClient(clientId);
					if (!this._sockets.size) {
						disconnect.schedule();
					}
				}
			});
		});
		await spawned.p;
		if (this._closed) {
			throw new CancellationError();
		}
		return {
			args: ['--remote', `ws://127.0.0.1:${(server.address() as AddressInfo).port}`, '--remote-auth-token-env', 'VSCODE_NATIVE_CLI_CONNECTION', ...launch.args],
			env: { VSCODE_NATIVE_CLI_CONNECTION: token },
		};
	}

	override dispose(): void {
		if (this._closed) {
			return;
		}
		this._closed = true;
		for (const socket of this._sockets.values()) {
			socket.close();
		}
		this._sockets.clear();
		this._server?.close();
		super.dispose();
		this._onClose();
	}
}
