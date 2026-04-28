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
import { AgentSession, IAgentProgressEvent, IAgentUserInputRequestEvent } from '../../common/agentService.js';
import { IDiffComputeService } from '../../common/diffComputeService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { AttachmentType, SessionInputAnswerState, SessionInputAnswerValueKind, SessionInputQuestionKind, SessionInputResponseKind, ToolResultContentType } from '../../common/state/sessionState.js';
import { CopilotAgentSession, IActiveClientSnapshot, SessionWrapperFactory } from '../../node/copilot/copilotAgentSession.js';
import { CopilotSessionWrapper } from '../../node/copilot/copilotSessionWrapper.js';
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

	private readonly _handlers = new Map<string, Set<(event: SessionEvent) => void>>();

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
	_onDidSessionProgress: { fire(event: IAgentProgressEvent): void };
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

async function createAgentSession(disposables: DisposableStore, options?: {
	clientSnapshot?: IActiveClientSnapshot;
	environmentServiceRegistration?: 'native' | 'none';
	logService?: ILogService;
	captureWrapperCallbacks?: { current?: Parameters<SessionWrapperFactory>[0] };
	workingDirectory?: URI;
}): Promise<{
	session: CopilotAgentSession;
	mockSession: MockCopilotSession;
	progressEvents: IAgentProgressEvent[];
	waitForProgress: (predicate: (event: IAgentProgressEvent) => boolean) => Promise<IAgentProgressEvent>;
}> {
	const progressEmitter = disposables.add(new Emitter<IAgentProgressEvent>());
	const progressEvents: IAgentProgressEvent[] = [];
	const waiters: { predicate: (event: IAgentProgressEvent) => boolean; deferred: DeferredPromise<IAgentProgressEvent> }[] = [];
	disposables.add(progressEmitter.event(e => {
		progressEvents.push(e);
		for (let i = waiters.length - 1; i >= 0; i--) {
			if (waiters[i].predicate(e)) {
				const { deferred } = waiters[i];
				waiters.splice(i, 1);
				deferred.complete(e);
			}
		}
	}));

	const waitForProgress = (predicate: (event: IAgentProgressEvent) => boolean): Promise<IAgentProgressEvent> => {
		const existing = progressEvents.find(predicate);
		if (existing) {
			return Promise.resolve(existing);
		}
		const deferred = new DeferredPromise<IAgentProgressEvent>();
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
	const environmentService = {
		_serviceBrand: undefined,
		userHome: URI.file('/mock-home'),
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

	return { session, mockSession, progressEvents, waitForProgress };
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
			const { session, progressEvents, waitForProgress } = await createAgentSession(disposables);
			const resultPromise = session.handlePermissionRequest({
				kind: 'read',
				path: '/workspace/src/file.ts',
				toolCallId: 'tc-1',
			});

			await waitForProgress(e => e.type === 'tool_ready');
			assert.strictEqual(progressEvents.length, 1);

			assert.ok(session.respondToPermissionRequest('tc-1', true));
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'approved');
		});

		test('auto-approves read permission for session-state plan files', async () => {
			const previousXdgStateHome = process.env['XDG_STATE_HOME'];
			process.env['XDG_STATE_HOME'] = '/mock-state-home';
			try {
				const { session, progressEvents } = await createAgentSession(disposables);
				const result = await session.handlePermissionRequest({
					kind: 'read',
					path: join('/mock-state-home', '.copilot', 'session-state', 'test-session-1', 'plan.md'),
					toolCallId: 'tc-read-plan',
				});

				assert.strictEqual(result.kind, 'approved');
				assert.strictEqual(progressEvents.length, 0);
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
				const { session, progressEvents } = await createAgentSession(disposables, { environmentServiceRegistration: 'native' });
				const result = await session.handlePermissionRequest({
					kind: 'read',
					path: join('/mock-home', '.copilot', 'session-state', 'test-session-1', 'plan.md'),
					toolCallId: 'tc-read-plan-native-env',
				});

				assert.strictEqual(result.kind, 'approved');
				assert.strictEqual(progressEvents.length, 0);
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
			const { session, progressEvents, waitForProgress } = await createAgentSession(disposables);
			const resultPromise = session.handlePermissionRequest({
				kind: 'write',
				fileName: '/workspace/src/file.ts',
				toolCallId: 'tc-1',
			});

			await waitForProgress(e => e.type === 'tool_ready');
			assert.strictEqual(progressEvents.length, 1);

			assert.ok(session.respondToPermissionRequest('tc-1', true));
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'approved');
		});

		test('auto-approves write permission for session-state plan files', async () => {
			const previousXdgStateHome = process.env['XDG_STATE_HOME'];
			process.env['XDG_STATE_HOME'] = '/mock-state-home';
			try {
				const { session, progressEvents } = await createAgentSession(disposables);
				const result = await session.handlePermissionRequest({
					kind: 'write',
					fileName: join('/mock-state-home', '.copilot', 'session-state', 'test-session-1', 'plan.md'),
					toolCallId: 'tc-write-plan',
				});

				assert.strictEqual(result.kind, 'approved');
				assert.strictEqual(progressEvents.length, 0);
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
				const { session, progressEvents, waitForProgress } = await createAgentSession(disposables);
				const resultPromise = session.handlePermissionRequest({
					kind: 'write',
					fileName: join('/mock-state-home', '.copilot', 'session-state', 'different-session', 'plan.md'),
					toolCallId: 'tc-write-other-plan',
				});

				await waitForProgress(e => e.type === 'tool_ready');
				assert.strictEqual(progressEvents.length, 1);

				assert.ok(session.respondToPermissionRequest('tc-write-other-plan', true));
				const result = await resultPromise;
				assert.strictEqual(result.kind, 'approved');
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
				const { session, progressEvents, waitForProgress } = await createAgentSession(disposables);
				const sessionDir = join('/mock-state-home', '.copilot', 'session-state', 'test-session-1');
				const resultPromise = session.handlePermissionRequest({
					kind: 'write',
					fileName: `${sessionDir}${sep}..${sep}outside.md`,
					toolCallId: 'tc-write-traversal',
				});

				await waitForProgress(e => e.type === 'tool_ready');
				assert.strictEqual(progressEvents.length, 1);

				assert.ok(session.respondToPermissionRequest('tc-write-traversal', true));
				const result = await resultPromise;
				assert.strictEqual(result.kind, 'approved');
			} finally {
				if (previousXdgStateHome === undefined) {
					delete process.env['XDG_STATE_HOME'];
				} else {
					process.env['XDG_STATE_HOME'] = previousXdgStateHome;
				}
			}
		});

		test('write permission outside working directory fires tool_ready', async () => {
			const { session, progressEvents, waitForProgress } = await createAgentSession(disposables);

			const resultPromise = session.handlePermissionRequest({
				kind: 'write',
				fileName: '/other/file.ts',
				toolCallId: 'tc-write-outside',
			});

			await waitForProgress(e => e.type === 'tool_ready');
			assert.strictEqual(progressEvents.length, 1);

			assert.ok(session.respondToPermissionRequest('tc-write-outside', true));
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'approved');
		});

		test('read permission outside working directory fires tool_ready', async () => {
			const { session, progressEvents, waitForProgress } = await createAgentSession(disposables);

			// Kick off permission request but don't await — it will block
			const resultPromise = session.handlePermissionRequest({
				kind: 'read',
				path: '/other/file.ts',
				toolCallId: 'tc-2',
			});

			// Should have fired a tool_ready event
			await waitForProgress(e => e.type === 'tool_ready');
			assert.strictEqual(progressEvents.length, 1);

			// Respond to it
			assert.ok(session.respondToPermissionRequest('tc-2', true));
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'approved');
		});

		test('denies permission when no toolCallId', async () => {
			const { session } = await createAgentSession(disposables);
			const result = await session.handlePermissionRequest({ kind: 'write' });
			assert.strictEqual(result.kind, 'denied-interactively-by-user');
		});

		test('denied-interactively when user denies', async () => {
			const { session, progressEvents, waitForProgress } = await createAgentSession(disposables);
			const resultPromise = session.handlePermissionRequest({
				kind: 'shell',
				toolCallId: 'tc-3',
			});

			await waitForProgress(e => e.type === 'tool_ready');
			assert.strictEqual(progressEvents.length, 1);
			session.respondToPermissionRequest('tc-3', false);
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'denied-interactively-by-user');
		});

		test('pending permissions are denied on dispose', async () => {
			const { session } = await createAgentSession(disposables);
			const resultPromise = session.handlePermissionRequest({
				kind: 'write',
				toolCallId: 'tc-4',
			});

			session.dispose();
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'denied-interactively-by-user');
		});

		test('pending permissions are denied on abort', async () => {
			const { session } = await createAgentSession(disposables);
			const resultPromise = session.handlePermissionRequest({
				kind: 'write',
				toolCallId: 'tc-5',
			});

			await session.abort();
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'denied-interactively-by-user');
		});

		test('respondToPermissionRequest returns false for unknown id', async () => {
			const { session } = await createAgentSession(disposables);
			assert.strictEqual(session.respondToPermissionRequest('unknown-id', true), false);
		});
	});

	// ---- sendSteering ----

	suite('sendSteering', () => {

		test('fires steering_consumed after send resolves', async () => {
			const { session, progressEvents } = await createAgentSession(disposables);

			await session.sendSteering({ id: 'steer-1', userMessage: { text: 'focus on tests' } });

			const consumed = progressEvents.find(e => e.type === 'steering_consumed');
			assert.ok(consumed, 'should fire steering_consumed event');
			assert.strictEqual((consumed as { id: string }).id, 'steer-1');
		});

		test('does not fire steering_consumed when send fails', async () => {
			const { session, mockSession, progressEvents } = await createAgentSession(disposables);

			mockSession.send = async () => { throw new Error('send failed'); };

			await session.sendSteering({ id: 'steer-fail', userMessage: { text: 'will fail' } });

			const consumed = progressEvents.find(e => e.type === 'steering_consumed');
			assert.strictEqual(consumed, undefined, 'should not fire steering_consumed on failure');
		});
	});

	// ---- event mapping ----

	suite('event mapping', () => {

		test('tool_start event is mapped for non-hidden tools', async () => {
			const { mockSession, progressEvents } = await createAgentSession(disposables);
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-10',
				toolName: 'bash',
				arguments: { command: 'echo hello' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			assert.strictEqual(progressEvents.length, 1);
			assert.strictEqual(progressEvents[0].type, 'tool_start');
			if (progressEvents[0].type === 'tool_start') {
				assert.strictEqual(progressEvents[0].toolCallId, 'tc-10');
				assert.strictEqual(progressEvents[0].toolName, 'bash');
			}
		});

		test('live tool_start strips redundant cd prefix matching workingDirectory', async () => {
			const wd = URI.file('/repo/project');
			const { mockSession, progressEvents } = await createAgentSession(disposables, { workingDirectory: wd });
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-cd',
				toolName: 'bash',
				arguments: { command: 'cd /repo/project && npm test' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			assert.strictEqual(progressEvents.length, 1);
			const ev = progressEvents[0];
			assert.strictEqual(ev.type, 'tool_start');
			if (ev.type === 'tool_start') {
				assert.strictEqual(ev.toolInput, 'npm test');
				assert.ok(ev.toolArguments && ev.toolArguments.includes('"npm test"'), `toolArguments should contain rewritten command, was: ${ev.toolArguments}`);
				assert.ok(!ev.toolArguments?.includes('cd /repo/project'), 'toolArguments should not contain stripped prefix');
			}
		});

		test('live tool_complete past-tense message reflects the rewritten command', async () => {
			const wd = URI.file('/repo/project');
			const { mockSession, progressEvents } = await createAgentSession(disposables, { workingDirectory: wd });

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

			assert.strictEqual(progressEvents.length, 2);
			const completeEv = progressEvents[1];
			assert.strictEqual(completeEv.type, 'tool_complete');
			if (completeEv.type === 'tool_complete') {
				const past = completeEv.result.pastTenseMessage;
				const pastStr = typeof past === 'string' ? past : (past?.markdown ?? '');
				assert.ok(!pastStr.includes('cd /repo/project'), `past-tense message should not contain stripped prefix, got: ${pastStr}`);
				assert.ok(pastStr.includes('npm test'), `past-tense message should contain the rewritten command, got: ${pastStr}`);
			}
		});

		test('live tool_start does not rewrite when cd target differs from workingDirectory', async () => {
			const wd = URI.file('/repo/project');
			const { mockSession, progressEvents } = await createAgentSession(disposables, { workingDirectory: wd });
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-cd-other',
				toolName: 'bash',
				arguments: { command: 'cd /tmp && ls' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			assert.strictEqual(progressEvents.length, 1);
			const ev = progressEvents[0];
			assert.strictEqual(ev.type, 'tool_start');
			if (ev.type === 'tool_start') {
				assert.strictEqual(ev.toolInput, 'cd /tmp && ls');
			}
		});

		test('live tool_start without workingDirectory passes command through', async () => {
			const { mockSession, progressEvents } = await createAgentSession(disposables);
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-cd-nowd',
				toolName: 'bash',
				arguments: { command: 'cd /repo/project && npm test' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			assert.strictEqual(progressEvents.length, 1);
			const ev = progressEvents[0];
			assert.strictEqual(ev.type, 'tool_start');
			if (ev.type === 'tool_start') {
				assert.strictEqual(ev.toolInput, 'cd /repo/project && npm test');
			}
		});

		test('hidden tools are not emitted as tool_start', async () => {
			const { mockSession, progressEvents } = await createAgentSession(disposables);
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-11',
				toolName: 'report_intent',
			} as SessionEventPayload<'tool.execution_start'>['data']);

			assert.strictEqual(progressEvents.length, 0);
		});

		test('tool_complete event produces past-tense message', async () => {
			const { mockSession, progressEvents } = await createAgentSession(disposables);

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

			assert.strictEqual(progressEvents.length, 2);
			assert.strictEqual(progressEvents[1].type, 'tool_complete');
			if (progressEvents[1].type === 'tool_complete') {
				assert.strictEqual(progressEvents[1].toolCallId, 'tc-12');
				assert.ok(progressEvents[1].result.success);
				assert.ok(progressEvents[1].result.pastTenseMessage);
			}
		});

		test('tool_complete for untracked tool is ignored', async () => {
			const { mockSession, progressEvents } = await createAgentSession(disposables);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-untracked',
				success: true,
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			assert.strictEqual(progressEvents.length, 0);
		});

		test('idle event is forwarded', async () => {
			const { mockSession, progressEvents } = await createAgentSession(disposables);
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			assert.strictEqual(progressEvents.length, 1);
			assert.strictEqual(progressEvents[0].type, 'idle');
		});

		test('error event is forwarded', async () => {
			const { mockSession, progressEvents } = await createAgentSession(disposables);
			mockSession.fire('session.error', {
				errorType: 'TestError',
				message: 'something went wrong',
				stack: 'Error: something went wrong',
			} as SessionEventPayload<'session.error'>['data']);

			assert.strictEqual(progressEvents.length, 1);
			assert.strictEqual(progressEvents[0].type, 'error');
			if (progressEvents[0].type === 'error') {
				assert.strictEqual(progressEvents[0].errorType, 'TestError');
				assert.strictEqual(progressEvents[0].message, 'something went wrong');
			}
		});

		test('message delta is forwarded', async () => {
			const { mockSession, progressEvents } = await createAgentSession(disposables);
			mockSession.fire('assistant.message_delta', {
				messageId: 'msg-1',
				deltaContent: 'Hello ',
			} as SessionEventPayload<'assistant.message_delta'>['data']);

			assert.strictEqual(progressEvents.length, 1);
			assert.strictEqual(progressEvents[0].type, 'delta');
			if (progressEvents[0].type === 'delta') {
				assert.strictEqual(progressEvents[0].content, 'Hello ');
			}
		});

		test('complete message with tool requests is forwarded', async () => {
			const { mockSession, progressEvents } = await createAgentSession(disposables);
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

			assert.strictEqual(progressEvents.length, 1);
			assert.strictEqual(progressEvents[0].type, 'message');
			if (progressEvents[0].type === 'message') {
				assert.strictEqual(progressEvents[0].content, 'Let me help you.');
				assert.strictEqual(progressEvents[0].toolRequests?.length, 1);
				assert.strictEqual(progressEvents[0].toolRequests?.[0].toolCallId, 'tc-20');
			}
		});
	});

	// ---- user input handling ----

	suite('user input handling', () => {

		function assertUserInputEvent(event: IAgentProgressEvent): asserts event is IAgentUserInputRequestEvent {
			assert.strictEqual(event.type, 'user_input_request');
		}

		test('handleUserInputRequest fires user_input_request progress event', async () => {
			const { session, progressEvents } = await createAgentSession(disposables);

			// Start the request (don't await — it blocks waiting for response)
			const resultPromise = session.handleUserInputRequest(
				{ question: 'What is your name?' },
				{ sessionId: 'test-session-1' }
			);

			// Verify progress event was fired
			assert.strictEqual(progressEvents.length, 1);
			const event = progressEvents[0];
			assertUserInputEvent(event);
			const requestId = event.request.id;
			assert.ok(event.request.questions);
			assert.strictEqual(event.request.questions[0].message, 'What is your name?');
			const questionId = event.request.questions[0].id;

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
			const { session, progressEvents } = await createAgentSession(disposables);

			const resultPromise = session.handleUserInputRequest(
				{ question: 'Pick a color', choices: ['red', 'blue', 'green'] },
				{ sessionId: 'test-session-1' }
			);

			assert.strictEqual(progressEvents.length, 1);
			const event = progressEvents[0];
			assertUserInputEvent(event);
			assert.ok(event.request.questions);
			assert.strictEqual(event.request.questions.length, 1);
			assert.strictEqual(event.request.questions[0].kind, SessionInputQuestionKind.SingleSelect);
			if (event.request.questions[0].kind === SessionInputQuestionKind.SingleSelect) {
				assert.strictEqual(event.request.questions[0].options.length, 3);
				assert.strictEqual(event.request.questions[0].options[0].label, 'red');
			}

			// Respond with a selected choice
			const questions = event.request.questions;
			session.respondToUserInputRequest(event.request.id, SessionInputResponseKind.Accept, {
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
			const { session, progressEvents } = await createAgentSession(disposables);

			const resultPromise = session.handleUserInputRequest(
				{ question: 'Cancel me' },
				{ sessionId: 'test-session-1' }
			);

			const event = progressEvents[0];
			assertUserInputEvent(event);
			session.respondToUserInputRequest(event.request.id, SessionInputResponseKind.Cancel);

			const result = await resultPromise;
			assert.strictEqual(result.answer, '');
			assert.strictEqual(result.wasFreeform, true);
		});

		test('respondToUserInputRequest returns false for unknown id', async () => {
			const { session } = await createAgentSession(disposables);
			assert.strictEqual(session.respondToUserInputRequest('unknown-id', SessionInputResponseKind.Accept), false);
		});

		test('handleUserInputRequest returns empty answer on skipped question', async () => {
			const { session, progressEvents } = await createAgentSession(disposables);

			const resultPromise = session.handleUserInputRequest(
				{ question: 'Skip me' },
				{ sessionId: 'test-session-1' }
			);

			const event = progressEvents[0];
			assertUserInputEvent(event);
			const questionId = event.request.questions![0].id;
			session.respondToUserInputRequest(event.request.id, SessionInputResponseKind.Accept, {
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
			const { session, mockSession, progressEvents } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			// SDK emits tool.execution_start — tool_start fires immediately
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-client-1',
				toolName: 'my_tool',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);

			// tool_start fires immediately
			assert.strictEqual(progressEvents.filter(e => e.type === 'tool_start').length, 1);
			if (progressEvents[0].type === 'tool_start') {
				assert.strictEqual(progressEvents[0].toolClientId, 'test-client');
			}

			// SDK invokes the handler — it creates a deferred and waits,
			// but does NOT fire tool_ready (that comes from the permission flow).
			const tools = session.createClientSdkTools();
			const handlerPromise = invokeClientToolHandler(tools[0], 'tc-client-1', { file: 'test.ts' });

			// No tool_ready should have been emitted by the handler
			assert.strictEqual(progressEvents.filter(e => e.type === 'tool_ready').length, 0);

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
			const { session, mockSession, progressEvents, waitForProgress } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			// SDK emits tool.execution_start — tool_start fires immediately
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-client-perm',
				toolName: 'my_tool',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);

			// tool_start fired, no tool_ready yet
			assert.strictEqual(progressEvents.filter(e => e.type === 'tool_start').length, 1);
			assert.strictEqual(progressEvents.filter(e => e.type === 'tool_ready').length, 0);

			// Permission request fires — tool_ready from permission flow.
			const resultPromise = session.handlePermissionRequest({
				kind: 'custom-tool',
				toolCallId: 'tc-client-perm',
				toolName: 'my_tool',
			});

			// tool_ready from permission flow should have fired (with confirmationTitle)
			await waitForProgress(e => e.type === 'tool_ready');
			const permissionReady = progressEvents.filter(e => e.type === 'tool_ready');
			assert.strictEqual(permissionReady.length, 1);
			if (permissionReady[0].type === 'tool_ready') {
				assert.strictEqual(permissionReady[0].toolCallId, 'tc-client-perm');
				assert.ok(permissionReady[0].confirmationTitle);
			}

			const tools = session.createClientSdkTools();
			const handlerPromise = invokeClientToolHandler(tools[0], 'tc-client-perm');

			// The handler should NOT emit its own tool_ready — only the
			// permission flow fires tool_ready for client tools.
			assert.strictEqual(progressEvents.filter(e => e.type === 'tool_ready').length, 1, 'handler should not emit a second tool_ready');

			// Approve and clean up
			session.respondToPermissionRequest('tc-client-perm', true);
			const permResult = await resultPromise;
			assert.strictEqual(permResult.kind, 'approved');
			session.handleClientToolCallComplete('tc-client-perm', {
				success: true,
				pastTenseMessage: 'did it',
			});
			await handlerPromise;
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
			const { session, mockSession, progressEvents, waitForProgress } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-ready-data',
				toolName: 'my_tool',
				arguments: { file: 'test.ts' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			// tool_start should have fired
			assert.strictEqual(progressEvents.filter(e => e.type === 'tool_start').length, 1);

			// Permission before the handler should produce only the confirmation
			// tool_ready, not a synthetic auto-ready.
			const resultPromise = session.handlePermissionRequest({
				kind: 'custom-tool',
				toolCallId: 'tc-ready-data',
				toolName: 'my_tool',
			});

			await waitForProgress(e => e.type === 'tool_ready');
			const toolReadys = progressEvents.filter(e => e.type === 'tool_ready');
			assert.strictEqual(toolReadys.length, 1);
			if (toolReadys[0].type === 'tool_ready') {
				assert.ok(toolReadys[0].confirmationTitle);
			}

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
});
