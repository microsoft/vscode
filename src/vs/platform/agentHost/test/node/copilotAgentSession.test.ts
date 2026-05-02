/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotSession, SessionEvent, SessionEventPayload, SessionEventType, Tool, ToolResultObject, TypedSessionEventHandler } from '@github/copilot-sdk';
import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { join, sep } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IFileService } from '../../../files/common/files.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { AgentSession, type AgentSignal, type IAgentActionSignal, type IAgentToolPendingConfirmationSignal } from '../../common/agentService.js';
import { IDiffComputeService } from '../../common/diffComputeService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { ActionType, type SessionDeltaAction, type SessionErrorAction, type SessionInputRequestedAction, type SessionResponsePartAction, type SessionToolCallCompleteAction, type SessionToolCallReadyAction, type SessionToolCallStartAction } from '../../common/state/sessionActions.js';
import { AttachmentType, ResponsePartKind, SessionInputAnswerState, SessionInputAnswerValueKind, SessionInputQuestionKind, SessionInputResponseKind, ToolResultContentType } from '../../common/state/sessionState.js';
import { CopilotAgentSession, IActiveClientSnapshot, SessionWrapperFactory } from '../../node/copilot/copilotAgentSession.js';
import { CopilotSessionWrapper } from '../../node/copilot/copilotSessionWrapper.js';
import { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { createSessionDataService, createZeroDiffComputeService } from '../common/sessionTestHelpers.js';

// ---- Mock CopilotSession (SDK level) ----------------------------------------

/**
 * Minimal mock of the SDK's {@link CopilotSession}. Implements `on()` to
 * store typed handlers, and exposes `fire()` so tests can push events
 * through the real {@link CopilotSessionWrapper} event pipeline.
 */
class MockCopilotSession {
	readonly sessionId = 'test-session-1';
	readonly sendRequests: unknown[] = [];
	readonly modeSetCalls: Array<{ mode: 'interactive' | 'plan' | 'autopilot' }> = [];

	private readonly _handlers = new Map<string, Set<(event: SessionEvent) => void>>();
	planReadResult: { exists: boolean; content: string | null; path: string | null } = { exists: false, content: null, path: null };

	on<K extends SessionEventType>(eventType: K, handler: TypedSessionEventHandler<K>): () => void {
		let set = this._handlers.get(eventType);
		if (!set) {
			set = new Set();
			this._handlers.set(eventType, set);
		}
		set.add(handler as (event: SessionEvent) => void);
		return () => { set.delete(handler as (event: SessionEvent) => void); };
	}

	/** Push an event through to all registered handlers of the given type. */
	fire<K extends SessionEventType>(type: K, data: SessionEventPayload<K>['data']): void {
		const event = { type, data, id: 'evt-1', timestamp: new Date().toISOString(), parentId: null } as SessionEventPayload<K>;
		const set = this._handlers.get(type);
		if (set) {
			for (const handler of set) {
				handler(event);
			}
		}
	}

	// Stubs for methods the wrapper / session class calls
	async send(request: unknown) { this.sendRequests.push(request); return ''; }
	async abort() { }
	async setModel() { }
	async getMessages() { return []; }
	async destroy() { }

	readonly rpc = {
		mode: {
			get: async () => ({ mode: 'interactive' as const }),
			set: async (params: { mode: 'interactive' | 'plan' | 'autopilot' }) => {
				this.modeSetCalls.push({ mode: params.mode });
			},
		},
		plan: {
			read: async () => this.planReadResult,
			update: async (_params: { content: string }) => { /* no-op */ },
			delete: async () => { /* no-op */ },
		},
	};
}

class CapturingLogService extends NullLogService {
	readonly errors: Array<{ first: string | Error; args: unknown[] }> = [];

	override error(message: string | Error, ...args: unknown[]): void {
		this.errors.push({ first: message, args });
		super.error(message, ...args);
	}
}

// ---- Helpers ----------------------------------------------------------------

/**
 * Invokes a client-SDK tool's handler with the minimal fields the SDK
 * contract requires, and narrows the `unknown` return type to
 * {@link ToolResultObject} — which is what {@link CopilotAgentSession}'s
 * handler implementation actually returns.
 */
function invokeClientToolHandler(tool: Pick<Tool, 'name' | 'handler'>, toolCallId: string, args: Record<string, unknown> = {}): Promise<ToolResultObject> {
	return Promise.resolve(tool.handler(args, {
		sessionId: 'test-session-1',
		toolCallId,
		toolName: tool.name,
		arguments: args,
	})) as Promise<ToolResultObject>;
}

type ISessionInternalsForTest = {
	_onDidSessionProgress: { fire(event: AgentSignal): void };
	_editTracker: {
		trackEditStart(path: string): Promise<void>;
		completeEdit(path: string): Promise<void>;
	};
	_pendingClientToolCalls: {
		get(toolCallId: string): DeferredPromise<ToolResultObject> | undefined;
		set(toolCallId: string, value: DeferredPromise<ToolResultObject>): Map<string, DeferredPromise<ToolResultObject>>;
		delete(toolCallId: string): boolean;
	};
};

function isAction(s: AgentSignal, type: ActionType): s is IAgentActionSignal {
	return s.kind === 'action' && s.action.type === type;
}

function getInputRequest(signal: AgentSignal): SessionInputRequestedAction['request'] {
	assert.strictEqual(signal.kind, 'action');
	if (signal.kind !== 'action') { throw new Error('unreachable'); }
	assert.strictEqual(signal.action.type, ActionType.SessionInputRequested);
	return (signal.action as SessionInputRequestedAction).request;
}

async function createAgentSession(disposables: DisposableStore, options?: {
	clientSnapshot?: IActiveClientSnapshot;
	environmentServiceRegistration?: 'native' | 'none';
	logService?: ILogService;
	captureWrapperCallbacks?: { current?: Parameters<SessionWrapperFactory>[0] };
	workingDirectory?: URI;
	/** Per-key effective config values returned by the fake configuration service. */
	configValues?: Record<string, unknown>;
}): Promise<{
	session: CopilotAgentSession;
	mockSession: MockCopilotSession;
	signals: AgentSignal[];
	waitForSignal: (predicate: (signal: AgentSignal) => boolean) => Promise<AgentSignal>;
	sessionConfigUpdates: ReadonlyArray<{ session: string; patch: Record<string, unknown> }>;
}> {
	const progressEmitter = disposables.add(new Emitter<AgentSignal>());
	const signals: AgentSignal[] = [];
	const waiters: { predicate: (signal: AgentSignal) => boolean; deferred: DeferredPromise<AgentSignal> }[] = [];

	disposables.add(progressEmitter.event(signal => {
		signals.push(signal);
		for (let i = waiters.length - 1; i >= 0; i--) {
			if (waiters[i].predicate(signal)) {
				const { deferred } = waiters[i];
				waiters.splice(i, 1);
				deferred.complete(signal);
			}
		}
	}));

	const waitForSignal = (predicate: (signal: AgentSignal) => boolean): Promise<AgentSignal> => {
		const existing = signals.find(predicate);
		if (existing) {
			return Promise.resolve(existing);
		}
		const deferred = new DeferredPromise<AgentSignal>();
		waiters.push({ predicate, deferred });
		return deferred.p;
	};

	const sessionUri = AgentSession.uri('copilot', 'test-session-1');
	const mockSession = new MockCopilotSession();

	const factory: SessionWrapperFactory = async callbacks => {
		if (options?.captureWrapperCallbacks) {
			options.captureWrapperCallbacks.current = callbacks;
		}
		return new CopilotSessionWrapper(mockSession as unknown as CopilotSession);
	};

	const services = new ServiceCollection();
	services.set(ILogService, options?.logService ?? new NullLogService());
	services.set(IFileService, { _serviceBrand: undefined } as IFileService);
	services.set(ISessionDataService, createSessionDataService());
	services.set(IDiffComputeService, createZeroDiffComputeService());
	const sessionConfigUpdates: Array<{ session: string; patch: Record<string, unknown> }> = [];
	const configValues = options?.configValues ?? {};
	const fakeConfigurationService: IAgentConfigurationService = {
		_serviceBrand: undefined,
		onDidRootConfigChange: new Emitter<void>().event,
		// Simple per-key map suffices for tests; the real service walks
		// session → parent → host and validates against the schema, but
		// neither matters here — we just need to surface a value the
		// session class will read.
		getEffectiveValue: ((_session: string, _schema: unknown, key: string) => configValues[key]) as IAgentConfigurationService['getEffectiveValue'],
		getEffectiveWorkingDirectory: () => undefined,
		getSessionConfigValues: () => undefined,
		updateSessionConfig: (session, patch) => { sessionConfigUpdates.push({ session, patch }); },
		getRootValue: () => undefined,
		updateRootConfig: () => { /* no-op */ },
		persistRootConfig: () => { /* no-op */ },
	};
	services.set(IAgentConfigurationService, fakeConfigurationService);
	const environmentService = {
		_serviceBrand: undefined,
		userHome: URI.file('/mock-home'),
		tmpDir: URI.file('/mock-tmp'),
	} as INativeEnvironmentService;
	if (options?.environmentServiceRegistration !== 'none') {
		services.set(INativeEnvironmentService, environmentService);
	}
	const instantiationService = disposables.add(new InstantiationService(services));

	const session = disposables.add(instantiationService.createInstance(
		CopilotAgentSession,
		{
			sessionUri,
			rawSessionId: 'test-session-1',
			onDidSessionProgress: progressEmitter,
			wrapperFactory: factory,
			shellManager: undefined,
			clientSnapshot: options?.clientSnapshot,
			workingDirectory: options?.workingDirectory,
		},
	));

	await session.initializeSession();

	return { session, mockSession, signals, waitForSignal, sessionConfigUpdates };
}

// ---- Tests ------------------------------------------------------------------

suite('CopilotAgentSession', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps internal attachment URIs to Copilot SDK path fields', async () => {
		const { session, mockSession } = await createAgentSession(disposables);
		const fileUri = URI.file('/workspace/file.ts');
		const selectionUri = URI.file('/workspace/selection.ts');

		await session.send('hello', [
			{ type: AttachmentType.File, uri: fileUri, displayName: 'file.ts' },
			{ type: AttachmentType.Selection, uri: selectionUri, displayName: 'selection.ts' },
		]);

		assert.deepStrictEqual(mockSession.sendRequests, [{
			prompt: 'hello',
			attachments: [
				{ type: 'file', path: fileUri.fsPath, displayName: 'file.ts' },
				{ type: 'selection', filePath: selectionUri.fsPath, displayName: 'selection.ts', text: undefined, selection: undefined },
			],
		}]);
	});

	// ---- permission handling ----

	suite('permission handling', () => {

		test('read permission fires tool_ready (deferred to side effects)', async () => {
			const { session, signals, waitForSignal } = await createAgentSession(disposables);
			const resultPromise = session.handlePermissionRequest({
				kind: 'read',
				path: '/workspace/src/file.ts',
				toolCallId: 'tc-1',
			});

			await waitForSignal(s => s.kind === 'pending_confirmation');
			assert.strictEqual(signals.length, 1);

			assert.ok(session.respondToPermissionRequest('tc-1', true));
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'approve-once');
		});

		test('auto-approves read permission for session-state plan files', async () => {
			const previousXdgStateHome = process.env['XDG_STATE_HOME'];
			process.env['XDG_STATE_HOME'] = '/mock-state-home';
			try {
				const { session, signals } = await createAgentSession(disposables);
				const result = await session.handlePermissionRequest({
					kind: 'read',
					path: join('/mock-state-home', '.copilot', 'session-state', 'test-session-1', 'plan.md'),
					toolCallId: 'tc-read-plan',
				});

				assert.strictEqual(result.kind, 'approve-once');
				assert.strictEqual(signals.length, 0);
			} finally {
				if (previousXdgStateHome === undefined) {
					delete process.env['XDG_STATE_HOME'];
				} else {
					process.env['XDG_STATE_HOME'] = previousXdgStateHome;
				}
			}
		});

		test('resolves native environment through INativeEnvironmentService registration', async () => {
			const previousXdgStateHome = process.env['XDG_STATE_HOME'];
			delete process.env['XDG_STATE_HOME'];
			try {
				const { session, signals } = await createAgentSession(disposables, { environmentServiceRegistration: 'native' });
				const result = await session.handlePermissionRequest({
					kind: 'read',
					path: join('/mock-home', '.copilot', 'session-state', 'test-session-1', 'plan.md'),
					toolCallId: 'tc-read-plan-native-env',
				});

				assert.strictEqual(result.kind, 'approve-once');
				assert.strictEqual(signals.length, 0);
			} finally {
				if (previousXdgStateHome === undefined) {
					delete process.env['XDG_STATE_HOME'];
				} else {
					process.env['XDG_STATE_HOME'] = previousXdgStateHome;
				}
			}
		});

		test('logs and rethrows permission failures', async () => {
			const previousXdgStateHome = process.env['XDG_STATE_HOME'];
			delete process.env['XDG_STATE_HOME'];
			const logService = new CapturingLogService();
			try {
				const { session } = await createAgentSession(disposables, {
					environmentServiceRegistration: 'none',
					logService,
				});

				await assert.rejects(
					session.handlePermissionRequest({
						kind: 'read',
						path: join('/mock-home', '.copilot', 'session-state', 'test-session-1', 'plan.md'),
						toolCallId: 'tc-read-plan-missing-env',
					}),
				);

				assert.strictEqual(logService.errors.length, 1);
				const [entry] = logService.errors;
				assert.ok(entry.first instanceof TypeError);
				assert.strictEqual(entry.args[0], '[Copilot:test-session-1] Failed to handle permission request: kind=read, toolCallId=tc-read-plan-missing-env');
			} finally {
				if (previousXdgStateHome === undefined) {
					delete process.env['XDG_STATE_HOME'];
				} else {
					process.env['XDG_STATE_HOME'] = previousXdgStateHome;
				}
			}
		});

		test('write permission fires tool_ready (deferred to side effects)', async () => {
			const { session, signals, waitForSignal } = await createAgentSession(disposables);
			const resultPromise = session.handlePermissionRequest({
				kind: 'write',
				fileName: '/workspace/src/file.ts',
				toolCallId: 'tc-1',
			});

			await waitForSignal(s => s.kind === 'pending_confirmation');
			assert.strictEqual(signals.length, 1);

			assert.ok(session.respondToPermissionRequest('tc-1', true));
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'approve-once');
		});

		test('auto-approves write permission for session-state plan files', async () => {
			const previousXdgStateHome = process.env['XDG_STATE_HOME'];
			process.env['XDG_STATE_HOME'] = '/mock-state-home';
			try {
				const { session, signals } = await createAgentSession(disposables);
				const result = await session.handlePermissionRequest({
					kind: 'write',
					fileName: join('/mock-state-home', '.copilot', 'session-state', 'test-session-1', 'plan.md'),
					toolCallId: 'tc-write-plan',
				});

				assert.strictEqual(result.kind, 'approve-once');
				assert.strictEqual(signals.length, 0);
			} finally {
				if (previousXdgStateHome === undefined) {
					delete process.env['XDG_STATE_HOME'];
				} else {
					process.env['XDG_STATE_HOME'] = previousXdgStateHome;
				}
			}
		});

		test('does not auto-approve session-state files from another session', async () => {
			const previousXdgStateHome = process.env['XDG_STATE_HOME'];
			process.env['XDG_STATE_HOME'] = '/mock-state-home';
			try {
				const { session, signals, waitForSignal } = await createAgentSession(disposables);
				const resultPromise = session.handlePermissionRequest({
					kind: 'write',
					fileName: join('/mock-state-home', '.copilot', 'session-state', 'different-session', 'plan.md'),
					toolCallId: 'tc-write-other-plan',
				});

				await waitForSignal(s => s.kind === 'pending_confirmation');
				assert.strictEqual(signals.length, 1);

				assert.ok(session.respondToPermissionRequest('tc-write-other-plan', true));
				const result = await resultPromise;
				assert.strictEqual(result.kind, 'approve-once');
			} finally {
				if (previousXdgStateHome === undefined) {
					delete process.env['XDG_STATE_HOME'];
				} else {
					process.env['XDG_STATE_HOME'] = previousXdgStateHome;
				}
			}
		});

		test('does not auto-approve traversal paths that escape the session-state directory', async () => {
			const previousXdgStateHome = process.env['XDG_STATE_HOME'];
			process.env['XDG_STATE_HOME'] = '/mock-state-home';
			try {
				const { session, signals, waitForSignal } = await createAgentSession(disposables);
				const sessionDir = join('/mock-state-home', '.copilot', 'session-state', 'test-session-1');
				const resultPromise = session.handlePermissionRequest({
					kind: 'write',
					fileName: `${sessionDir}${sep}..${sep}outside.md`,
					toolCallId: 'tc-write-traversal',
				});

				await waitForSignal(s => s.kind === 'pending_confirmation');
				assert.strictEqual(signals.length, 1);

				assert.ok(session.respondToPermissionRequest('tc-write-traversal', true));
				const result = await resultPromise;
				assert.strictEqual(result.kind, 'approve-once');
			} finally {
				if (previousXdgStateHome === undefined) {
					delete process.env['XDG_STATE_HOME'];
				} else {
					process.env['XDG_STATE_HOME'] = previousXdgStateHome;
				}
			}
		});

		test('auto-approves read of Copilot SDK large-tool-output temp files', async () => {
			const { session, signals } = await createAgentSession(disposables);

			// Layout 1: <timestamp>-copilot-tool-output-<id>.txt
			const result1 = await session.handlePermissionRequest({
				kind: 'read',
				path: join('/mock-tmp', '1730000000000-copilot-tool-output-abc123.txt'),
				toolCallId: 'tc-tool-output-1',
			});
			assert.strictEqual(result1.kind, 'approve-once');

			// Layout 2: copilot-tool-output-<timestamp>-<id>.txt
			const result2 = await session.handlePermissionRequest({
				kind: 'read',
				path: join('/mock-tmp', 'copilot-tool-output-1730000000000-abc123.txt'),
				toolCallId: 'tc-tool-output-2',
			});
			assert.strictEqual(result2.kind, 'approve-once');

			assert.strictEqual(signals.length, 0);
		});

		test('does not auto-approve tool-output-named files outside tmpdir', async () => {
			const { session, signals, waitForSignal } = await createAgentSession(disposables);
			const resultPromise = session.handlePermissionRequest({
				kind: 'read',
				path: join('/some/other/dir', 'copilot-tool-output-1730000000000-abc123.txt'),
				toolCallId: 'tc-tool-output-outside',
			});

			await waitForSignal(s => s.kind === 'pending_confirmation');
			assert.strictEqual(signals.length, 1);

			assert.ok(session.respondToPermissionRequest('tc-tool-output-outside', true));
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'approve-once');
		});

		test('does not auto-approve unrelated files inside tmpdir', async () => {
			const { session, signals, waitForSignal } = await createAgentSession(disposables);
			const resultPromise = session.handlePermissionRequest({
				kind: 'read',
				path: join('/mock-tmp', 'something-else.txt'),
				toolCallId: 'tc-tmp-other',
			});

			await waitForSignal(s => s.kind === 'pending_confirmation');
			assert.strictEqual(signals.length, 1);

			assert.ok(session.respondToPermissionRequest('tc-tmp-other', true));
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'approve-once');
		});

		test('does not auto-approve write to a tool-output temp path', async () => {
			const { session, signals, waitForSignal } = await createAgentSession(disposables);
			const resultPromise = session.handlePermissionRequest({
				kind: 'write',
				fileName: join('/mock-tmp', 'copilot-tool-output-1730000000000-abc123.txt'),
				toolCallId: 'tc-tool-output-write',
			});

			await waitForSignal(s => s.kind === 'pending_confirmation');
			assert.strictEqual(signals.length, 1);

			assert.ok(session.respondToPermissionRequest('tc-tool-output-write', true));
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'approve-once');
		});

		test('write permission outside working directory fires tool_ready', async () => {
			const { session, signals, waitForSignal } = await createAgentSession(disposables);

			const resultPromise = session.handlePermissionRequest({
				kind: 'write',
				fileName: '/other/file.ts',
				toolCallId: 'tc-write-outside',
			});

			await waitForSignal(s => s.kind === 'pending_confirmation');
			assert.strictEqual(signals.length, 1);

			assert.ok(session.respondToPermissionRequest('tc-write-outside', true));
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'approve-once');
		});

		test('read permission outside working directory fires tool_ready', async () => {
			const { session, signals, waitForSignal } = await createAgentSession(disposables);

			// Kick off permission request but don't await — it will block
			const resultPromise = session.handlePermissionRequest({
				kind: 'read',
				path: '/other/file.ts',
				toolCallId: 'tc-2',
			});

			// Should have fired a pending_confirmation signal
			await waitForSignal(s => s.kind === 'pending_confirmation');
			assert.strictEqual(signals.length, 1);

			// Respond to it
			assert.ok(session.respondToPermissionRequest('tc-2', true));
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'approve-once');
		});

		test('denies permission when no toolCallId', async () => {
			const { session } = await createAgentSession(disposables);
			const result = await session.handlePermissionRequest({ kind: 'write' });
			assert.strictEqual(result.kind, 'reject');
		});

		test('denied-interactively when user denies', async () => {
			const { session, signals, waitForSignal } = await createAgentSession(disposables);
			const resultPromise = session.handlePermissionRequest({
				kind: 'shell',
				toolCallId: 'tc-3',
			});

			await waitForSignal(s => s.kind === 'pending_confirmation');
			assert.strictEqual(signals.length, 1);
			session.respondToPermissionRequest('tc-3', false);
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'reject');
		});

		test('pending permissions are denied on dispose', async () => {
			const { session } = await createAgentSession(disposables);
			const resultPromise = session.handlePermissionRequest({
				kind: 'write',
				toolCallId: 'tc-4',
			});

			session.dispose();
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'reject');
		});

		test('pending permissions are denied on abort', async () => {
			const { session } = await createAgentSession(disposables);
			const resultPromise = session.handlePermissionRequest({
				kind: 'write',
				toolCallId: 'tc-5',
			});

			await session.abort();
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'reject');
		});

		test('respondToPermissionRequest returns false for unknown id', async () => {
			const { session } = await createAgentSession(disposables);
			assert.strictEqual(session.respondToPermissionRequest('unknown-id', true), false);
		});
	});

	// ---- sendSteering ----

	suite('sendSteering', () => {

		test('fires steering_consumed after send resolves', async () => {
			const { session, signals } = await createAgentSession(disposables);

			await session.sendSteering({ id: 'steer-1', userMessage: { text: 'focus on tests' } });

			const consumed = signals.find(s => s.kind === 'steering_consumed');
			assert.ok(consumed, 'should fire steering_consumed signal');
			assert.strictEqual((consumed as { id: string }).id, 'steer-1');
		});

		test('does not fire steering_consumed when send fails', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);

			mockSession.send = async () => { throw new Error('send failed'); };

			await session.sendSteering({ id: 'steer-fail', userMessage: { text: 'will fail' } });

			const consumed = signals.find(s => s.kind === 'steering_consumed');
			assert.strictEqual(consumed, undefined, 'should not fire steering_consumed on failure');
		});
	});

	// ---- event mapping ----

	suite('event mapping', () => {

		test('tool_start event is mapped for non-hidden tools', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-10',
				toolName: 'bash',
				arguments: { command: 'echo hello' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			assert.strictEqual(signals.length, 2);
			const toolStart = signals[0];
			assert.ok(isAction(toolStart, ActionType.SessionToolCallStart));
			if (isAction(toolStart, ActionType.SessionToolCallStart)) {
				const action = toolStart.action as SessionToolCallStartAction;
				assert.strictEqual(action.toolCallId, 'tc-10');
				assert.strictEqual(action.toolName, 'bash');
			}
		});

		test('live tool_start strips redundant cd prefix matching workingDirectory', async () => {
			const wd = URI.file('/repo/project');
			const { mockSession, signals } = await createAgentSession(disposables, { workingDirectory: wd });
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-cd',
				toolName: 'bash',
				arguments: { command: 'cd /repo/project && npm test' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			assert.strictEqual(signals.length, 2);
			// toolInput on the auto-ready signal (signals[1])
			const readySignal = signals[1];
			assert.ok(isAction(readySignal, ActionType.SessionToolCallReady));
			if (isAction(readySignal, ActionType.SessionToolCallReady)) {
				const action = readySignal.action as SessionToolCallReadyAction;
				assert.strictEqual(action.toolInput, 'npm test');
			}
			// toolArguments in _meta on the tool_start signal (signals[0])
			const startSignal = signals[0];
			assert.ok(isAction(startSignal, ActionType.SessionToolCallStart));
			if (isAction(startSignal, ActionType.SessionToolCallStart)) {
				const meta = (startSignal.action as SessionToolCallStartAction)._meta;
				const toolArgs = meta?.['toolArguments'] as string | undefined;
				assert.ok(toolArgs && toolArgs.includes('"npm test"'), `toolArguments should contain rewritten command, was: ${toolArgs}`);
				assert.ok(!toolArgs?.includes('cd /repo/project'), 'toolArguments should not contain stripped prefix');
			}
		});

		test('live tool_complete past-tense message reflects the rewritten command', async () => {
			const wd = URI.file('/repo/project');
			const { mockSession, signals } = await createAgentSession(disposables, { workingDirectory: wd });

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-cd-complete',
				toolName: 'bash',
				arguments: { command: 'cd /repo/project && npm test' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-cd-complete',
				success: true,
				result: { content: 'all tests passed' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			assert.strictEqual(signals.length, 3);
			const completeSignal = signals[2];
			assert.ok(isAction(completeSignal, ActionType.SessionToolCallComplete));
			if (isAction(completeSignal, ActionType.SessionToolCallComplete)) {
				const action = completeSignal.action as SessionToolCallCompleteAction;
				const past = action.result.pastTenseMessage;
				const pastStr = typeof past === 'string' ? past : (past?.markdown ?? '');
				assert.ok(!pastStr.includes('cd /repo/project'), `past-tense message should not contain stripped prefix, got: ${pastStr}`);
				assert.ok(pastStr.includes('npm test'), `past-tense message should contain the rewritten command, got: ${pastStr}`);
			}
		});

		test('live tool_start does not rewrite when cd target differs from workingDirectory', async () => {
			const wd = URI.file('/repo/project');
			const { mockSession, signals } = await createAgentSession(disposables, { workingDirectory: wd });
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-cd-other',
				toolName: 'bash',
				arguments: { command: 'cd /tmp && ls' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			assert.strictEqual(signals.length, 2);
			const readySignal = signals[1];
			assert.ok(isAction(readySignal, ActionType.SessionToolCallReady));
			if (isAction(readySignal, ActionType.SessionToolCallReady)) {
				assert.strictEqual((readySignal.action as SessionToolCallReadyAction).toolInput, 'cd /tmp && ls');
			}
		});

		test('live tool_start without workingDirectory passes command through', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-cd-nowd',
				toolName: 'bash',
				arguments: { command: 'cd /repo/project && npm test' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			assert.strictEqual(signals.length, 2);
			const readySignal = signals[1];
			assert.ok(isAction(readySignal, ActionType.SessionToolCallReady));
			if (isAction(readySignal, ActionType.SessionToolCallReady)) {
				assert.strictEqual((readySignal.action as SessionToolCallReadyAction).toolInput, 'cd /repo/project && npm test');
			}
		});

		test('hidden tools are not emitted as tool_start', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-11',
				toolName: 'report_intent',
			} as SessionEventPayload<'tool.execution_start'>['data']);

			assert.strictEqual(signals.length, 0);
		});

		test('report_intent surfaces as session activity', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-intent-1',
				toolName: 'report_intent',
				arguments: { intent: 'Reading repo docs' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			assert.strictEqual(signals.length, 1);
			const signal = signals[0];
			assert.ok(isAction(signal, ActionType.SessionActivityChanged));
			if (isAction(signal, ActionType.SessionActivityChanged)) {
				assert.strictEqual((signal.action as { activity: string | undefined }).activity, 'Reading repo docs');
			}

			// Going idle clears the activity.
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);
			const clearSignal = signals.find((s, i) => i > 0 && isAction(s, ActionType.SessionActivityChanged));
			assert.ok(clearSignal, 'expected activity to be cleared on idle');
			if (clearSignal && isAction(clearSignal, ActionType.SessionActivityChanged)) {
				assert.strictEqual((clearSignal.action as { activity: string | undefined }).activity, undefined);
			}
		});

		test('tool_complete event produces past-tense message', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);

			// First fire tool_start so it's tracked
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-12',
				toolName: 'bash',
				arguments: { command: 'ls' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			// Then fire complete
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-12',
				success: true,
				result: { content: 'file1.ts\nfile2.ts' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			assert.strictEqual(signals.length, 3);
			const completeSignal = signals[2];
			assert.ok(isAction(completeSignal, ActionType.SessionToolCallComplete));
			if (isAction(completeSignal, ActionType.SessionToolCallComplete)) {
				const action = completeSignal.action as SessionToolCallCompleteAction;
				assert.strictEqual(action.toolCallId, 'tc-12');
				assert.ok(action.result.success);
				assert.ok(action.result.pastTenseMessage);
			}
		});

		test('tool_complete for untracked tool is ignored', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-untracked',
				success: true,
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			assert.strictEqual(signals.length, 0);
		});

		test('idle event is forwarded', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			assert.strictEqual(signals.length, 1);
			assert.ok(isAction(signals[0], ActionType.SessionTurnComplete));
		});

		test('error event is forwarded', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('session.error', {
				errorType: 'TestError',
				message: 'something went wrong',
				stack: 'Error: something went wrong',
			} as SessionEventPayload<'session.error'>['data']);

			assert.strictEqual(signals.length, 1);
			assert.ok(isAction(signals[0], ActionType.SessionError));
			if (isAction(signals[0], ActionType.SessionError)) {
				const action = signals[0].action as SessionErrorAction;
				assert.strictEqual(action.error.errorType, 'TestError');
				assert.strictEqual(action.error.message, 'something went wrong');
			}
		});

		test('message delta is forwarded', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('assistant.message_delta', {
				messageId: 'msg-1',
				deltaContent: 'Hello ',
			} as SessionEventPayload<'assistant.message_delta'>['data']);

			assert.ok(signals.length >= 1);
			const hasDelta = signals.some(s => {
				if (s.kind !== 'action') { return false; }
				if (s.action.type === ActionType.SessionResponsePart) {
					const part = (s.action as SessionResponsePartAction).part;
					return part.kind === ResponsePartKind.Markdown && part.content === 'Hello ';
				}
				if (s.action.type === ActionType.SessionDelta) {
					return (s.action as SessionDeltaAction).content === 'Hello ';
				}
				return false;
			});
			assert.ok(hasDelta, 'should have forwarded the delta content');
		});

		test('complete assistant message without preceding deltas surfaces a markdown response part', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('assistant.message', {
				messageId: 'msg-2',
				content: 'Let me help you.',
				toolRequests: [{
					toolCallId: 'tc-20',
					name: 'bash',
					arguments: { command: 'ls' },
					type: 'function',
				}],
			} as SessionEventPayload<'assistant.message'>['data']);

			// The session emits a fresh markdown response part for the
			// content. Tool calls fire their own events, so
			// `toolRequests` on the assistant message are not forwarded
			// during live streaming.
			assert.ok(signals.length >= 1);
			const hasPart = signals.some(s => {
				if (s.kind !== 'action') { return false; }
				if (s.action.type === ActionType.SessionResponsePart) {
					const part = (s.action as SessionResponsePartAction).part;
					return part.kind === ResponsePartKind.Markdown && part.content === 'Let me help you.';
				}
				if (s.action.type === ActionType.SessionDelta) {
					return (s.action as SessionDeltaAction).content === 'Let me help you.';
				}
				return false;
			});
			assert.ok(hasPart, 'should have surfaced the message content');
		});

		test('reasoning delta after tool_start starts a new reasoning response part', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);

			// First reasoning delta — allocates a fresh reasoning response part.
			mockSession.fire('assistant.reasoning_delta', {
				deltaContent: 'thinking step 1',
			} as SessionEventPayload<'assistant.reasoning_delta'>['data']);

			// A tool call interleaves between reasoning rounds.
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-r-1',
				toolName: 'bash',
				arguments: { command: 'echo hi' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-r-1',
				success: true,
				result: { content: 'hi' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			// Second round of reasoning, after the tool call. This must
			// land in a NEW reasoning response part — otherwise the
			// renderer / state-tree would merge it into the pre-tool-call
			// block and the visual ordering would be wrong on restore.
			mockSession.fire('assistant.reasoning_delta', {
				deltaContent: 'thinking step 2',
			} as SessionEventPayload<'assistant.reasoning_delta'>['data']);

			// Pull the protocol-level reasoning response parts. Both
			// `SessionResponsePart{Reasoning}` (allocates a new part) and
			// `SessionReasoning` (appends to an existing part) translate to
			// the legacy `'reasoning'` view, so we have to inspect raw
			// signals to tell them apart.
			const reasoningResponseParts = signals.flatMap(s => {
				if (s.kind !== 'action' || s.action.type !== ActionType.SessionResponsePart) {
					return [];
				}
				return s.action.part.kind === ResponsePartKind.Reasoning ? [s.action.part] : [];
			});
			assert.strictEqual(reasoningResponseParts.length, 2,
				'reasoning after a tool call should allocate a new response part, not append to the part from before the tool call');
			assert.notStrictEqual(reasoningResponseParts[0].id, reasoningResponseParts[1].id,
				'second reasoning round should have a distinct part id');
			assert.strictEqual(reasoningResponseParts[0].content, 'thinking step 1');
			assert.strictEqual(reasoningResponseParts[1].content, 'thinking step 2');
		});
	});

	// ---- user input handling ----

	suite('user input handling', () => {

		test('handleUserInputRequest fires user_input_request progress event', async () => {
			const { session, signals } = await createAgentSession(disposables);

			// Start the request (don't await — it blocks waiting for response)
			const resultPromise = session.handleUserInputRequest(
				{ question: 'What is your name?' },
				{ sessionId: 'test-session-1' }
			);

			// Verify signal was fired
			assert.strictEqual(signals.length, 1);
			const request = getInputRequest(signals[0]);
			const requestId = request.id;
			assert.ok(request.questions);
			assert.strictEqual(request.questions[0].message, 'What is your name?');
			const questionId = request.questions[0].id;

			// Respond to unblock the promise
			session.respondToUserInputRequest(requestId, SessionInputResponseKind.Accept, {
				[questionId]: {
					state: SessionInputAnswerState.Submitted,
					value: { kind: SessionInputAnswerValueKind.Text, value: 'Alice' }
				}
			});

			const result = await resultPromise;
			assert.strictEqual(result.answer, 'Alice');
			assert.strictEqual(result.wasFreeform, true);
		});

		test('handleUserInputRequest with choices generates SingleSelect question', async () => {
			const { session, signals } = await createAgentSession(disposables);

			const resultPromise = session.handleUserInputRequest(
				{ question: 'Pick a color', choices: ['red', 'blue', 'green'] },
				{ sessionId: 'test-session-1' }
			);

			assert.strictEqual(signals.length, 1);
			const request = getInputRequest(signals[0]);
			assert.ok(request.questions);
			assert.strictEqual(request.questions.length, 1);
			assert.strictEqual(request.questions[0].kind, SessionInputQuestionKind.SingleSelect);
			if (request.questions[0].kind === SessionInputQuestionKind.SingleSelect) {
				assert.strictEqual(request.questions[0].options.length, 3);
				assert.strictEqual(request.questions[0].options[0].label, 'red');
			}

			// Respond with a selected choice
			const questions = request.questions;
			session.respondToUserInputRequest(request.id, SessionInputResponseKind.Accept, {
				[questions[0].id]: {
					state: SessionInputAnswerState.Submitted,
					value: { kind: SessionInputAnswerValueKind.Selected, value: 'blue' }
				}
			});

			const result = await resultPromise;
			assert.strictEqual(result.answer, 'blue');
			assert.strictEqual(result.wasFreeform, false);
		});

		test('handleUserInputRequest returns empty answer on cancel', async () => {
			const { session, signals } = await createAgentSession(disposables);

			const resultPromise = session.handleUserInputRequest(
				{ question: 'Cancel me' },
				{ sessionId: 'test-session-1' }
			);

			const request = getInputRequest(signals[0]);
			session.respondToUserInputRequest(request.id, SessionInputResponseKind.Cancel);

			const result = await resultPromise;
			assert.strictEqual(result.answer, '');
			assert.strictEqual(result.wasFreeform, true);
		});

		test('respondToUserInputRequest returns false for unknown id', async () => {
			const { session } = await createAgentSession(disposables);
			assert.strictEqual(session.respondToUserInputRequest('unknown-id', SessionInputResponseKind.Accept), false);
		});

		test('handleUserInputRequest returns empty answer on skipped question', async () => {
			const { session, signals } = await createAgentSession(disposables);

			const resultPromise = session.handleUserInputRequest(
				{ question: 'Skip me' },
				{ sessionId: 'test-session-1' }
			);

			const request = getInputRequest(signals[0]);
			const questionId = request.questions![0].id;
			session.respondToUserInputRequest(request.id, SessionInputResponseKind.Accept, {
				[questionId]: {
					state: SessionInputAnswerState.Skipped,
				}
			});

			const result = await resultPromise;
			assert.strictEqual(result.answer, '');
			assert.strictEqual(result.wasFreeform, true);
		});

		test('pending user inputs are cancelled on dispose', async () => {
			const { session } = await createAgentSession(disposables);

			const resultPromise = session.handleUserInputRequest(
				{ question: 'Will be cancelled' },
				{ sessionId: 'test-session-1' }
			);

			session.dispose();
			const result = await resultPromise;
			assert.strictEqual(result.answer, '');
			assert.strictEqual(result.wasFreeform, true);
		});

		test('autopilot auto-answers a free-form question without firing a progress event', async () => {
			const { session, signals } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.AutoApprove]: 'autopilot' },
			});

			const result = await session.handleUserInputRequest(
				{ question: 'Pick a color', choices: ['red', 'blue', 'green'] },
				{ sessionId: 'test-session-1' }
			);

			// `wasFreeform: false` because we picked one of the SDK's
			// offered choices — the SDK uses this hint to record whether
			// the user typed something custom.
			assert.strictEqual(result.answer, 'The user is not available to answer your question. Choose a pragmatic option best aligned with the context of the request.');
			assert.strictEqual(result.wasFreeform, true);
			assert.strictEqual(signals.length, 0);
		});

		test('autopilot does not auto-answer when autoApprove is not "autopilot"', async () => {
			// Sanity check: with autoApprove=default the question must
			// still be surfaced as a progress event (the existing behavior).
			const { session, signals } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.AutoApprove]: 'default' },
			});

			session.handleUserInputRequest(
				{ question: 'Need user input' },
				{ sessionId: 'test-session-1' }
			);

			// Microtask flush so the handler can run far enough to either
			// short-circuit or emit a progress event.
			await Promise.resolve();
			assert.strictEqual(signals.length, 1);
			assert.ok(isAction(signals[0], ActionType.SessionInputRequested));
		});
	});

	suite('SDK callback logging', () => {

		test('logs and rethrows user input callback failures', async () => {
			const logService = new CapturingLogService();
			const { session } = await createAgentSession(disposables, { logService });
			const sessionInternals = session as unknown as ISessionInternalsForTest;
			sessionInternals._onDidSessionProgress.fire = () => {
				throw new Error('user input boom');
			};

			await assert.rejects(
				session.handleUserInputRequest(
					{ question: 'Need input' },
					{ sessionId: 'test-session-1' },
				),
				/user input boom/,
			);

			assert.strictEqual(logService.errors.length, 1);
			const [entry] = logService.errors;
			assert.ok(entry.first instanceof Error);
			assert.strictEqual((entry.first as Error).message, 'user input boom');
			assert.strictEqual(entry.args[0], '[Copilot:test-session-1] Failed to handle user input request: question="Need input"');
		});

		test('logs and rethrows onPreToolUse failures', async () => {
			const logService = new CapturingLogService();
			const capturedCallbacks: { current?: Parameters<SessionWrapperFactory>[0] } = {};
			const { session } = await createAgentSession(disposables, { logService, captureWrapperCallbacks: capturedCallbacks });
			const sessionInternals = session as unknown as ISessionInternalsForTest;
			sessionInternals._editTracker.trackEditStart = async () => {
				throw new Error('pre tool boom');
			};

			await assert.rejects(
				capturedCallbacks.current!.hooks.onPreToolUse({
					timestamp: 0,
					cwd: '/tmp',
					toolName: 'edit',
					toolArgs: { path: '/tmp/file.ts' },
				}),
				/pre tool boom/,
			);

			assert.strictEqual(logService.errors.length, 1);
			const [entry] = logService.errors;
			assert.ok(entry.first instanceof Error);
			assert.strictEqual((entry.first as Error).message, 'pre tool boom');
			assert.strictEqual(entry.args[0], '[Copilot:test-session-1] Failed in onPreToolUse: tool=edit');
		});

		test('logs and rethrows onPostToolUse failures', async () => {
			const logService = new CapturingLogService();
			const capturedCallbacks: { current?: Parameters<SessionWrapperFactory>[0] } = {};
			const { session } = await createAgentSession(disposables, { logService, captureWrapperCallbacks: capturedCallbacks });
			const sessionInternals = session as unknown as ISessionInternalsForTest;
			sessionInternals._editTracker.completeEdit = async () => {
				throw new Error('post tool boom');
			};

			await assert.rejects(
				capturedCallbacks.current!.hooks.onPostToolUse({
					timestamp: 0,
					cwd: '/tmp',
					toolName: 'edit',
					toolArgs: { path: '/tmp/file.ts' },
					toolResult: { textResultForLlm: '', resultType: 'success' },
				}),
				/post tool boom/,
			);

			assert.strictEqual(logService.errors.length, 1);
			const [entry] = logService.errors;
			assert.ok(entry.first instanceof Error);
			assert.strictEqual((entry.first as Error).message, 'post tool boom');
			assert.strictEqual(entry.args[0], '[Copilot:test-session-1] Failed in onPostToolUse: tool=edit');
		});
	});

	// ---- client tool calls ----

	suite('client tool calls', () => {

		const snapshot: IActiveClientSnapshot = {
			clientId: 'test-client',
			tools: [{
				name: 'my_tool',
				description: 'A test tool',
				inputSchema: { type: 'object', properties: {} },
			}],
			plugins: [],
		};

		test('client tool handler waits for completion without emitting tool_ready', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			// SDK emits tool.execution_start — tool_start fires immediately
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-client-1',
				toolName: 'my_tool',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);

			// tool_start fires immediately (client tools don't auto-ready)
			assert.strictEqual(signals.filter(s => isAction(s, ActionType.SessionToolCallStart)).length, 1);
			const startSignal = signals.find(s => isAction(s, ActionType.SessionToolCallStart));
			assert.ok(startSignal && isAction(startSignal, ActionType.SessionToolCallStart));
			if (isAction(startSignal!, ActionType.SessionToolCallStart)) {
				assert.strictEqual((startSignal.action as SessionToolCallStartAction).toolClientId, 'test-client');
			}

			// SDK invokes the handler — it creates a deferred and waits,
			// but does NOT fire tool_ready (that comes from the permission flow).
			const tools = session.createClientSdkTools();
			const handlerPromise = invokeClientToolHandler(tools[0], 'tc-client-1', { file: 'test.ts' });

			// No pending_confirmation or tool_ready should have been emitted by the handler
			assert.strictEqual(signals.filter(s => s.kind === 'pending_confirmation' || isAction(s, ActionType.SessionToolCallReady)).length, 0);

			// Complete the tool call
			session.handleClientToolCallComplete('tc-client-1', {
				success: true,
				pastTenseMessage: 'did it',
				content: [{ type: ToolResultContentType.Text, text: 'result text' }],
			});

			const result = await handlerPromise;
			assert.strictEqual(result.resultType, 'success');
			assert.strictEqual(result.textResultForLlm, 'result text');
		});

		test('client tool handler does not emit tool_ready (permission flow owns it)', async () => {
			const { session, mockSession, signals, waitForSignal } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			// SDK emits tool.execution_start — tool_start fires immediately
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-client-perm',
				toolName: 'my_tool',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);

			// tool_start fired, no pending_confirmation yet
			assert.strictEqual(signals.filter(s => isAction(s, ActionType.SessionToolCallStart)).length, 1);
			assert.strictEqual(signals.filter(s => s.kind === 'pending_confirmation').length, 0);

			// Permission request fires — pending_confirmation from permission flow.
			const resultPromise = session.handlePermissionRequest({
				kind: 'custom-tool',
				toolCallId: 'tc-client-perm',
				toolName: 'my_tool',
			});

			// pending_confirmation from permission flow should have fired (with confirmationTitle)
			await waitForSignal(s => s.kind === 'pending_confirmation');
			const permSignals = signals.filter((s): s is IAgentToolPendingConfirmationSignal => s.kind === 'pending_confirmation');
			assert.strictEqual(permSignals.length, 1);
			assert.strictEqual(permSignals[0].state.toolCallId, 'tc-client-perm');
			assert.ok(permSignals[0].state.confirmationTitle);

			const tools = session.createClientSdkTools();
			const handlerPromise = invokeClientToolHandler(tools[0], 'tc-client-perm');

			// The handler should NOT emit its own pending_confirmation — only the
			// permission flow fires pending_confirmation for client tools.
			assert.strictEqual(signals.filter(s => s.kind === 'pending_confirmation').length, 1, 'handler should not emit a second pending_confirmation');

			// Approve and clean up
			session.respondToPermissionRequest('tc-client-perm', true);
			const permResult = await resultPromise;
			assert.strictEqual(permResult.kind, 'approve-once');
			session.handleClientToolCallComplete('tc-client-perm', {
				success: true,
				pastTenseMessage: 'did it',
			});
			await handlerPromise;
		});

		test('pending_confirmation forwards parentToolCallId for tools inside subagents', async () => {
			// Regression: when a client tool runs inside a subagent the
			// permission-flow `pending_confirmation` must carry the
			// parentToolCallId from the originating tool_start. Without it
			// the host has no way to route the resulting
			// SessionToolCallReady to the subagent session and emits a
			// stray ready against the parent session (no preceding
			// SessionToolCallStart).
			const { session, mockSession, signals, waitForSignal } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-sub-client',
				toolName: 'my_tool',
				arguments: {},
				parentToolCallId: 'tc-parent-subagent',
			} as SessionEventPayload<'tool.execution_start'>['data']);

			const resultPromise = session.handlePermissionRequest({
				kind: 'custom-tool',
				toolCallId: 'tc-sub-client',
				toolName: 'my_tool',
			});

			await waitForSignal(s => s.kind === 'pending_confirmation');
			const permSignals = signals.filter((s): s is IAgentToolPendingConfirmationSignal => s.kind === 'pending_confirmation');
			assert.strictEqual(permSignals.length, 1);
			assert.strictEqual(permSignals[0].parentToolCallId, 'tc-parent-subagent');

			session.respondToPermissionRequest('tc-sub-client', false);
			await resultPromise;
		});

		test('handleClientToolCallComplete pre-completes when no handler is waiting yet', async () => {
			const { session } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			// Completion arrives before handler — pre-creates deferred
			session.handleClientToolCallComplete('tc-unknown', {
				success: true,
				pastTenseMessage: 'done',
			});

			// Handler picks up the pre-completed result
			const tools = session.createClientSdkTools();
			const result = await invokeClientToolHandler(tools[0], 'tc-unknown');
			assert.strictEqual(result.resultType, 'success');
		});

		test('handleClientToolCallComplete with failure result', async () => {
			const { session } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			const tools = session.createClientSdkTools();
			const handlerPromise = invokeClientToolHandler(tools[0], 'tc-client-3');

			session.handleClientToolCallComplete('tc-client-3', {
				success: false,
				pastTenseMessage: 'failed',
				error: { message: 'something broke' },
			});

			const result = await handlerPromise;
			assert.strictEqual(result.resultType, 'failure');
			assert.strictEqual(result.error, 'something broke');
		});

		test('pending client tool calls are cancelled on dispose', async () => {
			const { session } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			const tools = session.createClientSdkTools();
			const handlerPromise = invokeClientToolHandler(tools[0], 'tc-client-4');

			session.dispose();
			const result = await handlerPromise;
			assert.strictEqual(result.resultType, 'failure');
			assert.ok(result.error);
		});

		test('multiple concurrent client tool calls resolve independently', async () => {
			const { session } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			const tools = session.createClientSdkTools();
			const promise1 = invokeClientToolHandler(tools[0], 'tc-multi-1');
			const promise2 = invokeClientToolHandler(tools[0], 'tc-multi-2');

			// Complete in reverse order
			session.handleClientToolCallComplete('tc-multi-2', {
				success: true,
				pastTenseMessage: 'second done',
				content: [{ type: ToolResultContentType.Text, text: 'result-2' }],
			});
			session.handleClientToolCallComplete('tc-multi-1', {
				success: true,
				pastTenseMessage: 'first done',
				content: [{ type: ToolResultContentType.Text, text: 'result-1' }],
			});

			const [result1, result2] = await Promise.all([promise1, promise2]);
			assert.strictEqual(result1.textResultForLlm, 'result-1');
			assert.strictEqual(result2.textResultForLlm, 'result-2');
		});

		test('handler cleans up deferred after consuming result', async () => {
			const { session } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			const tools = session.createClientSdkTools();
			const handlerPromise = invokeClientToolHandler(tools[0], 'tc-cleanup');

			session.handleClientToolCallComplete('tc-cleanup', {
				success: true,
				pastTenseMessage: 'done',
				content: [{ type: ToolResultContentType.Text, text: 'ok' }],
			});

			await handlerPromise;

			// A second complete for the same toolCallId should create a new
			// deferred (not fail). This tests the cleanup path.
			session.handleClientToolCallComplete('tc-cleanup', {
				success: true,
				pastTenseMessage: 'done again',
			});
		});

		test('client tool handler logs and rethrows failures', async () => {
			const logService = new CapturingLogService();
			const { session } = await createAgentSession(disposables, { clientSnapshot: snapshot, logService });
			const tools = session.createClientSdkTools();
			const sessionInternals = session as unknown as ISessionInternalsForTest;
			sessionInternals._pendingClientToolCalls.get = () => {
				throw new Error('client tool boom');
			};

			await assert.rejects(
				invokeClientToolHandler(tools[0], 'tc-client-error'),
				/client tool boom/,
			);

			assert.strictEqual(logService.errors.length, 1);
			const [entry] = logService.errors;
			assert.ok(entry.first instanceof Error);
			assert.strictEqual((entry.first as Error).message, 'client tool boom');
			assert.strictEqual(entry.args[0], '[Copilot:test-session-1] Failed in client tool handler: tool=my_tool, toolCallId=tc-client-error');
		});

		test('permission request before client tool handler emits only confirmation ready', async () => {
			const { session, mockSession, signals, waitForSignal } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-ready-data',
				toolName: 'my_tool',
				arguments: { file: 'test.ts' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			// tool_start should have fired
			assert.strictEqual(signals.filter(s => isAction(s, ActionType.SessionToolCallStart)).length, 1);

			// Permission before the handler should produce only the confirmation
			// pending_confirmation, not a synthetic auto-ready.
			const resultPromise = session.handlePermissionRequest({
				kind: 'custom-tool',
				toolCallId: 'tc-ready-data',
				toolName: 'my_tool',
			});

			await waitForSignal(s => s.kind === 'pending_confirmation');
			const permSignals = signals.filter((s): s is IAgentToolPendingConfirmationSignal => s.kind === 'pending_confirmation');
			assert.strictEqual(permSignals.length, 1);
			assert.ok(permSignals[0].state.confirmationTitle);

			session.respondToPermissionRequest('tc-ready-data', true);
			await resultPromise;
		});

		test('handleClientToolCallComplete with content containing embedded resources', async () => {
			const { session } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			const tools = session.createClientSdkTools();
			const handlerPromise = invokeClientToolHandler(tools[0], 'tc-embedded');

			session.handleClientToolCallComplete('tc-embedded', {
				success: true,
				pastTenseMessage: 'done',
				content: [
					{ type: ToolResultContentType.Text, text: 'text part' },
					{ type: ToolResultContentType.EmbeddedResource, data: 'base64data', contentType: 'image/png' },
				],
			});

			const result = await handlerPromise;
			assert.strictEqual(result.resultType, 'success');
			// Text content should be extracted
			assert.strictEqual(result.textResultForLlm, 'text part');
		});
	});

	// ---- Plan mode ----------------------------------------------------------

	suite('plan mode', () => {

		const planRequestParams = (overrides?: Partial<{ actions: string[]; recommendedAction: string; summary: string }>) => ({
			sessionId: 'test-session-1',
			summary: overrides?.summary ?? '## Plan summary',
			planContent: '## Plan',
			actions: overrides?.actions ?? ['autopilot', 'interactive', 'exit_only'],
			recommendedAction: overrides?.recommendedAction ?? 'autopilot',
		});

		test('applyMode pushes the mode to the SDK only when it changes', async () => {
			const { session, mockSession } = await createAgentSession(disposables);

			await session.applyMode('plan');
			await session.applyMode('plan');
			await session.applyMode('autopilot');
			await session.applyMode(undefined);
			await session.applyMode('autopilot');

			assert.deepStrictEqual(mockSession.modeSetCalls, [
				{ mode: 'plan' },
				{ mode: 'autopilot' },
			]);
		});

		test('send applies mode before forwarding to the SDK', async () => {
			const { session, mockSession } = await createAgentSession(disposables);

			await session.send('hi', undefined, 'turn-1', 'plan');

			assert.deepStrictEqual(mockSession.modeSetCalls, [{ mode: 'plan' }]);
			assert.strictEqual(mockSession.sendRequests.length, 1);
		});

		test('handleExitPlanModeRequest produces a single-select input request with options and recommended', async () => {
			const { session, mockSession, signals, waitForSignal } = await createAgentSession(disposables);

			mockSession.planReadResult = { exists: true, content: '## Plan', path: '/sessions/abc/plan.md' };

			const responsePromise = session.handleExitPlanModeRequest(planRequestParams());

			const signal = await waitForSignal(s => isAction(s, ActionType.SessionInputRequested));
			const request = getInputRequest(signal);

			// The plan summary and "View full plan" link are emitted as a
			// markdown response part before the input request, so the
			// client renders them inline above the question.
			const deltaContent = signals.flatMap(s => {
				if (s.kind !== 'action') { return []; }
				if (s.action.type === ActionType.SessionResponsePart) {
					const part = (s.action as SessionResponsePartAction).part;
					return part.kind === ResponsePartKind.Markdown ? [part.content] : [];
				}
				if (s.action.type === ActionType.SessionDelta) {
					return [(s.action as SessionDeltaAction).content];
				}
				return [];
			}).join('');
			assert.ok(deltaContent.includes('Plan summary'), `expected delta to include plan summary; got: ${deltaContent}`);
			assert.ok(deltaContent.includes('plan.md'), 'delta should include a link to the plan file');

			const question = request.questions?.[0];
			assert.strictEqual(question?.kind, SessionInputQuestionKind.SingleSelect);
			if (question?.kind === SessionInputQuestionKind.SingleSelect) {
				assert.deepStrictEqual(question.options.map(o => o.id), ['autopilot', 'interactive', 'exit_only']);
				const recommended = question.options.find(o => o.recommended);
				assert.strictEqual(recommended?.id, 'autopilot');
				assert.strictEqual(question.allowFreeformInput, true);
			}

			// Resolve the request so the deferred completes and the test can clean up.
			session.respondToUserInputRequest(request.id, SessionInputResponseKind.Decline);
			await responsePromise;
		});

		test('completing the input request with autopilot resolves with approved + autopilot + autoApproveEdits', async () => {
			const { session, waitForSignal } = await createAgentSession(disposables);

			const responsePromise = session.handleExitPlanModeRequest(planRequestParams({ actions: ['autopilot', 'interactive'], recommendedAction: 'autopilot' }));
			const signal = await waitForSignal(s => isAction(s, ActionType.SessionInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			session.respondToUserInputRequest(requestId, SessionInputResponseKind.Accept, {
				[questionId]: {
					state: SessionInputAnswerState.Submitted,
					value: { kind: SessionInputAnswerValueKind.Selected, value: 'autopilot' },
				},
			});

			assert.deepStrictEqual(await responsePromise, { approved: true, selectedAction: 'autopilot', autoApproveEdits: true });
		});

		test('completing the input request with interactive resolves with approved + interactive (no autoApprove)', async () => {
			const { session, waitForSignal } = await createAgentSession(disposables);

			const responsePromise = session.handleExitPlanModeRequest(planRequestParams({ actions: ['autopilot', 'interactive'], recommendedAction: 'interactive' }));
			const signal = await waitForSignal(s => isAction(s, ActionType.SessionInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			session.respondToUserInputRequest(requestId, SessionInputResponseKind.Accept, {
				[questionId]: {
					state: SessionInputAnswerState.Submitted,
					value: { kind: SessionInputAnswerValueKind.Selected, value: 'interactive' },
				},
			});

			assert.deepStrictEqual(await responsePromise, { approved: true, selectedAction: 'interactive' });
		});

		test('declining the input request resolves with approved=false', async () => {
			const { session, waitForSignal } = await createAgentSession(disposables);

			const responsePromise = session.handleExitPlanModeRequest(planRequestParams());
			const signal = await waitForSignal(s => isAction(s, ActionType.SessionInputRequested));

			session.respondToUserInputRequest(getInputRequest(signal).id, SessionInputResponseKind.Decline);

			assert.deepStrictEqual(await responsePromise, { approved: false });
		});

		test('exit_only resolves as approved + interactive without autoApproveEdits', async () => {
			const { session, waitForSignal } = await createAgentSession(disposables);

			const responsePromise = session.handleExitPlanModeRequest(planRequestParams({ actions: ['autopilot', 'interactive', 'exit_only'], recommendedAction: 'exit_only' }));
			const signal = await waitForSignal(s => isAction(s, ActionType.SessionInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			session.respondToUserInputRequest(requestId, SessionInputResponseKind.Accept, {
				[questionId]: {
					state: SessionInputAnswerState.Submitted,
					value: { kind: SessionInputAnswerValueKind.Selected, value: 'exit_only' },
				},
			});

			assert.deepStrictEqual(await responsePromise, { approved: true, selectedAction: 'exit_only' });
		});

		test('freeform feedback alongside a selected action becomes a revision request', async () => {
			const { session, waitForSignal } = await createAgentSession(disposables);

			const responsePromise = session.handleExitPlanModeRequest(planRequestParams({ actions: ['autopilot', 'interactive'], recommendedAction: 'interactive' }));
			const signal = await waitForSignal(s => isAction(s, ActionType.SessionInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			session.respondToUserInputRequest(requestId, SessionInputResponseKind.Accept, {
				[questionId]: {
					state: SessionInputAnswerState.Submitted,
					value: {
						kind: SessionInputAnswerValueKind.Selected,
						value: 'interactive',
						freeformValues: ['Please use Python instead of Node.js'],
					},
				},
			});

			assert.deepStrictEqual(await responsePromise, {
				approved: false,
				feedback: 'Please use Python instead of Node.js',
				selectedAction: 'interactive',
			});
		});

		test('selectedAction not in offered actions falls back to recommendedAction', async () => {
			const { session, waitForSignal } = await createAgentSession(disposables);

			const responsePromise = session.handleExitPlanModeRequest(planRequestParams({ actions: ['interactive', 'exit_only'], recommendedAction: 'interactive' }));
			const signal = await waitForSignal(s => isAction(s, ActionType.SessionInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			// SDK only offered `interactive` and `exit_only`; the client
			// somehow sent `autopilot` (e.g. stale UI state). The agent
			// host clamps to `recommendedAction` so the SDK never sees a
			// value it didn't offer.
			session.respondToUserInputRequest(requestId, SessionInputResponseKind.Accept, {
				[questionId]: {
					state: SessionInputAnswerState.Submitted,
					value: { kind: SessionInputAnswerValueKind.Selected, value: 'autopilot' },
				},
			});

			assert.deepStrictEqual(await responsePromise, { approved: true, selectedAction: 'interactive' });
		});

		test('selectedAction not in offered actions and no fallback resolves to approved=false', async () => {
			const { session, waitForSignal } = await createAgentSession(disposables);

			// SDK offered `exit_only` only and recommended a value not in
			// the offered set. The client picked something invalid. With
			// no usable selectedAction and no feedback, decline.
			const responsePromise = session.handleExitPlanModeRequest(planRequestParams({ actions: ['exit_only'], recommendedAction: 'autopilot' }));
			const signal = await waitForSignal(s => isAction(s, ActionType.SessionInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			session.respondToUserInputRequest(requestId, SessionInputResponseKind.Accept, {
				[questionId]: {
					state: SessionInputAnswerState.Submitted,
					value: { kind: SessionInputAnswerValueKind.Selected, value: 'interactive' },
				},
			});

			assert.deepStrictEqual(await responsePromise, { approved: false });
		});

		test('text answer with feedback becomes a revision request without selectedAction', async () => {
			const { session, waitForSignal } = await createAgentSession(disposables);

			const responsePromise = session.handleExitPlanModeRequest(planRequestParams({ actions: ['autopilot', 'interactive'], recommendedAction: 'interactive' }));
			const signal = await waitForSignal(s => isAction(s, ActionType.SessionInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			// The single-select question normally produces a Selected
			// value, but a defensive Text response should still be
			// translated to a revision request when the answer is
			// non-empty (selectedAction falls back to recommendedAction).
			session.respondToUserInputRequest(requestId, SessionInputResponseKind.Accept, {
				[questionId]: {
					state: SessionInputAnswerState.Submitted,
					value: { kind: SessionInputAnswerValueKind.Text, value: 'Add tests for edge cases' },
				},
			});

			assert.deepStrictEqual(await responsePromise, {
				approved: false,
				feedback: 'Add tests for edge cases',
				selectedAction: 'interactive',
			});
		});

		test('whitespace-only freeform feedback is ignored', async () => {
			const { session, waitForSignal } = await createAgentSession(disposables);

			const responsePromise = session.handleExitPlanModeRequest(planRequestParams({ actions: ['autopilot', 'interactive'], recommendedAction: 'interactive' }));
			const signal = await waitForSignal(s => isAction(s, ActionType.SessionInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			session.respondToUserInputRequest(requestId, SessionInputResponseKind.Accept, {
				[questionId]: {
					state: SessionInputAnswerState.Submitted,
					value: {
						kind: SessionInputAnswerValueKind.Selected,
						value: 'interactive',
						freeformValues: ['   ', ''],
					},
				},
			});

			assert.deepStrictEqual(await responsePromise, { approved: true, selectedAction: 'interactive' });
		});

		test('session.mode_changed → plan updates the AHP session config', async () => {
			const { mockSession, sessionConfigUpdates } = await createAgentSession(disposables);

			mockSession.fire('session.mode_changed', { previousMode: 'interactive', newMode: 'plan' } as SessionEventPayload<'session.mode_changed'>['data']);

			assert.deepStrictEqual(sessionConfigUpdates, [
				{ session: 'copilot:/test-session-1', patch: { mode: 'plan' } },
			]);
		});

		test('session.mode_changed → interactive updates the AHP session config', async () => {
			const { mockSession, sessionConfigUpdates } = await createAgentSession(disposables);

			mockSession.fire('session.mode_changed', { previousMode: 'plan', newMode: 'interactive' } as SessionEventPayload<'session.mode_changed'>['data']);

			assert.deepStrictEqual(sessionConfigUpdates, [
				{ session: 'copilot:/test-session-1', patch: { mode: 'interactive' } },
			]);
		});

		test('session.mode_changed → autopilot translates to mode=interactive + autoApprove=autopilot', async () => {
			// The SDK has a first-class `autopilot` mode but AHP exposes it
			// as the `autopilot` value on the orthogonal `autoApprove` axis.
			// The translation is contained in the Copilot agent.
			const { mockSession, sessionConfigUpdates } = await createAgentSession(disposables);

			mockSession.fire('session.mode_changed', { previousMode: 'plan', newMode: 'autopilot' } as SessionEventPayload<'session.mode_changed'>['data']);

			assert.deepStrictEqual(sessionConfigUpdates, [
				{ session: 'copilot:/test-session-1', patch: { mode: 'interactive', autoApprove: 'autopilot' } },
			]);
		});

		test('session.mode_changed for unsupported mode is ignored', async () => {
			const { mockSession, sessionConfigUpdates } = await createAgentSession(disposables);

			mockSession.fire('session.mode_changed', { previousMode: 'interactive', newMode: 'shell' } as SessionEventPayload<'session.mode_changed'>['data']);

			assert.strictEqual(sessionConfigUpdates.length, 0);
		});

		// ---- autopilot fast-path -------------------------------------------

		test('handleExitPlanModeRequest auto-accepts when autoApprove=autopilot (recommended action)', async () => {
			const { session, signals } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.AutoApprove]: 'autopilot' },
			});

			const response = await session.handleExitPlanModeRequest(planRequestParams({
				actions: ['autopilot', 'interactive', 'exit_only'],
				recommendedAction: 'autopilot',
			}));

			assert.deepStrictEqual(response, { approved: true, selectedAction: 'autopilot', autoApproveEdits: true });
			// User-input request should NOT be surfaced to the client.
			assert.strictEqual(signals.filter(s => isAction(s, ActionType.SessionInputRequested)).length, 0);
		});

		test('handleExitPlanModeRequest auto-accepts with priority order when no recommended action available', async () => {
			const { session } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.AutoApprove]: 'autopilot' },
			});

			// SDK proposes a recommended action that's NOT in the offered set —
			// fall back to the priority order (autopilot > autopilot_fleet >
			// interactive > exit_only).
			const response = await session.handleExitPlanModeRequest(planRequestParams({
				actions: ['interactive', 'exit_only'],
				recommendedAction: 'autopilot_fleet',
			}));

			assert.deepStrictEqual(response, { approved: true, selectedAction: 'interactive' });
		});

		test('handleExitPlanModeRequest does NOT auto-accept when autoApprove=default', async () => {
			const { session, waitForSignal } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.AutoApprove]: 'default' },
			});

			const responsePromise = session.handleExitPlanModeRequest(planRequestParams());

			// The user-input request fires — the user must respond.
			const signal = await waitForSignal(s => isAction(s, ActionType.SessionInputRequested));
			session.respondToUserInputRequest(getInputRequest(signal).id, SessionInputResponseKind.Decline);
			await responsePromise;
		});
	});
});
