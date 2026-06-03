/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotSession, SessionEvent, SessionEventPayload, SessionEventType, Tool, ToolResultObject, TypedSessionEventHandler } from '@github/copilot-sdk';
import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
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
import type { ClassifiedEvent, IGDPRProperty, OmitMetadata, StrictPropertyCheck } from '../../../telemetry/common/gdprTypings.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../telemetry/common/telemetryUtils.js';
import { AgentSession, type AgentSignal, type IAgentActionSignal, type IAgentToolPendingConfirmationSignal } from '../../common/agentService.js';
import { IDiffComputeService } from '../../common/diffComputeService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { ActionType, type SessionDeltaAction, type SessionErrorAction, type SessionInputRequestedAction, type SessionResponsePartAction, type SessionToolCallCompleteAction, type SessionToolCallReadyAction, type SessionToolCallStartAction } from '../../common/state/sessionActions.js';
import { MessageAttachmentKind, MessageKind, ResponsePartKind, SessionInputAnswerState, SessionInputAnswerValueKind, SessionInputQuestionKind, SessionInputResponseKind, ToolCallStatus, ToolResultContentType, type ToolResultFileEditContent } from '../../common/state/sessionState.js';
import { CopilotAgentSession, IActiveClientSnapshot, SessionWrapperFactory } from '../../node/copilot/copilotAgentSession.js';
import { CopilotSessionWrapper } from '../../node/copilot/copilotSessionWrapper.js';
import { buildCopilotSystemNotification } from '../../node/copilot/copilotSystemNotification.js';
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
	messages: SessionEvent[] = [];

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
	fire<K extends SessionEventType>(type: K, data: SessionEventPayload<K>['data'], overrides?: Partial<Omit<SessionEventPayload<K>, 'type' | 'data'>>): void {
		const event = { type, data, id: 'evt-1', timestamp: new Date().toISOString(), parentId: null, ...overrides } as SessionEventPayload<K>;
		const set = this._handlers.get(type);
		if (set) {
			for (const handler of set) {
				handler(event);
			}
		}
	}

	// Stubs for methods the wrapper / session class calls
	async send(request: unknown) {
		this.sendRequests.push(request);
		return `message-${this.sendRequests.length}`;
	}
	async abort() { }
	async setModel() { }
	async getEvents(): Promise<SessionEvent[]> { return this.messages; }
	async disconnect() { }

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
	readonly warnings: Array<{ message: string; args: unknown[] }> = [];

	override error(message: string | Error, ...args: unknown[]): void {
		this.errors.push({ first: message, args });
		super.error(message, ...args);
	}

	override warn(message: string, ...args: unknown[]): void {
		this.warnings.push({ message, args });
		super.warn(message, ...args);
	}
}

class RecordingTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;
	readonly telemetryLevel = TelemetryLevel.NONE;
	readonly sessionId = 'someValue.sessionId';
	readonly machineId = 'someValue.machineId';
	readonly sqmId = 'someValue.sqmId';
	readonly devDeviceId = 'someValue.devDeviceId';
	readonly firstSessionDate = 'someValue.firstSessionDate';
	readonly sendErrorTelemetry = false;
	readonly events: Array<{ eventName: string; data: unknown }> = [];

	publicLog(): void { }

	publicLog2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>): void {
		this.events.push({ eventName, data });
	}

	publicLogError(): void { }

	publicLogError2(): void { }

	setExperimentProperty(): void { }

	setCommonProperty(): void { }
}

// ---- Helpers ----------------------------------------------------------------

/**
 * Invokes a client-SDK tool's handler with the minimal fields the SDK
 * contract requires, and narrows the `unknown` return type to
 * {@link ToolResultObject} — which is what {@link CopilotAgentSession}'s
 * handler implementation actually returns.
 */
function invokeClientToolHandler(tool: Pick<Tool, 'name' | 'handler'>, toolCallId: string, args: Record<string, unknown> = {}): Promise<ToolResultObject> {
	return Promise.resolve(tool.handler!(args, {
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
		takeCompletedEdit(turnId: string, toolCallId: string, path: string): Promise<ToolResultFileEditContent | undefined>;
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

function getActions(signals: readonly AgentSignal[]) {
	return signals
		.filter((s): s is IAgentActionSignal => s.kind === 'action')
		.map(s => s.action);
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
	telemetryService?: ITelemetryService;
	captureWrapperCallbacks?: { current?: Parameters<SessionWrapperFactory>[0] };
	workingDirectory?: URI;
	/** Per-key effective config values returned by the fake configuration service. */
	configValues?: Record<string, unknown>;
	fileContents?: Record<string, string>;
	fileReadErrors?: readonly string[];
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
	services.set(ITelemetryService, options?.telemetryService ?? new NullTelemetryServiceShape());
	services.set(IFileService, {
		_serviceBrand: undefined,
		readFile: async (resource: URI) => {
			if (options?.fileReadErrors?.includes(resource.toString()) || options?.fileReadErrors?.includes(resource.fsPath)) {
				throw new Error('read failed');
			}
			return { value: VSBuffer.fromString(options?.fileContents?.[resource.toString()] ?? options?.fileContents?.[resource.fsPath] ?? '') };
		},
	} as Partial<IFileService> as IFileService);
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
		const fileUri = URI.file('/workspace/file.ts');
		const selectionUri = URI.file('/workspace/selection.ts');
		const { session, mockSession } = await createAgentSession(disposables, {
			fileContents: {
				[selectionUri.toString()]: 'alpha\nbeta\n012selected text345\nomega',
			},
		});

		await session.send('hello', [
			{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: 'file.ts', displayKind: 'document' },
			{
				type: MessageAttachmentKind.Resource,
				uri: selectionUri.toString(),
				label: 'selection.ts',
				displayKind: 'selection',
				selection: {
					range: {
						start: { line: 2, character: 3 },
						end: { line: 2, character: 16 },
					},
				},
			},
		]);

		assert.deepStrictEqual(mockSession.sendRequests, [{
			prompt: 'hello',
			attachments: [
				{ type: 'file', path: fileUri.fsPath, displayName: 'file.ts' },
				{
					type: 'selection',
					filePath: selectionUri.fsPath,
					displayName: 'selection.ts',
					text: 'selected text',
					selection: {
						start: { line: 2, character: 3 },
						end: { line: 2, character: 16 },
					},
				},
			],
		}]);
	});

	test('sends simple attachments as text blobs and restores them from SDK blobs', async () => {
		const { session, mockSession } = await createAgentSession(disposables);

		await session.send('/act-on-feedback', [{
			type: MessageAttachmentKind.Simple,
			label: 'Feedback',
			modelRepresentation: 'Feedback text for the model',
		}]);

		const expectedAttachment = {
			type: MessageAttachmentKind.Simple,
			label: 'Feedback',
			modelRepresentation: 'Feedback text for the model',
		};
		assert.deepStrictEqual(mockSession.sendRequests, [{
			prompt: '/act-on-feedback',
			attachments: [{
				type: 'blob',
				data: encodeBase64(VSBuffer.fromString('Feedback text for the model')),
				mimeType: 'text/plain',
				displayName: 'Feedback',
			}],
		}]);

		mockSession.messages = [{
			type: 'user.message',
			id: 'event-1',
			parentId: null,
			timestamp: new Date().toISOString(),
			data: {
				interactionId: 'message-1',
				content: '/act-on-feedback',
				attachments: [{
					type: 'blob',
					data: encodeBase64(VSBuffer.fromString('Feedback text for the model')),
					mimeType: 'text/plain',
					displayName: 'Feedback',
				}],
			},
		}];

		assert.deepStrictEqual(await session.getMessages(), [{
			id: 'event-1',
			message: {
				text: '/act-on-feedback',
				origin: { kind: MessageKind.User },
				attachments: [expectedAttachment],
			},
			responseParts: [],
			usage: undefined,
			state: 'cancelled',
		}]);
	});

	test('emits accumulated Copilot usage metadata', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-usage');
		mockSession.fire('assistant.usage', {
			model: 'claude-sonnet-4.6',
			inputTokens: 10,
			outputTokens: 20,
			cacheReadTokens: 5,
			cost: 2,
		});
		mockSession.fire('assistant.usage', {
			model: 'claude-sonnet-4.6',
			inputTokens: 30,
			outputTokens: 40,
			cost: 2,
		});

		const usageActions = signals
			.filter((s): s is IAgentActionSignal => s.kind === 'action')
			.map(s => s.action)
			.filter(a => a.type === ActionType.SessionUsage);

		assert.deepStrictEqual(usageActions.map(a => a.usage), [
			{
				inputTokens: 10,
				outputTokens: 20,
				model: 'claude-sonnet-4.6',
				cacheReadTokens: 5,
				_meta: {
					cost: 2,
				},
			},
			{
				inputTokens: 30,
				outputTokens: 40,
				model: 'claude-sonnet-4.6',
				cacheReadTokens: undefined,
				_meta: {
					cost: 2,
				},
			},
		]);
	});

	test('extracts selected text from file contents for different line endings and bounds', async () => {
		const testCases = [
			{
				name: 'lf multiline',
				contents: 'zero\none\ntwo\nthree',
				selection: { start: { line: 1, character: 1 }, end: { line: 2, character: 2 } },
				expectedText: 'ne\ntw',
			},
			{
				name: 'crlf multiline',
				contents: 'zero\r\none\r\ntwo\r\nthree',
				selection: { start: { line: 1, character: 1 }, end: { line: 2, character: 2 } },
				expectedText: 'ne\r\ntw',
			},
			{
				name: 'clamps past eof',
				contents: 'zero\none',
				selection: { start: { line: 1, character: 1 }, end: { line: 42, character: 99 } },
				expectedText: 'ne',
			},
			{
				name: 'empty when end is before start',
				contents: 'zero\none',
				selection: { start: { line: 1, character: 3 }, end: { line: 1, character: 1 } },
				expectedText: '',
			},
		] satisfies ReadonlyArray<{
			name: string;
			contents: string;
			selection: {
				start: { line: number; character: number };
				end: { line: number; character: number };
			};
			expectedText: string;
		}>;

		for (const testCase of testCases) {
			const selectionUri = URI.file(`/workspace/${testCase.name}.ts`);
			const { session, mockSession } = await createAgentSession(disposables, {
				fileContents: {
					[selectionUri.toString()]: testCase.contents,
				},
			});

			await session.send('hello', [{
				type: MessageAttachmentKind.Resource,
				uri: selectionUri.toString(),
				label: `${testCase.name}.ts`,
				displayKind: 'selection',
				selection: { range: testCase.selection },
			}]);

			assert.deepStrictEqual(mockSession.sendRequests, [{
				prompt: 'hello',
				attachments: [{
					type: 'selection',
					filePath: selectionUri.fsPath,
					displayName: `${testCase.name}.ts`,
					text: testCase.expectedText,
					selection: testCase.selection,
				}],
			}], testCase.name);
			disposables.clear();
		}
	});

	test('falls back to file attachment when selection text cannot be read', async () => {
		const selectionUri = URI.file('/workspace/missing.ts');
		const logService = new CapturingLogService();
		const { session, mockSession } = await createAgentSession(disposables, {
			fileReadErrors: [selectionUri.toString()],
			logService,
		});

		await session.send('hello', [{
			type: MessageAttachmentKind.Resource,
			uri: selectionUri.toString(),
			label: 'missing.ts',
			displayKind: 'selection',
			selection: {
				range: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 5 },
				},
			},
		}]);

		assert.deepStrictEqual(mockSession.sendRequests, [{
			prompt: 'hello',
			attachments: [
				{ type: 'file', path: selectionUri.fsPath, displayName: 'missing.ts' },
			],
		}]);
		assert.strictEqual(logService.warnings.length, 1);
		assert.match(logService.warnings[0].message, /Failed to read selected text/);
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

		test('promotes steering to its own turn when the SDK echoes the user message', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-original');

			await session.sendSteering({ id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });

			// Sending the steering must not flip turns until the SDK has
			// echoed the user message back through the event stream.
			assert.strictEqual(signals.find(s => s.kind === 'action' && (s as IAgentActionSignal).action.type === ActionType.SessionTurnStarted), undefined);

			mockSession.fire('user.message', {
				content: 'focus on tests',
				interactionId: 'interaction-steer',
			} as SessionEventPayload<'user.message'>['data']);

			const actions = signals.filter(s => s.kind === 'action').map(s => (s as IAgentActionSignal).action);
			const turnComplete = actions.find(a => a.type === ActionType.SessionTurnComplete);
			const turnStarted = actions.find(a => a.type === ActionType.SessionTurnStarted);
			assert.ok(turnComplete, 'should complete the in-flight turn before promoting steering');
			assert.strictEqual(turnComplete.turnId, 'turn-original');
			assert.ok(turnStarted, 'should start a new turn for the steering message');
			assert.notStrictEqual(turnStarted.turnId, 'turn-original');
			assert.deepStrictEqual(turnStarted.message, { text: 'focus on tests', origin: { kind: MessageKind.User } });
			assert.strictEqual(turnStarted.queuedMessageId, 'steer-1');
		});

		test('routes subsequent SDK events into the steering turn', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-original');

			await session.sendSteering({ id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });
			mockSession.fire('user.message', {
				content: 'focus on tests',
				interactionId: 'interaction-steer',
			} as SessionEventPayload<'user.message'>['data']);

			const turnStarted = signals
				.filter(s => s.kind === 'action')
				.map(s => (s as IAgentActionSignal).action)
				.find(a => a.type === ActionType.SessionTurnStarted)!;

			mockSession.fire('assistant.message_delta', {
				deltaContent: 'No problem',
			} as SessionEventPayload<'assistant.message_delta'>['data']);

			const responseParts = signals
				.filter(s => s.kind === 'action')
				.map(s => (s as IAgentActionSignal).action)
				.filter(a => a.type === ActionType.SessionResponsePart);
			assert.ok(responseParts.length > 0, 'expected delta to allocate a response part');
			assert.strictEqual(responseParts[0].turnId, turnStarted.turnId, 'response part should land in the steering turn, not the original');
		});

		test('does not flip turns for SDK-injected user messages (non-user source)', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-original');

			await session.sendSteering({ id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });

			// SDK injects an unrelated user.message (e.g. skill content)
			// with the steering's exact text but a non-'user' source.
			// Even if the text happened to match, the synthetic-source
			// guard MUST skip the flip.
			mockSession.fire('user.message', {
				content: 'focus on tests',
				source: 'skill-pdf',
			} as SessionEventPayload<'user.message'>['data']);

			const turnStarted = signals.find(s => s.kind === 'action' && (s as IAgentActionSignal).action.type === ActionType.SessionTurnStarted);
			assert.strictEqual(turnStarted, undefined, 'synthetic user messages should not promote steering to a turn');
		});

		test('does not flip turns when the user.message content does not match', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-original');

			await session.sendSteering({ id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });
			mockSession.fire('user.message', {
				content: 'something completely different',
			} as SessionEventPayload<'user.message'>['data']);

			const turnStarted = signals.find(s => s.kind === 'action' && (s as IAgentActionSignal).action.type === ActionType.SessionTurnStarted);
			assert.strictEqual(turnStarted, undefined, 'unrelated user messages should not consume the pending steering');
		});

		test('does not send the same steering message again before it is flipped', async () => {
			const { session, mockSession } = await createAgentSession(disposables);

			await session.sendSteering({ id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });
			await session.sendSteering({ id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });

			assert.strictEqual(mockSession.sendRequests.length, 1);
		});

		test('fires steering_consumed on abort when the steering never reached its turn', async () => {
			const { session, signals } = await createAgentSession(disposables);

			await session.sendSteering({ id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });
			await session.abort();

			const consumed = signals.find(s => s.kind === 'steering_consumed');
			assert.ok(consumed, 'abort should clean up pending steering UI state');
			assert.strictEqual((consumed as { id: string }).id, 'steer-1');
		});

		test('does not signal cleanup when send fails', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);

			mockSession.send = async () => { throw new Error('send failed'); };

			await session.sendSteering({ id: 'steer-fail', message: { text: 'will fail', origin: { kind: MessageKind.User } } });

			const consumed = signals.find(s => s.kind === 'steering_consumed');
			const turnStarted = signals.find(s => s.kind === 'action' && (s as IAgentActionSignal).action.type === ActionType.SessionTurnStarted);
			assert.strictEqual(consumed, undefined, 'should not fire steering_consumed on failure');
			assert.strictEqual(turnStarted, undefined, 'should not start a new turn on failure');
		});
	});

	// ---- system.notification ----

	suite('system.notification', () => {

		test('translator handles supported kinds and ignores unsupported kinds', () => {
			const base = {
				id: 'evt-system',
				parentId: null,
				timestamp: new Date().toISOString(),
				type: 'system.notification' as const,
			};

			assert.deepStrictEqual(buildCopilotSystemNotification({
				...base,
				data: {
					content: '<system_notification>\nShell done\n</system_notification>',
					kind: { type: 'shell_completed', shellId: 'shell-a', exitCode: 0, description: 'sleep 6' },
				},
			}), {
				content: 'Shell done',
				messageText: '`sleep 6` completed',
			});

			assert.deepStrictEqual(buildCopilotSystemNotification({
				...base,
				data: {
					content: 'Detached done',
					kind: { type: 'shell_detached_completed', shellId: 'detached-a' },
				},
			}), {
				content: 'Detached done',
				messageText: 'Shell `detached-a` completed',
			});

			assert.deepStrictEqual(buildCopilotSystemNotification({
				...base,
				data: {
					content: 'Agent done',
					kind: { type: 'agent_completed', agentId: 'agent-a', agentType: 'task', status: 'completed' },
				},
			}), {
				content: 'Agent done',
				messageText: 'Background agent completed',
			});

			assert.strictEqual(buildCopilotSystemNotification({
				...base,
				data: {
					content: 'Agent idle',
					kind: { type: 'agent_idle', agentId: 'agent-a', agentType: 'task' },
				},
			}), undefined);
		});

		test('idle notification starts a system-initiated turn without sending another SDK message', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);

			mockSession.fire('system.notification', {
				content: '<system_notification>\nShell command completed\n</system_notification>',
				kind: { type: 'shell_completed', shellId: 'shell-a', exitCode: 0, description: 'sleep 6' },
			} as SessionEventPayload<'system.notification'>['data']);

			assert.strictEqual(mockSession.sendRequests.length, 0, 'system notification should not call session.send');
			const actions = getActions(signals);
			const turnStarted = actions.find(a => a.type === ActionType.SessionTurnStarted);
			assert.ok(turnStarted, 'should synthesize a fresh turn');
			assert.deepStrictEqual(turnStarted.message, { text: '`sleep 6` completed', origin: { kind: MessageKind.SystemNotification } });
		});

		test('routes subsequent SDK events into the generated system turn', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);

			mockSession.fire('system.notification', {
				content: 'Shell command completed',
				kind: { type: 'shell_completed', shellId: 'shell-a', exitCode: 0, description: 'sleep 6' },
			} as SessionEventPayload<'system.notification'>['data']);
			const turnStarted = getActions(signals).find(a => a.type === ActionType.SessionTurnStarted)!;

			mockSession.fire('assistant.message_delta', {
				deltaContent: 'Reading the shell output now.',
			} as SessionEventPayload<'assistant.message_delta'>['data']);

			const responsePart = getActions(signals).find(a => a.type === ActionType.SessionResponsePart && a.part.kind === ResponsePartKind.Markdown);
			assert.ok(responsePart, 'expected response part for follow-up assistant delta');
			assert.strictEqual((responsePart as SessionResponsePartAction).turnId, (turnStarted as { turnId: string }).turnId);
		});

		test('notification during an active turn appends a SystemNotification response part', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-active');

			mockSession.fire('system.notification', {
				content: 'Shell command completed',
				kind: { type: 'shell_completed', shellId: 'shell-a', exitCode: 0, description: 'sleep 6' },
			} as SessionEventPayload<'system.notification'>['data']);

			const actions = getActions(signals);
			assert.strictEqual(actions.find(a => a.type === ActionType.SessionTurnStarted), undefined, 'should not create a duplicate turn');
			const systemPart = actions.find(a => a.type === ActionType.SessionResponsePart && a.part.kind === ResponsePartKind.SystemNotification) as SessionResponsePartAction | undefined;
			assert.ok(systemPart, 'expected system notification response part');
			assert.strictEqual(systemPart.turnId, 'turn-active');
			assert.strictEqual(systemPart.part.kind, ResponsePartKind.SystemNotification);
			assert.strictEqual(systemPart.part.content, 'Shell command completed');
		});

		test('generated system turn completes on session.idle', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);

			mockSession.fire('system.notification', {
				content: 'Shell command completed',
				kind: { type: 'shell_completed', shellId: 'shell-a', exitCode: 0, description: 'sleep 6' },
			} as SessionEventPayload<'system.notification'>['data']);
			const turnStarted = getActions(signals).find(a => a.type === ActionType.SessionTurnStarted)!;

			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			const turnComplete = getActions(signals).find(a => a.type === ActionType.SessionTurnComplete);
			assert.ok(turnComplete, 'expected idle to complete the generated turn');
			assert.strictEqual((turnComplete as { turnId: string }).turnId, turnStarted.turnId);
		});

		test('events after a completed turn do not target the stale previous turn id', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-old');

			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);
			mockSession.fire('assistant.message_delta', {
				deltaContent: 'late text',
			} as SessionEventPayload<'assistant.message_delta'>['data']);

			const lateMarkdownActions = getActions(signals)
				.filter(a => a.type === ActionType.SessionResponsePart && a.part.kind === ResponsePartKind.Markdown)
				.map(a => a as SessionResponsePartAction);
			const lateMarkdown = lateMarkdownActions[lateMarkdownActions.length - 1];
			assert.ok(lateMarkdown, 'late event still emits a no-op action for the reducer');
			assert.notStrictEqual(lateMarkdown.turnId, 'turn-old');
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

		test('live tool_complete emits languageModelToolInvoked telemetry', async () => {
			const telemetryService = new RecordingTelemetryService();
			const { mockSession } = await createAgentSession(disposables, { telemetryService });

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-bash-telemetry',
				toolName: 'bash',
				arguments: { command: 'npm test' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-bash-telemetry',
				success: true,
				result: { content: 'passed' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-mcp-telemetry',
				toolName: 'mcp_tool',
				arguments: {},
				mcpServerName: 'test-server',
				mcpToolName: 'lookup',
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-mcp-telemetry',
				success: false,
				error: { code: 'denied', message: 'denied' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			const normalizedEvents = telemetryService.events.map(event => {
				const data = event.data as {
					result: string;
					chatSessionId: string | undefined;
					toolId: string;
					toolExtensionId: string | undefined;
					toolSourceKind: string;
					invocationTimeMs?: number;
				};
				return {
					eventName: event.eventName,
					data: {
						...data,
						invocationTimeMs: typeof data.invocationTimeMs === 'number' && data.invocationTimeMs >= 0,
					},
				};
			});

			assert.deepStrictEqual(normalizedEvents, [
				{
					eventName: 'languageModelToolInvoked',
					data: {
						result: 'success',
						chatSessionId: AgentSession.uri('copilot', 'test-session-1').toString(),
						toolId: 'bash',
						toolExtensionId: undefined,
						toolSourceKind: 'agentHost',
						invocationTimeMs: true,
					},
				},
				{
					eventName: 'languageModelToolInvoked',
					data: {
						result: 'userCancelled',
						chatSessionId: AgentSession.uri('copilot', 'test-session-1').toString(),
						toolId: 'mcp_tool',
						toolExtensionId: undefined,
						toolSourceKind: 'mcp',
						invocationTimeMs: true,
					},
				},
			]);
		});

		test('client tool telemetry does not use clientId as toolExtensionId', async () => {
			const telemetryService = new RecordingTelemetryService();
			const { mockSession } = await createAgentSession(disposables, {
				telemetryService,
				clientSnapshot: {
					clientId: 'test-client',
					tools: [{ name: 'my_tool', description: 'A test tool', inputSchema: { type: 'object', properties: {} } }],
					plugins: [],
				},
			});

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-client-telemetry',
				toolName: 'my_tool',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-client-telemetry',
				success: true,
				result: { content: 'done' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			const [event] = telemetryService.events;
			assert.deepStrictEqual({
				eventName: event.eventName,
				data: {
					...(event.data as object),
					invocationTimeMs: typeof (event.data as { invocationTimeMs?: number }).invocationTimeMs === 'number',
				},
			}, {
				eventName: 'languageModelToolInvoked',
				data: {
					result: 'success',
					chatSessionId: AgentSession.uri('copilot', 'test-session-1').toString(),
					toolId: 'my_tool',
					toolExtensionId: undefined,
					toolSourceKind: 'client',
					invocationTimeMs: true,
				},
			});
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

		test('edit hooks resolve relative apply_patch file paths against workingDirectory', async () => {
			const capturedCallbacks: { current?: Parameters<SessionWrapperFactory>[0] } = {};
			const workingDirectory = URI.file('/repo/project');
			const absolutePath = URI.file('/tmp/absolute.ts').fsPath;
			const { session } = await createAgentSession(disposables, { workingDirectory, captureWrapperCallbacks: capturedCallbacks });
			const sessionInternals = session as unknown as ISessionInternalsForTest;
			const started: string[] = [];
			const completed: string[] = [];
			sessionInternals._editTracker.trackEditStart = async path => { started.push(path); };
			sessionInternals._editTracker.completeEdit = async path => { completed.push(path); };
			const patch = [
				'*** Begin Patch',
				'*** Update File: foo.ts',
				'@@',
				'+new',
				'*** Update File: src/bar.ts',
				'@@',
				'+new',
				`*** Update File: ${absolutePath}`,
				'@@',
				'+new',
				'*** End Patch',
			].join('\n');

			await capturedCallbacks.current!.hooks.onPreToolUse({
				sessionId: 'test-session-1',
				timestamp: new Date(0),
				workingDirectory: '/repo/project',
				toolName: 'apply_patch',
				toolArgs: patch,
			});
			await capturedCallbacks.current!.hooks.onPostToolUse({
				sessionId: 'test-session-1',
				timestamp: new Date(0),
				workingDirectory: '/repo/project',
				toolName: 'apply_patch',
				toolArgs: patch,
				toolResult: { textResultForLlm: '', resultType: 'success' },
			});

			assert.deepStrictEqual({ started, completed }, {
				started: [join(workingDirectory.fsPath, 'foo.ts'), join(workingDirectory.fsPath, 'src/bar.ts'), absolutePath],
				completed: [join(workingDirectory.fsPath, 'foo.ts'), join(workingDirectory.fsPath, 'src/bar.ts'), absolutePath],
			});
		});

		test('tool_complete resolves relative apply_patch file paths before taking completed edits', async () => {
			const workingDirectory = URI.file('/repo/project');
			const { session, mockSession, waitForSignal } = await createAgentSession(disposables, { workingDirectory });
			const sessionInternals = session as unknown as ISessionInternalsForTest;
			const taken: string[] = [];
			sessionInternals._editTracker.takeCompletedEdit = async (_turnId, _toolCallId, path) => {
				taken.push(path);
				return undefined;
			};
			session.resetTurnState('turn-apply-patch');
			const patch = [
				'*** Begin Patch',
				'*** Update File: foo.ts',
				'@@',
				'+new',
				'*** Update File: src/bar.ts',
				'@@',
				'+new',
				'*** End Patch',
			].join('\n');

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-apply-patch',
				toolName: 'apply_patch',
				arguments: patch,
			} as unknown as SessionEventPayload<'tool.execution_start'>['data']);

			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-apply-patch',
				success: true,
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			await waitForSignal(s => isAction(s, ActionType.SessionToolCallComplete));

			assert.deepStrictEqual(taken, [join(workingDirectory.fsPath, 'foo.ts'), join(workingDirectory.fsPath, 'src/bar.ts')]);
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

		test('idle event completes the active turn', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-idle');
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			assert.strictEqual(signals.length, 1);
			assert.ok(isAction(signals[0], ActionType.SessionTurnComplete));
		});

		test('idle event without an active turn is ignored', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			assert.strictEqual(signals.length, 0);
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

		test('history replay renders assistant tool requests when lifecycle events are missing', async () => {
			const { session, mockSession } = await createAgentSession(disposables);
			mockSession.getEvents = async () => [
				{
					type: 'user.message',
					data: { messageId: 'turn-1', content: 'inspect the workspace' },
				},
				{
					type: 'assistant.message',
					data: {
						messageId: 'msg-1',
						content: 'I will inspect the workspace.',
						toolRequests: [
							{
								toolCallId: 'tc-view',
								name: 'view',
								arguments: { path: '/workspace/file.ts' },
								type: 'function',
							},
							{
								toolCallId: 'tc-bash',
								name: 'bash',
								arguments: { command: 'npm test' },
								type: 'function',
							},
							{
								toolCallId: 'tc-intent',
								name: 'report_intent',
								arguments: { intent: 'Inspecting files' },
								type: 'function',
							},
						],
					},
				},
				{
					type: 'tool.execution_complete',
					data: {
						toolCallId: 'tc-bash',
						success: false,
						error: { message: 'tests failed' },
					},
				},
				{
					type: 'assistant.message',
					data: { messageId: 'msg-2', content: 'Done.' },
				},
			] as SessionEvent[];

			const turns = await session.getMessages();

			const actual = turns.map(turn => {
				const parts: Array<Record<string, unknown>> = [];
				for (const part of turn.responseParts) {
					switch (part.kind) {
						case ResponsePartKind.ToolCall:
							parts.push({
								kind: part.kind,
								toolCallId: part.toolCall.toolCallId,
								toolName: part.toolCall.toolName,
								status: part.toolCall.status,
								success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : undefined,
								content: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.content : undefined,
							});
							break;
						case ResponsePartKind.Markdown:
							parts.push({ kind: part.kind, content: part.content });
							break;
						default:
							parts.push({ kind: part.kind });
					}
				}
				return { message: turn.message.text, parts };
			});

			assert.deepStrictEqual(actual, [{
				message: 'inspect the workspace',
				parts: [
					{ kind: ResponsePartKind.Markdown, content: 'I will inspect the workspace.' },
					{ kind: ResponsePartKind.ToolCall, toolCallId: 'tc-view', toolName: 'view', status: ToolCallStatus.Completed, success: true, content: undefined },
					{ kind: ResponsePartKind.ToolCall, toolCallId: 'tc-bash', toolName: 'bash', status: ToolCallStatus.Completed, success: false, content: [{ type: ToolResultContentType.Text, text: 'tests failed' }] },
					{ kind: ResponsePartKind.Markdown, content: 'Done.' },
				],
			}]);
		});

		test('history replay does not duplicate assistant tool requests with lifecycle events', async () => {
			const { session, mockSession } = await createAgentSession(disposables);
			mockSession.getEvents = async () => [
				{
					type: 'user.message',
					data: { messageId: 'turn-1', content: 'run tests' },
				},
				{
					type: 'assistant.message',
					data: {
						messageId: 'msg-1',
						content: '',
						toolRequests: [{
							toolCallId: 'tc-bash',
							name: 'bash',
							arguments: { command: 'npm test' },
							type: 'function',
						}],
					},
				},
				{
					type: 'tool.execution_start',
					data: {
						toolCallId: 'tc-bash',
						toolName: 'bash',
						arguments: { command: 'npm test' },
					},
				},
				{
					type: 'tool.execution_complete',
					data: {
						toolCallId: 'tc-bash',
						success: true,
						result: { content: 'passed' },
					},
				},
				{
					type: 'assistant.message',
					data: { messageId: 'msg-2', content: 'Done.' },
				},
			] as SessionEvent[];

			const turns = await session.getMessages();
			const toolCalls = turns[0].responseParts.flatMap(part => part.kind === ResponsePartKind.ToolCall ? [part.toolCall] : []);

			assert.deepStrictEqual(toolCalls.map(toolCall => ({
				toolCallId: toolCall.toolCallId,
				toolName: toolCall.toolName,
				content: toolCall.status === ToolCallStatus.Completed ? toolCall.content : undefined,
			})), [{
				toolCallId: 'tc-bash',
				toolName: 'bash',
				content: [{ type: ToolResultContentType.Text, text: 'passed' }],
			}]);
		});

		test('subagent message delta does not suppress final parent assistant message', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-1');

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-subagent',
				toolName: 'task',
				arguments: { description: 'Explore tests', agent_type: 'explore' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			mockSession.fire('subagent.started', {
				toolCallId: 'tc-subagent',
				agentName: 'explore',
				agentDisplayName: 'Explore',
				agentDescription: 'Explore tests',
			} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-1' });

			mockSession.fire('assistant.message_delta', {
				messageId: 'msg-child',
				deltaContent: 'Subagent found the answer.',
			} as SessionEventPayload<'assistant.message_delta'>['data'], { agentId: 'agent-1' });

			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-subagent',
				success: true,
				result: { content: 'done' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			mockSession.fire('assistant.message', {
				messageId: 'msg-parent-final',
				content: 'Final parent answer.',
			} as SessionEventPayload<'assistant.message'>['data']);

			const markdownParts = signals.flatMap(signal => {
				if (signal.kind !== 'action' || signal.action.type !== ActionType.SessionResponsePart) {
					return [];
				}
				const part = (signal.action as SessionResponsePartAction).part;
				if (part.kind !== ResponsePartKind.Markdown) {
					return [];
				}
				return [{ parentToolCallId: signal.parentToolCallId, content: part.content }];
			});

			assert.deepStrictEqual(markdownParts, [
				{ parentToolCallId: 'tc-subagent', content: 'Subagent found the answer.' },
				{ parentToolCallId: undefined, content: 'Final parent answer.' },
			]);
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

		test('subagent reasoning delta routes to the subagent session scope', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-1');

			mockSession.fire('subagent.started', {
				toolCallId: 'tc-subagent',
				agentName: 'explore',
				agentDisplayName: 'Explore',
				agentDescription: 'Explore tests',
			} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-1' });

			mockSession.fire('assistant.reasoning_delta', {
				reasoningId: 'reasoning-child',
				deltaContent: 'Subagent thinking.',
			} as SessionEventPayload<'assistant.reasoning_delta'>['data'], { agentId: 'agent-1' });

			mockSession.fire('assistant.reasoning_delta', {
				reasoningId: 'reasoning-parent',
				deltaContent: 'Parent thinking.',
			} as SessionEventPayload<'assistant.reasoning_delta'>['data']);

			const reasoningParts = signals.flatMap(signal => {
				if (signal.kind !== 'action' || signal.action.type !== ActionType.SessionResponsePart) {
					return [];
				}
				const part = (signal.action as SessionResponsePartAction).part;
				if (part.kind !== ResponsePartKind.Reasoning) {
					return [];
				}
				return [{ parentToolCallId: signal.parentToolCallId, content: part.content }];
			});

			assert.deepStrictEqual(reasoningParts, [
				{ parentToolCallId: 'tc-subagent', content: 'Subagent thinking.' },
				{ parentToolCallId: undefined, content: 'Parent thinking.' },
			]);
		});

		test('subagent tool completion routes to the subagent session scope', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-1');

			mockSession.fire('subagent.started', {
				toolCallId: 'tc-subagent',
				agentName: 'explore',
				agentDisplayName: 'Explore',
				agentDescription: 'Explore tests',
			} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-1' });

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-child-tool',
				toolName: 'bash',
				arguments: { command: 'echo hi' },
			} as SessionEventPayload<'tool.execution_start'>['data'], { agentId: 'agent-1' });

			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-child-tool',
				success: true,
				result: { content: 'hi' },
			} as SessionEventPayload<'tool.execution_complete'>['data'], { agentId: 'agent-1' });

			const toolCompletions = signals.flatMap(signal => {
				if (!isAction(signal, ActionType.SessionToolCallComplete)) {
					return [];
				}
				const action = signal.action as SessionToolCallCompleteAction;
				return [{ parentToolCallId: signal.parentToolCallId, toolCallId: action.toolCallId }];
			});

			assert.deepStrictEqual(toolCompletions, [
				{ parentToolCallId: 'tc-subagent', toolCallId: 'tc-child-tool' },
			]);
		});

		test('history replay seeds turn id from the SDK envelope id, matching `turns.event_id`', async () => {
			// Regression test: fork / truncate look up the SDK boundary
			// event id via `getNextTurnEventId(turnId)`, which keys on
			// either `turns.id` (live `request_xxx`) or `turns.event_id`
			// (SDK envelope id). For sessions restored from disk we want
			// the restored turn id to be the SDK envelope id so that
			// lookup succeeds without translation.
			const { session, mockSession } = await createAgentSession(disposables);
			mockSession.getEvents = async () => [
				{
					type: 'user.message',
					id: 'sdk-evt-user-1',
					data: { interactionId: 'capi-interaction-1', content: 'first prompt' },
				},
				{
					type: 'assistant.message',
					id: 'sdk-evt-asst-1',
					data: { messageId: 'sdk-msg-1', content: 'first response.' },
				},
				{
					type: 'user.message',
					id: 'sdk-evt-user-2',
					data: { interactionId: 'capi-interaction-2', content: 'second prompt' },
				},
				{
					type: 'assistant.message',
					id: 'sdk-evt-asst-2',
					data: { messageId: 'sdk-msg-2', content: 'second response.' },
				},
			] as SessionEvent[];

			const turns = await session.getMessages();
			assert.deepStrictEqual(
				turns.map(t => ({ id: t.id, text: t.message.text })),
				[
					{ id: 'sdk-evt-user-1', text: 'first prompt' },
					{ id: 'sdk-evt-user-2', text: 'second prompt' },
				],
			);
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

	// ---- elicitation handling ----

	suite('elicitation handling', () => {

		test('form-mode request projects schema fields to questions and accept round-trips content', async () => {
			const { session, signals } = await createAgentSession(disposables);

			const resultPromise = session.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'Configure deployment',
				mode: 'form',
				requestedSchema: {
					type: 'object',
					properties: {
						environment: { type: 'string', enum: ['dev', 'prod'], enumNames: ['Development', 'Production'] },
						replicas: { type: 'integer', minimum: 1, maximum: 10, default: 3 },
						confirm: { type: 'boolean', default: false },
						region: { type: 'string', minLength: 2, default: 'us-west-2' },
						tags: { type: 'array', items: { type: 'string', enum: ['a', 'b', 'c'] } },
					},
					required: ['environment', 'confirm'],
				},
			});

			assert.strictEqual(signals.length, 1);
			const request = getInputRequest(signals[0]);
			assert.strictEqual(request.message, 'Configure deployment');
			assert.ok(request.questions);
			assert.deepStrictEqual(request.questions.map(q => ({ id: q.id, kind: q.kind, required: q.required })), [
				{ id: 'environment', kind: SessionInputQuestionKind.SingleSelect, required: true },
				{ id: 'replicas', kind: SessionInputQuestionKind.Integer, required: false },
				{ id: 'confirm', kind: SessionInputQuestionKind.Boolean, required: true },
				{ id: 'region', kind: SessionInputQuestionKind.Text, required: false },
				{ id: 'tags', kind: SessionInputQuestionKind.MultiSelect, required: false },
			]);
			const envQuestion = request.questions[0];
			assert.strictEqual(envQuestion.kind, SessionInputQuestionKind.SingleSelect);
			if (envQuestion.kind === SessionInputQuestionKind.SingleSelect) {
				assert.deepStrictEqual(envQuestion.options, [
					{ id: 'dev', label: 'Development' },
					{ id: 'prod', label: 'Production' },
				]);
			}

			session.respondToUserInputRequest(request.id, SessionInputResponseKind.Accept, {
				environment: { state: SessionInputAnswerState.Submitted, value: { kind: SessionInputAnswerValueKind.Selected, value: 'prod' } },
				replicas: { state: SessionInputAnswerState.Submitted, value: { kind: SessionInputAnswerValueKind.Number, value: 5 } },
				confirm: { state: SessionInputAnswerState.Submitted, value: { kind: SessionInputAnswerValueKind.Boolean, value: true } },
				region: { state: SessionInputAnswerState.Submitted, value: { kind: SessionInputAnswerValueKind.Text, value: 'eu-west-1' } },
				tags: { state: SessionInputAnswerState.Submitted, value: { kind: SessionInputAnswerValueKind.SelectedMany, value: ['a', 'c'] } },
			});

			assert.deepStrictEqual(await resultPromise, {
				action: 'accept',
				content: {
					environment: 'prod',
					replicas: 5,
					confirm: true,
					region: 'eu-west-1',
					tags: ['a', 'c'],
				},
			});
		});

		test('skipped and missing answers are omitted from accept content', async () => {
			const { session, signals } = await createAgentSession(disposables);

			const resultPromise = session.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'Partial form',
				mode: 'form',
				requestedSchema: {
					type: 'object',
					properties: {
						name: { type: 'string' },
						count: { type: 'integer' },
					},
				},
			});

			const request = getInputRequest(signals[0]);
			session.respondToUserInputRequest(request.id, SessionInputResponseKind.Accept, {
				name: { state: SessionInputAnswerState.Skipped },
				// `count` is missing entirely
			});

			assert.deepStrictEqual(await resultPromise, { action: 'accept', content: {} });
		});

		test('url-mode request surfaces url and accept returns no content', async () => {
			const { session, signals } = await createAgentSession(disposables);

			const resultPromise = session.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'Open this link',
				mode: 'url',
				url: 'https://example.com/auth',
			});

			const request = getInputRequest(signals[0]);
			assert.strictEqual(request.url, 'https://example.com/auth');
			assert.strictEqual(request.questions, undefined);

			session.respondToUserInputRequest(request.id, SessionInputResponseKind.Accept);
			assert.deepStrictEqual(await resultPromise, { action: 'accept' });
		});

		test('free-form request (no schema) returns submitted text as content.answer', async () => {
			const { session, signals } = await createAgentSession(disposables);

			const resultPromise = session.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'What is your favorite color?',
				mode: 'form',
				// No requestedSchema — the workbench fallback renders a single text question.
			});

			const request = getInputRequest(signals[0]);
			assert.strictEqual(request.questions, undefined);

			session.respondToUserInputRequest(request.id, SessionInputResponseKind.Accept, {
				answer: { state: SessionInputAnswerState.Submitted, value: { kind: SessionInputAnswerValueKind.Text, value: 'teal' } },
			});

			assert.deepStrictEqual(await resultPromise, { action: 'accept', content: { answer: 'teal' } });
		});

		test('decline response maps to action=decline', async () => {
			const { session, signals } = await createAgentSession(disposables);

			const resultPromise = session.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'Please confirm',
				mode: 'form',
				requestedSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
			});

			const request = getInputRequest(signals[0]);
			session.respondToUserInputRequest(request.id, SessionInputResponseKind.Decline);
			assert.deepStrictEqual(await resultPromise, { action: 'decline' });
		});

		test('cancel response maps to action=cancel', async () => {
			const { session, signals } = await createAgentSession(disposables);

			const resultPromise = session.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'Please confirm',
				mode: 'form',
				requestedSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
			});

			const request = getInputRequest(signals[0]);
			session.respondToUserInputRequest(request.id, SessionInputResponseKind.Cancel);
			assert.deepStrictEqual(await resultPromise, { action: 'cancel' });
		});

		test('autopilot auto-cancels without firing a progress event', async () => {
			const { session, signals } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.AutoApprove]: 'autopilot' },
			});

			const result = await session.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'Need input',
				mode: 'form',
				requestedSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
			});

			assert.deepStrictEqual(result, { action: 'cancel' });
			assert.strictEqual(signals.length, 0);
		});

		test('pending elicitations are cancelled on dispose', async () => {
			const { session } = await createAgentSession(disposables);

			const resultPromise = session.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'Will be cancelled',
				mode: 'form',
				requestedSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
			});

			session.dispose();
			assert.deepStrictEqual(await resultPromise, { action: 'cancel' });
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
					sessionId: 'test-session-1',
					timestamp: new Date(0),
					workingDirectory: '/tmp',
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
					sessionId: 'test-session-1',
					timestamp: new Date(0),
					workingDirectory: '/tmp',
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

			mockSession.fire('subagent.started', {
				toolCallId: 'tc-parent-subagent',
				agentName: 'helper',
				agentDisplayName: 'Helper',
				agentDescription: 'Helps',
			} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-client-tool' });

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-sub-client',
				toolName: 'my_tool',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data'], { agentId: 'agent-client-tool' });

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

			mockSession.fire('session.mode_changed', { previousMode: 'interactive', newMode: 'shell' } as unknown as SessionEventPayload<'session.mode_changed'>['data']);

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
