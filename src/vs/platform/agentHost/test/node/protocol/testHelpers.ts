/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess, fork } from 'child_process';
import { fileURLToPath } from 'url';
import { WebSocket } from 'ws';
import { URI } from '../../../../../base/common/uri.js';
import { SubscribeResult, type DispatchActionParams } from '../../../common/state/protocol/commands.js';
import { ActionType, type ActionEnvelope } from '../../../common/state/sessionActions.js';
import type { SessionAddedParams } from '../../../common/state/protocol/notifications.js';
import { MessageKind, buildDefaultChatUri, mergeSessionWithDefaultChat, parseDefaultChatUri, type ChatState, type ISessionWithDefaultChat, type SessionState } from '../../../common/state/sessionState.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import { AgentHostCodexAgentEnabledEnvVar } from '../../../common/agentService.js';
import {
	isJsonRpcNotification,
	isJsonRpcResponse,
	type AhpNotification,
	type JsonRpcErrorResponse,
	type JsonRpcSuccessResponse,
	type ProtocolMessage,
} from '../../../common/state/sessionProtocol.js';

// ---- JSON-RPC test client ---------------------------------------------------

interface IPendingCall {
	resolve: (result: unknown) => void;
	reject: (err: Error) => void;
}

export class TestProtocolClient {
	private readonly _ws: WebSocket;
	private _nextId = 1;
	private readonly _pendingCalls = new Map<number, IPendingCall>();
	private readonly _notifications: AhpNotification[] = [];
	private readonly _notifWaiters: { predicate: (n: AhpNotification) => boolean; resolve: (n: AhpNotification) => void; reject: (err: Error) => void; dispose: () => void }[] = [];

	constructor(port: number) {
		this._ws = new WebSocket(`ws://127.0.0.1:${port}`);
	}

	async connect(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this._ws.on('open', () => {
				this._ws.on('message', (data: Buffer | string) => {
					const text = typeof data === 'string' ? data : data.toString('utf-8');
					const msg = JSON.parse(text);
					this._handleMessage(msg);
				});
				resolve();
			});
			this._ws.on('error', reject);
		});
	}

	private _handleMessage(msg: ProtocolMessage): void {
		if (isJsonRpcResponse(msg)) {
			const pending = this._pendingCalls.get(msg.id);
			if (pending) {
				this._pendingCalls.delete(msg.id);
				const errResp = msg as JsonRpcErrorResponse;
				if (errResp.error) {
					pending.reject(new Error(errResp.error.message));
				} else {
					pending.resolve((msg as JsonRpcSuccessResponse).result);
				}
			}
		} else if (isJsonRpcNotification(msg)) {
			const notif = msg;
			this._notifications.push(notif);
			this._flushNotificationWaiters();
		}
	}

	/** Send a JSON-RPC notification (fire-and-forget). */
	notify(method: string, params?: unknown): void {
		this._ws.send(JSON.stringify({ jsonrpc: '2.0', method, params }));
	}

	/**
	 * Dispatch a strongly-typed protocol action (fire-and-forget write-ahead).
	 *
	 * Prefer this over the raw {@link notify} escape hatch: the action payload
	 * is checked against the {@link StateAction} union at compile time, so a
	 * malformed or incomplete action (e.g. an approval missing its required
	 * `confirmed` field) is caught by the type-checker rather than silently
	 * shipped over the wire and reduced into `undefined`.
	 */
	dispatch(params: DispatchActionParams): void {
		this.notify('dispatchAction', params);
	}

	/** Send a JSON-RPC request and await the response. */
	call<T>(method: string, params?: unknown, timeoutMs = 5000): Promise<T> {
		const id = this._nextId++;
		this._ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				this._pendingCalls.delete(id);
				reject(new Error(`Timeout waiting for response to ${method} (id=${id}, ${timeoutMs}ms)`));
			}, timeoutMs);

			this._pendingCalls.set(id, {
				resolve: result => { clearTimeout(timer); resolve(result as T); },
				reject: err => { clearTimeout(timer); reject(err); },
			});
		});
	}

	/** Wait for a server notification matching a predicate. */
	waitForNotification(predicate: (n: AhpNotification) => boolean, timeoutMs = 5000): Promise<AhpNotification> {
		const existing = this._notifications.find(predicate);
		if (existing) {
			return Promise.resolve(existing);
		}

		return new Promise<AhpNotification>((resolve, reject) => {
			const waiter = {
				predicate,
				resolve,
				reject,
				dispose: () => clearTimeout(timer),
			};
			const timer = setTimeout(() => {
				this._removeNotificationWaiter(waiter);
				const received = this._notifications.map(n => {
					const action = n.method === 'action' ? (n.params as ActionEnvelope).action.type : undefined;
					return action ? `${n.method}:${action}` : n.method;
				}).join(', ');
				reject(new Error(`Timeout waiting for notification (${timeoutMs}ms). Received: ${received}`));
			}, timeoutMs);
			this._notifWaiters.push(waiter);
			this._flushNotificationWaiters();
		});
	}

	private _flushNotificationWaiters(): void {
		for (let i = this._notifWaiters.length - 1; i >= 0; i--) {
			const waiter = this._notifWaiters[i];
			const match = this._notifications.find(waiter.predicate);
			if (match) {
				this._notifWaiters.splice(i, 1);
				waiter.dispose();
				waiter.resolve(match);
			}
		}
	}

	private _removeNotificationWaiter(waiter: { predicate: (n: AhpNotification) => boolean; resolve: (n: AhpNotification) => void; reject: (err: Error) => void; dispose: () => void }): void {
		const idx = this._notifWaiters.indexOf(waiter);
		if (idx >= 0) {
			this._notifWaiters.splice(idx, 1);
		}
	}

	/** Return all received notifications matching a predicate. */
	receivedNotifications(predicate?: (n: AhpNotification) => boolean): AhpNotification[] {
		return predicate ? this._notifications.filter(predicate) : [...this._notifications];
	}

	/** Send a raw string over the WebSocket without JSON serialization. */
	sendRaw(data: string): void {
		this._ws.send(data);
	}

	/** Wait for the next raw message from the server. */
	waitForRawMessage(timeoutMs = 5000): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				cleanup();
				reject(new Error(`Timeout waiting for raw message (${timeoutMs}ms)`));
			}, timeoutMs);
			const onMsg = (data: Buffer | string) => {
				cleanup();
				const text = typeof data === 'string' ? data : data.toString('utf-8');
				resolve(JSON.parse(text));
			};
			const cleanup = () => {
				clearTimeout(timer);
				this._ws.removeListener('message', onMsg);
			};
			this._ws.on('message', onMsg);
		});
	}

	close(): void {
		for (const w of this._notifWaiters) {
			w.dispose();
			w.reject(new Error('Client closed'));
		}
		this._notifWaiters.length = 0;
		for (const [, p] of this._pendingCalls) {
			p.reject(new Error('Client closed'));
		}
		this._pendingCalls.clear();
		this._ws.close();
	}

	clearReceived(): void {
		this._notifications.length = 0;
	}
}

// ---- Server process lifecycle -----------------------------------------------

export interface IServerHandle {
	process: ChildProcess;
	port: number;
}

export async function startServer(options?: { readonly quiet?: boolean; readonly userDataDir?: string; readonly env?: NodeJS.ProcessEnv }): Promise<IServerHandle> {
	return new Promise((resolve, reject) => {
		const serverPath = fileURLToPath(new URL('../../../node/agentHostServerMain.js', import.meta.url));
		const args = ['--enable-mock-agent', '--port', '0', '--without-connection-token'];
		if (options?.quiet ?? true) {
			args.push('--quiet');
		}
		if (options?.userDataDir) {
			args.push('--user-data-dir', options.userDataDir);
		}
		const child = fork(serverPath, args, {
			stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
			env: options?.env ? { ...process.env, ...options.env } : process.env,
		});

		const timer = setTimeout(() => {
			child.kill();
			reject(new Error('Server startup timed out'));
		}, 10_000);

		child.stdout!.on('data', (data: Buffer) => {
			const text = data.toString();
			const match = text.match(/READY:(\d+)/);
			if (match) {
				clearTimeout(timer);
				resolve({ process: child, port: parseInt(match[1], 10) });
			}
		});

		child.stderr!.on('data', () => {
			// Intentionally swallowed - the test runner fails if console.error is used.
		});

		child.on('error', err => {
			clearTimeout(timer);
			reject(err);
		});

		child.on('exit', code => {
			clearTimeout(timer);
			reject(new Error(`Server exited prematurely with code ${code}`));
		});
	});
}

/**
 * Start the agent host server with the real Copilot SDK agent (no mock agent).
 * The server is started with logging enabled so the CopilotAgent is registered.
 */
export async function startRealServer(options?: { readonly claudeSdkRoot?: string; readonly codexSdkRoot?: string }): Promise<IServerHandle> {
	return new Promise((resolve, reject) => {
		const serverPath = fileURLToPath(new URL('../../../node/agentHostServerMain.js', import.meta.url));
		const args = ['--port', '0', '--without-connection-token'];
		if (options?.claudeSdkRoot) {
			args.push('--claude-sdk-root', options.claudeSdkRoot);
		}
		if (options?.codexSdkRoot) {
			args.push('--codex-sdk-root', options.codexSdkRoot);
		}
		const child = fork(serverPath, args, {
			stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
			// Codex defaults to disabled; opt it in for the real-SDK suite when a
			// codex SDK root is supplied so the provider actually registers.
			env: options?.codexSdkRoot
				? { ...process.env, [AgentHostCodexAgentEnabledEnvVar]: 'true' }
				: process.env,
		});

		const timer = setTimeout(() => {
			child.kill();
			reject(new Error('Real server startup timed out'));
		}, 30_000);

		child.stdout!.on('data', (data: Buffer) => {
			const text = data.toString();
			const match = text.match(/READY:(\d+)/);
			if (match) {
				clearTimeout(timer);
				resolve({ process: child, port: parseInt(match[1], 10) });
			}
		});

		child.stderr!.on('data', () => {
			// Intentionally swallowed - the test runner fails if console.error is used.
			// Server logs go to the agent host's logger (under
			// `<userDataPath>/logs/<timestamp>/agenthost-server.log`); check
			// there when investigating real-SDK test failures.
		});

		child.on('error', err => {
			clearTimeout(timer);
			reject(err);
		});

		child.on('exit', code => {
			clearTimeout(timer);
			reject(new Error(`Real server exited prematurely with code ${code}`));
		});
	});
}

// ---- Helpers ----------------------------------------------------------------

let sessionCounter = 0;

export function nextSessionUri(): string {
	return URI.from({ scheme: 'mock', path: `/test-session-${++sessionCounter}` }).toString();
}

export function defaultChatChannel(sessionUri: string): string {
	return buildDefaultChatUri(sessionUri);
}

export function isActionNotification(n: AhpNotification, actionType: string): boolean {
	if (n.method !== 'action') {
		return false;
	}
	const envelope = n.params as unknown as ActionEnvelope;
	return envelope.action.type === actionType;
}

export function getActionEnvelope(n: AhpNotification): ActionEnvelope {
	return n.params as unknown as ActionEnvelope;
}

/** Perform handshake, create a session, subscribe, and return its URI. */
export async function createAndSubscribeSession(c: TestProtocolClient, clientId: string, workingDirectory?: string): Promise<string> {
	await c.call('initialize', { channel: 'ahp-root://', protocolVersions: [PROTOCOL_VERSION], clientId });

	await c.call('createSession', { channel: nextSessionUri(), provider: 'mock', workingDirectory });

	const notif = await c.waitForNotification(n =>
		n.method === 'root/sessionAdded'
	);
	const realSessionUri = (notif.params as SessionAddedParams).summary.resource;

	await c.call<SubscribeResult>('subscribe', { channel: realSessionUri });
	// Turns and other conversation contents live on the session's default
	// chat channel in the multi-chat protocol; subscribe to it as well so
	// `chat/*` action notifications (responsePart, turnComplete, …) are
	// delivered to this client.
	await c.call<SubscribeResult>('subscribe', { channel: buildDefaultChatUri(realSessionUri) });
	c.clearReceived();

	return realSessionUri;
}

export function dispatchTurnStarted(c: TestProtocolClient, session: string, turnId: string, text: string, clientSeq: number): void {
	c.dispatch({
		channel: defaultChatChannel(session),
		clientSeq,
		action: {
			type: ActionType.ChatTurnStarted,
			turnId,
			message: { text, origin: { kind: MessageKind.User } },
		},
	});
}

/**
 * Subscribes to a session channel and its default chat channel and returns the
 * merged {@link ISessionWithDefaultChat} view. In the multi-chat protocol the
 * conversation contents (turns, activeTurn, queued/steering messages, input
 * requests) live on the session's default chat channel, so reading them
 * requires merging the session snapshot with its default chat snapshot.
 */
export async function fetchSessionWithChat(c: TestProtocolClient, sessionUri: string): Promise<ISessionWithDefaultChat> {
	const owningSession = parseDefaultChatUri(sessionUri) ?? sessionUri;
	const chatUri = parseDefaultChatUri(sessionUri) ? sessionUri : buildDefaultChatUri(sessionUri);
	const sessionSnap = await c.call<SubscribeResult>('subscribe', { channel: owningSession });
	const chatSnap = await c.call<SubscribeResult>('subscribe', { channel: chatUri });
	return mergeSessionWithDefaultChat(
		sessionSnap.snapshot!.state as SessionState,
		chatSnap.snapshot?.state as ChatState | undefined,
	);
}
