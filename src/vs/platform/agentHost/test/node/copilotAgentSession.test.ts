/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { CopilotSession, SessionEventPayload } from '@github/copilot-sdk';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService, ILogService } from '../../../log/common/log.js';
import { IFileService } from '../../../files/common/files.js';
import { AgentSession, IAgentProgressEvent } from '../../common/agentService.js';
import { ISessionDatabase, ISessionDataService } from '../../common/sessionDataService.js';
import { CopilotAgentSession } from '../../node/copilot/copilotAgentSession.js';
import { CopilotSessionWrapper } from '../../node/copilot/copilotSessionWrapper.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';

// ---- Mock session wrapper ---------------------------------------------------

/**
 * A mock {@link CopilotSessionWrapper} that lets tests fire SDK events
 * directly via exposed emitters, without needing a real CopilotSession.
 */
class MockCopilotSessionWrapper extends Disposable {
	readonly sessionId = 'test-session-1';

	// Fake CopilotSession with minimal methods needed by CopilotAgentSession
	readonly session = {
		sessionId: 'test-session-1',
		send: async () => { },
		abort: async () => { },
		setModel: async () => { },
		getMessages: async () => [],
		destroy: async () => { },
		on: () => () => { },
	} as unknown as CopilotSession;

	// Emitters that tests can fire into — each matches the lazy event
	// accessor pattern from the real CopilotSessionWrapper.
	private readonly _messageDeltaEmitter = this._register(new Emitter<SessionEventPayload<'assistant.message_delta'>>());
	private readonly _messageEmitter = this._register(new Emitter<SessionEventPayload<'assistant.message'>>());
	private readonly _toolStartEmitter = this._register(new Emitter<SessionEventPayload<'tool.execution_start'>>());
	private readonly _toolCompleteEmitter = this._register(new Emitter<SessionEventPayload<'tool.execution_complete'>>());
	private readonly _turnStartEmitter = this._register(new Emitter<SessionEventPayload<'assistant.turn_start'>>());
	private readonly _idleEmitter = this._register(new Emitter<SessionEventPayload<'session.idle'>>());
	private readonly _errorEmitter = this._register(new Emitter<SessionEventPayload<'session.error'>>());
	private readonly _usageEmitter = this._register(new Emitter<SessionEventPayload<'assistant.usage'>>());
	private readonly _reasoningDeltaEmitter = this._register(new Emitter<SessionEventPayload<'assistant.reasoning_delta'>>());

	get onMessageDelta(): Event<SessionEventPayload<'assistant.message_delta'>> { return this._messageDeltaEmitter.event; }
	get onMessage(): Event<SessionEventPayload<'assistant.message'>> { return this._messageEmitter.event; }
	get onToolStart(): Event<SessionEventPayload<'tool.execution_start'>> { return this._toolStartEmitter.event; }
	get onToolComplete(): Event<SessionEventPayload<'tool.execution_complete'>> { return this._toolCompleteEmitter.event; }
	get onTurnStart(): Event<SessionEventPayload<'assistant.turn_start'>> { return this._turnStartEmitter.event; }
	get onIdle(): Event<SessionEventPayload<'session.idle'>> { return this._idleEmitter.event; }
	get onSessionError(): Event<SessionEventPayload<'session.error'>> { return this._errorEmitter.event; }
	get onUsage(): Event<SessionEventPayload<'assistant.usage'>> { return this._usageEmitter.event; }
	get onReasoningDelta(): Event<SessionEventPayload<'assistant.reasoning_delta'>> { return this._reasoningDeltaEmitter.event; }

	// no-op stubs for logging events — use cached emitters so repeated
	// access returns the same Event and subscriptions are properly tracked.
	private readonly _noop = this._register(new Emitter<any>()).event;
	get onSessionStart() { return this._noop; }
	get onSessionResume() { return this._noop; }
	get onSessionInfo() { return this._noop; }
	get onSessionModelChange() { return this._noop; }
	get onSessionHandoff() { return this._noop; }
	get onSessionTruncation() { return this._noop; }
	get onSessionSnapshotRewind() { return this._noop; }
	get onSessionShutdown() { return this._noop; }
	get onSessionUsageInfo() { return this._noop; }
	get onSessionCompactionStart() { return this._noop; }
	get onSessionCompactionComplete() { return this._noop; }
	get onUserMessage() { return this._noop; }
	get onPendingMessagesModified() { return this._noop; }
	get onIntent() { return this._noop; }
	get onReasoning() { return this._noop; }
	get onTurnEnd() { return this._noop; }
	get onAbort() { return this._noop; }
	get onToolUserRequested() { return this._noop; }
	get onToolPartialResult() { return this._noop; }
	get onToolProgress() { return this._noop; }
	get onSkillInvoked() { return this._noop; }
	get onSubagentStarted() { return this._noop; }
	get onSubagentCompleted() { return this._noop; }
	get onSubagentFailed() { return this._noop; }
	get onSubagentSelected() { return this._noop; }
	get onHookStart() { return this._noop; }
	get onHookEnd() { return this._noop; }
	get onSystemMessage() { return this._noop; }

	// Fire helpers for tests
	fireToolStart(data: SessionEventPayload<'tool.execution_start'>['data']): void {
		this._toolStartEmitter.fire({ type: 'tool.execution_start', data } as SessionEventPayload<'tool.execution_start'>);
	}

	fireToolComplete(data: SessionEventPayload<'tool.execution_complete'>['data']): void {
		this._toolCompleteEmitter.fire({ type: 'tool.execution_complete', data } as SessionEventPayload<'tool.execution_complete'>);
	}

	fireTurnStart(data: SessionEventPayload<'assistant.turn_start'>['data']): void {
		this._turnStartEmitter.fire({ type: 'assistant.turn_start', data } as SessionEventPayload<'assistant.turn_start'>);
	}

	fireIdle(): void {
		this._idleEmitter.fire({ type: 'session.idle', data: {} } as SessionEventPayload<'session.idle'>);
	}

	fireMessage(data: SessionEventPayload<'assistant.message'>['data']): void {
		this._messageEmitter.fire({ type: 'assistant.message', data } as SessionEventPayload<'assistant.message'>);
	}

	fireMessageDelta(data: SessionEventPayload<'assistant.message_delta'>['data']): void {
		this._messageDeltaEmitter.fire({ type: 'assistant.message_delta', data } as SessionEventPayload<'assistant.message_delta'>);
	}

	fireError(data: SessionEventPayload<'session.error'>['data']): void {
		this._errorEmitter.fire({ type: 'session.error', data } as SessionEventPayload<'session.error'>);
	}
}

// ---- Helpers ----------------------------------------------------------------

function createMockSessionDataService(): ISessionDataService {
	const mockDb: ISessionDatabase = {
		createTurn: async () => { },
		deleteTurn: async () => { },
		storeFileEdit: async () => { },
		getFileEdits: async () => [],
		readFileEditContent: async () => undefined,
		close: async () => { },
		dispose: () => { },
	};
	return {
		_serviceBrand: undefined,
		getSessionDataDir: () => URI.from({ scheme: 'test', path: '/data' }),
		getSessionDataDirById: () => URI.from({ scheme: 'test', path: '/data' }),
		openDatabase: () => ({ object: mockDb, dispose: () => { } }),
		deleteSessionData: async () => { },
		cleanupOrphanedData: async () => { },
	};
}

function createAgentSession(disposables: DisposableStore, options?: { workingDirectory?: string }): {
	session: CopilotAgentSession;
	wrapper: MockCopilotSessionWrapper;
	progressEvents: IAgentProgressEvent[];
} {
	const progressEmitter = disposables.add(new Emitter<IAgentProgressEvent>());
	const progressEvents: IAgentProgressEvent[] = [];
	disposables.add(progressEmitter.event(e => progressEvents.push(e)));

	const sessionUri = AgentSession.uri('copilot', 'test-session-1');

	const services = new ServiceCollection();
	services.set(ILogService, new NullLogService());
	services.set(IFileService, { _serviceBrand: undefined } as IFileService);
	services.set(ISessionDataService, createMockSessionDataService());
	const instantiationService = disposables.add(new InstantiationService(services));

	const session = disposables.add(instantiationService.createInstance(
		CopilotAgentSession,
		sessionUri,
		'test-session-1',
		options?.workingDirectory,
		progressEmitter,
	));

	const wrapper = new MockCopilotSessionWrapper();
	session._initializeWithWrapper(wrapper as unknown as CopilotSessionWrapper);

	return { session, wrapper, progressEvents };
}

// ---- Tests ------------------------------------------------------------------

suite('CopilotAgentSession', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- permission handling ----

	suite('permission handling', () => {

		test('auto-approves read inside working directory', async () => {
			const { session } = createAgentSession(disposables, { workingDirectory: '/workspace' });
			const result = await session.handlePermissionRequest({
				kind: 'read',
				path: '/workspace/src/file.ts',
				toolCallId: 'tc-1',
			});
			assert.strictEqual(result.kind, 'approved');
		});

		test('does not auto-approve read outside working directory', async () => {
			const { session, progressEvents } = createAgentSession(disposables, { workingDirectory: '/workspace' });

			// Kick off permission request but don't await — it will block
			const resultPromise = session.handlePermissionRequest({
				kind: 'read',
				path: '/other/file.ts',
				toolCallId: 'tc-2',
			});

			// Should have fired a tool_ready event
			assert.strictEqual(progressEvents.length, 1);
			assert.strictEqual(progressEvents[0].type, 'tool_ready');

			// Respond to it
			assert.ok(session.respondToPermissionRequest('tc-2', true));
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'approved');
		});

		test('denies permission when no toolCallId', async () => {
			const { session } = createAgentSession(disposables);
			const result = await session.handlePermissionRequest({ kind: 'write' });
			assert.strictEqual(result.kind, 'denied-interactively-by-user');
		});

		test('denied-interactively when user denies', async () => {
			const { session, progressEvents } = createAgentSession(disposables);
			const resultPromise = session.handlePermissionRequest({
				kind: 'shell',
				toolCallId: 'tc-3',
			});

			assert.strictEqual(progressEvents.length, 1);
			session.respondToPermissionRequest('tc-3', false);
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'denied-interactively-by-user');
		});

		test('pending permissions are denied on dispose', async () => {
			const { session } = createAgentSession(disposables);
			const resultPromise = session.handlePermissionRequest({
				kind: 'write',
				toolCallId: 'tc-4',
			});

			session.dispose();
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'denied-interactively-by-user');
		});

		test('pending permissions are denied on abort', async () => {
			const { session } = createAgentSession(disposables);
			const resultPromise = session.handlePermissionRequest({
				kind: 'write',
				toolCallId: 'tc-5',
			});

			await session.abort();
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'denied-interactively-by-user');
		});

		test('respondToPermissionRequest returns false for unknown id', () => {
			const { session } = createAgentSession(disposables);
			assert.strictEqual(session.respondToPermissionRequest('unknown-id', true), false);
		});
	});

	// ---- event mapping ----

	suite('event mapping', () => {

		test('tool_start event is mapped for non-hidden tools', () => {
			const { wrapper, progressEvents } = createAgentSession(disposables);
			wrapper.fireToolStart({
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

		test('hidden tools are not emitted as tool_start', () => {
			const { wrapper, progressEvents } = createAgentSession(disposables);
			wrapper.fireToolStart({
				toolCallId: 'tc-11',
				toolName: 'report_intent',
			} as SessionEventPayload<'tool.execution_start'>['data']);

			assert.strictEqual(progressEvents.length, 0);
		});

		test('tool_complete event produces past-tense message', () => {
			const { wrapper, progressEvents } = createAgentSession(disposables);

			// First fire tool_start so it's tracked
			wrapper.fireToolStart({
				toolCallId: 'tc-12',
				toolName: 'bash',
				arguments: { command: 'ls' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			// Then fire complete
			wrapper.fireToolComplete({
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

		test('tool_complete for untracked tool is ignored', () => {
			const { wrapper, progressEvents } = createAgentSession(disposables);
			wrapper.fireToolComplete({
				toolCallId: 'tc-untracked',
				success: true,
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			assert.strictEqual(progressEvents.length, 0);
		});

		test('idle event is forwarded', () => {
			const { wrapper, progressEvents } = createAgentSession(disposables);
			wrapper.fireIdle();

			assert.strictEqual(progressEvents.length, 1);
			assert.strictEqual(progressEvents[0].type, 'idle');
		});

		test('error event is forwarded', () => {
			const { wrapper, progressEvents } = createAgentSession(disposables);
			wrapper.fireError({
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

		test('message delta is forwarded', () => {
			const { wrapper, progressEvents } = createAgentSession(disposables);
			wrapper.fireMessageDelta({
				messageId: 'msg-1',
				deltaContent: 'Hello ',
			} as SessionEventPayload<'assistant.message_delta'>['data']);

			assert.strictEqual(progressEvents.length, 1);
			assert.strictEqual(progressEvents[0].type, 'delta');
			if (progressEvents[0].type === 'delta') {
				assert.strictEqual(progressEvents[0].content, 'Hello ');
			}
		});

		test('complete message with tool requests is forwarded', () => {
			const { wrapper, progressEvents } = createAgentSession(disposables);
			wrapper.fireMessage({
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
});
