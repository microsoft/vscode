/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess, fork } from 'child_process';
import { createRequire } from 'module';
import { mkdirSync } from 'fs';
import { userInfo } from 'os';
import { fileURLToPath } from 'url';
import { WebSocket } from 'ws';
import { CapiReplayProxy, type CapiReplayMode } from './e2e/harness/capiReplayProxy.js';
import { resolve as resolvePath } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { SubscribeResult, type DispatchActionParams } from '../../common/state/protocol/commands.js';
import { ActionType, type ActionEnvelope } from '../../common/state/sessionActions.js';
import type { SessionAddedParams } from '../../common/state/protocol/notifications.js';
import { MessageKind, buildDefaultChatUri, mergeSessionWithDefaultChat, parseDefaultChatUri, type ChatState, type ISessionWithDefaultChat, type SessionState } from '../../common/state/sessionState.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';
import { AgentHostCodexAgentBinaryArgsEnvVar, AgentHostCodexAgentEnabledEnvVar } from '../../common/agentService.js';
import {
	isJsonRpcNotification,
	isJsonRpcResponse,
	type AhpNotification,
	type JsonRpcNotification,
	type JsonRpcRequest,
	type JsonRpcErrorResponse,
	type JsonRpcSuccessResponse,
	type ProtocolMessage,
} from '../../common/state/sessionProtocol.js';
import { AhpSnapshotRecorder, type IAhpSnapshotNormalization, type IAhpSnapshotOptions } from './e2e/harness/ahpSnapshot.js';

// ---- JSON-RPC test client ---------------------------------------------------

interface IPendingCall {
	resolve: (result: unknown) => void;
	reject: (err: Error) => void;
}

export class TestProtocolClient {
	private readonly _ws: WebSocket;
	private readonly _ahpSnapshot = new AhpSnapshotRecorder();
	private _nextId = 1;
	private readonly _pendingCalls = new Map<number, IPendingCall>();
	private readonly _notifications: AhpNotification[] = [];
	private readonly _notifWaiters: { predicate: (n: AhpNotification) => boolean; resolve: (n: AhpNotification) => void; reject: (err: Error) => void; dispose: () => void }[] = [];

	constructor(
		port: number,
		private readonly _takeReplayError?: () => Error | undefined,
		private readonly _setWorkingDirectory?: (workingDirectory: string) => void,
	) {
		this._ws = new WebSocket(`ws://127.0.0.1:${port}`);
	}

	async connect(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this._ws.on('open', () => {
				this._ws.on('message', (data: Buffer | string) => {
					const text = typeof data === 'string' ? data : data.toString('utf-8');
					const msg = JSON.parse(text) as ProtocolMessage;
					this._ahpSnapshot.record('s2c', msg);
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
		const message: JsonRpcNotification = { jsonrpc: '2.0', method, params };
		this._ahpSnapshot.record('c2s', message);
		this._ws.send(JSON.stringify(message));
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
		const message: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
		this._ahpSnapshot.record('c2s', message);
		this._ws.send(JSON.stringify(message));
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

	clearAhpSnapshot(): void {
		this._ahpSnapshot.clear();
	}

	setAhpSnapshotNormalization(normalization: IAhpSnapshotNormalization): void {
		this._ahpSnapshot.setNormalization(normalization);
	}

	setWorkingDirectory(workingDirectory: string): void {
		this._setWorkingDirectory?.(workingDirectory);
	}

	beginAhpSnapshotRound(): void {
		this._ahpSnapshot.beginRound();
	}

	serializeAhpSnapshot(options?: IAhpSnapshotOptions): string {
		return this._ahpSnapshot.serialize(options);
	}

	takeReplayError(): Error | undefined {
		return this._takeReplayError?.();
	}
}

// ---- Server process lifecycle -----------------------------------------------

export interface IServerHandle {
	process: ChildProcess;
	port: number;
	/** Present when the server was started with a mock LLM; exposes request count for assertions. */
	mockLlm?: IMockLlmServerHandleWithLog;
	/**
	 * Present when the server was started with `capiReplay`. Stop it (ideally in
	 * `suiteTeardown`, before killing the process) to flush recorded exchanges to
	 * the fixture and surface strict-mode cache misses.
	 */
	capiReplay?: CapiReplayProxy;
}

interface IMockLlmServerHandle {
	readonly url: string;
	requestCount(): number;
	getRequests?(): readonly unknown[];
	close(): Promise<void>;
}

interface IMockLlmServerHandleWithLog extends IMockLlmServerHandle {
	logMessages: string[];
}

interface IMockLlmServerModule {
	startServer(port: number, options?: { logger?: (msg: string) => void; verbose?: boolean; captureRequests?: boolean }): Promise<IMockLlmServerHandle>;
	registerScenario(id: string, definition: unknown): void;
}

/** A mock-LLM scenario to register before recording (see `mock-llm-server.ts`). */
export interface IMockScenario {
	readonly id: string;
	readonly definition: unknown;
}

const AGENT_HOST_E2E_COVERAGE = process.env['AGENT_HOST_E2E_COVERAGE'] === '1';

export function getAgentHostE2ETestTimeout(normalTimeoutMs: number, coverageTimeoutMs: number): number {
	return AGENT_HOST_E2E_COVERAGE ? coverageTimeoutMs : normalTimeoutMs;
}

function withAgentHostCoverage(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const childEnvironment = { ...environment };
	if (AGENT_HOST_E2E_COVERAGE) {
		const coveragePath = resolvePath(process.cwd(), '.build', 'agent-host-e2e-coverage', 'raw');
		mkdirSync(coveragePath, { recursive: true });
		childEnvironment.NODE_V8_COVERAGE = coveragePath;
	} else {
		delete childEnvironment.NODE_V8_COVERAGE;
	}
	return childEnvironment;
}

function buildCopilotChatToken(mockUrl: string, copilotPlan: 'free' | 'pro' = 'free'): string {
	return Buffer.from(JSON.stringify({
		token: 'smoketest-fake-token',
		expires_at: Math.floor(Date.now() / 1000) + 3600,
		refresh_in: 1800,
		sku: copilotPlan === 'pro' ? 'individual_subscription_copilot' : 'free_limited_copilot',
		individual: true,
		isNoAuthUser: true,
		copilot_plan: copilotPlan,
		organization_login_list: [],
		endpoints: { api: mockUrl, proxy: mockUrl },
	})).toString('base64');
}

async function startMockLlmServer(scenarios?: readonly IMockScenario[]): Promise<IMockLlmServerHandleWithLog> {
	const mockServerPath = fileURLToPath(new URL('../../../../../../scripts/chat-simulation/common/mock-llm-server.ts', import.meta.url));
	const nodeRequire = createRequire(import.meta.url);
	const mockModule = nodeRequire(mockServerPath) as IMockLlmServerModule;
	mockModule.registerScenario('text-only', {
		type: 'multi-turn',
		turns: [{ kind: 'echo-last-message' }],
	});
	for (const scenario of scenarios ?? []) {
		mockModule.registerScenario(scenario.id, scenario.definition);
	}
	const messages: string[] = [];
	const serverHandle = await mockModule.startServer(0, { logger: msg => messages.push(msg), verbose: true, captureRequests: true });
	return { ...serverHandle, logMessages: messages };
}

export async function startServer(options?: { readonly quiet?: boolean; readonly userDataDir?: string; readonly env?: NodeJS.ProcessEnv; readonly startupTimeoutMs?: number }): Promise<IServerHandle> {
	return new Promise((resolve, reject) => {
		const serverPath = fileURLToPath(new URL('../../node/agentHostServerMain.js', import.meta.url));
		const args = ['--enable-mock-agent', '--port', '0', '--without-connection-token'];
		if (options?.quiet ?? true) {
			args.push('--quiet');
		}
		if (options?.userDataDir) {
			args.push('--user-data-dir', options.userDataDir);
		}
		const child = fork(serverPath, args, {
			stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
			env: withAgentHostCoverage({ ...process.env, ...options?.env }),
		});

		const timer = setTimeout(() => {
			child.kill();
			reject(new Error('Server startup timed out'));
		}, options?.startupTimeoutMs ?? getAgentHostE2ETestTimeout(10_000, 45_000));

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
 * Start the agent host server with the Copilot SDK agent with either a real or mocked LLM.
 * The server is started with logging enabled so the CopilotAgent is registered.
 */
export async function startRealServer(options?: { readonly claudeSdkRoot?: string; readonly codexSdkRoot?: string; readonly mockLlm?: boolean; readonly homeDir?: string; readonly userDataDir?: string; readonly env?: NodeJS.ProcessEnv; readonly capiReplay?: { readonly fixturePath: string; readonly mode?: CapiReplayMode; readonly workDir?: string; readonly real?: boolean }; readonly mockScenarios?: readonly IMockScenario[] }): Promise<IServerHandle> {
	// `capiReplay` records/replays in front of the mock LLM server, so it implies
	// a mock upstream even when `mockLlm` was not explicitly requested — unless
	// `real` is set, in which case the proxy forwards to real CAPI/GitHub.
	const realCapture = options?.capiReplay?.real === true;
	const mockLlmServer = (options?.mockLlm || (options?.capiReplay && !realCapture)) ? await startMockLlmServer(options?.mockScenarios) : undefined;
	let capiReplayProxy: CapiReplayProxy | undefined;
	if (options?.capiReplay) {
		capiReplayProxy = new CapiReplayProxy(realCapture ? {
			fixturePath: options.capiReplay.fixturePath,
			mode: options.capiReplay.mode,
			workDir: options.capiReplay.workDir,
			homeDir: options.homeDir,
			userName: userInfo().username,
			// Real hosts (consumer defaults); override for Enterprise/Business accounts.
			githubUpstreamUrl: process.env['AGENT_HOST_RECORD_GITHUB_URL'] || 'https://api.github.com',
			capiUpstreamUrl: process.env['AGENT_HOST_RECORD_CAPI_URL'] || 'https://api.githubcopilot.com',
		} : {
			fixturePath: options.capiReplay.fixturePath,
			mode: options.capiReplay.mode,
			workDir: options.capiReplay.workDir,
			homeDir: options.homeDir,
			userName: userInfo().username,
			upstreamUrl: mockLlmServer!.url,
		});
		await capiReplayProxy.start();
	}
	// The agent host talks to the proxy (when replaying) or directly to the mock.
	const capiUrl = capiReplayProxy?.url ?? mockLlmServer?.url;
	return new Promise((resolve, reject) => {
		const serverPath = fileURLToPath(new URL('../../node/agentHostServerMain.js', import.meta.url));
		const args = ['--port', '0', '--without-connection-token'];
		if (options?.claudeSdkRoot) {
			args.push('--claude-sdk-root', options.claudeSdkRoot);
		}
		if (options?.codexSdkRoot) {
			args.push('--codex-sdk-root', options.codexSdkRoot);
		}
		if (options?.userDataDir) {
			args.push('--user-data-dir', options.userDataDir);
		}
		const childEnv = withAgentHostCoverage({
			...process.env,
			...(options?.env ?? {}),
			...(options?.homeDir ? {
				HOME: options.homeDir,
				USERPROFILE: options.homeDir,
			} : {}),
			// Codex defaults to disabled; opt it in for the agent host e2e suite when a
			// codex SDK root is supplied so the provider actually registers.
			...(options?.codexSdkRoot ? { [AgentHostCodexAgentEnabledEnvVar]: 'true' } : {}),
			// Fixtures use Codex's unified exec tool, so keep record and replay on the same shell protocol.
			...(options?.codexSdkRoot && options.capiReplay ? { [AgentHostCodexAgentBinaryArgsEnvVar]: JSON.stringify(['-c', 'features.unified_exec=true']) } : {}),
			...(realCapture ? {
				// Real-CAPI capture/replay: route all CAPI + GitHub-API traffic through
				// the proxy. The real GitHub token flows via the `authenticate`
				// protocol call (record) or a placeholder (replay), not via env.
				COPILOT_API_URL: capiUrl,
				COPILOT_DEBUG_GITHUB_API_URL: capiUrl,
				VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE: capiUrl,
			} : mockLlmServer ? {
				GITHUB_PAT: 'smoketest-fake-pat',
				IS_SCENARIO_AUTOMATION: '1',
				// Agent host e2e Copilot tests run against responses-capable models
				// (e.g. gpt-5.3-codex) that are "pro"-gated in the mock /models
				// fixture, so mint a pro-plan token for this harness.
				VSCODE_COPILOT_CHAT_TOKEN: buildCopilotChatToken(capiUrl!, 'pro'),
				// Route the Copilot SDK's GitHub API calls (token refresh, model
				// discovery, etc.) at the mock/proxy instead of api.github.com,
				// which would 401 with the fake token.
				COPILOT_DEBUG_GITHUB_API_URL: capiUrl,
				COPILOT_API_URL: capiUrl,
				GITHUB_COPILOT_API_TOKEN: 'smoketest-fake-agent-host-token',
				// Route the agent host's shared CAPI client (used by the Codex /
				// agent-host harnesses for model discovery + requests) at the
				// mock/proxy instead of api.github.com, which would 401 with the
				// fake token.
				VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE: capiUrl,
			} : {}),
		});
		let child: ChildProcess;
		try {
			child = fork(serverPath, args, {
				stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
				env: childEnv,
			});
		} catch (err) {
			void mockLlmServer?.close();
			void capiReplayProxy?.stop().catch(() => undefined);
			throw err;
		}
		let mockClosed = false;
		const closeMockServer = async (): Promise<void> => {
			if (mockClosed || !mockLlmServer) {
				return;
			}
			mockClosed = true;
			// Flush any recording before closing the upstream. Swallow strict
			// cache-miss errors here — tests that want them call `capiReplay.stop()`
			// explicitly in teardown.
			await capiReplayProxy?.stop().catch(() => undefined);
			try {
				await mockLlmServer.close();
			} catch {
				// best effort
			}
		};
		child.on('exit', () => {
			void closeMockServer();
		});

		const timer = setTimeout(() => {
			child.kill();
			void closeMockServer();
			reject(new Error('Real server startup timed out'));
		}, 30_000);

		child.stdout!.on('data', (data: Buffer) => {
			const text = data.toString();
			const match = text.match(/READY:(\d+)/);
			if (match) {
				clearTimeout(timer);
				resolve({ process: child, port: parseInt(match[1], 10), mockLlm: mockLlmServer, capiReplay: capiReplayProxy });
			}
		});

		child.stderr!.on('data', () => {
			// Intentionally swallowed - the test runner fails if console.error is used.
			// Server logs go to the agent host's logger (under
			// `<userDataPath>/logs/<timestamp>/agenthost-server.log`); check
			// there when investigating agent host e2e test failures.
		});

		child.on('error', err => {
			clearTimeout(timer);
			void closeMockServer();
			reject(err);
		});

		child.on('exit', code => {
			clearTimeout(timer);
			void closeMockServer();
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
			startedAt: '2025-01-01T00:00:00.000Z',
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
