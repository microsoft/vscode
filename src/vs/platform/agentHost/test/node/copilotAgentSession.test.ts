/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotSession, SessionEvent, SessionEventHandler, SessionEventPayload, SessionEventType, Tool, ToolResultObject, TypedSessionEventHandler } from '@github/copilot-sdk';
import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
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
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../telemetry/common/telemetryUtils.js';
import { AgentSession, type AgentSignal, type IAgentActionSignal, type IAgentToolPendingConfirmationSignal } from '../../common/agentService.js';
import type { ChatInputRequestWithPlanReview } from '../../common/agentHostPlanReview.js';
import { AgentFeedbackAttachmentDisplayKind } from '../../common/meta/agentFeedbackAttachments.js';
import { IDiffComputeService } from '../../common/diffComputeService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { ActionType, type ChatDeltaAction, type ChatErrorAction, type ChatInputRequestedAction, type ChatResponsePartAction, type ChatToolCallCompleteAction, type ChatToolCallReadyAction, type ChatToolCallStartAction, type ChatTurnCompleteAction, type ChatUsageAction, type SessionAction } from '../../common/state/sessionActions.js';
import { MessageAttachmentKind, MessageKind, ResponsePartKind, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, buildDefaultChatUri, type ToolDefinition, type ToolResultContent, type ToolResultFileEditContent, type UsageInfoMeta } from '../../common/state/sessionState.js';
import { McpAuthRequiredReason, McpServerStatus } from '../../common/state/protocol/channels-session/state.js';
import { CopilotAgentSession } from '../../node/copilot/copilotAgentSession.js';
import { ActiveClientToolSet } from '../../node/activeClientState.js';
import { type CopilotSessionLaunchPlan, type IActiveClientSnapshot, type ICopilotSessionLauncher, type ICopilotSessionRuntime } from '../../node/copilot/copilotSessionLauncher.js';
import { CopilotSessionWrapper } from '../../node/copilot/copilotSessionWrapper.js';
import { buildCopilotSystemNotification } from '../../node/copilot/copilotSystemNotification.js';
import { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { AgentHostAutoReplyEnabledConfigKey, AgentHostGlobalAutoApproveEnabledConfigKey } from '../../common/agentHostSchema.js';
import { CopilotCliConfigKey } from '../../common/copilotCliConfig.js';
import { AgentHostSandboxConfigKey, AgentHostSandboxKey } from '../../common/sandboxConfigSchema.js';
import { AgentSandboxEnabledValue } from '../../../sandbox/common/settings.js';
import { createSessionDataService, createZeroDiffComputeService } from '../common/sessionTestHelpers.js';
import { IAgentServerToolHost } from '../../common/agentServerTools.js';

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
	readonly compactCalls: unknown[] = [];
	readonly commandListCalls: unknown[] = [];
	readonly commandInvokeCalls: Array<{ name: string; input?: string }> = [];
	compactResult: { success: boolean; tokensRemoved: number; messagesRemoved: number; contextWindow?: { currentTokens: number; tokenLimit: number; messagesLength: number } } = { success: true, tokensRemoved: 0, messagesRemoved: 0 };
	compactError: unknown = undefined;
	commandListResult: {
		commands: Array<{
			name: string;
			kind: 'builtin' | 'skill' | 'client';
			description: string;
			allowDuringAgentExecution: boolean;
			aliases?: string[];
			input?: { hint: string; required?: boolean; preserveMultilineInput?: boolean };
		}>;
	} = { commands: [] };
	commandInvokeResult: { kind: 'text'; text: string; markdown?: boolean } | { kind: 'completed'; message?: string } | { kind: 'agent-prompt'; prompt: string; displayPrompt: string; mode?: 'interactive' | 'plan' | 'autopilot' } = { kind: 'text', text: '' };
	messages: SessionEvent[] = [];

	private readonly _handlers = new Map<string, Set<(event: SessionEvent) => void>>();
	private readonly _allHandlers = new Set<SessionEventHandler>();
	planReadResult: { exists: boolean; content: string | null; path: string | null } = { exists: false, content: null, path: null };

	on(handler: SessionEventHandler): () => void;
	on<K extends SessionEventType>(eventType: K, handler: TypedSessionEventHandler<K>): () => void;
	on<K extends SessionEventType>(eventTypeOrHandler: K | SessionEventHandler, handler?: TypedSessionEventHandler<K>): () => void {
		if (typeof eventTypeOrHandler === 'function') {
			this._allHandlers.add(eventTypeOrHandler);
			return () => { this._allHandlers.delete(eventTypeOrHandler); };
		}
		const eventType = eventTypeOrHandler;
		let set = this._handlers.get(eventType);
		if (!set) {
			set = new Set();
			this._handlers.set(eventType, set);
		}
		assert.ok(handler);
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
		for (const handler of this._allHandlers) {
			handler(event);
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
		history: {
			compact: async (params?: unknown) => {
				this.compactCalls.push(params ?? null);
				if (this.compactError !== undefined) {
					throw this.compactError;
				}
				return this.compactResult;
			},
		},
		commands: {
			list: async (params?: unknown) => {
				this.commandListCalls.push(params ?? null);
				return this.commandListResult;
			},
			invoke: async (params: { name: string; input?: string }) => {
				this.commandInvokeCalls.push(params);
				return this.commandInvokeResult;
			},
		},
		mcp: {
			list: async () => {
				if (this.mcpListError !== undefined) {
					throw this.mcpListError;
				}
				return this.mcpListResult;
			},
			executeSampling: async () => ({ status: 'completed' as const, result: undefined }),
			cancelSamplingExecution: async () => { /* no-op */ },
		},
		options: {
			update: async (params: { sandboxConfig?: unknown }) => {
				if (params.sandboxConfig !== undefined) {
					this.sandboxConfigUpdates.push(params.sandboxConfig);
				}
			},
		},
	};

	readonly sandboxConfigUpdates: unknown[] = [];

	mcpListResult: { servers: ReadonlyArray<{ name: string; status: 'connected' | 'failed' | 'pending'; error?: string }> } = { servers: [] };
	mcpListError: unknown = undefined;
}

class CapturingLogService extends NullLogService {
	readonly errors: Array<{ first: string | Error; args: unknown[] }> = [];
	readonly warnings: Array<{ message: string; args: unknown[] }> = [];
	readonly traces: Array<{ message: string; args: unknown[] }> = [];

	override trace(message: string, ...args: unknown[]): void {
		this.traces.push({ message, args });
		super.trace(message, ...args);
	}

	override error(message: string | Error, ...args: unknown[]): void {
		this.errors.push({ first: message, args });
		super.error(message, ...args);
	}

	override warn(message: string, ...args: unknown[]): void {
		this.warnings.push({ message, args });
		super.warn(message, ...args);
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
		takeCompletedEdit(turnId: string, toolCallId: string, path: string, toolName: string, toolInput: unknown, modelId: string | undefined): Promise<ToolResultFileEditContent | undefined>;
	};
	_pendingClientToolCalls: {
		register(toolCallId: string): Promise<ToolResultObject>;
		respondOrBuffer(toolCallId: string, value: ToolResultObject): void;
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

function getInputRequest(signal: AgentSignal): ChatInputRequestedAction['request'] {
	assert.strictEqual(signal.kind, 'action');
	if (signal.kind !== 'action') { throw new Error('unreachable'); }
	assert.strictEqual(signal.action.type, ActionType.ChatInputRequested);
	return (signal.action as ChatInputRequestedAction).request;
}

async function createAgentSession(disposables: DisposableStore, options?: {
	clientSnapshot?: IActiveClientSnapshot;
	activeClientToolSet?: ActiveClientToolSet;
	environmentServiceRegistration?: 'native' | 'none';
	logService?: ILogService;
	telemetryService?: ITelemetryService;
	captureRuntime?: { current?: ICopilotSessionRuntime };
	workingDirectory?: URI;
	/** Per-key effective config values returned by the fake configuration service. */
	configValues?: Record<string, unknown>;
	/** Per-key root config values returned by the fake configuration service's `getRootValue`. */
	rootValues?: Record<string, unknown>;
	fileContents?: Record<string, string>;
	fileReadErrors?: readonly string[];
	/** Configure the mock session before {@link CopilotAgentSession.initializeSession} runs. */
	configureMockSession?: (session: MockCopilotSession) => void;
	/** Optional server-tool host wired into the session. */
	serverToolHost?: IAgentServerToolHost;
	/** Platform used to compute the SDK sandbox policy. Defaults to `'linux'` so sandbox tests are deterministic. */
	platform?: NodeJS.Platform;
}): Promise<{
	session: CopilotAgentSession;
	runtime: ICopilotSessionRuntime;
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
	options?.configureMockSession?.(mockSession);

	const launchPlan: CopilotSessionLaunchPlan = {
		kind: 'create',
		client: {
			createSession: async () => mockSession as unknown as CopilotSession,
			resumeSession: async () => mockSession as unknown as CopilotSession,
		},
		activeClientToolSet: new ActiveClientToolSet(),
		sessionId: 'test-session-1',
		workingDirectory: options?.workingDirectory,
		resolvedAgentName: undefined,
		snapshot: options?.clientSnapshot ?? { tools: [], plugins: [], mcpServers: {} },
		shellManager: undefined,
		githubToken: undefined,
		model: undefined,
	};
	let launchedRuntime: ICopilotSessionRuntime | undefined;
	const sessionLauncher: ICopilotSessionLauncher = {
		launch: async (_plan, runtime) => {
			launchedRuntime = runtime;
			if (options?.captureRuntime) {
				options.captureRuntime.current = runtime;
			}
			return new CopilotSessionWrapper(mockSession as unknown as CopilotSession);
		}
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
	const rootValues = options?.rootValues ?? {};
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
		getRootValue: ((_schema: unknown, key: string) => rootValues[key]) as IAgentConfigurationService['getRootValue'],
		updateRootConfig: () => { /* no-op */ },
		persistRootConfig: () => { /* no-op */ },
		whenIdle: async () => { /* no-op */ },
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
			chatChannelUri: URI.parse(buildDefaultChatUri(sessionUri)),
			rawSessionId: 'test-session-1',
			onDidSessionProgress: progressEmitter,
			sessionLauncher,
			launchPlan,
			shellManager: undefined,
			clientSnapshot: options?.clientSnapshot,
			activeClientToolSet: options?.activeClientToolSet,
			resolveMcpChildId: () => undefined,
			workingDirectory: options?.workingDirectory,
			serverToolHost: options?.serverToolHost,
			platform: options?.platform ?? 'linux',
		},
	));

	await session.initializeSession();
	assert.ok(launchedRuntime);

	return { session, runtime: launchedRuntime, mockSession, signals, waitForSignal, sessionConfigUpdates };
}

// ---- Tests ------------------------------------------------------------------

suite('CopilotAgentSession', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('CopilotSessionWrapper', () => {
		test('fires unhandled events when no wrapped listener is registered', () => {
			const mockSession = new MockCopilotSession();
			const wrapper = disposables.add(new CopilotSessionWrapper(mockSession as unknown as CopilotSession));
			const events: string[] = [];
			disposables.add(wrapper.onUnhandledEvent(e => events.push(e.type)));

			mockSession.fire('session.compaction_start', {} as SessionEventPayload<'session.compaction_start'>['data']);

			assert.deepStrictEqual(events, ['session.compaction_start']);
		});

		test('tracks wrapped listener registrations dynamically', () => {
			const mockSession = new MockCopilotSession();
			const wrapper = disposables.add(new CopilotSessionWrapper(mockSession as unknown as CopilotSession));
			const events: string[] = [];
			disposables.add(wrapper.onUnhandledEvent(e => events.push(e.type)));
			const handledListener = wrapper.onSessionCompactionStart(() => { });

			mockSession.fire('session.compaction_start', {} as SessionEventPayload<'session.compaction_start'>['data']);
			handledListener.dispose();
			mockSession.fire('session.compaction_start', {} as SessionEventPayload<'session.compaction_start'>['data']);

			assert.deepStrictEqual(events, ['session.compaction_start']);
		});
	});

	test('logs SDK events without wrapped handlers', async () => {
		const logService = new CapturingLogService();
		const { mockSession } = await createAgentSession(disposables, { logService });

		mockSession.fire('session.title_changed', { title: 'A new title' } as SessionEventPayload<'session.title_changed'>['data'], {
			ephemeral: true,
			id: 'evt-title',
			timestamp: '2026-06-24T00:00:00.000Z',
		});

		assert.deepStrictEqual(
			logService.traces.filter(t => t.message.includes('Unhandled SDK event')).map(t => t.message),
			['[Copilot:test-session-1] Unhandled SDK event: {"type":"session.title_changed","data":{"title":"A new title"},"id":"evt-title","timestamp":"2026-06-24T00:00:00.000Z","parentId":null,"ephemeral":true}']
		);
	});

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

	test('maps symbol Resource attachments to SDK selection so the range survives (#315193)', async () => {
		// Symbols arrive as a Resource with displayKind 'symbol' AND a populated selection.range. Keying the selection
		// branch off the `selection` field (not displayKind === 'selection') keeps the range instead of degrading the
		// symbol to a plain file reference.
		const symbolUri = URI.file('/workspace/sym.ts');
		const { session, mockSession } = await createAgentSession(disposables, {
			fileContents: {
				[symbolUri.toString()]: 'line0\nline1\nfunction foo() {}\nline3',
			},
		});

		await session.send('explain this', [
			{
				type: MessageAttachmentKind.Resource,
				uri: symbolUri.toString(),
				label: 'foo',
				displayKind: 'symbol',
				selection: {
					range: {
						start: { line: 2, character: 9 },
						end: { line: 2, character: 12 },
					},
				},
			},
		]);

		assert.deepStrictEqual(mockSession.sendRequests, [{
			prompt: 'explain this',
			attachments: [
				{
					type: 'selection',
					filePath: symbolUri.fsPath,
					displayName: 'foo',
					text: 'foo',
					selection: {
						start: { line: 2, character: 9 },
						end: { line: 2, character: 12 },
					},
				},
			],
		}]);
	});

	test('memoizes the event reconstruction across getMessages/getSubagentMessages and invalidates on log changes', async () => {
		const { session, mockSession } = await createAgentSession(disposables);
		let getEventsCalls = 0;
		mockSession.getEvents = async () => { getEventsCalls++; return mockSession.messages; };

		// A single resume wave reads + reconstructs the event log once, shared
		// by the parent turns and every subagent lookup.
		await session.getMessages();
		await session.getSubagentMessages('tc-x');
		await session.getMessages();
		assert.strictEqual(getEventsCalls, 1, 'event log should be read once for the whole resume wave');

		// A log-mutating event drops the memo so a later read rebuilds from
		// fresh events instead of serving stale turns.
		mockSession.fire('assistant.turn_end', { turnId: 'sdk-0' } as SessionEventPayload<'assistant.turn_end'>['data']);
		await session.getMessages();
		assert.strictEqual(getEventsCalls, 2, 'memo should be invalidated after the event log changes');
	});

	test('falls back to file reference when reading a symbol Resource attachment fails', async () => {
		const symbolUri = URI.file('/workspace/missing.ts');
		const { session, mockSession } = await createAgentSession(disposables, {
			fileReadErrors: [symbolUri.toString()],
		});

		await session.send('explain this', [
			{
				type: MessageAttachmentKind.Resource,
				uri: symbolUri.toString(),
				label: 'foo',
				displayKind: 'symbol',
				selection: {
					range: {
						start: { line: 2, character: 9 },
						end: { line: 2, character: 12 },
					},
				},
			},
		]);

		assert.deepStrictEqual(mockSession.sendRequests, [{
			prompt: 'explain this',
			attachments: [
				{ type: 'file', path: symbolUri.fsPath, displayName: 'foo' },
			],
		}]);
	});

	test('sends agent feedback annotations attachments as text blobs', async () => {
		const { session, mockSession } = await createAgentSession(disposables);

		await session.send('/act-on-feedback', [{
			type: MessageAttachmentKind.Annotations,
			label: '1 comment',
			displayKind: AgentFeedbackAttachmentDisplayKind,
			resource: 'ahp-session:/s/annotations',
			annotationIds: ['feedback-1'],
		}]);

		const expectedText =
			'The user attached specific feedback comments to act on (comment ids):\n' +
			'- feedback-1\n\n' +
			'Use the `listComments` tool to read their content and focus on these comments.';
		assert.deepStrictEqual(mockSession.sendRequests, [{
			prompt: '/act-on-feedback',
			attachments: [{
				type: 'blob',
				data: encodeBase64(VSBuffer.fromString(expectedText)),
				mimeType: 'text/plain',
				displayName: '1 comment',
			}],
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

	test('forwards an embedded resource with a selection as its already-sliced inline blob', async () => {
		const { session, mockSession } = await createAgentSession(disposables);

		// The handler inlines only the selected text into `data`, so the adapter forwards it verbatim (no re-slicing).
		await session.send('what is the selected word?', [{
			type: MessageAttachmentKind.EmbeddedResource,
			label: 'file:test.js',
			displayKind: 'selection',
			data: encodeBase64(VSBuffer.fromString('world')),
			contentType: 'text/plain',
			selection: { range: { start: { line: 1, character: 6 }, end: { line: 1, character: 11 } } },
		}]);

		assert.deepStrictEqual(mockSession.sendRequests, [{
			prompt: 'what is the selected word?',
			attachments: [{
				type: 'blob',
				data: encodeBase64(VSBuffer.fromString('world')),
				mimeType: 'text/plain',
				displayName: 'file:test.js',
			}],
		}]);
	});

	test('sends an embedded resource without a selection as the full blob', async () => {
		const { session, mockSession } = await createAgentSession(disposables);

		await session.send('what is in this file?', [{
			type: MessageAttachmentKind.EmbeddedResource,
			label: 'file:test.js',
			displayKind: 'document',
			data: encodeBase64(VSBuffer.fromString('line0\nhello world\nline2')),
			contentType: 'text/plain',
		}]);

		assert.deepStrictEqual(mockSession.sendRequests, [{
			prompt: 'what is in this file?',
			attachments: [{
				type: 'blob',
				data: encodeBase64(VSBuffer.fromString('line0\nhello world\nline2')),
				mimeType: 'text/plain',
				displayName: 'file:test.js',
			}],
		}]);
	});

	test('sends paste simple attachments as text blobs', async () => {
		const { session, mockSession } = await createAgentSession(disposables);

		await session.send('continue', [{
			type: MessageAttachmentKind.Simple,
			label: 'Previous conversation',
			displayKind: 'paste',
			modelRepresentation: 'Transcript text',
		}]);

		assert.deepStrictEqual(mockSession.sendRequests, [{
			prompt: 'continue',
			attachments: [{
				type: 'blob',
				data: encodeBase64(VSBuffer.fromString('Transcript text')),
				mimeType: 'text/plain',
				displayName: 'Previous conversation',
			}],
		}]);

		mockSession.messages = [{
			type: 'user.message',
			id: 'event-1',
			parentId: null,
			timestamp: new Date().toISOString(),
			data: {
				interactionId: 'message-1',
				content: 'continue',
				attachments: [{
					type: 'blob',
					data: encodeBase64(VSBuffer.fromString('Transcript text')),
					mimeType: 'text/plain',
					displayName: 'Previous conversation',
				}],
			},
		}];

		assert.deepStrictEqual((await session.getMessages())[0].message.attachments, [{
			type: MessageAttachmentKind.Simple,
			label: 'Previous conversation',
			modelRepresentation: 'Transcript text',
		}]);
	});

	test('`/compact` runs the history compact RPC and completes the turn with output', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		await session.send('/compact', undefined, 'turn-compact');

		// The compact command is handled inline via the history RPC and must
		// not fall through to a normal SDK `send()` turn.
		assert.strictEqual(mockSession.compactCalls.length, 1);
		assert.deepStrictEqual(mockSession.sendRequests, []);

		// The turn opened by the server is closed inline (the SDK never fires
		// `onIdle` for the compact path) after emitting the completion message.
		const actions = getActions(signals);
		const responseParts = actions.filter((a): a is ChatResponsePartAction => a.type === ActionType.ChatResponsePart);
		assert.strictEqual(responseParts.length, 1);
		const responsePart = responseParts[0];
		assert.strictEqual(responsePart.part.kind, ResponsePartKind.Markdown);
		if (responsePart.part.kind !== ResponsePartKind.Markdown) {
			throw new Error('unreachable');
		}
		assert.deepStrictEqual({
			turnId: responsePart.turnId,
			kind: responsePart.part.kind,
			content: responsePart.part.content,
		}, {
			turnId: 'turn-compact',
			kind: ResponsePartKind.Markdown,
			content: 'Compaction completed',
		});
		const turnComplete = actions.find(a => a.type === ActionType.ChatTurnComplete);
		assert.ok(turnComplete, 'expected the turn to complete');
		assert.strictEqual((turnComplete as ChatTurnCompleteAction).turnId, 'turn-compact');
	});

	test('`/compact` reports post-compaction context window usage before completing the turn', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		mockSession.compactResult = { success: true, tokensRemoved: 1200, messagesRemoved: 3, contextWindow: { currentTokens: 4500, tokenLimit: 128000, messagesLength: 7 } };

		await session.send('/compact', undefined, 'turn-compact');

		const actions = getActions(signals);
		const usage = actions.find(a => a.type === ActionType.ChatUsage) as ChatUsageAction | undefined;
		assert.ok(usage, 'expected a usage action reporting the shrunken context window');
		assert.deepStrictEqual({ turnId: usage.turnId, usage: usage.usage }, {
			turnId: 'turn-compact',
			usage: { inputTokens: 4500, outputTokens: 0, model: undefined },
		});
		// Usage must precede the turn completion so the reducer accepts it.
		const usageIndex = actions.findIndex(a => a.type === ActionType.ChatUsage);
		const completeIndex = actions.findIndex(a => a.type === ActionType.ChatTurnComplete);
		assert.ok(usageIndex >= 0 && completeIndex > usageIndex, 'usage emitted before turn complete');
	});

	test('`/compact` skips usage when the SDK omits the context window', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		mockSession.compactResult = { success: true, tokensRemoved: 0, messagesRemoved: 0 };

		await session.send('/compact', undefined, 'turn-compact');

		const usage = getActions(signals).find(a => a.type === ActionType.ChatUsage);
		assert.strictEqual(usage, undefined, 'no usage action without a context window');
	});

	test('`/compact` carries the last-seen model id on the post-compaction usage', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		// A prior model call sets `_lastSeenModelId`, which the compaction usage
		// reports so the context-usage widget can resolve the context window.
		mockSession.fire('assistant.usage', {
			inputTokens: 10,
			outputTokens: 20,
			model: 'claude-sonnet-4.6',
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);
		mockSession.compactResult = { success: true, tokensRemoved: 1200, messagesRemoved: 3, contextWindow: { currentTokens: 4500, tokenLimit: 128000, messagesLength: 7 } };

		await session.send('/compact', undefined, 'turn-compact');

		const usage = getActions(signals).reverse().find(a => a.type === ActionType.ChatUsage) as ChatUsageAction | undefined;
		assert.deepStrictEqual(usage?.usage, { inputTokens: 4500, outputTokens: 0, model: 'claude-sonnet-4.6' });
	});

	test('`/compact` completes the turn even when compaction reports failure', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		mockSession.compactResult = { success: false, tokensRemoved: 0, messagesRemoved: 0 };

		await session.send('/compact', undefined, 'turn-compact');

		assert.strictEqual(mockSession.compactCalls.length, 1);
		assert.deepStrictEqual(mockSession.sendRequests, []);
		const turnComplete = getActions(signals).find(a => a.type === ActionType.ChatTurnComplete);
		assert.ok(turnComplete, 'expected the turn to complete on a failed compaction');
	});

	test('`/compact` treats nothing-to-compact errors as completed', async () => {
		const logService = new CapturingLogService();
		const { session, mockSession, signals } = await createAgentSession(disposables, { logService });
		mockSession.compactError = new Error('NOTHING TO COMPACT for this conversation');

		await session.send('/compact', undefined, 'turn-compact');

		const actions = getActions(signals);
		assert.deepStrictEqual({
			compactCalls: mockSession.compactCalls.length,
			sendRequests: mockSession.sendRequests,
			errors: logService.errors,
			responseParts: actions
				.filter(a => a.type === ActionType.ChatResponsePart)
				.map(a => {
					const part = (a as ChatResponsePartAction).part;
					return part.kind === ResponsePartKind.Markdown ? { turnId: a.turnId, kind: part.kind, content: part.content } : { turnId: a.turnId, kind: part.kind };
				}),
			turnComplete: actions
				.filter(a => a.type === ActionType.ChatTurnComplete)
				.map(a => (a as ChatTurnCompleteAction).turnId),
		}, {
			compactCalls: 1,
			sendRequests: [],
			errors: [],
			responseParts: [{ turnId: 'turn-compact', kind: ResponsePartKind.Markdown, content: 'Compaction completed' }],
			turnComplete: ['turn-compact'],
		});
	});

	test('`/env` runs the runtime command when listed and emits markdown output', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		mockSession.commandListResult = {
			commands: [{
				name: 'env',
				kind: 'builtin',
				description: 'Show loaded environment details',
				allowDuringAgentExecution: true,
			}],
		};
		mockSession.commandInvokeResult = { kind: 'text', text: '## Environment\n\nLoaded.', markdown: true };

		await session.send('/env', undefined, 'turn-env');

		const actions = getActions(signals);
		assert.deepStrictEqual({
			commandListCalls: mockSession.commandListCalls,
			commandInvokeCalls: mockSession.commandInvokeCalls,
			sendRequests: mockSession.sendRequests,
			responseParts: actions
				.filter(a => a.type === ActionType.ChatResponsePart)
				.map(a => {
					const part = (a as ChatResponsePartAction).part;
					return part.kind === ResponsePartKind.Markdown ? { kind: part.kind, content: part.content } : { kind: part.kind };
				}),
			turnComplete: actions
				.filter(a => a.type === ActionType.ChatTurnComplete)
				.map(a => (a as ChatTurnCompleteAction).turnId),
		}, {
			commandListCalls: [{ includeBuiltins: true, includeSkills: true, includeClientCommands: true }],
			commandInvokeCalls: [{ name: 'env' }],
			sendRequests: [],
			responseParts: [{ kind: ResponsePartKind.Markdown, content: '## Environment\n\nLoaded.' }],
			turnComplete: ['turn-env'],
		});
	});

	test('`/env` escapes plain text runtime command output before emitting markdown', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		mockSession.commandListResult = {
			commands: [{
				name: 'env',
				kind: 'builtin',
				description: 'Show loaded environment details',
				allowDuringAgentExecution: true,
			}],
		};
		mockSession.commandInvokeResult = { kind: 'text', text: '*plain*\n- item', markdown: false };

		await session.send('/env', undefined, 'turn-env');

		const responsePart = getActions(signals).find(a => a.type === ActionType.ChatResponsePart) as ChatResponsePartAction | undefined;
		assert.strictEqual(responsePart?.part.kind, ResponsePartKind.Markdown);
		if (responsePart?.part.kind === ResponsePartKind.Markdown) {
			assert.strictEqual(responsePart.part.content, '\\*plain\\*\n\\- item');
		}
	});

	test('`/env` falls through to a normal SDK send when not listed', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		mockSession.commandListResult = { commands: [] };

		await session.send('/env', undefined, 'turn-env');

		assert.deepStrictEqual({
			commandListCalls: mockSession.commandListCalls,
			commandInvokeCalls: mockSession.commandInvokeCalls,
			sendRequests: mockSession.sendRequests,
			responseParts: getActions(signals).filter(a => a.type === ActionType.ChatResponsePart),
			turnComplete: getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete),
		}, {
			commandListCalls: [{ includeBuiltins: true, includeSkills: true, includeClientCommands: true }],
			commandInvokeCalls: [],
			sendRequests: [{ prompt: '/env', attachments: undefined }],
			responseParts: [],
			turnComplete: [],
		});
	});

	test('`/env` forwards trailing text as runtime command input', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		mockSession.commandListResult = {
			commands: [{
				name: 'env',
				kind: 'builtin',
				description: 'Show loaded environment details',
				allowDuringAgentExecution: true,
			}],
		};
		mockSession.commandInvokeResult = { kind: 'completed', message: 'done' };

		await session.send('/env details please', undefined, 'turn-env-input');

		const actions = getActions(signals);
		assert.deepStrictEqual({
			commandListCalls: mockSession.commandListCalls,
			commandInvokeCalls: mockSession.commandInvokeCalls,
			sendRequests: mockSession.sendRequests,
			responseParts: actions
				.filter(a => a.type === ActionType.ChatResponsePart)
				.map(a => {
					const part = (a as ChatResponsePartAction).part;
					return part.kind === ResponsePartKind.Markdown ? { kind: part.kind, content: part.content } : { kind: part.kind };
				}),
			turnComplete: actions
				.filter(a => a.type === ActionType.ChatTurnComplete)
				.map(a => (a as ChatTurnCompleteAction).turnId),
		}, {
			commandListCalls: [{ includeBuiltins: true, includeSkills: true, includeClientCommands: true }],
			commandInvokeCalls: [{ name: 'env', input: 'details please' }],
			sendRequests: [],
			responseParts: [{ kind: ResponsePartKind.Markdown, content: 'done' }],
			turnComplete: ['turn-env-input'],
		});
	});

	test('invokes non-local runtime slash commands via commands API', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		mockSession.commandListResult = {
			commands: [{
				name: 'focus',
				aliases: ['f'],
				kind: 'builtin',
				description: 'Focus on a scope',
				allowDuringAgentExecution: true,
				input: { hint: 'scope' },
			}],
		};
		mockSession.commandInvokeResult = { kind: 'completed', message: 'Focus done' };

		await session.send('/f src/vs/platform', undefined, 'turn-focus');

		const actions = getActions(signals);
		assert.deepStrictEqual({
			commandListCalls: mockSession.commandListCalls,
			commandInvokeCalls: mockSession.commandInvokeCalls,
			sendRequests: mockSession.sendRequests,
			responseParts: actions
				.filter(a => a.type === ActionType.ChatResponsePart)
				.map(a => {
					const part = (a as ChatResponsePartAction).part;
					return part.kind === ResponsePartKind.Markdown ? { kind: part.kind, content: part.content } : { kind: part.kind };
				}),
			turnComplete: actions
				.filter(a => a.type === ActionType.ChatTurnComplete)
				.map(a => (a as ChatTurnCompleteAction).turnId),
		}, {
			commandListCalls: [{ includeBuiltins: true, includeSkills: true, includeClientCommands: true }],
			commandInvokeCalls: [{ name: 'focus', input: 'src/vs/platform' }],
			sendRequests: [],
			responseParts: [{ kind: ResponsePartKind.Markdown, content: 'Focus done' }],
			turnComplete: ['turn-focus'],
		});
	});

	test('caches runtime slash command availability across checks', async () => {
		const { session, mockSession } = await createAgentSession(disposables);
		mockSession.commandListResult = {
			commands: [
				{
					name: 'env',
					kind: 'builtin',
					description: 'Show loaded environment details',
					allowDuringAgentExecution: true,
				},
				{
					name: 'review',
					kind: 'builtin',
					description: 'Run code review agent to analyze changes',
					allowDuringAgentExecution: false,
				},
				{
					name: 'not-a-builtin',
					kind: 'skill',
					description: 'Skill command',
					allowDuringAgentExecution: false,
				},
			],
		};

		assert.deepStrictEqual({
			env: await session.hasRuntimeSlashCommand('env'),
			review: await session.hasRuntimeSlashCommand('review'),
			skill: await session.hasRuntimeSlashCommand('not-a-builtin'),
			commandListCalls: mockSession.commandListCalls,
		}, {
			env: true,
			review: true,
			skill: true,
			commandListCalls: [{ includeBuiltins: true, includeSkills: true, includeClientCommands: true }],
		});
	});

	test('`/review` invokes runtime command when listed', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		mockSession.commandListResult = {
			commands: [{
				name: 'review',
				kind: 'builtin',
				description: 'Run code review agent to analyze changes',
				allowDuringAgentExecution: true,
				input: { hint: 'scope' },
			}],
		};
		mockSession.commandInvokeResult = { kind: 'completed', message: 'Review done' };

		await session.send('/review focus on tests', undefined, 'turn-review');

		assert.deepStrictEqual({
			commandListCalls: mockSession.commandListCalls,
			commandInvokeCalls: mockSession.commandInvokeCalls,
			sendRequests: mockSession.sendRequests,
			responseParts: getActions(signals)
				.filter(a => a.type === ActionType.ChatResponsePart)
				.map(a => {
					const part = (a as ChatResponsePartAction).part;
					return part.kind === ResponsePartKind.Markdown ? { kind: part.kind, content: part.content } : { kind: part.kind };
				}),
			turnComplete: getActions(signals)
				.filter(a => a.type === ActionType.ChatTurnComplete)
				.map(a => (a as ChatTurnCompleteAction).turnId),
		}, {
			commandListCalls: [{ includeBuiltins: true, includeSkills: true, includeClientCommands: true }],
			commandInvokeCalls: [{ name: 'review', input: 'focus on tests' }],
			sendRequests: [],
			responseParts: [{ kind: ResponsePartKind.Markdown, content: 'Review done' }],
			turnComplete: ['turn-review'],
		});
	});

	test('`/security-review` falls through to normal send when runtime command is unavailable', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);
		mockSession.commandListResult = { commands: [] };

		await session.send('/security-review', undefined, 'turn-security-review');

		assert.deepStrictEqual({
			commandListCalls: mockSession.commandListCalls,
			commandInvokeCalls: mockSession.commandInvokeCalls,
			sendRequests: mockSession.sendRequests,
			responseParts: getActions(signals).filter(a => a.type === ActionType.ChatResponsePart),
			turnComplete: getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete),
		}, {
			commandListCalls: [{ includeBuiltins: true, includeSkills: true, includeClientCommands: true }],
			commandInvokeCalls: [],
			sendRequests: [{ prompt: '/security-review', attachments: undefined }],
			responseParts: [],
			turnComplete: [],
		});
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
			// `copilotUsage` is marked `asInternal` in the SDK schema so it is not on the public type, but is present at runtime.
			copilotUsage: { totalNanoAiu: 500_000_000, tokenDetails: [] },
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);
		mockSession.fire('assistant.usage', {
			model: 'claude-sonnet-4.6',
			inputTokens: 30,
			outputTokens: 40,
			cost: 2,
			copilotUsage: { totalNanoAiu: 750_000_000, tokenDetails: [] },
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);

		const usageActions = signals
			.filter((s): s is IAgentActionSignal => s.kind === 'action')
			.map(s => s.action)
			.filter(a => a.type === ActionType.ChatUsage);

		assert.deepStrictEqual(usageActions.map(a => a.usage), [
			{
				inputTokens: 10,
				outputTokens: 20,
				model: 'claude-sonnet-4.6',
				cacheReadTokens: 5,
				_meta: {
					cost: 2,
					copilotUsage: { totalNanoAiu: 500_000_000, tokenDetails: [] },
				},
			},
			{
				inputTokens: 30,
				outputTokens: 40,
				model: 'claude-sonnet-4.6',
				cacheReadTokens: undefined,
				_meta: {
					cost: 2,
					copilotUsage: { totalNanoAiu: 1_250_000_000, tokenDetails: [] },
				},
			},
		]);
	});

	test('reports the parent turn aggregate and additionally the per-subagent component', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-1');

		// Map the subagent's agentId to its parent tool call id.
		mockSession.fire('subagent.started', {
			toolCallId: 'tc-subagent',
			agentName: 'explore',
			agentDisplayName: 'Explore',
			agentDescription: 'Explore tests',
		} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-1' });

		// Parent agent usage (no agentId) only contributes to the parent aggregate.
		mockSession.fire('assistant.usage', {
			model: 'claude-opus-4.8',
			inputTokens: 10,
			outputTokens: 20,
			copilotUsage: { totalNanoAiu: 500_000_000, tokenDetails: [] },
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);

		// Subagent usage (its agentId) is reported twice: folded into the parent
		// aggregate AND emitted to the subagent's child session as its component.
		mockSession.fire('assistant.usage', {
			model: 'gpt-5.5',
			inputTokens: 5,
			outputTokens: 7,
			copilotUsage: { totalNanoAiu: 200_000_000, tokenDetails: [] },
		} as unknown as SessionEventPayload<'assistant.usage'>['data'], { agentId: 'agent-1' });

		mockSession.fire('assistant.usage', {
			model: 'gpt-5.5',
			inputTokens: 6,
			outputTokens: 8,
			copilotUsage: { totalNanoAiu: 300_000_000, tokenDetails: [] },
		} as unknown as SessionEventPayload<'assistant.usage'>['data'], { agentId: 'agent-1' });

		const usageSignals = signals.flatMap(signal => {
			if (signal.kind !== 'action' || signal.action.type !== ActionType.ChatUsage) {
				return [];
			}
			return [{
				parentToolCallId: signal.parentToolCallId,
				model: signal.action.usage.model,
				totalNanoAiu: (signal.action.usage._meta as UsageInfoMeta | undefined)?.copilotUsage?.totalNanoAiu,
			}];
		});

		assert.deepStrictEqual(usageSignals, [
			// Parent-only call → parent aggregate.
			{ parentToolCallId: undefined, model: 'claude-opus-4.8', totalNanoAiu: 500_000_000 },
			// First subagent call → parent aggregate grows, plus the subagent component.
			{ parentToolCallId: undefined, model: 'gpt-5.5', totalNanoAiu: 700_000_000 },
			{ parentToolCallId: 'tc-subagent', model: 'gpt-5.5', totalNanoAiu: 200_000_000 },
			// Second subagent call → parent aggregate grows, plus the subagent component.
			{ parentToolCallId: undefined, model: 'gpt-5.5', totalNanoAiu: 1_000_000_000 },
			{ parentToolCallId: 'tc-subagent', model: 'gpt-5.5', totalNanoAiu: 500_000_000 },
		]);
	});

	test('forwards account quota snapshots on usage metadata', async () => {
		const { session, mockSession, signals } = await createAgentSession(disposables);

		session.resetTurnState('turn-quota');
		mockSession.fire('assistant.usage', {
			model: 'claude-sonnet-4.6',
			inputTokens: 10,
			outputTokens: 20,
			// `quotaSnapshots` is marked `asInternal` in the SDK schema so it is not on the public type, but is present at runtime.
			quotaSnapshots: {
				premium_interactions: {
					isUnlimitedEntitlement: false,
					entitlementRequests: 300,
					usedRequests: 75,
					usageAllowedWithExhaustedQuota: true,
					remainingPercentage: 75,
					overage: 1.5,
					overageAllowedWithExhaustedQuota: true,
					resetDate: '2026-07-01T00:00:00.000Z',
				},
			},
		} as unknown as SessionEventPayload<'assistant.usage'>['data']);

		const usageActions = signals
			.filter((s): s is IAgentActionSignal => s.kind === 'action')
			.map(s => s.action)
			.filter(a => a.type === ActionType.ChatUsage);

		assert.deepStrictEqual(usageActions.map(a => a.usage._meta?.quotaSnapshots), [
			{
				premium_interactions: {
					isUnlimitedEntitlement: false,
					entitlementRequests: 300,
					usedRequests: 75,
					remainingPercentage: 75,
					overage: 1.5,
					overageAllowedWithExhaustedQuota: true,
					resetDate: '2026-07-01T00:00:00.000Z',
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
			const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables);
			const resultPromise = runtime.handlePermissionRequest({
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
				const { runtime, signals } = await createAgentSession(disposables);
				const result = await runtime.handlePermissionRequest({
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
				const { runtime, signals } = await createAgentSession(disposables, { environmentServiceRegistration: 'native' });
				const result = await runtime.handlePermissionRequest({
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
				const { runtime } = await createAgentSession(disposables, {
					environmentServiceRegistration: 'none',
					logService,
				});

				await assert.rejects(
					runtime.handlePermissionRequest({
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
			const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables);
			const resultPromise = runtime.handlePermissionRequest({
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
				const { runtime, signals } = await createAgentSession(disposables);
				const result = await runtime.handlePermissionRequest({
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
				const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables);
				const resultPromise = runtime.handlePermissionRequest({
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
				const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables);
				const sessionDir = join('/mock-state-home', '.copilot', 'session-state', 'test-session-1');
				const resultPromise = runtime.handlePermissionRequest({
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
			const { runtime, signals } = await createAgentSession(disposables);

			// Layout 1: <timestamp>-copilot-tool-output-<id>.txt
			const result1 = await runtime.handlePermissionRequest({
				kind: 'read',
				path: join('/mock-tmp', '1730000000000-copilot-tool-output-abc123.txt'),
				toolCallId: 'tc-tool-output-1',
			});
			assert.strictEqual(result1.kind, 'approve-once');

			// Layout 2: copilot-tool-output-<timestamp>-<id>.txt
			const result2 = await runtime.handlePermissionRequest({
				kind: 'read',
				path: join('/mock-tmp', 'copilot-tool-output-1730000000000-abc123.txt'),
				toolCallId: 'tc-tool-output-2',
			});
			assert.strictEqual(result2.kind, 'approve-once');

			assert.strictEqual(signals.length, 0);
		});

		test('does not auto-approve tool-output-named files outside tmpdir', async () => {
			const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables);
			const resultPromise = runtime.handlePermissionRequest({
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
			const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables);
			const resultPromise = runtime.handlePermissionRequest({
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
			const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables);
			const resultPromise = runtime.handlePermissionRequest({
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
			const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables);

			const resultPromise = runtime.handlePermissionRequest({
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
			const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables);

			// Kick off permission request but don't await — it will block
			const resultPromise = runtime.handlePermissionRequest({
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
			const { runtime } = await createAgentSession(disposables);
			const result = await runtime.handlePermissionRequest({ kind: 'write' });
			assert.strictEqual(result.kind, 'reject');
		});

		test('denied-interactively when user denies', async () => {
			const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables);
			const resultPromise = runtime.handlePermissionRequest({
				kind: 'shell',
				toolCallId: 'tc-3',
			});

			await waitForSignal(s => s.kind === 'pending_confirmation');
			assert.strictEqual(signals.length, 1);
			session.respondToPermissionRequest('tc-3', false);
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'reject');
		});

		test('auto-approves sandboxed-by-default shell command without prompting', async () => {
			const { runtime, signals } = await createAgentSession(disposables, {
				rootValues: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On } },
			});

			const result = await runtime.handlePermissionRequest({
				kind: 'shell',
				toolCallId: 'tc-sandboxed',
				fullCommandText: 'cat ~/something.txt',
			});

			assert.strictEqual(result.kind, 'approve-once');
			assert.strictEqual(signals.length, 0);
		});

		test('does not auto-approve a shell command that opted out of the sandbox', async () => {
			const { session, runtime, signals, waitForSignal } = await createAgentSession(disposables, {
				rootValues: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On } },
			});

			const resultPromise = runtime.handlePermissionRequest({
				kind: 'shell',
				toolCallId: 'tc-sandboxbypass',
				fullCommandText: 'cat ~/something.txt',
				requestSandboxBypass: true,
			});

			// Must fall through to the normal confirmation flow rather than
			// auto-approving, since the command escapes the sandbox.
			await waitForSignal(s => s.kind === 'pending_confirmation');
			assert.strictEqual(signals.length, 1);
			assert.ok(session.respondToPermissionRequest('tc-sandboxbypass', true));
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'approve-once');
		});

		test('per-request sandbox: applies the configured policy under default approvals', async () => {
			const { session, mockSession } = await createAgentSession(disposables, {
				rootValues: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On } },
			});

			await session.send('hello', undefined, 'turn-1');

			assert.deepStrictEqual(mockSession.sandboxConfigUpdates.at(-1), {
				enabled: true,
				allowBypass: true,
				userPolicy: { filesystem: {}, network: { allowOutbound: false } },
			});
		});

		test('per-request sandbox: disabled under session bypass approvals', async () => {
			const { session, mockSession } = await createAgentSession(disposables, {
				rootValues: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On } },
				configValues: { [SessionConfigKey.AutoApprove]: 'autoApprove' },
			});

			await session.send('hello', undefined, 'turn-1');

			assert.deepStrictEqual(mockSession.sandboxConfigUpdates.at(-1), { enabled: false });
		});

		test('per-request sandbox: disabled under autopilot mode', async () => {
			const { session, mockSession } = await createAgentSession(disposables, {
				rootValues: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On } },
				configValues: { [SessionConfigKey.Mode]: 'autopilot' },
			});

			await session.send('hello', undefined, 'turn-1');

			assert.deepStrictEqual(mockSession.sandboxConfigUpdates.at(-1), { enabled: false });
		});

		test('per-request sandbox: disabled under global auto-approve', async () => {
			const { session, mockSession } = await createAgentSession(disposables, {
				rootValues: {
					[AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On },
					[AgentHostGlobalAutoApproveEnabledConfigKey]: true,
				},
			});

			await session.send('hello', undefined, 'turn-1');

			assert.deepStrictEqual(mockSession.sandboxConfigUpdates.at(-1), { enabled: false });
		});

		test('per-request sandbox: explicitly disabled on Windows', async () => {
			const { session, mockSession } = await createAgentSession(disposables, {
				rootValues: { [AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On } },
				platform: 'win32',
			});

			await session.send('hello', undefined, 'turn-1');

			assert.deepStrictEqual(mockSession.sandboxConfigUpdates.at(-1), { enabled: false });
		});

		test('per-request sandbox: explicitly disabled when the sandbox setting is off', async () => {
			const { session, mockSession } = await createAgentSession(disposables);

			await session.send('hello', undefined, 'turn-1');

			assert.deepStrictEqual(mockSession.sandboxConfigUpdates.at(-1), { enabled: false });
		});

		test('per-request sandbox: left untouched when the custom terminal tool is enabled', async () => {
			const { session, mockSession } = await createAgentSession(disposables, {
				rootValues: {
					[AgentHostSandboxConfigKey.Sandbox]: { [AgentHostSandboxKey.Enabled]: AgentSandboxEnabledValue.On },
					[CopilotCliConfigKey.EnableCustomTerminalTool]: true,
				},
			});

			await session.send('hello', undefined, 'turn-1');

			// The host's own terminal sandbox engine handles containment, so the
			// SDK sandbox config is not managed in this mode.
			assert.deepStrictEqual(mockSession.sandboxConfigUpdates, []);
		});

		test('pending permissions are denied on dispose', async () => {
			const { session, runtime } = await createAgentSession(disposables);
			const resultPromise = runtime.handlePermissionRequest({
				kind: 'write',
				toolCallId: 'tc-4',
			});

			session.dispose();
			const result = await resultPromise;
			assert.strictEqual(result.kind, 'reject');
		});

		test('pending permissions are denied on abort', async () => {
			const { session, runtime } = await createAgentSession(disposables);
			const resultPromise = runtime.handlePermissionRequest({
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
			assert.strictEqual(signals.find(s => s.kind === 'action' && (s as IAgentActionSignal).action.type === ActionType.ChatTurnStarted), undefined);

			mockSession.fire('user.message', {
				content: 'focus on tests',
				interactionId: 'interaction-steer',
			} as SessionEventPayload<'user.message'>['data']);

			const actions = signals.filter(s => s.kind === 'action').map(s => (s as IAgentActionSignal).action);
			const turnComplete = actions.find(a => a.type === ActionType.ChatTurnComplete);
			const turnStarted = actions.find(a => a.type === ActionType.ChatTurnStarted);
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
				.find(a => a.type === ActionType.ChatTurnStarted)!;

			mockSession.fire('assistant.message_delta', {
				deltaContent: 'No problem',
			} as SessionEventPayload<'assistant.message_delta'>['data']);

			const responseParts = signals
				.filter(s => s.kind === 'action')
				.map(s => (s as IAgentActionSignal).action)
				.filter(a => a.type === ActionType.ChatResponsePart);
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

			const turnStarted = signals.find(s => s.kind === 'action' && (s as IAgentActionSignal).action.type === ActionType.ChatTurnStarted);
			assert.strictEqual(turnStarted, undefined, 'synthetic user messages should not promote steering to a turn');
		});

		test('does not flip turns when the user.message content does not match', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-original');

			await session.sendSteering({ id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });
			mockSession.fire('user.message', {
				content: 'something completely different',
			} as SessionEventPayload<'user.message'>['data']);

			const turnStarted = signals.find(s => s.kind === 'action' && (s as IAgentActionSignal).action.type === ActionType.ChatTurnStarted);
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

		test('an abort during a steering turn tears it down without completing it', async () => {
			// A steering turn is promoted mid-loop while the SDK is actively
			// producing its response, so it must be `running` (not `pending`).
			// Otherwise an abort's terminal idle would treat it as a not-yet-
			// started queued turn and leave it open, and a later idle would
			// orphan-complete it.
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-original');
			mockSession.fire('assistant.turn_start', { turnId: 'sdk-0' } as SessionEventPayload<'assistant.turn_start'>['data']);

			await session.sendSteering({ id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });
			mockSession.fire('user.message', {
				content: 'focus on tests',
				interactionId: 'interaction-steer',
			} as SessionEventPayload<'user.message'>['data']);

			const steeringTurnId = getActions(signals).find(a => a.type === ActionType.ChatTurnStarted)?.turnId;
			assert.ok(steeringTurnId && steeringTurnId !== 'turn-original', 'steering should start its own turn');

			// Abort: the running steering turn is finalized by the client's
			// ChatTurnCancelled, so its terminal idle must tear it down rather
			// than complete it — and a subsequent stray idle must find no turn.
			mockSession.fire('session.idle', { aborted: true } as SessionEventPayload<'session.idle'>['data']);
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			const steeringCompletions = getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete && a.turnId === steeringTurnId);
			assert.strictEqual(steeringCompletions.length, 0, 'an aborted steering turn must not be completed');
		});

		test('does not signal cleanup when send fails', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);

			mockSession.send = async () => { throw new Error('send failed'); };

			await session.sendSteering({ id: 'steer-fail', message: { text: 'will fail', origin: { kind: MessageKind.User } } });

			const consumed = signals.find(s => s.kind === 'steering_consumed');
			const turnStarted = signals.find(s => s.kind === 'action' && (s as IAgentActionSignal).action.type === ActionType.ChatTurnStarted);
			assert.strictEqual(consumed, undefined, 'should not fire steering_consumed on failure');
			assert.strictEqual(turnStarted, undefined, 'should not start a new turn on failure');
		});
	});

	// ---- system.notification ----

	suite('system.notification', () => {

		test('translator handles every notification kind and ignores empty content', () => {
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
				messageText: '`sleep 6` completed',
				startsTurn: true,
			});

			assert.deepStrictEqual(buildCopilotSystemNotification({
				...base,
				data: {
					content: 'Detached done',
					kind: { type: 'shell_detached_completed', shellId: 'detached-a' },
				},
			}), {
				messageText: 'Shell `detached-a` completed',
				startsTurn: true,
			});

			assert.deepStrictEqual(buildCopilotSystemNotification({
				...base,
				data: {
					content: 'Agent done',
					kind: { type: 'agent_completed', agentId: 'agent-a', agentType: 'task', status: 'completed' },
				},
			}), {
				messageText: 'Background agent agent-a completed',
				startsTurn: true,
			});

			assert.deepStrictEqual(buildCopilotSystemNotification({
				...base,
				data: {
					content: 'Agent failed',
					kind: { type: 'agent_completed', agentId: 'agent-b', agentType: 'task', status: 'failed' },
				},
			}), {
				messageText: 'Background agent agent-b failed',
				startsTurn: true,
			});

			assert.deepStrictEqual(buildCopilotSystemNotification({
				...base,
				data: {
					content: '<system_notification>\nAgent idle\n</system_notification>',
					kind: { type: 'agent_idle', agentId: 'agent-a', agentType: 'task' },
				},
			}), {
				messageText: 'Background agent agent-a is complete',
				startsTurn: true,
			});

			assert.deepStrictEqual(buildCopilotSystemNotification({
				...base,
				data: {
					content: 'Inbox message',
					kind: { type: 'new_inbox_message', entryId: 'entry-a', senderName: 'sidekick', senderType: 'sidekick-agent', summary: 'New message' },
				},
			}), {
				messageText: 'New inbox message from sidekick',
				startsTurn: false,
			});

			assert.deepStrictEqual(buildCopilotSystemNotification({
				...base,
				data: {
					content: 'Discovered instruction',
					kind: { type: 'instruction_discovered', sourcePath: 'packages/billing/AGENTS.md', triggerFile: 'packages/billing/src/index.ts', triggerTool: 'view', description: 'AGENTS.md from packages/billing/' },
				},
			}), {
				messageText: 'Instruction discovered: AGENTS.md from packages/billing/',
				startsTurn: false,
			});

			assert.strictEqual(buildCopilotSystemNotification({
				...base,
				data: {
					content: '   ',
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
			const turnStarted = actions.find(a => a.type === ActionType.ChatTurnStarted);
			assert.ok(turnStarted, 'should synthesize a fresh turn');
			assert.deepStrictEqual(turnStarted.message, { text: '`sleep 6` completed', origin: { kind: MessageKind.SystemNotification } });
		});

		test('agent idle notification routes resumed SDK events into a generated system turn', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);

			mockSession.fire('system.notification', {
				content: '<system_notification>\nAgent "agent-a" has finished processing and is now idle.\n</system_notification>',
				kind: { type: 'agent_idle', agentId: 'agent-a', agentType: 'general-purpose', description: 'Investigate the issue' },
			} as SessionEventPayload<'system.notification'>['data']);
			const turnStarted = getActions(signals).find(a => a.type === ActionType.ChatTurnStarted)!;

			mockSession.fire('assistant.message_delta', {
				deltaContent: 'Reading the background agent result now.',
			} as SessionEventPayload<'assistant.message_delta'>['data']);
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			assert.deepStrictEqual({
				message: turnStarted.message,
				responseTurnId: (getActions(signals).find(a => a.type === ActionType.ChatResponsePart && a.part.kind === ResponsePartKind.Markdown) as ChatResponsePartAction | undefined)?.turnId,
				completedTurnId: (getActions(signals).find(a => a.type === ActionType.ChatTurnComplete) as ChatTurnCompleteAction | undefined)?.turnId,
			}, {
				message: { text: 'Background agent agent-a is complete', origin: { kind: MessageKind.SystemNotification } },
				responseTurnId: turnStarted.turnId,
				completedTurnId: turnStarted.turnId,
			});
		});

		test('agent idle notification during an active turn appends a SystemNotification response part', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-active');

			mockSession.fire('system.notification', {
				content: 'Agent "agent-a" has finished processing and is now idle.',
				kind: { type: 'agent_idle', agentId: 'agent-a', agentType: 'general-purpose' },
			} as SessionEventPayload<'system.notification'>['data']);

			const actions = getActions(signals);
			const systemPart = actions.find(a => a.type === ActionType.ChatResponsePart && a.part.kind === ResponsePartKind.SystemNotification) as ChatResponsePartAction | undefined;
			assert.deepStrictEqual({
				turnStarted: actions.find(a => a.type === ActionType.ChatTurnStarted),
				turnId: systemPart?.turnId,
				part: systemPart?.part,
			}, {
				turnStarted: undefined,
				turnId: 'turn-active',
				part: {
					kind: ResponsePartKind.SystemNotification,
					content: 'Background agent agent-a is complete',
				},
			});
		});

		test('passive notifications render only within an active turn', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);

			mockSession.fire('system.notification', {
				content: 'Inbox from sidekick',
				kind: { type: 'new_inbox_message', entryId: 'entry-a', senderName: 'sidekick', senderType: 'sidekick-agent', summary: 'New message' },
			} as SessionEventPayload<'system.notification'>['data']);
			assert.deepStrictEqual(getActions(signals), []);

			session.resetTurnState('turn-active');
			mockSession.fire('system.notification', {
				content: 'Inbox from sidekick',
				kind: { type: 'new_inbox_message', entryId: 'entry-a', senderName: 'sidekick', senderType: 'sidekick-agent', summary: 'New message' },
			} as SessionEventPayload<'system.notification'>['data']);
			mockSession.fire('system.notification', {
				content: 'Discovered instruction',
				kind: { type: 'instruction_discovered', sourcePath: 'packages/billing/AGENTS.md', triggerFile: 'packages/billing/src/index.ts', triggerTool: 'view', description: 'AGENTS.md from packages/billing/' },
			} as SessionEventPayload<'system.notification'>['data']);

			assert.deepStrictEqual(getActions(signals)
				.filter(action => action.type === ActionType.ChatResponsePart)
				.map(action => action.part), [
				{ kind: ResponsePartKind.SystemNotification, content: 'New inbox message from sidekick' },
				{ kind: ResponsePartKind.SystemNotification, content: 'Instruction discovered: AGENTS.md from packages/billing/' },
			]);
		});

		test('generated system turn completes on session.idle', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);

			mockSession.fire('system.notification', {
				content: 'Shell command completed',
				kind: { type: 'shell_completed', shellId: 'shell-a', exitCode: 0, description: 'sleep 6' },
			} as SessionEventPayload<'system.notification'>['data']);
			const turnStarted = getActions(signals).find(a => a.type === ActionType.ChatTurnStarted)!;

			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			const turnComplete = getActions(signals).find(a => a.type === ActionType.ChatTurnComplete);
			assert.ok(turnComplete, 'expected idle to complete the generated turn');
			assert.strictEqual((turnComplete as { turnId: string }).turnId, turnStarted.turnId);
		});

		test('a late event after a completed turn is dropped and logged (never targets the stale turn id)', async () => {
			const logService = new CapturingLogService();
			const { session, mockSession, signals } = await createAgentSession(disposables, { logService });
			session.resetTurnState('turn-old');

			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);
			mockSession.fire('assistant.message_delta', {
				deltaContent: 'late text',
			} as SessionEventPayload<'assistant.message_delta'>['data']);

			// With no active turn, the late delta is dropped (not emitted even as a
			// no-op), so it can never be attributed to the stale 'turn-old', and the
			// unexpected state is surfaced via an error log.
			const markdownActions = getActions(signals)
				.filter(a => a.type === ActionType.ChatResponsePart && a.part.kind === ResponsePartKind.Markdown);
			assert.strictEqual(markdownActions.length, 0, 'the late delta must be dropped, not emitted');
			assert.ok(logService.errors.some(e => /no active turn/i.test(String(e.first))), 'the dropped delta should be logged');
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
			assert.ok(isAction(toolStart, ActionType.ChatToolCallStart));
			if (isAction(toolStart, ActionType.ChatToolCallStart)) {
				const action = toolStart.action as ChatToolCallStartAction;
				assert.strictEqual(action.toolCallId, 'tc-10');
				assert.strictEqual(action.toolName, 'bash');
			}
		});

		test('tool_start derives intention from a shell tool description argument', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-intent');

			// The shell tool's own `description` argument carries the intention.
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-intent',
				toolName: 'bash',
				arguments: { command: 'ls', description: 'List files in the repo root' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			const toolStart = signals.find(s => isAction(s, ActionType.ChatToolCallStart));
			assert.ok(toolStart && isAction(toolStart, ActionType.ChatToolCallStart));
			assert.strictEqual((toolStart.action as ChatToolCallStartAction).intention, 'List files in the repo root');
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
			assert.ok(isAction(readySignal, ActionType.ChatToolCallReady));
			if (isAction(readySignal, ActionType.ChatToolCallReady)) {
				const action = readySignal.action as ChatToolCallReadyAction;
				assert.strictEqual(action.toolInput, 'npm test');
			}
			// toolArguments in _meta on the tool_start signal (signals[0])
			const startSignal = signals[0];
			assert.ok(isAction(startSignal, ActionType.ChatToolCallStart));
			if (isAction(startSignal, ActionType.ChatToolCallStart)) {
				const meta = (startSignal.action as ChatToolCallStartAction)._meta;
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
			assert.ok(isAction(completeSignal, ActionType.ChatToolCallComplete));
			if (isAction(completeSignal, ActionType.ChatToolCallComplete)) {
				const action = completeSignal.action as ChatToolCallCompleteAction;
				const past = action.result.pastTenseMessage;
				const pastStr = typeof past === 'string' ? past : (past?.markdown ?? '');
				assert.ok(!pastStr.includes('cd /repo/project'), `past-tense message should not contain stripped prefix, got: ${pastStr}`);
				assert.ok(pastStr.includes('npm test'), `past-tense message should contain the rewritten command, got: ${pastStr}`);
			}
		});

		test('live tool_complete preserves SDK shell_exit content', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-shell-exit',
				toolName: 'bash',
				arguments: { command: 'gti status' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-shell-exit',
				success: true,
				result: {
					content: 'command not found\n',
					contents: [{ type: 'shell_exit', shellId: '0', exitCode: 127, cwd: '/repo' }],
				},
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			assert.strictEqual(signals.length, 3);
			const completeSignal = signals[2];
			assert.ok(isAction(completeSignal, ActionType.ChatToolCallComplete));
			if (isAction(completeSignal, ActionType.ChatToolCallComplete)) {
				const action = completeSignal.action as ChatToolCallCompleteAction;
				assert.strictEqual(action.result.success, true);
				assert.deepStrictEqual(action.result.content, [
					{ type: ToolResultContentType.Text, text: 'command not found\n' },
					{ type: ToolResultContentType.ShellExit, shellId: '0', exitCode: 127, cwd: '/repo' },
				]);
				assert.ok(!action.result.content?.some(content => content.type === ToolResultContentType.Terminal));
			}
		});

		test('live task_complete emits root markdown instead of a tool call', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-task-complete',
				toolName: 'task_complete',
				arguments: { summary: 'Completed the requested work.' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			mockSession.fire('tool.execution_complete', {
				toolCallId: 'tc-task-complete',
				success: true,
				result: { content: 'Completed the requested work.' },
			} as SessionEventPayload<'tool.execution_complete'>['data']);

			const actions = getActions(signals);
			assert.deepStrictEqual(actions.map(a => a.type), [ActionType.ChatResponsePart]);
			const responsePart = actions[0] as ChatResponsePartAction;
			assert.strictEqual(responsePart.part.kind, ResponsePartKind.Markdown);
			if (responsePart.part.kind !== ResponsePartKind.Markdown) {
				return;
			}
			assert.deepStrictEqual(responsePart.part, {
				kind: ResponsePartKind.Markdown,
				id: responsePart.part.id,
				content: '\n\n**Task completed:** Completed the requested work.',
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
			assert.ok(isAction(readySignal, ActionType.ChatToolCallReady));
			if (isAction(readySignal, ActionType.ChatToolCallReady)) {
				assert.strictEqual((readySignal.action as ChatToolCallReadyAction).toolInput, 'cd /tmp && ls');
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
			assert.ok(isAction(readySignal, ActionType.ChatToolCallReady));
			if (isAction(readySignal, ActionType.ChatToolCallReady)) {
				assert.strictEqual((readySignal.action as ChatToolCallReadyAction).toolInput, 'cd /repo/project && npm test');
			}
		});

		test('edit hooks resolve relative apply_patch file paths against workingDirectory', async () => {
			const capturedRuntime: { current?: ICopilotSessionRuntime } = {};
			const workingDirectory = URI.file('/repo/project');
			const absolutePath = URI.file('/tmp/absolute.ts').fsPath;
			const { session } = await createAgentSession(disposables, { workingDirectory, captureRuntime: capturedRuntime });
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

			await capturedRuntime.current!.handlePreToolUse({
				sessionId: 'test-session-1',
				timestamp: new Date(0),
				workingDirectory: '/repo/project',
				toolName: 'apply_patch',
				toolArgs: patch,
			});
			await capturedRuntime.current!.handlePostToolUse({
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
			sessionInternals._editTracker.takeCompletedEdit = async (_turnId, _toolCallId, path, _toolName, _toolInput, _modelId) => {
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

			await waitForSignal(s => isAction(s, ActionType.ChatToolCallComplete));

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

		test('assistant.intent surfaces as session activity', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('assistant.intent', { intent: 'Reading repo docs' });
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			assert.deepStrictEqual(signals
				.filter(signal => isAction(signal, ActionType.SessionActivityChanged))
				.map(signal => (signal.action as { activity: string | undefined }).activity), [
				'Reading repo docs',
				undefined,
			]);
		});

		test('assistant.intent clears session activity', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('assistant.intent', { intent: 'Reading repo docs' });
			mockSession.fire('assistant.intent', { intent: '' });

			assert.deepStrictEqual(signals
				.filter(signal => isAction(signal, ActionType.SessionActivityChanged))
				.map(signal => (signal.action as { activity: string | undefined }).activity), [
				'Reading repo docs',
				undefined,
			]);
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
			assert.ok(isAction(completeSignal, ActionType.ChatToolCallComplete));
			if (isAction(completeSignal, ActionType.ChatToolCallComplete)) {
				const action = completeSignal.action as ChatToolCallCompleteAction;
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
			assert.ok(isAction(signals[0], ActionType.ChatTurnComplete));
		});

		test('idle event without an active turn is ignored', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			assert.strictEqual(signals.length, 0);
		});

		test('drops and logs a markdown delta emitted with no active turn', async () => {
			// A delta should only arrive while a turn is active. With none, we
			// can't persist the part id (so every delta would allocate a fresh
			// part) and the action would carry an empty turnId — drop it and log.
			const logService = new CapturingLogService();
			const { mockSession, signals } = await createAgentSession(disposables, { logService });

			// No resetTurnState → no active turn.
			mockSession.fire('assistant.message_delta', {
				deltaContent: 'orphan text',
			} as SessionEventPayload<'assistant.message_delta'>['data']);

			const parts = getActions(signals).filter(a => a.type === ActionType.ChatResponsePart || a.type === ActionType.ChatDelta);
			assert.strictEqual(parts.length, 0, 'no response part/delta should be emitted without an active turn');
			assert.strictEqual(logService.errors.length, 1, 'should log an error');
			assert.match(String(logService.errors[0].first), /no active turn/i);
		});

		test('abort-induced idle does not complete a pending queued turn', async () => {
			// Repro for the blank-response-after-abort race: a running turn is
			// aborted while a queued message exists. The queued message's
			// `send()` creates a fresh (pending) turn before the abort's
			// terminal `session.idle` is delivered. That idle must not complete
			// the queued turn — structurally, because it has not started running
			// yet, and because the idle carries `aborted: true`.
			const { session, mockSession, signals } = await createAgentSession(disposables);

			// The queued message has started its (pending) turn by the time the
			// abort's terminal idle arrives — no SDK event has run it yet.
			session.resetTurnState('turn-queued');
			mockSession.fire('session.idle', { aborted: true } as SessionEventPayload<'session.idle'>['data']);

			assert.strictEqual(
				getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete).length,
				0,
				'abort-induced idle must not complete the pending queued turn',
			);

			// The queued turn now actually runs (first SDK event) and then
			// completes on its own (non-abort) idle.
			mockSession.fire('assistant.turn_start', { turnId: 'sdk-0' } as SessionEventPayload<'assistant.turn_start'>['data']);
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			const completions = getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete);
			assert.strictEqual(completions.length, 1, 'the queued turn should complete on its real idle');
			assert.strictEqual((completions[0] as ChatTurnCompleteAction).turnId, 'turn-queued');
		});

		test('abort-induced idle tears down a running turn without completing it', async () => {
			// Plain abort (no queued message): the running turn is finalized by
			// the client-dispatched ChatTurnCancelled, so the abort's idle must
			// not also emit a ChatTurnComplete. The turn handle is dropped so a
			// later stray idle cannot complete it.
			const { session, mockSession, signals } = await createAgentSession(disposables);

			session.resetTurnState('turn-aborted');
			mockSession.fire('assistant.turn_start', { turnId: 'sdk-0' } as SessionEventPayload<'assistant.turn_start'>['data']);
			mockSession.fire('session.idle', { aborted: true } as SessionEventPayload<'session.idle'>['data']);

			assert.strictEqual(
				getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete).length,
				0,
				'abort-induced idle must not complete the running aborted turn',
			);

			// A subsequent stray idle has no turn to act on.
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);
			assert.strictEqual(getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete).length, 0);
		});

		test('a running turn after a prior abort still completes on its idle', async () => {
			// No lingering state across turns: the next turn completes normally.
			const { session, mockSession, signals } = await createAgentSession(disposables);

			session.resetTurnState('turn-aborted');
			mockSession.fire('assistant.turn_start', { turnId: 'sdk-0' } as SessionEventPayload<'assistant.turn_start'>['data']);
			mockSession.fire('session.idle', { aborted: true } as SessionEventPayload<'session.idle'>['data']);
			assert.strictEqual(getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete).length, 0);

			session.resetTurnState('turn-next');
			mockSession.fire('assistant.turn_start', { turnId: 'sdk-1' } as SessionEventPayload<'assistant.turn_start'>['data']);
			mockSession.fire('session.idle', {} as SessionEventPayload<'session.idle'>['data']);

			const completions = getActions(signals).filter(a => a.type === ActionType.ChatTurnComplete);
			assert.strictEqual(completions.length, 1);
			assert.strictEqual((completions[0] as ChatTurnCompleteAction).turnId, 'turn-next');
		});

		test('error event is forwarded', async () => {
			const { mockSession, signals } = await createAgentSession(disposables);
			mockSession.fire('session.error', {
				errorType: 'TestError',
				message: 'something went wrong',
				stack: 'Error: something went wrong',
			} as SessionEventPayload<'session.error'>['data']);

			assert.strictEqual(signals.length, 1);
			assert.ok(isAction(signals[0], ActionType.ChatError));
			if (isAction(signals[0], ActionType.ChatError)) {
				const action = signals[0].action as ChatErrorAction;
				assert.strictEqual(action.error.errorType, 'TestError');
				assert.strictEqual(action.error.message, 'something went wrong');
			}
		});

		test('message delta is forwarded', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-1');
			mockSession.fire('assistant.message_delta', {
				messageId: 'msg-1',
				deltaContent: 'Hello ',
			} as SessionEventPayload<'assistant.message_delta'>['data']);

			assert.ok(signals.length >= 1);
			const hasDelta = signals.some(s => {
				if (s.kind !== 'action') { return false; }
				if (s.action.type === ActionType.ChatResponsePart) {
					const part = (s.action as ChatResponsePartAction).part;
					return part.kind === ResponsePartKind.Markdown && part.content === 'Hello ';
				}
				if (s.action.type === ActionType.ChatDelta) {
					return (s.action as ChatDeltaAction).content === 'Hello ';
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
				if (s.action.type === ActionType.ChatResponsePart) {
					const part = (s.action as ChatResponsePartAction).part;
					return part.kind === ResponsePartKind.Markdown && part.content === 'Let me help you.';
				}
				if (s.action.type === ActionType.ChatDelta) {
					return (s.action as ChatDeltaAction).content === 'Let me help you.';
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
				if (signal.kind !== 'action' || signal.action.type !== ActionType.ChatResponsePart) {
					return [];
				}
				const part = (signal.action as ChatResponsePartAction).part;
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
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-1');

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
			// `ChatResponsePart{Reasoning}` (allocates a new part) and
			// `ChatReasoning` (appends to an existing part) translate to
			// the legacy `'reasoning'` view, so we have to inspect raw
			// signals to tell them apart.
			const reasoningResponseParts = signals.flatMap(s => {
				if (s.kind !== 'action' || s.action.type !== ActionType.ChatResponsePart) {
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
				if (signal.kind !== 'action' || signal.action.type !== ActionType.ChatResponsePart) {
					return [];
				}
				const part = (signal.action as ChatResponsePartAction).part;
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
				if (!isAction(signal, ActionType.ChatToolCallComplete)) {
					return [];
				}
				const action = signal.action as ChatToolCallCompleteAction;
				return [{ parentToolCallId: signal.parentToolCallId, toolCallId: action.toolCallId }];
			});

			assert.deepStrictEqual(toolCompletions, [
				{ parentToolCallId: 'tc-subagent', toolCallId: 'tc-child-tool' },
			]);
		});

		test('subagent skill invocation routes to the subagent session scope', async () => {
			const { session, mockSession, signals } = await createAgentSession(disposables);
			session.resetTurnState('turn-1');

			mockSession.fire('subagent.started', {
				toolCallId: 'tc-subagent',
				agentName: 'explore',
				agentDisplayName: 'Explore',
				agentDescription: 'Explore tests',
			} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-1' });

			mockSession.fire('skill.invoked', {
				name: 'explore',
				path: '/skills/explore/SKILL.md',
			} as SessionEventPayload<'skill.invoked'>['data'], { id: 'skill-event', agentId: 'agent-1' });

			const skillActions = signals
				.filter((signal): signal is IAgentActionSignal => signal.kind === 'action')
				.filter(signal =>
					signal.action.type === ActionType.ChatToolCallStart
					|| signal.action.type === ActionType.ChatToolCallReady
					|| signal.action.type === ActionType.ChatToolCallComplete
				)
				.map(signal => ({ parentToolCallId: signal.parentToolCallId, action: signal.action }));

			assert.deepStrictEqual(skillActions, [
				{
					parentToolCallId: 'tc-subagent',
					action: {
						type: ActionType.ChatToolCallStart,
						turnId: 'turn-1',
						toolCallId: 'synth-skill-skill-event',
						toolName: 'skill',
						displayName: 'Read Skill',
					},
				},
				{
					parentToolCallId: 'tc-subagent',
					action: {
						type: ActionType.ChatToolCallReady,
						turnId: 'turn-1',
						toolCallId: 'synth-skill-skill-event',
						invocationMessage: { markdown: 'Reading skill [explore](file:///skills/explore/SKILL.md)' },
						confirmed: ToolCallConfirmationReason.NotNeeded,
					},
				},
				{
					parentToolCallId: 'tc-subagent',
					action: {
						type: ActionType.ChatToolCallComplete,
						turnId: 'turn-1',
						toolCallId: 'synth-skill-skill-event',
						result: {
							success: true,
							pastTenseMessage: { markdown: 'Read skill [explore](file:///skills/explore/SKILL.md)' },
						},
					},
				},
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
			const { session, runtime, signals } = await createAgentSession(disposables);

			// Start the request (don't await — it blocks waiting for response)
			const resultPromise = runtime.handleUserInputRequest(
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
			session.respondToUserInputRequest(requestId, ChatInputResponseKind.Accept, {
				[questionId]: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Text, value: 'Alice' }
				}
			});

			const result = await resultPromise;
			assert.strictEqual(result.answer, 'Alice');
			assert.strictEqual(result.wasFreeform, true);
		});

		test('handleUserInputRequest with choices generates SingleSelect question', async () => {
			const { session, runtime, signals } = await createAgentSession(disposables);

			const resultPromise = runtime.handleUserInputRequest(
				{ question: 'Pick a color', choices: ['red', 'blue', 'green'] },
				{ sessionId: 'test-session-1' }
			);

			assert.strictEqual(signals.length, 1);
			const request = getInputRequest(signals[0]);
			assert.ok(request.questions);
			assert.strictEqual(request.questions.length, 1);
			assert.strictEqual(request.questions[0].kind, ChatInputQuestionKind.SingleSelect);
			if (request.questions[0].kind === ChatInputQuestionKind.SingleSelect) {
				assert.strictEqual(request.questions[0].options.length, 3);
				assert.strictEqual(request.questions[0].options[0].label, 'red');
			}

			// Respond with a selected choice
			const questions = request.questions;
			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Accept, {
				[questions[0].id]: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Selected, value: 'blue' }
				}
			});

			const result = await resultPromise;
			assert.strictEqual(result.answer, 'blue');
			assert.strictEqual(result.wasFreeform, false);
		});

		test('handleUserInputRequest returns empty answer on cancel', async () => {
			const { session, runtime, signals } = await createAgentSession(disposables);

			const resultPromise = runtime.handleUserInputRequest(
				{ question: 'Cancel me' },
				{ sessionId: 'test-session-1' }
			);

			const request = getInputRequest(signals[0]);
			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Cancel);

			const result = await resultPromise;
			assert.strictEqual(result.answer, '');
			assert.strictEqual(result.wasFreeform, true);
		});

		test('respondToUserInputRequest returns false for unknown id', async () => {
			const { session } = await createAgentSession(disposables);
			assert.strictEqual(session.respondToUserInputRequest('unknown-id', ChatInputResponseKind.Accept), false);
		});

		test('handleUserInputRequest returns empty answer on skipped question', async () => {
			const { session, runtime, signals } = await createAgentSession(disposables);

			const resultPromise = runtime.handleUserInputRequest(
				{ question: 'Skip me' },
				{ sessionId: 'test-session-1' }
			);

			const request = getInputRequest(signals[0]);
			const questionId = request.questions![0].id;
			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Accept, {
				[questionId]: {
					state: ChatInputAnswerState.Skipped,
				}
			});

			const result = await resultPromise;
			assert.strictEqual(result.answer, '');
			assert.strictEqual(result.wasFreeform, true);
		});

		test('pending user inputs are cancelled on dispose', async () => {
			const { session, runtime } = await createAgentSession(disposables);

			const resultPromise = runtime.handleUserInputRequest(
				{ question: 'Will be cancelled' },
				{ sessionId: 'test-session-1' }
			);

			session.dispose();
			const result = await resultPromise;
			assert.strictEqual(result.answer, '');
			assert.strictEqual(result.wasFreeform, true);
		});

		test('autopilot auto-answers a free-form question without firing a progress event', async () => {
			const { runtime, signals } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.Mode]: 'autopilot' },
			});

			const result = await runtime.handleUserInputRequest(
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

		test('autopilot does not auto-answer when mode is not "autopilot"', async () => {
			// Sanity check: with mode=interactive the question must
			// still be surfaced as a progress event (the existing behavior).
			const { runtime, signals } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.Mode]: 'interactive' },
			});

			runtime.handleUserInputRequest(
				{ question: 'Need user input' },
				{ sessionId: 'test-session-1' }
			);

			// Microtask flush so the handler can run far enough to either
			// short-circuit or emit a progress event.
			await Promise.resolve();
			assert.strictEqual(signals.length, 1);
			assert.ok(isAction(signals[0], ActionType.ChatInputRequested));
		});

		test('auto-reply auto-answers a question without firing a progress event', async () => {
			// `chat.autoReply` is forwarded as the autoReplyEnabled root config.
			// Even in interactive mode it must short-circuit like autopilot.
			const { runtime, signals } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.Mode]: 'interactive' },
				rootValues: { [AgentHostAutoReplyEnabledConfigKey]: true },
			});

			const result = await runtime.handleUserInputRequest(
				{ question: 'Pick a color', choices: ['red', 'blue', 'green'] },
				{ sessionId: 'test-session-1' }
			);

			assert.strictEqual(result.answer, 'The user is not available to answer your question. Choose a pragmatic option best aligned with the context of the request.');
			assert.strictEqual(result.wasFreeform, true);
			assert.strictEqual(signals.length, 0);
		});
	});

	// ---- elicitation handling ----

	suite('elicitation handling', () => {

		test('form-mode request projects schema fields to questions and accept round-trips content', async () => {
			const { session, runtime, signals } = await createAgentSession(disposables);

			const resultPromise = runtime.handleElicitationRequest({
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
				{ id: 'environment', kind: ChatInputQuestionKind.SingleSelect, required: true },
				{ id: 'replicas', kind: ChatInputQuestionKind.Integer, required: false },
				{ id: 'confirm', kind: ChatInputQuestionKind.Boolean, required: true },
				{ id: 'region', kind: ChatInputQuestionKind.Text, required: false },
				{ id: 'tags', kind: ChatInputQuestionKind.MultiSelect, required: false },
			]);
			const envQuestion = request.questions[0];
			assert.strictEqual(envQuestion.kind, ChatInputQuestionKind.SingleSelect);
			if (envQuestion.kind === ChatInputQuestionKind.SingleSelect) {
				assert.deepStrictEqual(envQuestion.options, [
					{ id: 'dev', label: 'Development' },
					{ id: 'prod', label: 'Production' },
				]);
			}

			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Accept, {
				environment: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: 'prod' } },
				replicas: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Number, value: 5 } },
				confirm: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Boolean, value: true } },
				region: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: 'eu-west-1' } },
				tags: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.SelectedMany, value: ['a', 'c'] } },
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
			const { session, runtime, signals } = await createAgentSession(disposables);

			const resultPromise = runtime.handleElicitationRequest({
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
			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Accept, {
				name: { state: ChatInputAnswerState.Skipped },
				// `count` is missing entirely
			});

			assert.deepStrictEqual(await resultPromise, { action: 'accept', content: {} });
		});

		test('url-mode request surfaces url and accept returns no content', async () => {
			const { session, runtime, signals } = await createAgentSession(disposables);

			const resultPromise = runtime.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'Open this link',
				mode: 'url',
				url: 'https://example.com/auth',
			});

			const request = getInputRequest(signals[0]);
			assert.strictEqual(request.url, 'https://example.com/auth');
			assert.strictEqual(request.questions, undefined);

			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Accept);
			assert.deepStrictEqual(await resultPromise, { action: 'accept' });
		});

		test('free-form request (no schema) returns submitted text as content.answer', async () => {
			const { session, runtime, signals } = await createAgentSession(disposables);

			const resultPromise = runtime.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'What is your favorite color?',
				mode: 'form',
				// No requestedSchema — the workbench fallback renders a single text question.
			});

			const request = getInputRequest(signals[0]);
			assert.strictEqual(request.questions, undefined);

			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Accept, {
				answer: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: 'teal' } },
			});

			assert.deepStrictEqual(await resultPromise, { action: 'accept', content: { answer: 'teal' } });
		});

		test('decline response maps to action=decline', async () => {
			const { session, runtime, signals } = await createAgentSession(disposables);

			const resultPromise = runtime.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'Please confirm',
				mode: 'form',
				requestedSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
			});

			const request = getInputRequest(signals[0]);
			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Decline);
			assert.deepStrictEqual(await resultPromise, { action: 'decline' });
		});

		test('cancel response maps to action=cancel', async () => {
			const { session, runtime, signals } = await createAgentSession(disposables);

			const resultPromise = runtime.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'Please confirm',
				mode: 'form',
				requestedSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
			});

			const request = getInputRequest(signals[0]);
			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Cancel);
			assert.deepStrictEqual(await resultPromise, { action: 'cancel' });
		});

		test('autopilot auto-cancels without firing a progress event', async () => {
			const { runtime, signals } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.Mode]: 'autopilot' },
			});

			const result = await runtime.handleElicitationRequest({
				sessionId: 'test-session-1',
				message: 'Need input',
				mode: 'form',
				requestedSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
			});

			assert.deepStrictEqual(result, { action: 'cancel' });
			assert.strictEqual(signals.length, 0);
		});

		test('pending elicitations are cancelled on dispose', async () => {
			const { session, runtime } = await createAgentSession(disposables);

			const resultPromise = runtime.handleElicitationRequest({
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
			const { session, runtime } = await createAgentSession(disposables, { logService });
			const sessionInternals = session as unknown as ISessionInternalsForTest;
			sessionInternals._onDidSessionProgress.fire = () => {
				throw new Error('user input boom');
			};

			await assert.rejects(
				runtime.handleUserInputRequest(
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
			const capturedRuntime: { current?: ICopilotSessionRuntime } = {};
			const { session } = await createAgentSession(disposables, { logService, captureRuntime: capturedRuntime });
			const sessionInternals = session as unknown as ISessionInternalsForTest;
			sessionInternals._editTracker.trackEditStart = async () => {
				throw new Error('pre tool boom');
			};

			await assert.rejects(
				capturedRuntime.current!.handlePreToolUse({
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
			const capturedRuntime: { current?: ICopilotSessionRuntime } = {};
			const { session } = await createAgentSession(disposables, { logService, captureRuntime: capturedRuntime });
			const sessionInternals = session as unknown as ISessionInternalsForTest;
			sessionInternals._editTracker.completeEdit = async () => {
				throw new Error('post tool boom');
			};

			await assert.rejects(
				capturedRuntime.current!.handlePostToolUse({
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
			tools: [{
				name: 'my_tool',
				description: 'A test tool',
				inputSchema: { type: 'object', properties: {} },
			}],
			plugins: [],
			mcpServers: {},
		};

		/** Builds a live ActiveClientToolSet seeded with the given owning clientId and the snapshot's tools. */
		const activeClientToolSetWith = (clientId: string): ActiveClientToolSet => {
			const toolSet = new ActiveClientToolSet();
			toolSet.set(clientId, snapshot.tools);
			return toolSet;
		};

		test('client tool started with no connected client fails immediately', async () => {
			// No activeClientState is provided, so the session seeds one with
			// an undefined clientId — i.e. no client is connected to run the tool.
			const { runtime, mockSession, signals } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-no-client',
				toolName: 'my_tool',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);

			// tool_start is stamped as a client contributor with no owner...
			const startSignal = signals.find(s => isAction(s, ActionType.ChatToolCallStart));
			assert.ok(startSignal && isAction(startSignal, ActionType.ChatToolCallStart));
			assert.deepStrictEqual((startSignal.action as ChatToolCallStartAction).contributor, undefined);

			// ...and is failed immediately (ready + complete) rather than left
			// pending for the server-side disconnect timeout.
			assert.strictEqual(signals.filter(s => isAction(s, ActionType.ChatToolCallReady)).length, 1);
			const completeSignal = signals.find(s => isAction(s, ActionType.ChatToolCallComplete));
			assert.ok(completeSignal && isAction(completeSignal, ActionType.ChatToolCallComplete));
			assert.strictEqual((completeSignal.action as ChatToolCallCompleteAction).result.success, false);

			// When the SDK invokes the handler it resolves immediately with the
			// buffered failure result.
			const tools = runtime.createClientSdkTools();
			const result = await invokeClientToolHandler(tools[0], 'tc-no-client');
			assert.strictEqual(result.resultType, 'failure');
		});

		test('client tool handler waits for completion without emitting tool_ready', async () => {

			const { session, runtime, mockSession, signals } = await createAgentSession(disposables, { clientSnapshot: snapshot, activeClientToolSet: activeClientToolSetWith('test-client') });

			// SDK emits tool.execution_start — tool_start fires immediately
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-client-1',
				toolName: 'my_tool',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);

			// tool_start fires immediately (client tools don't auto-ready)
			assert.strictEqual(signals.filter(s => isAction(s, ActionType.ChatToolCallStart)).length, 1);
			const startSignal = signals.find(s => isAction(s, ActionType.ChatToolCallStart));
			assert.ok(startSignal && isAction(startSignal, ActionType.ChatToolCallStart));
			if (isAction(startSignal!, ActionType.ChatToolCallStart)) {
				assert.deepStrictEqual((startSignal.action as ChatToolCallStartAction).contributor, { kind: ToolCallContributorKind.Client, clientId: 'test-client' });
			}

			// SDK invokes the handler — it creates a deferred and waits,
			// but does NOT fire tool_ready (that comes from the permission flow).
			const tools = runtime.createClientSdkTools();
			const handlerPromise = invokeClientToolHandler(tools[0], 'tc-client-1', { file: 'test.ts' });

			// No pending_confirmation or tool_ready should have been emitted by the handler
			assert.strictEqual(signals.filter(s => s.kind === 'pending_confirmation' || isAction(s, ActionType.ChatToolCallReady)).length, 0);

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

		test('agent-coordination client tools auto-ready with a tailored invocation message', async () => {
			const agentSnapshot: IActiveClientSnapshot = {
				tools: [{ name: 'list_agents', description: 'List agents', inputSchema: { type: 'object', properties: {} } }],
				plugins: [],
				mcpServers: {},
			};
			const activeClientToolSet = new ActiveClientToolSet();
			activeClientToolSet.set('agent-client', agentSnapshot.tools);
			const { mockSession, signals } = await createAgentSession(disposables, { clientSnapshot: agentSnapshot, activeClientToolSet });

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-list-agents',
				toolName: 'list_agents',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);

			// Unlike other client tools (which defer to the permission flow),
			// the auto-approved agent-coordination tools auto-ready so their
			// invocation renders our tailored message instead of the generic
			// "Running {displayName}…" fallback.
			const readySignal = signals.find(s => isAction(s, ActionType.ChatToolCallReady));
			assert.ok(readySignal && isAction(readySignal, ActionType.ChatToolCallReady));
			assert.strictEqual((readySignal.action as ChatToolCallReadyAction).invocationMessage, 'Listed agents');
		});

		test('client tool handler does not emit tool_ready (permission flow owns it)', async () => {
			const activeClientToolSet = new ActiveClientToolSet();
			activeClientToolSet.set('client-perm', snapshot.tools);
			const { session, runtime, mockSession, signals, waitForSignal } = await createAgentSession(disposables, { clientSnapshot: snapshot, activeClientToolSet });

			// SDK emits tool.execution_start — tool_start fires immediately
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-client-perm',
				toolName: 'my_tool',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);

			// tool_start fired, no pending_confirmation yet
			assert.strictEqual(signals.filter(s => isAction(s, ActionType.ChatToolCallStart)).length, 1);
			assert.strictEqual(signals.filter(s => s.kind === 'pending_confirmation').length, 0);

			// Permission request fires — pending_confirmation from permission flow.
			const resultPromise = runtime.handlePermissionRequest({
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

			const tools = runtime.createClientSdkTools();
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
			assert.deepStrictEqual(await handlerPromise, {
				textResultForLlm: '<empty />',
				resultType: 'success',
				binaryResultsForLlm: undefined,
			});
		});

		test('permission before tool.execution_start synthesizes the client tool start so the ready is not dropped (SDK >= 1.0.6 ordering)', async () => {
			// Regression for the client-tool hang after the Copilot SDK bump
			// (1.0.6-preview): the SDK reordered client-tool events so
			// `permission.requested` now fires *before* `tool.execution_start`.
			// The permission-derived `ChatToolCallReady` must land on an
			// existing tool-call part, so the host synthesizes the
			// `ChatToolCallStart` at permission time. Without this the ready is
			// dropped, the client tool stays streaming, and the turn hangs.
			const activeClientToolSet = new ActiveClientToolSet();
			activeClientToolSet.set('client-reorder', snapshot.tools);
			const { session, runtime, mockSession, signals, waitForSignal } = await createAgentSession(disposables, { clientSnapshot: snapshot, activeClientToolSet });

			// Permission fires FIRST — no tool.execution_start yet.
			const resultPromise = runtime.handlePermissionRequest({
				kind: 'custom-tool',
				toolCallId: 'tc-reorder',
				toolName: 'my_tool',
				args: { file: 'test.ts' },
			});
			await waitForSignal(s => s.kind === 'pending_confirmation');

			// A single ChatToolCallStart was synthesized (with the client
			// contributor) and it precedes the pending_confirmation, so the
			// permission-derived ready has a part to land on.
			const startSignals = signals.filter(s => isAction(s, ActionType.ChatToolCallStart));
			assert.strictEqual(startSignals.length, 1);
			assert.deepStrictEqual((startSignals[0].action as ChatToolCallStartAction).contributor, { kind: ToolCallContributorKind.Client, clientId: 'client-reorder' });
			const startIndex = signals.indexOf(startSignals[0]);
			const pendingIndex = signals.findIndex(s => s.kind === 'pending_confirmation');
			assert.ok(startIndex >= 0 && startIndex < pendingIndex, 'ChatToolCallStart must be emitted before pending_confirmation');

			// The real tool.execution_start now arrives — it must NOT emit a
			// duplicate ChatToolCallStart.
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-reorder',
				toolName: 'my_tool',
				arguments: { file: 'test.ts' },
			} as SessionEventPayload<'tool.execution_start'>['data']);
			assert.strictEqual(signals.filter(s => isAction(s, ActionType.ChatToolCallStart)).length, 1, 'tool.execution_start must not emit a duplicate ChatToolCallStart');

			// The parked SDK handler resolves once the client completes the
			// call — i.e. the tool runs instead of hanging.
			const tools = runtime.createClientSdkTools();
			const handlerPromise = invokeClientToolHandler(tools[0], 'tc-reorder', { file: 'test.ts' });
			session.respondToPermissionRequest('tc-reorder', true);
			assert.strictEqual((await resultPromise).kind, 'approve-once');
			session.handleClientToolCallComplete('tc-reorder', {
				success: true,
				pastTenseMessage: 'did it',
				content: [{ type: ToolResultContentType.Text, text: 'result text' }],
			});
			const result = await handlerPromise;
			assert.strictEqual(result.resultType, 'success');
			assert.strictEqual(result.textResultForLlm, 'result text');
		});

		test('pending_confirmation forwards parentToolCallId for tools inside subagents', async () => {
			// Regression: when a client tool runs inside a subagent the
			// permission-flow `pending_confirmation` must carry the
			// parentToolCallId from the originating tool_start. Without it
			// the host has no way to route the resulting
			// ChatToolCallReady to the subagent session and emits a
			// stray ready against the parent session (no preceding
			// ChatToolCallStart).
			const { session, runtime, mockSession, signals, waitForSignal } = await createAgentSession(disposables, { clientSnapshot: snapshot, activeClientToolSet: activeClientToolSetWith('test-client') });

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

			const resultPromise = runtime.handlePermissionRequest({
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

		test('subagent client tool: permission before tool.execution_start routes the synthesized start and ready to the subagent (SDK >= 1.0.6 ordering)', async () => {
			// Regression for the SDK 1.0.6-preview reorder applied to a client
			// tool running *inside a subagent*: `permission.requested` fires
			// before `tool.execution_start`, so the start is synthesized at
			// permission time. The synthesized start (and, via `_activeToolCalls`,
			// the permission `pending_confirmation`) must route to the subagent
			// session — the raw `permission.requested` event's `agentId` is used
			// to recover the parent tool call because the SDK's permission handler
			// callback drops it.
			const { session, runtime, mockSession, signals, waitForSignal } = await createAgentSession(disposables, { clientSnapshot: snapshot, activeClientToolSet: activeClientToolSetWith('test-client') });

			mockSession.fire('subagent.started', {
				toolCallId: 'tc-parent-subagent',
				agentName: 'helper',
				agentDisplayName: 'Helper',
				agentDescription: 'Helps',
			} as SessionEventPayload<'subagent.started'>['data'], { agentId: 'agent-client-tool' });

			// NEW ordering: the raw permission.requested event (carrying agentId)
			// arrives before tool.execution_start.
			mockSession.fire('permission.requested', {
				requestId: 'req-sub',
				permissionRequest: { kind: 'custom-tool', toolCallId: 'tc-sub-client', toolName: 'my_tool', toolDescription: 'A test tool', args: {} },
			} as SessionEventPayload<'permission.requested'>['data'], { agentId: 'agent-client-tool' });

			const resultPromise = runtime.handlePermissionRequest({
				kind: 'custom-tool',
				toolCallId: 'tc-sub-client',
				toolName: 'my_tool',
			});
			await waitForSignal(s => s.kind === 'pending_confirmation');

			// The synthesized start routes to the subagent (parentToolCallId set).
			const startSignals = signals.filter(s => isAction(s, ActionType.ChatToolCallStart));
			assert.strictEqual(startSignals.length, 1);
			assert.strictEqual(startSignals[0].parentToolCallId, 'tc-parent-subagent');
			assert.deepStrictEqual((startSignals[0].action as ChatToolCallStartAction).contributor, { kind: ToolCallContributorKind.Client, clientId: 'test-client' });

			// The permission pending_confirmation also routes to the subagent.
			const permSignals = signals.filter((s): s is IAgentToolPendingConfirmationSignal => s.kind === 'pending_confirmation');
			assert.strictEqual(permSignals.length, 1);
			assert.strictEqual(permSignals[0].parentToolCallId, 'tc-parent-subagent');

			// The real subagent tool.execution_start must not emit a duplicate.
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-sub-client',
				toolName: 'my_tool',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data'], { agentId: 'agent-client-tool' });
			assert.strictEqual(signals.filter(s => isAction(s, ActionType.ChatToolCallStart)).length, 1, 'tool.execution_start must not emit a duplicate ChatToolCallStart');

			session.respondToPermissionRequest('tc-sub-client', false);
			await resultPromise;
		});

		test('handleClientToolCallComplete pre-completes when no handler is waiting yet', async () => {
			const { session, runtime } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			// Completion arrives before handler — pre-creates deferred
			session.handleClientToolCallComplete('tc-unknown', {
				success: true,
				pastTenseMessage: 'done',
			});

			// Handler picks up the pre-completed result
			const tools = runtime.createClientSdkTools();
			const result = await invokeClientToolHandler(tools[0], 'tc-unknown');
			assert.strictEqual(result.resultType, 'success');
		});

		test('handleClientToolCallComplete with failure result', async () => {
			const { session, runtime } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			const tools = runtime.createClientSdkTools();
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
			const { session, runtime } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			const tools = runtime.createClientSdkTools();
			const handlerPromise = invokeClientToolHandler(tools[0], 'tc-client-4');

			session.dispose();
			const result = await handlerPromise;
			assert.strictEqual(result.resultType, 'failure');
			assert.ok(result.error);
		});

		test('multiple concurrent client tool calls resolve independently', async () => {
			const { session, runtime } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			const tools = runtime.createClientSdkTools();
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
			const { session, runtime } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			const tools = runtime.createClientSdkTools();
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
			const { session, runtime } = await createAgentSession(disposables, { clientSnapshot: snapshot, logService });
			const tools = runtime.createClientSdkTools();
			const sessionInternals = session as unknown as ISessionInternalsForTest;
			sessionInternals._pendingClientToolCalls.register = () => {
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
			const { session, runtime, mockSession, signals, waitForSignal } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-ready-data',
				toolName: 'my_tool',
				arguments: { file: 'test.ts' },
			} as SessionEventPayload<'tool.execution_start'>['data']);

			// tool_start should have fired
			assert.strictEqual(signals.filter(s => isAction(s, ActionType.ChatToolCallStart)).length, 1);

			// Permission before the handler should produce only the confirmation
			// pending_confirmation, not a synthetic auto-ready.
			const resultPromise = runtime.handlePermissionRequest({
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
			const { session, runtime } = await createAgentSession(disposables, { clientSnapshot: snapshot });

			const tools = runtime.createClientSdkTools();
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

		test('handleClientToolCallComplete describes embedded-resource-only content', async () => {
			const testCases = [
				{
					toolCallId: 'tc-image-only',
					contentType: 'image/png',
					expectedText: 'Tool produced the attached image',
					expectedType: 'image',
				},
				{
					toolCallId: 'tc-file-only',
					contentType: 'application/pdf',
					expectedText: 'Tool produced the attached file',
					expectedType: 'resource',
				},
				{
					toolCallId: 'tc-image-and-file',
					contentType: 'image/png',
					additionalContentType: 'application/pdf',
					expectedText: 'Tool produced the attached image and file',
					expectedType: 'image',
				},
			] satisfies ReadonlyArray<{
				readonly toolCallId: string;
				readonly contentType: string;
				readonly additionalContentType?: string;
				readonly expectedText: string;
				readonly expectedType: 'image' | 'resource';
			}>;
			const embeddedResource = (data: string, contentType: string): ToolResultContent => ({ type: ToolResultContentType.EmbeddedResource, data, contentType });

			for (const testCase of testCases) {
				const { session, runtime } = await createAgentSession(disposables, { clientSnapshot: snapshot });
				const tools = runtime.createClientSdkTools();
				const handlerPromise = invokeClientToolHandler(tools[0], testCase.toolCallId);
				const content: ToolResultContent[] = [
					embeddedResource('base64data', testCase.contentType),
					...(testCase.additionalContentType ? [embeddedResource('base64data2', testCase.additionalContentType)] : []),
				];

				session.handleClientToolCallComplete(testCase.toolCallId, {
					success: true,
					pastTenseMessage: 'done',
					content,
				});

				assert.deepStrictEqual(await handlerPromise, {
					textResultForLlm: testCase.expectedText,
					resultType: 'success',
					binaryResultsForLlm: [
						{ data: 'base64data', mimeType: testCase.contentType, type: testCase.expectedType },
						...(testCase.additionalContentType ? [{ data: 'base64data2', mimeType: testCase.additionalContentType, type: 'resource' }] : []),
					],
				});
				disposables.clear();
			}
		});

		test('client tool start stamps the owning clientId from the shared ActiveClientToolSet', async () => {
			const activeClientToolSet = new ActiveClientToolSet();
			activeClientToolSet.set('client-A', snapshot.tools);
			const { mockSession, signals } = await createAgentSession(disposables, { clientSnapshot: snapshot, activeClientToolSet });

			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-live-1',
				toolName: 'my_tool',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);

			// A window reload removes the old client and re-pushes the same
			// tools under a new clientId.
			activeClientToolSet.delete('client-A');
			activeClientToolSet.set('client-B', snapshot.tools);
			mockSession.fire('tool.execution_start', {
				toolCallId: 'tc-live-2',
				toolName: 'my_tool',
				arguments: {},
			} as SessionEventPayload<'tool.execution_start'>['data']);

			const starts = signals.filter((s): s is IAgentActionSignal => isAction(s, ActionType.ChatToolCallStart));
			assert.deepStrictEqual(starts.map(s => (s.action as ChatToolCallStartAction).contributor), [
				{ kind: ToolCallContributorKind.Client, clientId: 'client-A' },
				{ kind: ToolCallContributorKind.Client, clientId: 'client-B' },
			]);
		});

		test('completion arriving before the SDK handler registers still resolves', async () => {
			const { session, runtime } = await createAgentSession(disposables, { clientSnapshot: snapshot });
			const tools = runtime.createClientSdkTools();

			// Completion races ahead of the handler.
			session.handleClientToolCallComplete('tc-early', {
				success: true,
				pastTenseMessage: 'done',
				content: [{ type: ToolResultContentType.Text, text: 'buffered result' }],
			});

			const result = await invokeClientToolHandler(tools[0], 'tc-early');
			assert.strictEqual(result.resultType, 'success');
			assert.strictEqual(result.textResultForLlm, 'buffered result');
		});
	});

	// ---- Server tools -------------------------------------------------------

	suite('server tools', () => {

		const fakeToolDefinitions: readonly ToolDefinition[] = [
			{ name: 'serverToolA', description: 'A', inputSchema: { type: 'object', properties: {} } },
			{ name: 'serverToolB', description: 'B', inputSchema: { type: 'object', properties: {} } },
		];

		class FakeServerToolHost implements IAgentServerToolHost {
			readonly definitions: readonly ToolDefinition[] = fakeToolDefinitions;
			readonly toolNames: readonly string[] = fakeToolDefinitions.map(def => def.name);
			readonly advertised: string[] = [];
			readonly executions: Array<{ sessionUri: string; toolName: string; rawArgs: unknown }> = [];
			result = 'ok';
			error: Error | undefined;

			advertise(sessionUri: string): void {
				this.advertised.push(sessionUri);
			}

			requiresConfirmation(_toolName: string): boolean { return false; }

			executeTool(sessionUri: string, toolName: string, rawArgs: unknown): string {
				this.executions.push({ sessionUri, toolName, rawArgs });
				if (this.error) {
					throw this.error;
				}
				return this.result;
			}
		}

		test('advertises the server tools on initialize and exposes them as server SDK tools', async () => {
			const serverToolHost = new FakeServerToolHost();
			const { runtime } = await createAgentSession(disposables, { serverToolHost });

			const sessionUri = AgentSession.uri('copilot', 'test-session-1').toString();
			assert.deepStrictEqual(serverToolHost.advertised, [sessionUri]);

			const tools = runtime.createServerSdkTools();
			assert.deepStrictEqual(tools.map(t => t.name).sort(), [...serverToolHost.toolNames].sort());
		});

		test('server tool handler routes to the host and returns a success result', async () => {
			const serverToolHost = new FakeServerToolHost();
			serverToolHost.result = 'listed 2 comments';
			const { runtime } = await createAgentSession(disposables, { serverToolHost });

			const tools = runtime.createServerSdkTools();
			const result = await invokeClientToolHandler(tools[0], 'tc-server-tool', { foo: 'bar' });

			const sessionUri = buildDefaultChatUri(AgentSession.uri('copilot', 'test-session-1'));
			assert.deepStrictEqual(serverToolHost.executions, [{ sessionUri, toolName: tools[0].name, rawArgs: { foo: 'bar' } }]);
			assert.strictEqual(result.resultType, 'success');
			assert.strictEqual(result.textResultForLlm, 'listed 2 comments');
		});

		test('server tool handler surfaces host failures as a failure result', async () => {
			const serverToolHost = new FakeServerToolHost();
			serverToolHost.error = new Error('boom');
			const { runtime } = await createAgentSession(disposables, { serverToolHost });

			const tools = runtime.createServerSdkTools();
			const result = await invokeClientToolHandler(tools[0], 'tc-server-tool');

			assert.strictEqual(result.resultType, 'failure');
			assert.strictEqual(result.textResultForLlm, 'boom');
			assert.strictEqual(result.error, 'boom');
		});

		test('exposes no server SDK tools and advertises nothing when no host is wired', async () => {
			const { runtime } = await createAgentSession(disposables);
			assert.deepStrictEqual(runtime.createServerSdkTools(), []);
		});

		test('auto-approves every server tool without prompting for confirmation', async () => {
			const serverToolHost = new FakeServerToolHost();
			const { runtime, signals } = await createAgentSession(disposables, { serverToolHost });

			const results = [];
			for (const toolName of serverToolHost.toolNames) {
				results.push(await runtime.handlePermissionRequest({ kind: 'custom-tool', toolCallId: `tc-${toolName}`, toolName }));
			}

			assert.deepStrictEqual({
				results,
				pendingConfirmations: signals.filter(s => s.kind === 'pending_confirmation').length,
			}, {
				results: serverToolHost.toolNames.map(() => ({ kind: 'approve-once' })),
				pendingConfirmations: 0,
			});
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

		test('handleExitPlanModeRequest produces a plan-review input request with fallback question', async () => {
			const { session, runtime, mockSession, signals, waitForSignal } = await createAgentSession(disposables);
			session.resetTurnState('turn-plan');

			mockSession.planReadResult = { exists: true, content: '## Plan', path: '/sessions/abc/plan.md' };

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams(), { sessionId: 'test-session-1' });

			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			const request = getInputRequest(signal);

			const planReview = (request as ChatInputRequestWithPlanReview).planReview;
			assert.deepStrictEqual(planReview, {
				title: 'Review Plan',
				content: '## Plan summary',
				canProvideFeedback: true,
				answerQuestionId: request.questions?.[0].id,
				planUri: URI.file('/sessions/abc/plan.md').toString(),
				actions: [
					{
						id: 'autopilot',
						label: 'Implement with Autopilot',
						description: 'Auto-approve all tool calls and continue until done.',
						default: true,
						permissionLevel: 'autopilot',
					},
					{
						id: 'interactive',
						label: 'Implement Plan',
						description: 'Implement the plan, asking for input and approval for each action.',
					},
					{
						id: 'exit_only',
						label: 'Approve Plan Only',
						description: 'Approve the plan without executing it. I will implement it myself.',
					},
				],
			});

			// The summary is now carried by the plan-review payload so the
			// renderer can dock the richer plan review widget without duplicating
			// the content as a separate markdown response part.
			const deltaContent = signals.flatMap(s => {
				if (s.kind !== 'action') { return []; }
				if (s.action.type === ActionType.ChatResponsePart) {
					const part = (s.action as ChatResponsePartAction).part;
					return part.kind === ResponsePartKind.Markdown ? [part.content] : [];
				}
				if (s.action.type === ActionType.ChatDelta) {
					return [(s.action as ChatDeltaAction).content];
				}
				return [];
			}).join('');
			assert.strictEqual(deltaContent, '');

			const question = request.questions?.[0];
			assert.strictEqual(question?.kind, ChatInputQuestionKind.SingleSelect);
			if (question?.kind === ChatInputQuestionKind.SingleSelect) {
				assert.deepStrictEqual(question.options.map(o => o.id), ['autopilot', 'interactive', 'exit_only']);
				const recommended = question.options.find(o => o.recommended);
				assert.strictEqual(recommended?.id, 'autopilot');
				assert.strictEqual(question.allowFreeformInput, true);
			}

			// Resolve the request so the deferred completes and the test can clean up.
			session.respondToUserInputRequest(request.id, ChatInputResponseKind.Decline);
			await responsePromise;
		});

		test('completing the input request with autopilot resolves with approved + autopilot + autoApproveEdits and syncs mode=autopilot', async () => {
			const { session, runtime, waitForSignal, sessionConfigUpdates } = await createAgentSession(disposables);

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams({ actions: ['autopilot', 'interactive'], recommendedAction: 'autopilot' }), { sessionId: 'test-session-1' });
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			session.respondToUserInputRequest(requestId, ChatInputResponseKind.Accept, {
				[questionId]: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Selected, value: 'autopilot' },
				},
			});

			assert.deepStrictEqual(await responsePromise, { approved: true, selectedAction: 'autopilot', autoApproveEdits: true });
			// Picking "Implement with Autopilot" flips the AHP mode immediately.
			assert.deepStrictEqual(sessionConfigUpdates, [
				{ session: 'copilot:/test-session-1', patch: { mode: 'autopilot' } },
			]);
		});

		test('completing the input request with interactive resolves with approved + interactive (no autoApprove) and syncs mode=interactive', async () => {
			const { session, runtime, waitForSignal, sessionConfigUpdates } = await createAgentSession(disposables);

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams({ actions: ['autopilot', 'interactive'], recommendedAction: 'interactive' }), { sessionId: 'test-session-1' });
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			session.respondToUserInputRequest(requestId, ChatInputResponseKind.Accept, {
				[questionId]: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Selected, value: 'interactive' },
				},
			});

			assert.deepStrictEqual(await responsePromise, { approved: true, selectedAction: 'interactive' });
			assert.deepStrictEqual(sessionConfigUpdates, [
				{ session: 'copilot:/test-session-1', patch: { mode: 'interactive' } },
			]);
		});

		test('declining the input request resolves with approved=false', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables);

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams(), { sessionId: 'test-session-1' });
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));

			session.respondToUserInputRequest(getInputRequest(signal).id, ChatInputResponseKind.Decline);

			assert.deepStrictEqual(await responsePromise, { approved: false });
		});

		test('exit_only resolves as approved + interactive without autoApproveEdits', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables);

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams({ actions: ['autopilot', 'interactive', 'exit_only'], recommendedAction: 'exit_only' }), { sessionId: 'test-session-1' });
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			session.respondToUserInputRequest(requestId, ChatInputResponseKind.Accept, {
				[questionId]: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Selected, value: 'exit_only' },
				},
			});

			assert.deepStrictEqual(await responsePromise, { approved: true, selectedAction: 'exit_only' });
		});

		test('freeform feedback alongside a selected action becomes a revision request', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables);

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams({ actions: ['autopilot', 'interactive'], recommendedAction: 'interactive' }), { sessionId: 'test-session-1' });
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			session.respondToUserInputRequest(requestId, ChatInputResponseKind.Accept, {
				[questionId]: {
					state: ChatInputAnswerState.Submitted,
					value: {
						kind: ChatInputAnswerValueKind.Selected,
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
			const { session, runtime, waitForSignal } = await createAgentSession(disposables);

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams({ actions: ['interactive', 'exit_only'], recommendedAction: 'interactive' }), { sessionId: 'test-session-1' });
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			// SDK only offered `interactive` and `exit_only`; the client
			// somehow sent `autopilot` (e.g. stale UI state). The agent
			// host clamps to `recommendedAction` so the SDK never sees a
			// value it didn't offer.
			session.respondToUserInputRequest(requestId, ChatInputResponseKind.Accept, {
				[questionId]: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Selected, value: 'autopilot' },
				},
			});

			assert.deepStrictEqual(await responsePromise, { approved: true, selectedAction: 'interactive' });
		});

		test('selectedAction not in offered actions and no fallback resolves to approved=false', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables);

			// SDK offered `exit_only` only and recommended a value not in
			// the offered set. The client picked something invalid. With
			// no usable selectedAction and no feedback, decline.
			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams({ actions: ['exit_only'], recommendedAction: 'autopilot' }), { sessionId: 'test-session-1' });
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			session.respondToUserInputRequest(requestId, ChatInputResponseKind.Accept, {
				[questionId]: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Selected, value: 'interactive' },
				},
			});

			assert.deepStrictEqual(await responsePromise, { approved: false });
		});

		test('text answer with feedback becomes a revision request without selectedAction', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables);

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams({ actions: ['autopilot', 'interactive'], recommendedAction: 'interactive' }), { sessionId: 'test-session-1' });
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			// The single-select question normally produces a Selected
			// value, but a defensive Text response should still be
			// translated to a revision request when the answer is
			// non-empty (selectedAction falls back to recommendedAction).
			session.respondToUserInputRequest(requestId, ChatInputResponseKind.Accept, {
				[questionId]: {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Text, value: 'Add tests for edge cases' },
				},
			});

			assert.deepStrictEqual(await responsePromise, {
				approved: false,
				feedback: 'Add tests for edge cases',
				selectedAction: 'interactive',
			});
		});

		test('whitespace-only freeform feedback is ignored', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables);

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams({ actions: ['autopilot', 'interactive'], recommendedAction: 'interactive' }), { sessionId: 'test-session-1' });
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			const request = getInputRequest(signal);
			const requestId = request.id;
			const questionId = request.questions![0].id;

			session.respondToUserInputRequest(requestId, ChatInputResponseKind.Accept, {
				[questionId]: {
					state: ChatInputAnswerState.Submitted,
					value: {
						kind: ChatInputAnswerValueKind.Selected,
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

		test('session.mode_changed → autopilot maps directly to mode=autopilot', async () => {
			// The SDK and AHP share the same three-mode space; autopilot now
			// lives on the `mode` axis and the `autoApprove` axis is left
			// untouched. The translation is contained in the Copilot agent.
			const { mockSession, sessionConfigUpdates } = await createAgentSession(disposables);

			mockSession.fire('session.mode_changed', { previousMode: 'plan', newMode: 'autopilot' } as SessionEventPayload<'session.mode_changed'>['data']);

			assert.deepStrictEqual(sessionConfigUpdates, [
				{ session: 'copilot:/test-session-1', patch: { mode: 'autopilot' } },
			]);
		});

		test('session.mode_changed for unsupported mode is ignored', async () => {
			const { mockSession, sessionConfigUpdates } = await createAgentSession(disposables);

			mockSession.fire('session.mode_changed', { previousMode: 'interactive', newMode: 'shell' } as unknown as SessionEventPayload<'session.mode_changed'>['data']);

			assert.strictEqual(sessionConfigUpdates.length, 0);
		});

		test('session.mode_changed from a subagent does not update the session config', async () => {
			// Sub-agents (e.g. a `task` tool sub-agent running in plan mode)
			// emit `session.mode_changed` carrying an `agentId`. These reflect
			// the sub-agent's internal mode, not the root session's, and must
			// not flip the shared session mode picker (e.g. to Plan) mid-turn.
			const { mockSession, sessionConfigUpdates } = await createAgentSession(disposables);

			mockSession.fire('session.mode_changed', { previousMode: 'interactive', newMode: 'plan' } as SessionEventPayload<'session.mode_changed'>['data'], { agentId: 'subagent-1' });

			assert.strictEqual(sessionConfigUpdates.length, 0);
		});

		// ---- no automatic plan → implementation handoff -------------------

		test('handleExitPlanModeRequest always surfaces the plan-review UI, even in autopilot mode', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.Mode]: 'autopilot' },
			});

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams({
				actions: ['autopilot', 'interactive', 'exit_only'],
				recommendedAction: 'autopilot',
			}), { sessionId: 'test-session-1' });

			// There is no automatic handoff from plan into implementation: the
			// user must explicitly choose an action regardless of mode.
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			session.respondToUserInputRequest(getInputRequest(signal).id, ChatInputResponseKind.Decline);
			await responsePromise;
		});

		test('handleExitPlanModeRequest does NOT auto-accept when autoApprove=default', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables, {
				configValues: { [SessionConfigKey.AutoApprove]: 'default' },
			});

			const responsePromise = runtime.handleExitPlanModeRequest(planRequestParams(), { sessionId: 'test-session-1' });

			// The user-input request fires — the user must respond.
			const signal = await waitForSignal(s => isAction(s, ActionType.ChatInputRequested));
			session.respondToUserInputRequest(getInputRequest(signal).id, ChatInputResponseKind.Decline);
			await responsePromise;
		});
	});

	suite('MCP server inventory', () => {

		test('MCP auth request publishes authRequired state and resolves with authenticate token', async () => {
			const { session, runtime, waitForSignal } = await createAgentSession(disposables);

			const authPromise = runtime.handleMcpAuthRequest({
				requestId: 'auth-1',
				serverName: 'github',
				serverUrl: 'https://mcp.example.com',
				reason: 'upscope',
				resourceMetadata: JSON.stringify({
					resource: 'https://mcp.example.com',
					resource_name: 'Example MCP',
					authorization_servers: ['https://auth.example.com'],
					scopes_supported: ['repo'],
				}),
				wwwAuthenticateParams: { scope: 'repo issues:write', error: 'insufficient_scope' },
			}, { sessionId: 'test-session-1' });

			const signal = await waitForSignal(s => isAction(s, ActionType.SessionCustomizationUpdated)) as IAgentActionSignal;
			const action = signal.action as Extract<SessionAction, { type: ActionType.SessionCustomizationUpdated }>;

			assert.deepStrictEqual(action.customization, {
				type: 'mcpServer',
				id: 'mcp-top-level:copilot:test-session-1:github',
				uri: 'mcp-top-level:copilot:test-session-1:github',
				name: 'github',
				enabled: true,
				state: {
					kind: McpServerStatus.AuthRequired,
					reason: McpAuthRequiredReason.InsufficientScope,
					resource: {
						resource: 'https://mcp.example.com',
						resource_name: 'Example MCP',
						authorization_servers: ['https://auth.example.com'],
						scopes_supported: ['repo'],
					},
					requiredScopes: ['repo', 'issues:write'],
					description: 'insufficient_scope',
				},
				channel: undefined,
				mcpApp: { capabilities: { serverTools: { listChanged: true }, serverResources: {}, sampling: {} } },
			});

			assert.strictEqual(await session.resolveMcpAuthentication({ resource: 'https://mcp.example.com', scopes: ['repo', 'issues:write'], token: 'token-1' }), true);
			assert.deepStrictEqual(await authPromise, { kind: 'token', accessToken: 'token-1' });
		});

		test('needs-auth status remains starting when no auth request details are available', async () => {
			const { mockSession, waitForSignal } = await createAgentSession(disposables);

			mockSession.fire('session.mcp_server_status_changed', {
				serverName: 'github',
				status: 'needs-auth',
			} as SessionEventPayload<'session.mcp_server_status_changed'>['data']);

			const signal = await waitForSignal(s => isAction(s, ActionType.SessionCustomizationUpdated)) as IAgentActionSignal;
			const action = signal.action as Extract<SessionAction, { type: ActionType.SessionCustomizationUpdated }>;
			assert.strictEqual(action.customization.type, 'mcpServer');
			assert.deepStrictEqual(action.customization.state, { kind: McpServerStatus.Starting });
		});

		test('seeds inventory from rpc.mcp.list at subscription time', async () => {
			const { signals, waitForSignal } = await createAgentSession(disposables, {
				configureMockSession: m => {
					m.mcpListResult = {
						servers: [
							{ name: 'alpha', status: 'connected' },
							{ name: 'beta', status: 'pending' },
						],
					};
				},
			});

			await waitForSignal(s => isAction(s, ActionType.SessionCustomizationUpdated));
			// Give the seed's microtask chain time to apply both servers.
			await timeout(0);

			const updates = getActions(signals).filter(a => a.type === ActionType.SessionCustomizationUpdated);
			const names = updates.map(a => (a as { customization: { name: string } }).customization.name).sort();
			assert.deepStrictEqual(names, ['alpha', 'beta']);
		});

		test('logs a warning and continues when rpc.mcp.list rejects', async () => {
			const logService = new CapturingLogService();
			const { mockSession, waitForSignal } = await createAgentSession(disposables, {
				logService,
				configureMockSession: m => { m.mcpListError = new Error('boom'); },
			});
			// Allow the rejected promise to surface.
			await timeout(0);
			await timeout(0);

			assert.ok(
				logService.warnings.some(w => w.message.includes('Failed to seed MCP server inventory')),
				`expected seed-failure warning, got: ${JSON.stringify(logService.warnings)}`,
			);

			// Subsequent live events still flow through the normal pipeline.
			mockSession.fire('session.mcp_servers_loaded', {
				servers: [{ name: 'late', status: 'connected' }],
			} as SessionEventPayload<'session.mcp_servers_loaded'>['data']);
			await waitForSignal(s => isAction(s, ActionType.SessionCustomizationUpdated));
		});
	});
});
