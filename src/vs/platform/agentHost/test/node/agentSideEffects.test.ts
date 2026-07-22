/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { observableValue } from '../../../../base/common/observable.js';
import { hasKey } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { AgentSession, IAgent, SubagentChatSignal } from '../../common/agentService.js';
import { buildDefaultChangesetCatalog } from '../../common/changesetUri.js';
import { readToolCallMeta } from '../../common/meta/agentToolCallMeta.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import type { RootConfigChangedAction } from '../../common/state/protocol/actions.js';
import { ChangesSummary, ChatOriginKind, CustomizationType, McpAuthRequiredReason, SessionInputRequestKind } from '../../common/state/protocol/state.js';
import { ActionType, ActionEnvelope, type ChatAction, type INotification, type SessionAction } from '../../common/state/sessionActions.js';
import { buildSubagentChatUri, buildChatUri, buildDefaultChatUri, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInteractivity, CustomizationLoadStatus, MessageAttachmentKind, MessageKind, PendingMessageKind, ResponsePartKind, SessionInputResponseKind, SessionLifecycle, SessionStatus, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, TurnState, customizationId, type ClientPluginCustomization, type Customization, type PluginCustomization } from '../../common/state/sessionState.js';
import { IProductService } from '../../../product/common/productService.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { AgentHostTelemetryLevelConfigKey, telemetryLevelToAgentHostConfigValue } from '../../common/agentHostSchema.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostTelemetryService } from '../../node/agentHostTelemetryService.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../../common/agentHostCheckpointService.js';
import { IAgentHostChangesetService, StaticChangesetKind } from '../../common/agentHostChangesetService.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { AgentService } from '../../node/agentService.js';
import { AgentSideEffects, IAgentSideEffectsOptions } from '../../node/agentSideEffects.js';
import { AgentHostLocalTurns } from '../../node/agentHostLocalTurns.js';
import { IAgentHostTerminalManager } from '../../node/agentHostTerminalManager.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { createNoopGitService, createNullSessionDataService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { MockAgent } from './mockAgent.js';
import { TestAgentHostTerminalManager } from './testAgentHostTerminalManager.js';

// ---- Tests ------------------------------------------------------------------

/** Spy `IAgentHostChangesetService` used to assert AgentSideEffects forwarding. */
class FakeChangesetService implements IAgentHostChangesetService {
	declare readonly _serviceBrand: undefined;

	readonly toolCallEdits: { session: string; turnId: string }[] = [];
	readonly turnCompletes: { session: string; turnId: string | undefined }[] = [];
	readonly truncates: string[] = [];

	registerStaticChangesets(): void { /* no-op for routing tests */ }
	restoreStaticChangeset(_session: string, _kind: StaticChangesetKind, _diffs: readonly unknown[]): void { /* no-op */ }
	parsePersistedStaticChangesets(): { session?: undefined } { return {}; }
	applyPersistedStaticChangesets(): void { /* no-op */ }
	restorePersistedStaticChangesets(): { session?: undefined } { return {}; }
	persistChangesSummary(session: string, changesSummary: ChangesSummary): void { /* no-op */ }
	isStaticChangesetComputeActive(): boolean { return false; }
	getListMetadataKeys(_sessionUri: string): Record<string, true> | undefined { return undefined; }
	computeListEntryChanges(_sessionUri: string, _metadata: Record<string, string | undefined>): ChangesSummary | undefined { return undefined; }
	refreshChangesetCatalog(session: string): void { /* no-op */ }
	refreshBranchChangeset(): void { /* no-op */ }
	refreshSessionChangeset(): void { /* no-op */ }
	onWorkingDirectoryAvailable(): void { /* no-op */ }
	recomputeSubscribedChangesets(): void { /* no-op */ }
	onSessionDisposed(): void { /* no-op */ }
	async computeUncommittedChangeset(session: string): Promise<string> { return `${session}/changeset/uncommitted`; }
	async computeTurnChangeset(session: string): Promise<string> { return `${session}/changeset/turn/x`; }
	async computeCompareTurnsChangeset(session: string, originalTurnId: string, modifiedTurnId: string): Promise<string> {
		return `${session}/changeset/compare/${originalTurnId}/${modifiedTurnId}`;
	}

	onToolCallEditsApplied(session: string, turnId: string): void {
		this.toolCallEdits.push({ session, turnId });
	}
	onTurnComplete(session: string, turnId: string | undefined): void {
		this.turnCompletes.push({ session, turnId });
	}
	onSessionTruncated(session: string): void {
		this.truncates.push(session);
	}
}

/**
 * Constructs an {@link AgentSideEffects} with a minimal local instantiation
 * scope that satisfies its {@link IAgentConfigurationService} /
 * {@link ILogService} / {@link IAgentHostChangesetService} dependencies.
 * `gitService` is no longer required by `AgentSideEffects` itself (moved
 * to {@link IAgentHostChangesetService}); it is kept here as a leftover
 * for any future tests that need to override the no-op git service via
 * the changeset fake's underlying implementation.
 */
function createTestSideEffects(
	disposables: DisposableStore,
	stateManager: AgentHostStateManager,
	options: Omit<IAgentSideEffectsOptions, 'localTurns'> & { localTurns?: AgentHostLocalTurns },
	_gitService?: IAgentHostGitService,
	telemetryService: ITelemetryService = NullTelemetryService,
	changesets: IAgentHostChangesetService = new FakeChangesetService(),
	terminalManager: IAgentHostTerminalManager = disposables.add(new TestAgentHostTerminalManager()),
): AgentSideEffects {
	const logService = new NullLogService();
	const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
	const instantiationService = disposables.add(new InstantiationService(new ServiceCollection(
		[ILogService, logService],
		[IAgentConfigurationService, configService],
		[IAgentHostChangesetService, changesets],
		[IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE],
		[ITelemetryService, telemetryService],
		[IAgentHostTerminalManager, terminalManager],
		[ISessionDataService, options.sessionDataService],
	), /*strict*/ true));
	const resolvedOptions: IAgentSideEffectsOptions = {
		...options,
		localTurns: options.localTurns ?? new AgentHostLocalTurns(options.sessionDataService, logService),
	};
	return disposables.add(instantiationService.createInstance(AgentSideEffects, stateManager, resolvedOptions));
}

class TestTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;
	readonly telemetryLevel = TelemetryLevel.USAGE;
	readonly sessionId = 'test-session';
	readonly machineId = 'test-machine';
	readonly sqmId = 'test-sqm';
	readonly devDeviceId = 'test-dev-device';
	readonly firstSessionDate = 'test-first-session-date';
	readonly sendErrorTelemetry = false;
	readonly events: { eventName: string; data: unknown }[] = [];

	publicLog(): void { }
	publicLog2(eventName: string, data?: unknown): void {
		this.events.push({ eventName, data });
	}
	publicLogError(): void { }
	publicLogError2(): void { }
	setExperimentProperty(): void { }
	setCommonProperty(): void { }
}

suite('AgentSideEffects', () => {

	const disposables = new DisposableStore();
	let fileService: FileService;
	let stateManager: AgentHostStateManager;
	let agent: MockAgent;
	let sideEffects: AgentSideEffects;
	let agentList: ReturnType<typeof observableValue<readonly IAgent[]>>;
	let telemetryService: TestTelemetryService;

	const sessionUri = AgentSession.uri('mock', 'session-1');
	const defaultChatUri = buildDefaultChatUri(sessionUri);

	function setupSession(workingDirectory?: string): void {
		stateManager.createSession({
			resource: sessionUri.toString(),
			provider: 'mock',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
			project: { uri: 'file:///test-project', displayName: 'Test Project' },
			workingDirectory,
		});
		stateManager.setSessionChangesets(sessionUri.toString(), buildDefaultChangesetCatalog(sessionUri.toString()));
		stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionReady, });
	}

	function startTurn(turnId: string, channel = defaultChatUri): void {
		stateManager.dispatchClientAction(channel, { type: ActionType.ChatTurnStarted, turnId, startedAt: '2025-01-01T00:00:00.000Z', message: { text: 'hello', origin: { kind: MessageKind.User } } },
			{ clientId: 'test', clientSeq: 1 },
		);
	}

	/**
	 * Resolves with the first non-`undefined` value returned by `match`,
	 * re-evaluating it immediately and after every envelope emitted by the
	 * state manager. Used to await the async tool-approval pipeline
	 * (`_handleToolReady` -> `getAutoApproval` -> `realpath`) deterministically
	 * instead of depending on a fixed settle delay.
	 */
	function waitForState<T>(manager: AgentHostStateManager, match: () => T | undefined): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const initial = match();
			if (initial !== undefined) {
				resolve(initial);
				return;
			}
			const store = new DisposableStore();
			const timer = setTimeout(() => {
				store.dispose();
				reject(new Error('waitForState: condition was not met'));
			}, 5000);
			store.add(toDisposable(() => clearTimeout(timer)));
			store.add(manager.onDidEmitEnvelope(() => {
				const value = match();
				if (value !== undefined) {
					store.dispose();
					resolve(value);
				}
			}));
		});
	}

	async function waitForSendMessageCalls(count: number): Promise<void> {
		if (agent.sendMessageCalls.length >= count) {
			return;
		}
		await Event.toPromise(Event.filter(agent.onDidSendMessage, () => agent.sendMessageCalls.length >= count));
	}

	setup(async () => {
		fileService = disposables.add(new FileService(new NullLogService()));
		const memFs = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.inMemory, memFs));

		// Seed a file so the handleBrowseDirectory tests can distinguish files from dirs
		const testDir = URI.from({ scheme: Schemas.inMemory, path: '/testDir' });
		await fileService.createFolder(testDir);
		await fileService.writeFile(URI.from({ scheme: Schemas.inMemory, path: '/testDir/file.txt' }), VSBuffer.fromString('hello'));

		agent = new MockAgent();
		disposables.add(toDisposable(() => agent.dispose()));
		stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		agentList = observableValue<readonly IAgent[]>('agents', [agent]);
		telemetryService = new TestTelemetryService();
		sideEffects = createTestSideEffects(disposables, stateManager, {
			getAgent: () => agent,
			agents: agentList,
			sessionDataService: createNullSessionDataService(),
			onTurnComplete: () => { },
		}, undefined, disposables.add(new AgentHostTelemetryService(telemetryService)));

		// Mimic the orchestrator's spawn channel: in production AgentService adds
		// a subagent's chat to the catalog (via _onChatSpawned) before
		// AgentSideEffects starts its turn. Registered here (ahead of each test's
		// registerProgressListener) so the subagent chat exists first. addChat is
		// idempotent, matching the real spawn-channel/side-effects overlap.
		disposables.add(agent.onDidSessionProgress(signal => {
			const spawn = SubagentChatSignal.toSpawnEvent(signal);
			if (spawn) {
				stateManager.addChat(spawn.session.toString(), spawn.chat.toString(), {
					title: spawn.title,
					origin: spawn.parent ? { kind: ChatOriginKind.Tool, chat: spawn.parent.chat.toString(), toolCallId: spawn.parent.toolCallId } : undefined,
				});
			}
		}));
	});

	teardown(() => {
		disposables.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- handleAction: session/turnStarted ------------------------------

	suite('handleAction — session/turnStarted', () => {

		test('calls sendMessage on the agent', async () => {
			setupSession();
			const action: ChatAction = {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'hello world', origin: { kind: MessageKind.User } },
			};
			sideEffects.handleAction(defaultChatUri, action);

			await waitForSendMessageCalls(1);

			assert.deepStrictEqual(agent.sendMessageCalls, [{ session: URI.parse(sessionUri.toString()), prompt: 'hello world', attachments: undefined, chat: URI.parse(defaultChatUri) }]);
		});

		test('passes the dispatching client id to sendMessage', async () => {
			setupSession();
			const action: ChatAction = {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'hello world', origin: { kind: MessageKind.User } },
			};
			sideEffects.handleAction(defaultChatUri, action, 'client-B');

			await waitForSendMessageCalls(1);

			assert.deepStrictEqual(agent.sendMessageCalls, [{
				session: URI.parse(sessionUri.toString()),
				prompt: 'hello world',
				attachments: undefined,
				chat: URI.parse(defaultChatUri),
				senderClientId: 'client-B',
			}]);
		});

		test('logs telemetry when sending a direct user message', () => {
			setupSession();
			const activeClientAction: SessionAction = {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'test-client',
					tools: [{ name: 'testTool', inputSchema: { type: 'object' } }],
					customizations: [{ type: CustomizationType.Plugin, id: customizationId('file:///customizations/SKILL.md'), uri: 'file:///customizations/SKILL.md', name: 'Test Skill', enabled: true }]
				},
			};
			stateManager.dispatchClientAction(sessionUri.toString(), activeClientAction, { clientId: 'test', clientSeq: 1 });
			sideEffects.handleAction(sessionUri.toString(), activeClientAction);
			const fileUri = URI.file('/workspace/direct.ts');
			sideEffects.handleAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'hello world', origin: { kind: MessageKind.User }, attachments: [{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: 'direct.ts', displayKind: 'document' }] },
			});

			assert.deepStrictEqual(telemetryService.events, [{
				eventName: 'agentHost.userMessageSent',
				data: {
					provider: 'mock',
					agentSessionId: 'session-1',
					source: 'direct',
					isSubagentSession: false,
					turnCount: 0,
					activeClientId: 'test-client',
					activeClientToolCount: 1,
					activeClientCustomizationCount: 1,
					attachmentCount: 1,
				},
			}]);
		});

		test('parses protocol attachment URI strings before passing them to the agent', async () => {
			setupSession();
			const fileUri = URI.file('/workspace/test.ts');
			const action: ChatAction = {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'hello world', origin: { kind: MessageKind.User }, attachments: [{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: 'test.ts', displayKind: 'document' }] },
			};

			sideEffects.handleAction(defaultChatUri, action);
			await waitForSendMessageCalls(1);

			assert.deepStrictEqual(agent.sendMessageCalls, [{
				session: URI.parse(sessionUri.toString()),
				prompt: 'hello world',
				attachments: [{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: 'test.ts', displayKind: 'document' }],
				chat: URI.parse(defaultChatUri),
			}]);
		});

		test('passes protocol selection attachment range straight through to the agent', async () => {
			setupSession();
			const fileUri = URI.file('/workspace/selection.ts');
			const action: ChatAction = {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: {
					text: 'hello world',
					origin: { kind: MessageKind.User },
					attachments: [{
						type: MessageAttachmentKind.Resource,
						uri: fileUri.toString(),
						label: 'selection.ts',
						displayKind: 'selection',
						selection: {
							range: {
								start: { line: 2, character: 3 },
								end: { line: 4, character: 5 }
							}
						}
					}]
				},
			};

			sideEffects.handleAction(defaultChatUri, action);
			await waitForSendMessageCalls(1);

			assert.deepStrictEqual(agent.sendMessageCalls, [{
				session: URI.parse(sessionUri.toString()),
				prompt: 'hello world',
				attachments: [{
					type: MessageAttachmentKind.Resource,
					uri: fileUri.toString(),
					label: 'selection.ts',
					displayKind: 'selection',
					selection: {
						range: {
							start: { line: 2, character: 3 },
							end: { line: 4, character: 5 },
						},
					},
				}],
				chat: URI.parse(defaultChatUri),
			}]);
		});

		test('dispatches session/error when no agent is found', async () => {
			setupSession();
			const emptyAgents = observableValue<readonly IAgent[]>('agents', []);
			const noAgentSideEffects = createTestSideEffects(disposables, stateManager, {
				getAgent: () => undefined,
				agents: emptyAgents,
				sessionDataService: {} as ISessionDataService,
				onTurnComplete: () => { },
			});

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			noAgentSideEffects.handleAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'hello', origin: { kind: MessageKind.User } },
			});

			const errorAction = envelopes.find(e => e.action.type === ActionType.ChatError);
			assert.ok(errorAction, 'should dispatch session/error');
		});

		test('rejects a turn on an archived session without calling the agent', () => {
			setupSession();
			stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionIsArchivedChanged, isArchived: true });

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			sideEffects.handleAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				startedAt: '2025-01-01T00:00:00.000Z',
				turnId: 'turn-1',
				message: { text: 'hello', origin: { kind: MessageKind.User } },
			});

			const errorAction = envelopes.find(e => e.action.type === ActionType.ChatError);
			assert.ok(errorAction, 'should dispatch a chat error for an archived session');
			assert.deepStrictEqual(agent.sendMessageCalls, []);
		});

		test('rejects a turn on a read-only chat without calling the agent', () => {
			setupSession();
			// A read-only peer chat (e.g. a subagent worker) on a non-archived
			// session — enforcement keys off the chat's interactivity, not archived.
			const readOnlyChat = buildChatUri(sessionUri, 'peer-ro');
			stateManager.addChat(sessionUri.toString(), readOnlyChat, { interactivity: ChatInteractivity.ReadOnly });

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			sideEffects.handleAction(readOnlyChat, {
				type: ActionType.ChatTurnStarted,
				startedAt: '2025-01-01T00:00:00.000Z',
				turnId: 'turn-1',
				message: { text: 'hello', origin: { kind: MessageKind.User } },
			});

			const errorAction = envelopes.find(e => e.action.type === ActionType.ChatError);
			assert.ok(errorAction, 'should dispatch a chat error for a read-only chat');
			assert.deepStrictEqual(agent.sendMessageCalls, []);
		});
	});

	// ---- handleAction: first-turn materialization failure ---------------

	suite('handleAction — first-turn materialization failure', () => {
		/**
		 * Create a provisional (not-yet-materialized) session: no `SessionReady`
		 * (so lifecycle stays `Creating`) and a deferred `SessionAdded` — mirroring
		 * how the agent host creates a session whose worktree/SDK setup happens on
		 * the first `sendMessage`.
		 */
		function setupProvisionalSession(): void {
			stateManager.createSession({
				resource: sessionUri.toString(),
				provider: 'mock',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
			}, { emitNotification: false });
		}

		test('surfaces a failed provisional first turn as a terminal creation failure', async () => {
			setupProvisionalSession();
			agent.sendMessageError = new Error('git -c exited with code 128: fatal: invalid reference: main');

			// Reduce the turn start (as the client would) so the chat has an
			// active turn for the subsequent ChatError to terminate, then invoke
			// the side effects that drive `sendMessage`.
			const turnStarted = {
				type: ActionType.ChatTurnStarted,
				startedAt: '2025-01-01T00:00:00.000Z',
				turnId: 'turn-1',
				message: { text: 'hello', origin: { kind: MessageKind.User } },
			} as const;
			stateManager.dispatchClientAction(defaultChatUri, turnStarted, { clientId: 'test', clientSeq: 1 });

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
			const notifications: INotification[] = [];
			disposables.add(stateManager.onDidEmitNotification(n => notifications.push(n)));

			sideEffects.handleAction(defaultChatUri, turnStarted);

			// Wait for the async send rejection + catch handling to run.
			await waitForState(stateManager, () => envelopes.some(e => e.action.type === ActionType.SessionCreationFailed) || undefined);

			const sessionAdded = notifications.find(n => n.type === 'root/sessionAdded');
			assert.deepStrictEqual({
				chatError: envelopes.some(e => e.action.type === ActionType.ChatError),
				creationFailed: envelopes.some(e => e.action.type === ActionType.SessionCreationFailed),
				lifecycle: stateManager.getSessionState(sessionUri.toString())?.lifecycle,
				sessionAddedWithError: !!sessionAdded && (sessionAdded.summary.status & SessionStatus.Error) === SessionStatus.Error,
			}, {
				chatError: true,
				creationFailed: true,
				lifecycle: SessionLifecycle.CreationFailed,
				sessionAddedWithError: true,
			});
		});

		test('surfaces a working directory resolution failure without calling the agent', async () => {
			setupProvisionalSession();
			const resolutionError = new Error('The isolated worktree could not be restored');
			const resolvingSideEffects = createTestSideEffects(disposables, stateManager, {
				getAgent: () => agent,
				agents: agentList,
				sessionDataService: {} as ISessionDataService,
				resolveWorkingDirectoryBeforeSend: async () => { throw resolutionError; },
				onTurnComplete: () => { },
			});
			const turnStarted = {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'hello', origin: { kind: MessageKind.User } },
			} as const;
			stateManager.dispatchClientAction(defaultChatUri, turnStarted, { clientId: 'test', clientSeq: 1 });

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
			resolvingSideEffects.handleAction(defaultChatUri, turnStarted);

			await waitForState(stateManager, () => envelopes.some(e => e.action.type === ActionType.SessionCreationFailed) || undefined);

			assert.deepStrictEqual({
				chatError: envelopes.some(e => e.action.type === ActionType.ChatError),
				creationFailed: envelopes.some(e => e.action.type === ActionType.SessionCreationFailed),
				lifecycle: stateManager.getSessionState(sessionUri.toString())?.lifecycle,
				sendMessageCalls: agent.sendMessageCalls,
			}, {
				chatError: true,
				creationFailed: true,
				lifecycle: SessionLifecycle.CreationFailed,
				sendMessageCalls: [],
			});
		});

		test('does not fail creation when an already-ready session send rejects', async () => {
			setupSession(); // dispatches SessionReady -> lifecycle Ready
			agent.sendMessageError = new Error('transient send failure');

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			sideEffects.handleAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				startedAt: '2025-01-01T00:00:00.000Z',
				turnId: 'turn-1',
				message: { text: 'hello', origin: { kind: MessageKind.User } },
			});

			await waitForState(stateManager, () => envelopes.some(e => e.action.type === ActionType.ChatError) || undefined);

			assert.deepStrictEqual({
				chatError: envelopes.some(e => e.action.type === ActionType.ChatError),
				creationFailed: envelopes.some(e => e.action.type === ActionType.SessionCreationFailed),
				lifecycle: stateManager.getSessionState(sessionUri.toString())?.lifecycle,
			}, {
				chatError: true,
				creationFailed: false,
				lifecycle: SessionLifecycle.Ready,
			});
		});
	});

	// ---- handleAction: generic /rename slash command ---------------------

	suite('handleAction — /rename slash command', () => {

		// `/rename` persists the new title, so these tests need a session data
		// service whose `openDatabase` actually returns a database (the default
		// null service throws).
		function createRenameSideEffects(): AgentSideEffects {
			return createTestSideEffects(disposables, stateManager, {
				getAgent: () => agent,
				agents: agentList,
				sessionDataService: createSessionDataService(),
				onTurnComplete: () => { },
			});
		}

		test('redirects /rename to a title change and completes the turn without calling the agent', async () => {
			setupSession();
			const renameSideEffects = createRenameSideEffects();
			const action: ChatAction = {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: '/rename Renamed Session', origin: { kind: MessageKind.User } },
			};
			// Mirror production: the reducer applies the turn, then side effects run.
			stateManager.dispatchClientAction(defaultChatUri, action, { clientId: 'test', clientSeq: 1 });
			renameSideEffects.handleAction(defaultChatUri, action);
			await new Promise(r => setTimeout(r, 10));

			assert.deepStrictEqual(agent.sendMessageCalls, []);
			const state = stateManager.getSessionState(sessionUri.toString());
			assert.strictEqual(state?.title, 'Renamed Session');
			assert.strictEqual(stateManager.getActiveTurnId(sessionUri.toString()), undefined);
			const part = state?.turns.at(-1)?.responseParts[0];
			assert.strictEqual(part?.kind, ResponsePartKind.Markdown);
			assert.strictEqual(part?.kind === ResponsePartKind.Markdown ? part.content : undefined, 'Renamed: Renamed Session');
		});

		test('/rename without a title completes the turn and leaves the title unchanged', async () => {
			setupSession();
			const renameSideEffects = createRenameSideEffects();
			const action: ChatAction = {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: '/rename', origin: { kind: MessageKind.User } },
			};
			stateManager.dispatchClientAction(defaultChatUri, action, { clientId: 'test', clientSeq: 1 });
			renameSideEffects.handleAction(defaultChatUri, action);
			await new Promise(r => setTimeout(r, 10));

			assert.deepStrictEqual(agent.sendMessageCalls, []);
			const state = stateManager.getSessionState(sessionUri.toString());
			assert.strictEqual(state?.title, 'Test');
			assert.strictEqual(stateManager.getActiveTurnId(sessionUri.toString()), undefined);
		});

		test('a message that merely starts with /rename text (no separator) is sent to the agent', async () => {
			setupSession();
			const renameSideEffects = createRenameSideEffects();
			const action: ChatAction = {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: '/renamed thing', origin: { kind: MessageKind.User } },
			};
			stateManager.dispatchClientAction(defaultChatUri, action, { clientId: 'test', clientSeq: 1 });
			renameSideEffects.handleAction(defaultChatUri, action);
			await new Promise(r => setTimeout(r, 10));

			assert.deepStrictEqual(agent.sendMessageCalls, [{ session: URI.parse(sessionUri.toString()), chat: URI.parse(defaultChatUri), prompt: '/renamed thing', attachments: undefined }]);
		});
	});

	// ---- handleAction: generic ! terminal command ------------------------

	suite('handleAction — ! terminal command', () => {

		function createBangSideEffects(terminalManager: TestAgentHostTerminalManager): AgentSideEffects {
			return createTestSideEffects(disposables, stateManager, {
				getAgent: () => agent,
				agents: agentList,
				sessionDataService: createNullSessionDataService(),
				onTurnComplete: () => { },
			}, undefined, undefined, undefined, terminalManager);
		}

		test('runs a ! message as a terminal command and completes the turn without calling the agent', async () => {
			setupSession('file:///work');
			const terminalManager = disposables.add(new TestAgentHostTerminalManager());
			const bangSideEffects = createBangSideEffects(terminalManager);
			const action: ChatAction = {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: '!echo hi', origin: { kind: MessageKind.User } },
			};
			// Mirror production: the reducer opens the turn, then side effects run.
			stateManager.dispatchClientAction(defaultChatUri, action, { clientId: 'test', clientSeq: 1 });
			bangSideEffects.handleAction(defaultChatUri, action);

			// Wait until the command is running (its completion listener is
			// registered), then signal that the command finished.
			await terminalManager.commandFinishedListenerRegistered.p;
			const terminalUri = terminalManager.created[0].channel;
			terminalManager.fireCommandFinished({ commandId: '1', command: 'echo hi', exitCode: 0, output: 'hi\n' });

			// Wait for the turn to be closed out.
			await waitForState(stateManager, () => stateManager.getActiveTurnId(sessionUri.toString()) === undefined ? true : undefined);

			assert.deepStrictEqual(agent.sendMessageCalls, []);
			const state = stateManager.getSessionState(sessionUri.toString());
			const part = state?.turns.at(-1)?.responseParts[0];
			assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
			const toolCall = part?.kind === ResponsePartKind.ToolCall ? part.toolCall : undefined;
			assert.strictEqual(toolCall?.status, ToolCallStatus.Completed);
			assert.strictEqual(toolCall?.status === ToolCallStatus.Completed ? toolCall.success : undefined, true);
			assert.ok(toolCall?.status === ToolCallStatus.Completed
				&& toolCall.content?.some(c => c.type === ToolResultContentType.Terminal && c.resource === terminalUri));
			assert.strictEqual(terminalManager.created.length, 1);
			assert.ok(terminalManager.sentTexts.some(s => s.data.includes('echo hi')));
		});

		test('a lone ! is forwarded to the agent instead of running a command', async () => {
			setupSession();
			const terminalManager = disposables.add(new TestAgentHostTerminalManager());
			const bangSideEffects = createBangSideEffects(terminalManager);
			const action: ChatAction = {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: '!', origin: { kind: MessageKind.User } },
			};
			stateManager.dispatchClientAction(defaultChatUri, action, { clientId: 'test', clientSeq: 1 });
			bangSideEffects.handleAction(defaultChatUri, action);

			await waitForSendMessageCalls(1);

			assert.strictEqual(agent.sendMessageCalls[0].prompt, '!');
			assert.strictEqual(terminalManager.created.length, 0);
		});

		test('records the completed bang turn as a local turn, stripped of the live terminal reference', async () => {
			setupSession('file:///work');
			const db = new TestSessionDatabase();
			const localTurns = new AgentHostLocalTurns(createSessionDataService(db), new NullLogService());
			const terminalManager = disposables.add(new TestAgentHostTerminalManager());
			const bangSideEffects = createTestSideEffects(disposables, stateManager, {
				getAgent: () => agent,
				agents: agentList,
				sessionDataService: createSessionDataService(db),
				localTurns,
				onTurnComplete: () => { },
			}, undefined, undefined, undefined, terminalManager);

			const action: ChatAction = {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: '!echo hi', origin: { kind: MessageKind.User } },
			};
			stateManager.dispatchClientAction(defaultChatUri, action, { clientId: 'test', clientSeq: 1 });
			bangSideEffects.handleAction(defaultChatUri, action);

			await terminalManager.commandFinishedListenerRegistered.p;
			terminalManager.fireCommandFinished({ commandId: '1', command: 'echo hi', exitCode: 0, output: 'hi\n' });
			await waitForState(stateManager, () => stateManager.getActiveTurnId(sessionUri.toString()) === undefined ? true : undefined);

			// The turn with no preceding real turn has no anchor.
			assert.strictEqual(localTurns.resolveConcreteTurnId(defaultChatUri, 'turn-1'), undefined);
			const persisted = await db.getLocalTurns();
			assert.strictEqual(persisted.length, 1);
			const payload = JSON.parse(persisted[0].payload) as { responseParts: { kind: string; toolCall?: { content?: { type: string }[] } }[] };
			const toolCallPart = payload.responseParts.find(p => p.kind === ResponsePartKind.ToolCall);
			// Live terminal reference is stripped; text output is retained.
			assert.ok(toolCallPart?.toolCall?.content?.every(c => c.type !== ToolResultContentType.Terminal));
			assert.ok(toolCallPart?.toolCall?.content?.some(c => c.type === ToolResultContentType.Text));
		});

		test('seeds the session title from the ! command when the session is untitled', async () => {
			// A brand-new, untitled session: the bang command is the only thing
			// we can title it with until a real request arrives.
			stateManager.createSession({
				resource: sessionUri.toString(),
				provider: 'mock',
				title: '',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
			});
			stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionReady });
			const db = new TestSessionDatabase();
			const terminalManager = disposables.add(new TestAgentHostTerminalManager());
			const bangSideEffects = createTestSideEffects(disposables, stateManager, {
				getAgent: () => agent,
				agents: agentList,
				sessionDataService: createSessionDataService(db),
				onTurnComplete: () => { },
			}, undefined, undefined, undefined, terminalManager);
			const action: ChatAction = {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: '!echo hi', origin: { kind: MessageKind.User } },
			};
			stateManager.dispatchClientAction(defaultChatUri, action, { clientId: 'test', clientSeq: 1 });
			bangSideEffects.handleAction(defaultChatUri, action);

			// The provisional title is applied synchronously, before the command runs.
			assert.strictEqual(stateManager.getSessionState(sessionUri.toString())?.title, 'echo hi');

			// Let the command finish so the turn closes cleanly.
			await terminalManager.commandFinishedListenerRegistered.p;
			terminalManager.fireCommandFinished({ commandId: '1', command: 'echo hi', exitCode: 0, output: 'hi\n' });
			await waitForState(stateManager, () => stateManager.getActiveTurnId(sessionUri.toString()) === undefined ? true : undefined);

			// The provisional title is persisted so it survives reload.
			assert.strictEqual(await db.getMetadata('customTitle'), 'echo hi');
		});
	});

	// ---- local turn persistence: anchoring + truncate resolution ---------

	suite('local turn persistence', () => {

		let clientSeq: number;

		setup(() => {
			clientSeq = 0;
		});

		/** Drives a normal (SDK-backed) turn into `turns[]` via the reducer. */
		function seedRealTurn(turnId: string, text: string): void {
			stateManager.dispatchClientAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted, turnId, startedAt: '2025-01-01T00:00:00.000Z', message: { text, origin: { kind: MessageKind.User } },
			}, { clientId: 'test', clientSeq: ++clientSeq });
			stateManager.dispatchServerAction(defaultChatUri, { type: ActionType.ChatTurnComplete, turnId, duration: 1000 });
		}

		async function runBang(se: AgentSideEffects, terminalManager: TestAgentHostTerminalManager, turnId: string): Promise<void> {
			const action: ChatAction = {
				type: ActionType.ChatTurnStarted, turnId, startedAt: '2025-01-01T00:00:00.000Z', message: { text: '!echo hi', origin: { kind: MessageKind.User } },
			};
			stateManager.dispatchClientAction(defaultChatUri, action, { clientId: 'test', clientSeq: ++clientSeq });
			se.handleAction(defaultChatUri, action);
			await terminalManager.commandFinishedListenerRegistered.p;
			terminalManager.fireCommandFinished({ commandId: turnId, command: 'echo hi', exitCode: 0, output: 'hi\n' });
			await waitForState(stateManager, () => stateManager.getActiveTurnId(sessionUri.toString()) === undefined ? true : undefined);
		}

		let localTurns: AgentHostLocalTurns;

		function createLocalTurnSideEffects(db: TestSessionDatabase, terminalManager: TestAgentHostTerminalManager): AgentSideEffects {
			const sessionDataService = createSessionDataService(db);
			localTurns = new AgentHostLocalTurns(sessionDataService, new NullLogService());
			return createTestSideEffects(disposables, stateManager, {
				getAgent: () => agent,
				agents: agentList,
				sessionDataService,
				localTurns,
				onTurnComplete: () => { },
			}, undefined, undefined, undefined, terminalManager);
		}

		test('anchors a bang turn to the preceding concrete turn', async () => {
			setupSession('file:///work');
			const db = new TestSessionDatabase();
			const terminalManager = disposables.add(new TestAgentHostTerminalManager());
			const se = createLocalTurnSideEffects(db, terminalManager);

			seedRealTurn('real-1', 'hello');
			await runBang(se, terminalManager, 'local-1');

			assert.strictEqual(localTurns.resolveConcreteTurnId(defaultChatUri, 'local-1'), 'real-1');
			const persisted = await db.getLocalTurns();
			assert.deepStrictEqual(persisted.map(r => ({ turnId: r.turnId, chatUri: r.chatUri, anchorTurnId: r.anchorTurnId })), [
				{ turnId: 'local-1', chatUri: defaultChatUri, anchorTurnId: 'real-1' },
			]);
		});

		test('truncating at a local turn redirects the SDK truncation to the concrete anchor', async () => {
			setupSession('file:///work');
			const db = new TestSessionDatabase();
			const terminalManager = disposables.add(new TestAgentHostTerminalManager());
			const se = createLocalTurnSideEffects(db, terminalManager);

			seedRealTurn('real-1', 'hello');
			await runBang(se, terminalManager, 'local-1');

			// Truncate at the local turn (keep it). Reducer keeps [real-1, local-1].
			stateManager.dispatchClientAction(defaultChatUri, { type: ActionType.ChatTruncated, turnId: 'local-1' }, { clientId: 'test', clientSeq: ++clientSeq });
			se.handleAction(defaultChatUri, { type: ActionType.ChatTruncated, turnId: 'local-1' });

			// The SDK is told to keep up to the concrete turn before the local one.
			const truncateCall = agent.truncateSessionCalls.at(-1);
			assert.strictEqual(truncateCall?.session.toString(), sessionUri.toString());
			assert.strictEqual(truncateCall?.turnId, 'real-1');
		});

		test('truncating at a real turn drops the trailing local turn', async () => {
			setupSession('file:///work');
			const db = new TestSessionDatabase();
			const terminalManager = disposables.add(new TestAgentHostTerminalManager());
			const se = createLocalTurnSideEffects(db, terminalManager);

			seedRealTurn('real-1', 'hello');
			await runBang(se, terminalManager, 'local-1');

			// Truncate at the real turn (drop the local turn after it).
			stateManager.dispatchClientAction(defaultChatUri, { type: ActionType.ChatTruncated, turnId: 'real-1' }, { clientId: 'test', clientSeq: ++clientSeq });
			se.handleAction(defaultChatUri, { type: ActionType.ChatTruncated, turnId: 'real-1' });

			assert.strictEqual(agent.truncateSessionCalls.at(-1)?.turnId, 'real-1');
			// The local turn is dropped from memory synchronously and from the DB async.
			assert.strictEqual(localTurns.isLocal(defaultChatUri, 'local-1'), false);
			await new Promise(r => setTimeout(r, 10));
			assert.deepStrictEqual(await db.getLocalTurns(), []);
		});
	});

	// ---- immediate title on first turn -----------------------------------

	suite('immediate title on first turn', () => {

		function setupDefaultSession(): void {
			stateManager.createSession({
				resource: sessionUri.toString(),
				provider: 'mock',
				title: '',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				project: { uri: 'file:///test-project', displayName: 'Test Project' },
			});
			stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionReady, });
		}

		test('dispatches titleChanged with user message on first turn', () => {
			setupDefaultSession();

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			sideEffects.handleAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'Fix the login bug', origin: { kind: MessageKind.User } },
			});

			const titleAction = envelopes.find(e => e.action.type === ActionType.SessionTitleChanged);
			assert.ok(titleAction, 'should dispatch session/titleChanged');
			if (titleAction?.action.type === ActionType.SessionTitleChanged) {
				assert.strictEqual(titleAction.action.title, 'Fix the login bug');
			}
		});

		test('does not dispatch titleChanged when message is whitespace', () => {
			setupDefaultSession();

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			sideEffects.handleAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: '   ', origin: { kind: MessageKind.User } },
			});

			const titleAction = envelopes.find(e => e.action.type === ActionType.SessionTitleChanged);
			assert.strictEqual(titleAction, undefined, 'should not dispatch titleChanged for empty message');
		});

		test('normalizes whitespace and truncates long messages', () => {
			setupDefaultSession();

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			const longMessage = 'Fix the bug\nin the login\tpage  please ' + 'a'.repeat(250);
			sideEffects.handleAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: longMessage, origin: { kind: MessageKind.User } },
			});

			const titleAction = envelopes.find(e => e.action.type === ActionType.SessionTitleChanged);
			assert.ok(titleAction, 'should dispatch session/titleChanged');
			if (titleAction?.action.type === ActionType.SessionTitleChanged) {
				assert.ok(!titleAction.action.title.includes('\n'), 'should not contain newlines');
				assert.ok(!titleAction.action.title.includes('\t'), 'should not contain tabs');
				assert.ok(!titleAction.action.title.includes('  '), 'should not contain double spaces');
				assert.ok(titleAction.action.title.length <= 200, 'should be truncated to 200 chars');
			}
		});

		test('does not dispatch titleChanged on second turn', () => {
			setupDefaultSession();
			startTurn('turn-1');

			// Complete the first turn so turns.length becomes 1.
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-1',
				duration: 1000,
			});

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			sideEffects.handleAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-2',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'second message', origin: { kind: MessageKind.User } },
			});

			const titleAction = envelopes.find(e => e.action.type === ActionType.SessionTitleChanged);
			assert.strictEqual(titleAction, undefined, 'should not dispatch titleChanged on second turn');
		});

		test('does not dispatch titleChanged when title is already set', () => {
			// Session has a non-empty title (e.g. user renamed before first message)
			stateManager.createSession({
				resource: sessionUri.toString(),
				provider: 'mock',
				title: 'User Renamed',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				project: { uri: 'file:///test-project', displayName: 'Test Project' },
			});
			stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionReady, });

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			sideEffects.handleAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'hello', origin: { kind: MessageKind.User } },
			});

			const titleAction = envelopes.find(e => e.action.type === ActionType.SessionTitleChanged);
			assert.strictEqual(titleAction, undefined, 'should not clobber existing title');
		});
	});

	suite('turn completion — read/unread', () => {

		function readChangesFrom(envelopes: readonly ActionEnvelope[]): boolean[] {
			return envelopes
				.filter(e => e.action.type === ActionType.SessionIsReadChanged)
				.map(e => (e.action as { isRead: boolean }).isRead);
		}

		/**
		 * Turn completion persists the (un)read flag, so these tests need a real
		 * session database rather than the suite's null data service.
		 */
		function setupPersisting(): { sideEffects: AgentSideEffects; db: TestSessionDatabase } {
			const db = new TestSessionDatabase();
			const persisting = createTestSideEffects(disposables, stateManager, {
				getAgent: () => agent,
				agents: agentList,
				sessionDataService: createSessionDataService(db),
				onTurnComplete: () => { },
			}, undefined, disposables.add(new AgentHostTelemetryService(telemetryService)));
			return { sideEffects: persisting, db };
		}

		test('marks a read session unread when a turn completes', () => {
			const { sideEffects: persisting } = setupPersisting();
			setupSession();
			// The session has been read (e.g. a client viewed it).
			stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionIsReadChanged, isRead: true });
			disposables.add(persisting.registerProgressListener(agent));
			startTurn('turn-1');

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 },
			});

			assert.deepStrictEqual({
				readChanges: readChangesFrom(envelopes),
				isReadBitSet: (stateManager.getSessionSummary(sessionUri.toString())!.status & SessionStatus.IsRead) !== 0,
			}, {
				readChanges: [false],
				isReadBitSet: false,
			});
		});

		test('does not re-mark an already-unread session on turn completion', () => {
			const { sideEffects: persisting } = setupPersisting();
			setupSession();
			// No SessionIsReadChanged dispatched: the session starts unread.
			disposables.add(persisting.registerProgressListener(agent));
			startTurn('turn-1');

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 },
			});

			assert.deepStrictEqual(readChangesFrom(envelopes), []);
		});

		test('persists the unread flag so it survives a host restart', async () => {
			const { sideEffects: persisting, db } = setupPersisting();
			setupSession();
			stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionIsReadChanged, isRead: true });
			disposables.add(persisting.registerProgressListener(agent));
			startTurn('turn-1');

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 },
			});

			assert.strictEqual(await db.getMetadata('isRead'), '');
		});

		test('marks the parent session unread when a subagent turn completes', () => {
			const { sideEffects: persisting } = setupPersisting();
			setupSession();
			// The session has been read (e.g. a client viewed it after the parent
			// turn already produced output). A background subagent then completes.
			stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionIsReadChanged, isRead: true });
			disposables.add(persisting.registerProgressListener(agent));
			startTurn('turn-1');

			// Spawn a subagent chat off a parent tool call.
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-1', toolName: 'runSubagent', displayName: 'Run Subagent', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'subagent_started', chat: URI.parse(defaultChatUri),
				toolCallId: 'tc-1', agentName: 'code-reviewer', agentDisplayName: 'Code Reviewer',
			});

			const subagentUri = buildSubagentChatUri(sessionUri.toString(), 'tc-1');
			const subagentTurnId = stateManager.getSessionState(subagentUri)!.activeTurn!.id;

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(subagentUri),
				action: { type: ActionType.ChatTurnComplete, turnId: subagentTurnId, duration: 1000 },
			});

			assert.deepStrictEqual({
				readChanges: readChangesFrom(envelopes),
				isReadBitSet: (stateManager.getSessionSummary(sessionUri.toString())!.status & SessionStatus.IsRead) !== 0,
			}, {
				readChanges: [false],
				isReadBitSet: false,
			});
		});
		test('marks a read session unread when a turn is cancelled', () => {
			const { sideEffects: persisting } = setupPersisting();
			setupSession();
			stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionIsReadChanged, isRead: true });
			disposables.add(persisting.registerProgressListener(agent));
			startTurn('turn-1');

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatTurnCancelled, turnId: 'turn-1', duration: 1000 },
			});

			assert.deepStrictEqual({
				readChanges: readChangesFrom(envelopes),
				isReadBitSet: (stateManager.getSessionSummary(sessionUri.toString())!.status & SessionStatus.IsRead) !== 0,
			}, {
				readChanges: [false],
				isReadBitSet: false,
			});
		});

		test('marks a read session unread when a turn errors', () => {
			const { sideEffects: persisting } = setupPersisting();
			setupSession();
			stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionIsReadChanged, isRead: true });
			disposables.add(persisting.registerProgressListener(agent));
			startTurn('turn-1');

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatError, turnId: 'turn-1', duration: 1000, error: { errorType: 'Error', message: 'boom' } },
			});

			assert.deepStrictEqual({
				readChanges: readChangesFrom(envelopes),
				isReadBitSet: (stateManager.getSessionSummary(sessionUri.toString())!.status & SessionStatus.IsRead) !== 0,
			}, {
				readChanges: [false],
				isReadBitSet: false,
			});
		});
	});

	suite('handleAction — session/turnCancelled', () => {

		test('calls abortSession on the agent', async () => {
			setupSession();
			sideEffects.handleAction(defaultChatUri, {
				type: ActionType.ChatTurnCancelled,
				turnId: 'turn-1',
				duration: 1000,
			});

			await new Promise(r => setTimeout(r, 10));

			assert.deepStrictEqual(agent.abortSessionCalls, [URI.parse(sessionUri.toString())]);
		});
	});

	// ---- handleAction: chat/turnStarted model selection --------------------

	suite('handleAction — chat/turnStarted model selection', () => {

		test('calls changeModel on the agent before sending the message', async () => {
			setupSession();
			sideEffects.handleAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'hello', origin: { kind: MessageKind.User }, model: { id: 'gpt-5' } },
			});

			await new Promise(r => setTimeout(r, 10));

			assert.deepStrictEqual(agent.changeModelCalls, [{ session: URI.parse(sessionUri.toString()), model: { id: 'gpt-5' }, chat: URI.parse(defaultChatUri) }]);
		});

		test('waits for model selection before sending the message', async () => {
			setupSession();
			let resolveChangeModel!: () => void;
			const changeModelSettled = new Promise<void>(resolve => { resolveChangeModel = resolve; });
			let resolveSend!: () => void;
			const sendStarted = new Promise<void>(resolve => { resolveSend = resolve; });
			agent.changeModel = async (session, model, chat) => {
				agent.changeModelCalls.push({ session, model, chat });
				await changeModelSettled;
			};
			agent.sendMessage = async (session, chat, prompt, attachments) => {
				agent.sendMessageCalls.push({ session, prompt, attachments, chat });
				resolveSend();
			};

			sideEffects.handleAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'hello', origin: { kind: MessageKind.User }, model: { id: 'gpt-5' } },
			});
			await Promise.resolve();

			assert.deepStrictEqual({
				changeModelCalls: agent.changeModelCalls,
				sendMessageCalls: agent.sendMessageCalls,
			}, {
				changeModelCalls: [{ session: URI.parse(sessionUri.toString()), model: { id: 'gpt-5' }, chat: URI.parse(defaultChatUri) }],
				sendMessageCalls: [],
			});

			resolveChangeModel();
			await sendStarted;

			assert.deepStrictEqual(agent.sendMessageCalls, [{ session: URI.parse(sessionUri.toString()), prompt: 'hello', attachments: undefined, chat: URI.parse(defaultChatUri) }]);
		});

		test('forwards the chat channel for an additional (peer) chat', async () => {
			setupSession();
			const chatChannel = buildChatUri(sessionUri.toString(), 'peer-1');
			sideEffects.handleAction(chatChannel, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'hello', origin: { kind: MessageKind.User }, model: { id: 'gpt-5' } },
			});

			await new Promise(r => setTimeout(r, 10));

			assert.deepStrictEqual(agent.changeModelCalls, [{ session: URI.parse(sessionUri.toString()), model: { id: 'gpt-5' }, chat: URI.parse(chatChannel) }]);
		});
	});

	// ---- handleAction: chat/turnStarted agent selection --------------------

	suite('handleAction — chat/turnStarted agent selection', () => {

		test('calls changeAgent on the agent for the session default chat before sending the message', async () => {
			setupSession();
			sideEffects.handleAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'hello', origin: { kind: MessageKind.User }, agent: { uri: 'file:///agents/reviewer.md' } },
			});

			await new Promise(r => setTimeout(r, 10));

			assert.deepStrictEqual(agent.changeAgentCalls, [{ session: URI.parse(sessionUri.toString()), agent: { uri: 'file:///agents/reviewer.md' }, chat: URI.parse(defaultChatUri) }]);
		});

		test('forwards the chat channel for an additional (peer) chat', async () => {
			setupSession();
			const chatChannel = buildChatUri(sessionUri.toString(), 'peer-1');
			sideEffects.handleAction(chatChannel, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'hello', origin: { kind: MessageKind.User }, agent: { uri: 'file:///agents/reviewer.md' } },
			});

			await new Promise(r => setTimeout(r, 10));

			assert.deepStrictEqual(agent.changeAgentCalls, [{ session: URI.parse(sessionUri.toString()), agent: { uri: 'file:///agents/reviewer.md' }, chat: URI.parse(chatChannel) }]);
		});
	});

	// ---- registerProgressListener ---------------------------------------

	suite('registerProgressListener', () => {

		test('maps agent progress events to state actions', () => {
			setupSession();
			startTurn('turn-1');

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatResponsePart, turnId: 'turn-1', part: { kind: ResponsePartKind.Markdown, id: 'msg-1', content: 'hi' } },
			});

			// First delta creates a response part (not a delta action)
			assert.ok(envelopes.some(e => e.action.type === ActionType.ChatResponsePart));
		});

		test('does not route stale actions into a force-started turn', () => {
			setupSession();
			startTurn('turn-1');
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatTurnCancelled,
				turnId: 'turn-1',
				duration: 1000,
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-2',
				startedAt: '2025-01-01T00:01:00.000Z',
				message: { text: 'continue', origin: { kind: MessageKind.User } },
			});
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatResponsePart, turnId: 'turn-1', part: { kind: ResponsePartKind.Markdown, id: 'stale-part', content: 'stale response' } },
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatUsage, turnId: 'turn-1', usage: { inputTokens: 100, outputTokens: 50, model: 'stale-model' } },
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 199029 },
			});

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatResponsePart, turnId: 'turn-2', part: { kind: ResponsePartKind.Markdown, id: 'fresh-part', content: 'fresh' } },
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatDelta, turnId: 'turn-2', partId: 'fresh-part', content: ' response' },
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatUsage, turnId: 'turn-2', usage: { inputTokens: 20, outputTokens: 10, model: 'fresh-model' } },
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatTurnComplete, turnId: 'turn-2', duration: 2000 },
			});

			const state = stateManager.getSessionState(defaultChatUri);
			assert.deepStrictEqual(state?.turns.map(turn => ({
				id: turn.id,
				state: turn.state,
				duration: turn.duration,
				message: turn.message.text,
				markdown: turn.responseParts
					.filter(part => part.kind === ResponsePartKind.Markdown)
					.map(part => part.content)
					.join(''),
				usage: turn.usage,
			})), [{
				id: 'turn-1',
				state: TurnState.Cancelled,
				duration: 1000,
				message: 'hello',
				markdown: '',
				usage: undefined,
			}, {
				id: 'turn-2',
				state: TurnState.Complete,
				duration: 2000,
				message: 'continue',
				markdown: 'fresh response',
				usage: { inputTokens: 20, outputTokens: 10, model: 'fresh-model' },
			}]);
		});

		test('preserves the turn id of a provider-initiated turn when idle', () => {
			setupSession();
			startTurn('turn-1');
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-1',
				duration: 1000,
			});
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatTurnStarted,
					turnId: 'provider-turn',
					startedAt: '2025-01-01T00:01:00.000Z',
					message: { text: 'provider notification', origin: { kind: MessageKind.SystemNotification } },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatResponsePart, turnId: 'provider-turn', part: { kind: ResponsePartKind.Markdown, id: 'provider-part', content: 'provider response' } },
			});

			const state = stateManager.getSessionState(defaultChatUri);
			assert.deepStrictEqual({
				turnId: state?.activeTurn?.id,
				message: state?.activeTurn?.message.text,
				responseParts: state?.activeTurn?.responseParts,
			}, {
				turnId: 'provider-turn',
				message: 'provider notification',
				responseParts: [{ kind: ResponsePartKind.Markdown, id: 'provider-part', content: 'provider response' }],
			});
		});

		test('does not replace an active turn with a stale turn start', () => {
			setupSession();
			startTurn('turn-2');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatTurnStarted,
					turnId: 'turn-1',
					startedAt: '2025-01-01T00:00:00.000Z',
					message: { text: 'stale request', origin: { kind: MessageKind.User } },
				},
			});

			assert.deepStrictEqual({
				turnId: stateManager.getSessionState(defaultChatUri)?.activeTurn?.id,
				message: stateManager.getSessionState(defaultChatUri)?.activeTurn?.message.text,
			}, {
				turnId: 'turn-2',
				message: 'hello',
			});
		});

		test('stale completion does not clear active turn tool tracking', () => {
			setupSession();
			startTurn('turn-1');
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatTurnCancelled,
				turnId: 'turn-1',
				duration: 1000,
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-2',
				startedAt: '2025-01-01T00:01:00.000Z',
				message: { text: 'continue', origin: { kind: MessageKind.User } },
			});
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-2',
					toolCallId: 'active-tool', toolName: 'read', displayName: 'Read', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 199029 },
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallComplete, turnId: 'turn-2',
					toolCallId: 'active-tool',
					result: { success: true, pastTenseMessage: 'Read file' },
				},
			});

			assert.deepStrictEqual(
				telemetryService.events.filter(event => event.eventName === 'languageModelToolInvoked').map(event => event.eventName),
				['languageModelToolInvoked'],
			);
		});

		test('returns a disposable that stops listening', () => {
			setupSession();
			startTurn('turn-1');

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
			const listener = sideEffects.registerProgressListener(agent);

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatResponsePart, turnId: 'turn-1', part: { kind: ResponsePartKind.Markdown, id: 'msg-1', content: 'before' } },
			});
			assert.strictEqual(envelopes.filter(e => e.action.type === ActionType.ChatResponsePart).length, 1);

			listener.dispose();
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatResponsePart, turnId: 'turn-1', part: { kind: ResponsePartKind.Markdown, id: 'msg-2', content: 'after' } },
			});
			assert.strictEqual(envelopes.filter(e => e.action.type === ActionType.ChatResponsePart).length, 1);
		});

		test('customizations change publishes once, then dedupes identical re-fetches', async () => {
			setupSession();

			// Return a freshly-built array of freshly-built objects on every
			// fetch (matching real providers, which re-scan disk each time) so
			// the dedup is proven to rely on structural equality, not reference
			// identity.
			const makeCustomizations = (): Customization[] => [
				{ type: CustomizationType.Plugin, id: customizationId('file:///plugin-a'), uri: 'file:///plugin-a', name: 'Plugin A', enabled: true, load: { kind: CustomizationLoadStatus.Loaded } },
			];
			let fetchCalls = 0;
			agent.getSessionCustomizations = async () => { fetchCalls++; return makeCustomizations(); };

			const changed: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => {
				if (e.action.type === ActionType.SessionCustomizationsChanged) {
					changed.push(e);
				}
			}));
			disposables.add(sideEffects.registerProgressListener(agent));

			// First change: fetch + publish.
			agent.fireCustomizationsChange();
			await waitForState(stateManager, () => changed.length >= 1 || undefined);
			assert.strictEqual(changed.length, 1);

			// Subsequent changes that resolve to structurally-equal customizations
			// (e.g. the O(N^2) fan-out from a shared `~/.claude` edit) must not
			// re-publish, even though each fetch returns a brand-new array.
			agent.fireCustomizationsChange();
			agent.fireCustomizationsChange();
			const deadline = Date.now() + 5000;
			while (fetchCalls < 3 && Date.now() < deadline) {
				await timeout(5);
			}
			assert.strictEqual(changed.length, 1, 'identical customizations must not re-publish');
			assert.ok(fetchCalls >= 3, 'each change still re-fetches to compare');
		});

		test('re-publishes after session eviction + restore even when customizations are unchanged', async () => {
			setupSession();

			const makeCustomizations = (): Customization[] => [
				{ type: CustomizationType.Plugin, id: customizationId('file:///plugin-a'), uri: 'file:///plugin-a', name: 'Plugin A', enabled: true, load: { kind: CustomizationLoadStatus.Loaded } },
			];
			agent.getSessionCustomizations = async () => makeCustomizations();

			const changed: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => {
				if (e.action.type === ActionType.SessionCustomizationsChanged) {
					changed.push(e);
				}
			}));
			disposables.add(sideEffects.registerProgressListener(agent));

			// Initial publish populates the session state's customizations.
			agent.fireCustomizationsChange();
			await waitForState(stateManager, () => changed.length >= 1 || undefined);
			assert.strictEqual(changed.length, 1);

			// Idle-evict then restore the same session URI: the restored state
			// starts without customizations. Because dedup compares against the
			// authoritative session state (not a stale side cache), the next
			// refresh must publish again even though the resolved set is
			// structurally identical to the prior incarnation's.
			stateManager.removeSession(sessionUri.toString());
			setupSession();

			agent.fireCustomizationsChange();
			await waitForState(stateManager, () => changed.length >= 2 || undefined);
			assert.strictEqual(changed.length, 2, 'restored session must receive its customizations');
		});
	});

	// ---- agents observable --------------------------------------------------

	suite('agents observable', () => {

		test('dispatches root/agentsChanged without fetching models when observable changes', async () => {
			agentList.set([], undefined);
			const envelope = Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, e => {
				if (e.action.type !== ActionType.RootAgentsChanged) {
					return false;
				}
				return e.action.agents.length === 1;
			}));
			agentList.set([agent], undefined);
			const { action } = await envelope;
			assert.strictEqual(action.type, ActionType.RootAgentsChanged);

			assert.deepStrictEqual(action.agents[0].models, []);
		});

		test('model observable update publishes models', async () => {
			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			const envelope = Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, e => {
				if (e.action.type !== ActionType.RootAgentsChanged) {
					return false;
				}
				return e.action.agents[0]?.models.length === 1;
			}));
			agent.setModels([{ provider: 'mock', id: 'mock-model', name: 'mock Model', maxContextWindow: 128000, maxOutputTokens: 16000, maxPromptTokens: 112000, supportsVision: false }]);
			await envelope;

			const actions = envelopes.map(e => e.action).filter(action => action.type === ActionType.RootAgentsChanged);
			const action = actions[actions.length - 1];
			assert.ok(action, 'should dispatch root/agentsChanged');
			assert.deepStrictEqual(action.agents[0].models, [{
				id: 'mock-model',
				provider: 'mock',
				name: 'mock Model',
				maxContextWindow: 128000,
				maxOutputTokens: 16000,
				maxPromptTokens: 112000,
				supportsVision: false,
				policyState: undefined,
				configSchema: undefined,
				_meta: undefined,
			}]);
		});

		test('model observable update publishes model metadata', async () => {
			const envelope = Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, e => {
				if (e.action.type !== ActionType.RootAgentsChanged) {
					return false;
				}
				return e.action.agents[0]?.models.length === 1;
			}));
			agent.setModels([{ provider: 'mock', id: 'mock-model', name: 'mock Model', maxContextWindow: 128000, supportsVision: false, _meta: { multiplierNumeric: 2 } }]);

			const { action } = await envelope;

			assert.strictEqual(action.type, ActionType.RootAgentsChanged);
			assert.deepStrictEqual(action.agents[0].models[0]._meta, { multiplierNumeric: 2 });
		});

		test('unchanged model observable update does not dispatch unchanged agent infos', async () => {
			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));
			const models = [{ provider: 'mock' as const, id: 'mock-model', name: 'mock Model', maxContextWindow: 128000, supportsVision: false }];

			const envelope = Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, e => {
				if (e.action.type !== ActionType.RootAgentsChanged) {
					return false;
				}
				return e.action.agents[0]?.models.length === 1;
			}));
			agent.setModels(models);
			await envelope;
			envelopes.length = 0;
			agent.setModels([...models]);
			await Promise.resolve();
			await Promise.resolve();

			assert.strictEqual(envelopes.filter(e => e.action.type === ActionType.RootAgentsChanged).length, 0);
		});
	});

	// ---- Pending message sync -----------------------------------------------

	suite('pending message sync', () => {

		test('syncs steering message to agent on ChatPendingMessageSet', () => {
			setupSession();

			const action = {
				type: ActionType.ChatPendingMessageSet as const,
				kind: PendingMessageKind.Steering,
				id: 'steer-1',
				message: { text: 'focus on tests', origin: { kind: MessageKind.User } },
			};
			stateManager.dispatchClientAction(defaultChatUri, action, { clientId: 'test', clientSeq: 1 });
			sideEffects.handleAction(defaultChatUri, action);

			assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
			assert.deepStrictEqual(agent.setPendingMessagesCalls[0].steeringMessage, { id: 'steer-1', message: { text: 'focus on tests', origin: { kind: MessageKind.User } } });
			assert.deepStrictEqual(agent.setPendingMessagesCalls[0].queuedMessages, []);
			// Default chat: no `chat` arg, so the agent routes to the session's default chat.
			assert.strictEqual(agent.setPendingMessagesCalls[0].chat, undefined);
		});

		test('syncs a peer chat steering message with the peer chat URI as the `chat` arg', () => {
			setupSession();
			const peerChatUri = URI.parse(buildChatUri(sessionUri.toString(), 'peer-steer'));
			stateManager.addChat(sessionUri.toString(), peerChatUri.toString());

			const action = {
				type: ActionType.ChatPendingMessageSet as const,
				kind: PendingMessageKind.Steering,
				id: 'steer-peer',
				message: { text: 'steer the peer', origin: { kind: MessageKind.User } },
			};
			stateManager.dispatchClientAction(peerChatUri.toString(), action, { clientId: 'test', clientSeq: 1 });
			sideEffects.handleAction(peerChatUri.toString(), action);

			assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
			assert.deepStrictEqual({
				session: agent.setPendingMessagesCalls[0].session.toString(),
				chat: agent.setPendingMessagesCalls[0].chat?.toString(),
				steeringId: agent.setPendingMessagesCalls[0].steeringMessage?.id,
			}, {
				session: sessionUri.toString(),
				chat: peerChatUri.toString(),
				steeringId: 'steer-peer',
			});
		});

		test('syncs queued message to agent on ChatPendingMessageSet', async () => {
			setupSession();

			const action = {
				type: ActionType.ChatPendingMessageSet as const,
				kind: PendingMessageKind.Queued,
				id: 'q-1',
				message: { text: 'queued message', origin: { kind: MessageKind.User } },
			};
			stateManager.dispatchClientAction(defaultChatUri, action, { clientId: 'test', clientSeq: 1 });
			sideEffects.handleAction(defaultChatUri, action);

			// Queued messages are not forwarded to the agent; the server controls consumption
			assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
			assert.strictEqual(agent.setPendingMessagesCalls[0].steeringMessage, undefined);
			assert.deepStrictEqual(agent.setPendingMessagesCalls[0].queuedMessages, []);

			// Session was idle, so the queued message is consumed immediately
			await waitForSendMessageCalls(1);
			assert.strictEqual(agent.sendMessageCalls.length, 1);
			assert.strictEqual(agent.sendMessageCalls[0].prompt, 'queued message');
		});

		test('parses queued protocol attachment URI strings before passing them to the agent', async () => {
			setupSession();
			const fileUri = URI.file('/workspace/queued.ts');
			const action: ChatAction = {
				type: ActionType.ChatPendingMessageSet as const,
				kind: PendingMessageKind.Queued,
				id: 'q-uri',
				message: { text: 'queued message', origin: { kind: MessageKind.User }, attachments: [{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: 'queued.ts', displayKind: 'document' }] },
			};

			stateManager.dispatchClientAction(defaultChatUri, action, { clientId: 'test', clientSeq: 1 });
			sideEffects.handleAction(defaultChatUri, action);
			await waitForSendMessageCalls(1);

			assert.deepStrictEqual(agent.sendMessageCalls, [{
				session: URI.parse(sessionUri.toString()),
				chat: URI.parse(defaultChatUri),
				prompt: 'queued message',
				attachments: [{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: 'queued.ts', displayKind: 'document' }],
			}]);
		});

		test('logs telemetry when sending a queued user message', () => {
			setupSession();

			const action = {
				type: ActionType.ChatPendingMessageSet as const,
				kind: PendingMessageKind.Queued,
				id: 'q-telemetry',
				message: { text: 'queued message', origin: { kind: MessageKind.User } },
			};
			stateManager.dispatchClientAction(defaultChatUri, action, { clientId: 'test', clientSeq: 1 });
			sideEffects.handleAction(defaultChatUri, action);

			assert.deepStrictEqual(telemetryService.events, [{
				eventName: 'agentHost.userMessageSent',
				data: {
					provider: 'mock',
					agentSessionId: 'session-1',
					source: 'queued',
					isSubagentSession: false,
					turnCount: 0,
					attachmentCount: 0,
				},
			}]);
		});

		test('syncs on ChatPendingMessageRemoved', () => {
			setupSession();

			// Add a queued message
			const setAction = {
				type: ActionType.ChatPendingMessageSet as const,
				kind: PendingMessageKind.Queued,
				id: 'q-rm',
				message: { text: 'will be removed', origin: { kind: MessageKind.User } },
			};
			stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: 'test', clientSeq: 1 });
			sideEffects.handleAction(defaultChatUri, setAction);

			agent.setPendingMessagesCalls.length = 0;

			// Remove
			const removeAction = {
				type: ActionType.ChatPendingMessageRemoved as const,
				kind: PendingMessageKind.Queued,
				id: 'q-rm',
			};
			stateManager.dispatchClientAction(defaultChatUri, removeAction, { clientId: 'test', clientSeq: 2 });
			sideEffects.handleAction(defaultChatUri, removeAction);

			assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
			assert.deepStrictEqual(agent.setPendingMessagesCalls[0].queuedMessages, []);
		});

		test('syncs on ChatQueuedMessagesReordered', () => {
			setupSession();

			// Add two queued messages
			const setA = { type: ActionType.ChatPendingMessageSet as const, kind: PendingMessageKind.Queued, id: 'q-a', message: { text: 'A', origin: { kind: MessageKind.User } } };
			stateManager.dispatchClientAction(defaultChatUri, setA, { clientId: 'test', clientSeq: 1 });
			sideEffects.handleAction(defaultChatUri, setA);

			const setB = { type: ActionType.ChatPendingMessageSet as const, kind: PendingMessageKind.Queued, id: 'q-b', message: { text: 'B', origin: { kind: MessageKind.User } } };
			stateManager.dispatchClientAction(defaultChatUri, setB, { clientId: 'test', clientSeq: 2 });
			sideEffects.handleAction(defaultChatUri, setB);

			agent.setPendingMessagesCalls.length = 0;

			// Reorder
			const reorderAction = { type: ActionType.ChatQueuedMessagesReordered as const, order: ['q-b', 'q-a'] };
			stateManager.dispatchClientAction(defaultChatUri, reorderAction, { clientId: 'test', clientSeq: 3 });
			sideEffects.handleAction(defaultChatUri, reorderAction);

			assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
			assert.deepStrictEqual(agent.setPendingMessagesCalls[0].queuedMessages, []);
		});
	});

	// ---- Queued message consumption -----------------------------------------

	suite('queued message consumption', () => {

		test('auto-starts turn from queued message on idle', async () => {
			setupSession();
			disposables.add(sideEffects.registerProgressListener(agent));

			// Queue a message while a turn is active
			startTurn('turn-1');
			const setAction = {
				type: ActionType.ChatPendingMessageSet as const,
				kind: PendingMessageKind.Queued,
				id: 'q-auto',
				message: { text: 'auto queued', origin: { kind: MessageKind.User } },
			};
			stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: 'test', clientSeq: 1 });
			sideEffects.handleAction(defaultChatUri, setAction);

			// Message should NOT be consumed yet (turn is active)
			assert.strictEqual(agent.sendMessageCalls.length, 0);

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			// Fire idle → turn completes → queued message should be consumed
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 },
			});

			const turnComplete = envelopes.find(e => e.action.type === ActionType.ChatTurnComplete);
			assert.ok(turnComplete, 'should dispatch session/turnComplete');

			const turnStarted = envelopes.find(e => e.action.type === ActionType.ChatTurnStarted);
			assert.ok(turnStarted, 'should dispatch session/turnStarted for queued message');
			assert.strictEqual((turnStarted!.action as { queuedMessageId?: string }).queuedMessageId, 'q-auto');

			await waitForSendMessageCalls(1);
			assert.strictEqual(agent.sendMessageCalls.length, 1);
			assert.strictEqual(agent.sendMessageCalls[0].prompt, 'auto queued');

			// Queued message should be removed from state
			const state = stateManager.getSessionState(sessionUri.toString());
			assert.strictEqual(state?.queuedMessages, undefined);
		});

		test('does not drain queued messages when the cancelled turn completes late', () => {
			// Cancelling a turn means "stop": messages queued behind it must stay
			// queued for the user to dequeue/run manually, not auto-start. (A
			// message the user sends *after* the abort is consumed separately via
			// the ChatPendingMessageSet path once cancellation clears the turn.)
			setupSession();
			disposables.add(sideEffects.registerProgressListener(agent));

			// Queue a message while a turn is active.
			startTurn('turn-1');
			const setAction = {
				type: ActionType.ChatPendingMessageSet as const,
				kind: PendingMessageKind.Queued,
				id: 'q-after-abort',
				message: { text: 'queued behind abort', origin: { kind: MessageKind.User } },
			};
			stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: 'test', clientSeq: 1 });
			sideEffects.handleAction(defaultChatUri, setAction);

			// Not consumed yet — the turn is still active.
			assert.strictEqual(agent.sendMessageCalls.length, 0);

			// Cancel the active turn (client abort).
			const cancelAction = { type: ActionType.ChatTurnCancelled as const, turnId: 'turn-1', duration: 1000 };
			stateManager.dispatchClientAction(defaultChatUri, cancelAction, { clientId: 'test', clientSeq: 2 });
			sideEffects.handleAction(defaultChatUri, cancelAction);

			const truncateAction = { type: ActionType.ChatTruncated as const };
			stateManager.dispatchClientAction(defaultChatUri, truncateAction, { clientId: 'test', clientSeq: 3 });
			sideEffects.handleAction(defaultChatUri, truncateAction);

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 2000 },
			});

			// The queued message must NOT auto-start, and must remain queued.
			assert.strictEqual(agent.sendMessageCalls.length, 0, 'cancelling must not drain queued messages');
			const state = stateManager.getSessionState(sessionUri.toString());
			assert.strictEqual(state?.turns.length, 0, 'the cancelled turn should no longer be retained in history');
			assert.strictEqual(state?.queuedMessages?.length, 1, 'queued message should remain for manual dequeue');
			assert.strictEqual(state?.queuedMessages?.[0].id, 'q-after-abort');
		});

		test('intercepts queued /rename and drains the message queued behind it', async () => {
			setupSession();
			// `/rename` persists the new title, so use a side effects instance
			// whose `openDatabase` returns a real database (the suite default
			// throws).
			const renameSideEffects = createTestSideEffects(disposables, stateManager, {
				getAgent: () => agent,
				agents: agentList,
				sessionDataService: createSessionDataService(),
				onTurnComplete: () => { },
			});
			disposables.add(renameSideEffects.registerProgressListener(agent));

			// Queue a `/rename` followed by a normal message while a turn is active
			startTurn('turn-1');
			for (const msg of [
				{ id: 'q-rename', text: '/rename Queued Title' },
				{ id: 'q-after', text: 'after rename' },
			]) {
				const setAction = {
					type: ActionType.ChatPendingMessageSet as const,
					kind: PendingMessageKind.Queued,
					id: msg.id,
					message: { text: msg.text, origin: { kind: MessageKind.User } },
				};
				stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: 'test', clientSeq: 1 });
				renameSideEffects.handleAction(defaultChatUri, setAction);
			}

			// Fire idle → turn completes → `/rename` is consumed and intercepted,
			// then the message queued behind it must be drained to the agent.
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 },
			});

			// The `/rename` must not reach the agent; only the message behind it does
			await waitForSendMessageCalls(1);
			assert.strictEqual(agent.sendMessageCalls.length, 1);
			assert.strictEqual(agent.sendMessageCalls[0].prompt, 'after rename');

			// Both queued messages should be drained from state
			const state = stateManager.getSessionState(sessionUri.toString());
			assert.strictEqual(state?.queuedMessages, undefined);
			assert.strictEqual(state?.title, 'Queued Title');
		});

		test('replaces a queued bang command title with the following real message', async () => {
			stateManager.createSession({
				resource: sessionUri.toString(),
				provider: 'mock',
				title: '',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
			});
			stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionReady });
			const db = new TestSessionDatabase();
			const terminalManager = disposables.add(new TestAgentHostTerminalManager());
			const queuedSideEffects = createTestSideEffects(disposables, stateManager, {
				getAgent: () => agent,
				agents: agentList,
				sessionDataService: createSessionDataService(db),
				onTurnComplete: () => { },
			}, undefined, undefined, undefined, terminalManager);
			disposables.add(queuedSideEffects.registerProgressListener(agent));

			startTurn('turn-1');
			for (const [id, text] of [['q-command', '!echo hi'], ['q-request', 'Explain the build']] as const) {
				const setAction = {
					type: ActionType.ChatPendingMessageSet as const,
					kind: PendingMessageKind.Queued,
					id,
					message: { text, origin: { kind: MessageKind.User } },
				};
				stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: 'test', clientSeq: 1 });
				queuedSideEffects.handleAction(defaultChatUri, setAction);
			}

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 },
			});
			await terminalManager.commandFinishedListenerRegistered.p;
			terminalManager.fireCommandFinished({ commandId: '1', command: 'echo hi', exitCode: 0, output: 'hi\n' });
			await waitForSendMessageCalls(1);

			assert.deepStrictEqual({
				prompt: agent.sendMessageCalls[0].prompt,
				title: stateManager.getSessionState(sessionUri.toString())?.title,
				persistedTitle: await db.getMetadata('customTitle'),
			}, {
				prompt: 'Explain the build',
				title: 'Explain the build',
				persistedTitle: 'Explain the build',
			});
		});

		test('drains a peer chat queued message to the owning session with the chat arg', async () => {
			setupSession();
			const chatUri = URI.parse(buildChatUri(sessionUri, 'peer-q'));
			stateManager.addChat(sessionUri.toString(), chatUri.toString());
			disposables.add(sideEffects.registerProgressListener(agent));

			// Start a turn on the peer chat, then queue a message behind it.
			stateManager.dispatchClientAction(chatUri.toString(),
				{ type: ActionType.ChatTurnStarted, turnId: 'pturn-1', startedAt: '2025-01-01T00:00:00.000Z', message: { text: 'hi', origin: { kind: MessageKind.User } } },
				{ clientId: 'test', clientSeq: 1 });
			const setAction = {
				type: ActionType.ChatPendingMessageSet as const,
				kind: PendingMessageKind.Queued,
				id: 'pq-1',
				message: { text: 'peer queued', origin: { kind: MessageKind.User } },
			};
			stateManager.dispatchClientAction(chatUri.toString(), setAction, { clientId: 'test', clientSeq: 2 });
			sideEffects.handleAction(chatUri.toString(), setAction);

			assert.strictEqual(agent.sendMessageCalls.length, 0);

			// Idle on the peer chat → the queued message drains to the parent
			// session URI with the chat channel passed as the `chat` argument
			// so the harness routes it to the right peer SDK chat.
			agent.fireProgress({
				kind: 'action', resource: chatUri,
				action: { type: ActionType.ChatTurnComplete, turnId: 'pturn-1', duration: 1000 },
			});

			await waitForSendMessageCalls(1);
			assert.deepStrictEqual(agent.sendMessageCalls, [{
				session: URI.parse(sessionUri.toString()),
				prompt: 'peer queued',
				attachments: undefined,
				chat: URI.parse(chatUri.toString()),
			}]);
		});

		test('does not consume queued message while a turn is active', () => {
			setupSession();
			startTurn('turn-1');

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			const setAction = {
				type: ActionType.ChatPendingMessageSet as const,
				kind: PendingMessageKind.Queued,
				id: 'q-wait',
				message: { text: 'should wait', origin: { kind: MessageKind.User } },
			};
			stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: 'test', clientSeq: 1 });
			sideEffects.handleAction(defaultChatUri, setAction);

			// No turn started for the queued message
			const turnStarted = envelopes.find(e => e.action.type === ActionType.ChatTurnStarted);
			assert.strictEqual(turnStarted, undefined, 'should not start a turn while one is active');
			assert.strictEqual(agent.sendMessageCalls.length, 0);

			// Queued message still in state
			const state = stateManager.getSessionState(sessionUri.toString());
			assert.strictEqual(state?.queuedMessages?.length, 1);
			assert.strictEqual(state?.queuedMessages?.[0].id, 'q-wait');
		});

		test('dispatches ChatPendingMessageRemoved for steering messages on steering_consumed', () => {
			setupSession();
			disposables.add(sideEffects.registerProgressListener(agent));

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			const action = {
				type: ActionType.ChatPendingMessageSet as const,
				kind: PendingMessageKind.Steering,
				id: 'steer-rm',
				message: { text: 'steer me', origin: { kind: MessageKind.User } },
			};
			stateManager.dispatchClientAction(defaultChatUri, action, { clientId: 'test', clientSeq: 1 });
			sideEffects.handleAction(defaultChatUri, action);

			// Removal is not dispatched synchronously; it waits for the agent
			let removal = envelopes.find(e =>
				e.action.type === ActionType.ChatPendingMessageRemoved &&
				(e.action as { kind: PendingMessageKind }).kind === PendingMessageKind.Steering
			);
			assert.strictEqual(removal, undefined, 'should not dispatch removal until steering_consumed');

			// Simulate the agent consuming the steering message
			agent.fireProgress({
				kind: 'steering_consumed',
				chat: URI.parse(defaultChatUri),
				id: 'steer-rm',
			});

			removal = envelopes.find(e =>
				e.action.type === ActionType.ChatPendingMessageRemoved &&
				(e.action as { kind: PendingMessageKind }).kind === PendingMessageKind.Steering
			);
			assert.ok(removal, 'should dispatch ChatPendingMessageRemoved for steering');
			assert.strictEqual((removal!.action as { id: string }).id, 'steer-rm');

			// Steering message should be removed from state
			const state = stateManager.getSessionState(sessionUri.toString());
			assert.strictEqual(state?.steeringMessage, undefined);
		});
	});

	// ---- handleAction: session/activeClientSet ----------------------

	suite('handleAction — session/activeClientSet', () => {

		setup(() => {
			disposables.add(sideEffects.registerProgressListener(agent));
		});

		test('calls setClientCustomizations and dispatches customizationsChanged once', async () => {
			setupSession();
			const pluginA: Customization = { type: CustomizationType.Plugin, id: customizationId('file:///plugin-a'), uri: 'file:///plugin-a', name: 'Plugin A', enabled: true, load: { kind: CustomizationLoadStatus.Loaded } };
			const pluginB: Customization = { type: CustomizationType.Plugin, id: customizationId('file:///plugin-b'), uri: 'file:///plugin-b', name: 'Plugin B', enabled: true, load: { kind: CustomizationLoadStatus.Loaded } };
			const pluginAClient: ClientPluginCustomization = { type: CustomizationType.Plugin, id: pluginA.id, uri: pluginA.uri, name: pluginA.name, enabled: true };
			const pluginBClient: ClientPluginCustomization = { type: CustomizationType.Plugin, id: pluginB.id, uri: pluginB.uri, name: pluginB.name, enabled: true };
			agent.getSessionCustomizations = async () => [pluginA, pluginB];

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			const action: SessionAction = {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'test-client',
					tools: [],
					customizations: [pluginAClient, pluginBClient]
				},
			};
			sideEffects.handleAction(sessionUri.toString(), action);

			// Wait for async setClientCustomizations
			await new Promise(r => setTimeout(r, 50));

			assert.deepStrictEqual(agent.setClientCustomizationsCalls, [{
				clientId: 'test-client',
				customizations: [pluginAClient, pluginBClient],
			}]);

			const customizationActions = envelopes
				.filter(e => e.action.type === ActionType.SessionCustomizationsChanged);
			assert.strictEqual(customizationActions.length, 1, 'should dispatch one full customizationsChanged replacement');
			assert.strictEqual(
				envelopes.filter(e => e.action.type === ActionType.SessionCustomizationUpdated).length,
				0,
				'should not dispatch customizationUpdated when progress matches the final state',
			);
		});

		test('dispatches customizationUpdated for sync progress after initial replacement', async () => {
			setupSession();
			const pluginAClient: ClientPluginCustomization = { type: CustomizationType.Plugin, id: customizationId('file:///plugin-a'), uri: 'file:///plugin-a', name: 'Plugin A', enabled: true };
			let currentCustomizations: readonly Customization[] = [];
			agent.getSessionCustomizations = async () => currentCustomizations;
			agent.syncClientCustomizations = (session, clientId, customizations) => {
				agent.setClientCustomizationsCalls.push({ clientId, customizations });
				const loading: PluginCustomization = { ...pluginAClient, load: { kind: CustomizationLoadStatus.Loading } };
				currentCustomizations = [loading];
				agent.fireProgress({
					kind: 'action',
					resource: session,
					action: {
						type: ActionType.SessionCustomizationsChanged,
						customizations: [...currentCustomizations],
					},
				});
				void (async () => {
					await new Promise(resolve => setTimeout(resolve, 0));
					const loaded: PluginCustomization = { ...pluginAClient, load: { kind: CustomizationLoadStatus.Loaded } };
					currentCustomizations = [loaded];
					agent.fireProgress({
						kind: 'action',
						resource: session,
						action: {
							type: ActionType.SessionCustomizationUpdated,
							customization: loaded,
						},
					});
				})();
				return currentCustomizations.map(customization => ({ customization: customization as PluginCustomization }));
			};

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			sideEffects.handleAction(sessionUri.toString(), {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'test-client',
					tools: [],
					customizations: [pluginAClient],
				},
			});
			await new Promise(resolve => setTimeout(resolve, 50));

			const customizationsChanged = envelopes.filter(e => e.action.type === ActionType.SessionCustomizationsChanged);
			assert.strictEqual(customizationsChanged.length, 1);
			const firstCustomizationsChanged = customizationsChanged[0].action;
			assert.strictEqual(firstCustomizationsChanged.type, ActionType.SessionCustomizationsChanged);
			assert.deepStrictEqual(firstCustomizationsChanged.customizations, [{
				...pluginAClient,
				load: { kind: CustomizationLoadStatus.Loading },
			}]);

			const customizationUpdated = envelopes.filter(e => e.action.type === ActionType.SessionCustomizationUpdated);
			assert.deepStrictEqual(customizationUpdated.map(e => e.action), [{
				type: ActionType.SessionCustomizationUpdated,
				customization: { ...pluginAClient, load: { kind: CustomizationLoadStatus.Loaded } },
			}]);
		});

		test('clears client customizations when activeClient has no customizations', () => {
			setupSession();

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			const action: SessionAction = {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'test-client',
					tools: []
				},
			};
			sideEffects.handleAction(sessionUri.toString(), action);

			assert.deepStrictEqual(agent.setClientCustomizationsCalls, [{
				clientId: 'test-client',
				customizations: [],
			}]);
			const customizationActions = envelopes
				.filter(e => e.action.type === ActionType.SessionCustomizationsChanged);
			assert.strictEqual(customizationActions.length, 1);
			assert.deepStrictEqual(customizationActions[0].action, {
				type: ActionType.SessionCustomizationsChanged,
				customizations: [],
			});
		});

		test('removes the active client when it is removed', () => {
			setupSession();

			const action: SessionAction = {
				type: ActionType.SessionActiveClientRemoved,
				clientId: 'test-client',
			};
			sideEffects.handleAction(sessionUri.toString(), action);

			assert.deepStrictEqual(agent.removeActiveClientCalls, [{
				clientId: 'test-client',
			}]);
		});
	});

	// ---- handleAction: root/configChanged --------------------------------

	suite('handleAction - root/configChanged', () => {

		test('republishes agent and session customizations for existing sessions', async () => {
			setupSession('file:///workspace');
			const customization: Customization = { type: CustomizationType.Plugin, id: customizationId('file:///plugin-a'), uri: 'file:///plugin-a', name: 'Plugin A', enabled: true, load: { kind: CustomizationLoadStatus.Loaded } };
			agent.customizations = [customization];
			agent.getSessionCustomizations = async () => [customization];

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			const action: RootConfigChangedAction = {
				type: ActionType.RootConfigChanged,
				config: { customizations: [customization] },
			};

			stateManager.dispatchServerAction(sessionUri.toString(), action);
			sideEffects.handleAction(sessionUri.toString(), action);
			await new Promise(resolve => setTimeout(resolve, 10));

			const agentInfoAction = envelopes.filter(e => e.action.type === ActionType.RootAgentsChanged).at(-1);
			assert.ok(agentInfoAction && hasKey(agentInfoAction.action, { agents: true }));
			assert.deepStrictEqual(agentInfoAction.action.agents[0]?.customizations, [customization]);

			const sessionCustomizationAction = envelopes.filter(e => e.action.type === ActionType.SessionCustomizationsChanged).at(-1);
			assert.ok(sessionCustomizationAction && hasKey(sessionCustomizationAction.action, { customizations: true }));
			assert.deepStrictEqual(sessionCustomizationAction.action.customizations, [customization]);
		});

		test('updates telemetry level from root config', () => {
			setupSession();
			const action: RootConfigChangedAction = {
				type: ActionType.RootConfigChanged,
				config: { [AgentHostTelemetryLevelConfigKey]: telemetryLevelToAgentHostConfigValue(TelemetryLevel.NONE) },
			};

			sideEffects.handleAction(sessionUri.toString(), action);
			sideEffects.handleAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'hello world', origin: { kind: MessageKind.User } },
			});

			assert.deepStrictEqual(telemetryService.events, []);
		});
	});

	// ---- onDidCustomizationsChange integration --------------------------

	suite('onDidCustomizationsChange', () => {

		test('republishes agent info and session customizations when agent fires onDidCustomizationsChange', async () => {
			disposables.add(sideEffects.registerProgressListener(agent));
			setupSession('file:///workspace');

			const customization: Customization = { type: CustomizationType.Plugin, id: customizationId('file:///plugin-b'), uri: 'file:///plugin-b', name: 'Plugin B', enabled: true, load: { kind: CustomizationLoadStatus.Loaded } };
			agent.customizations = [customization];
			agent.getSessionCustomizations = async () => [customization];

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			agent.fireCustomizationsChange();
			await new Promise(resolve => setTimeout(resolve, 10));

			const agentInfoAction = envelopes.find(e => e.action.type === ActionType.RootAgentsChanged);
			assert.ok(agentInfoAction && hasKey(agentInfoAction.action, { agents: true }));
			assert.deepStrictEqual(agentInfoAction.action.agents[0]?.customizations, [customization]);

			const sessionCustomizationAction = envelopes.find(e => e.action.type === ActionType.SessionCustomizationsChanged);
			assert.ok(sessionCustomizationAction && hasKey(sessionCustomizationAction.action, { customizations: true }));
			assert.deepStrictEqual(sessionCustomizationAction.action.customizations, [customization]);
		});

		test('does not republish when registerProgressListener is disposed', async () => {
			const listener = sideEffects.registerProgressListener(agent);
			setupSession('file:///workspace');

			agent.customizations = [{ type: CustomizationType.Plugin, id: customizationId('file:///plugin-c'), uri: 'file:///plugin-c', name: 'Plugin C', enabled: true }];

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			listener.dispose();
			agent.fireCustomizationsChange();
			await new Promise(resolve => setTimeout(resolve, 10));

			assert.strictEqual(
				envelopes.filter(e => e.action.type === ActionType.SessionCustomizationsChanged).length,
				0,
				'should not republish session customizations after listener disposed',
			);
		});
	});

	// ---- handleAction: session/toolCallConfirmed ------------------------

	suite('handleAction — session/toolCallConfirmed', () => {

		test('routes confirmation to correct agent via _toolCallAgents', () => {
			setupSession();
			startTurn('turn-1', defaultChatUri);
			disposables.add(sideEffects.registerProgressListener(agent));

			// Fire tool_start to register the tool call
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-conf-1', toolName: 'read', displayName: 'Read File', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'tc-conf-1', invocationMessage: 'Reading file', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});

			// Fire tool_ready asking for permission (non-write, so not auto-approved)
			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-conf-1', toolName: '', displayName: '',
					invocationMessage: 'Read file.txt', toolInput: undefined,
					confirmationTitle: 'Read file.txt', edits: undefined,
				},
				permissionKind: undefined, permissionPath: undefined,
			});

			// Now confirm the tool call
			sideEffects.handleAction(defaultChatUri, {
				type: ActionType.ChatToolCallConfirmed,
				turnId: 'turn-1',
				toolCallId: 'tc-conf-1',
				approved: true,
				confirmed: 'user-action' as const,
			} as ChatAction);

			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'tc-conf-1', approved: true },
			]);
		});

		test('handles denial of tool call', () => {
			setupSession();
			startTurn('turn-1', defaultChatUri);
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-deny-1', toolName: 'shell', displayName: 'Shell', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'tc-deny-1', invocationMessage: 'Running command', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});

			sideEffects.handleAction(defaultChatUri, {
				type: ActionType.ChatToolCallConfirmed,
				turnId: 'turn-1',
				toolCallId: 'tc-deny-1',
				approved: false,
				reason: 'denied' as const,
			} as ChatAction);

			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'tc-deny-1', approved: false },
			]);
		});
	});

	// ---- tool_ready progress dispatch -----------------------------------

	suite('tool_ready dispatches progress actions to advance tool call state', () => {

		test('tool_ready for a non-permission tool dispatches ChatToolCallReady and advances state from Streaming to Running', async () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			// tool_start puts the tool call into Streaming state
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-ready-1', toolName: 'runTask', displayName: 'Run Task', contributor: { kind: ToolCallContributorKind.Client, clientId: 'test-client' },
					_meta: { toolKind: undefined, language: undefined },
				},
			});

			const stateAfterStart = stateManager.getSessionState(sessionUri.toString());
			const partAfterStart = stateAfterStart?.activeTurn?.responseParts[0];
			assert.strictEqual(partAfterStart?.kind, ResponsePartKind.ToolCall);
			assert.strictEqual(partAfterStart?.kind === ResponsePartKind.ToolCall ? partAfterStart.toolCall.status : undefined, ToolCallStatus.Streaming);

			// tool_ready without confirmationTitle should dispatch the ready
			// action and advance the tool call to Running
			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-ready-1', toolName: '', displayName: '',
					invocationMessage: 'Run Task', toolInput: '{"task":"build"}',
					confirmationTitle: undefined, edits: undefined,
				},
				permissionKind: undefined, permissionPath: undefined,
			});

			const stateAfterReady = await waitForState(stateManager, () => {
				const s = stateManager.getSessionState(sessionUri.toString());
				const p = s?.activeTurn?.responseParts[0];
				return p?.kind === ResponsePartKind.ToolCall && p.toolCall.status === ToolCallStatus.Running ? s : undefined;
			});
			const partAfterReady = stateAfterReady?.activeTurn?.responseParts[0];
			assert.strictEqual(partAfterReady?.kind, ResponsePartKind.ToolCall);
			assert.strictEqual(partAfterReady?.kind === ResponsePartKind.ToolCall ? partAfterReady.toolCall.status : undefined, ToolCallStatus.Running,
				'tool call should advance from Streaming to Running after tool_ready');
		});

		test('tool_ready for a permission-gated tool dispatches ChatToolCallReady and advances state to PendingConfirmation', async () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-perm-1', toolName: 'write', displayName: 'Write File', contributor: { kind: ToolCallContributorKind.Client, clientId: 'test-client' },
					_meta: { toolKind: undefined, language: undefined },
				},
			});

			// tool_ready with confirmationTitle should dispatch the ready
			// action and advance the tool call to PendingConfirmation
			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-perm-1', toolName: '', displayName: '',
					invocationMessage: 'Write .env', toolInput: '{"path":".env"}',
					confirmationTitle: 'Write .env', edits: undefined,
				},
				permissionKind: undefined, permissionPath: undefined,
			});

			const state = await waitForState(stateManager, () => {
				const s = stateManager.getSessionState(sessionUri.toString());
				const p = s?.activeTurn?.responseParts[0];
				return p?.kind === ResponsePartKind.ToolCall && p.toolCall.status === ToolCallStatus.PendingConfirmation ? s : undefined;
			});
			const part = state?.activeTurn?.responseParts[0];
			assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
			assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : undefined, ToolCallStatus.PendingConfirmation,
				'tool call should advance to PendingConfirmation for permission-gated tool_ready');
		});

		test('tool_ready is dropped when the tool completes while permission lookup is pending', async () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-stale-ready', toolName: 'vscodeAPI', displayName: 'Get VS Code API References',
					contributor: { kind: ToolCallContributorKind.Client, clientId: 'disconnected-client' },
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-stale-ready', toolName: 'vscodeAPI', displayName: 'Get VS Code API References',
					invocationMessage: 'Get VS Code API References', toolInput: '{"query":"test"}',
					confirmationTitle: 'Allow tool call?', edits: undefined,
				},
				permissionKind: 'custom-tool', permissionPath: undefined,
			});

			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tc-stale-ready',
				invocationMessage: 'Get VS Code API References',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallComplete,
				turnId: 'turn-1',
				toolCallId: 'tc-stale-ready',
				result: {
					success: false,
					pastTenseMessage: 'Get VS Code API References failed',
					error: { message: 'Client disconnected' },
				},
			});

			await Promise.resolve();

			const toolCall = stateManager.getSessionState(sessionUri.toString())?.activeTurn?.responseParts
				.find(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === 'tc-stale-ready');
			assert.deepStrictEqual({
				status: toolCall?.kind === ResponsePartKind.ToolCall ? toolCall.toolCall.status : undefined,
				readyActions: envelopes.filter(e => e.action.type === ActionType.ChatToolCallReady).length,
			}, {
				status: ToolCallStatus.Completed,
				readyActions: 1,
			});
		});

		test('tool_ready for an additional chat is emitted on that chat channel', async () => {
			setupSession();
			const chatUri = buildChatUri(sessionUri.toString(), 'peer');
			stateManager.addChat(sessionUri.toString(), chatUri);
			stateManager.setSessionConfig(sessionUri.toString(), { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Permissions]: { allow: [], deny: [] } } });
			startTurn('turn-peer', chatUri);
			disposables.add(sideEffects.registerProgressListener(agent));

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(chatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-peer',
					toolCallId: 'tc-peer-perm', toolName: 'write', displayName: 'Write File', contributor: { kind: ToolCallContributorKind.Client, clientId: 'test-client' },
					_meta: { toolKind: undefined, language: undefined },
				},
			});

			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(chatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-peer-perm', toolName: '', displayName: '',
					invocationMessage: 'Write .env', toolInput: '{"path":".env"}',
					confirmationTitle: 'Write .env', edits: undefined,
				},
				permissionKind: undefined, permissionPath: undefined,
			});

			const chatState = await waitForState(stateManager, () => {
				const s = stateManager.getChatState(chatUri);
				const p = s?.activeTurn?.responseParts.find(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === 'tc-peer-perm');
				return p?.kind === ResponsePartKind.ToolCall && p.toolCall.status === ToolCallStatus.PendingConfirmation ? s : undefined;
			});
			const defaultState = stateManager.getSessionState(sessionUri.toString());
			const defaultPart = defaultState?.activeTurn?.responseParts.find(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === 'tc-peer-perm');
			const peerPart = chatState.activeTurn?.responseParts.find(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === 'tc-peer-perm');
			const readyEnvelope = envelopes.find(e => e.action.type === ActionType.ChatToolCallReady && hasKey(e.action, { toolCallId: true }) && e.action.toolCallId === 'tc-peer-perm');

			assert.deepStrictEqual({
				peerToolStatus: peerPart?.kind === ResponsePartKind.ToolCall
					? peerPart.toolCall.status
					: undefined,
				defaultHasTool: defaultPart !== undefined,
				readyEnvelopeChannel: readyEnvelope?.channel,
			}, {
				peerToolStatus: ToolCallStatus.PendingConfirmation,
				defaultHasTool: false,
				readyEnvelopeChannel: chatUri,
			});

			sideEffects.handleAction(chatUri, {
				type: ActionType.ChatToolCallConfirmed,
				turnId: 'turn-peer',
				toolCallId: 'tc-peer-perm',
				approved: true,
				confirmed: 'user-action' as const,
				selectedOptionId: 'allow-session',
			} as ChatAction);

			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'tc-peer-perm', approved: true },
			]);
			assert.deepStrictEqual(stateManager.getSessionState(sessionUri.toString())?.config?.values[SessionConfigKey.Permissions], { allow: ['write'], deny: [] });
		});

		test('pending_confirmation for a tool inside a subagent routes to the subagent session', async () => {
			// Regression: a `pending_confirmation` signal for a client tool
			// inside a subagent must dispatch ChatToolCallReady against
			// the subagent session, not the parent. Otherwise the parent
			// session sees a stray `session/toolCallReady` with no
			// preceding `session/toolCallStart`, which is illegal.
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			// Parent tool that delegates to a subagent.
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-parent', toolName: 'runSubagent', displayName: 'Run Subagent', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'tc-parent', invocationMessage: 'Delegating...', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});
			agent.fireProgress({ kind: 'subagent_started', chat: URI.parse(defaultChatUri), toolCallId: 'tc-parent', agentName: 'helper', agentDisplayName: 'Helper' });

			// Inner client tool starts inside the subagent.
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri), parentToolCallId: 'tc-parent',
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-inner', toolName: 'problems', displayName: 'Problems', contributor: { kind: ToolCallContributorKind.Client, clientId: 'client-tools' },
					_meta: { toolKind: undefined, language: undefined },
				},
			});

			// Permission flow fires `pending_confirmation` for the inner
			// client tool. The signal must be routed to the subagent
			// chat — not to the parent — when the signal carries the parent
			// chat URI and parentToolCallId.
			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri), parentToolCallId: 'tc-parent',
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-inner', toolName: 'problems', displayName: 'Problems',
					invocationMessage: 'Get problems', toolInput: '{}',
					confirmationTitle: undefined, edits: undefined,
				},
				permissionKind: 'custom-tool', permissionPath: undefined,
			});

			// The subagent chat must contain the ChatToolCallReady.
			const subagentUri = buildSubagentChatUri(sessionUri.toString(), 'tc-parent');
			const subState = await waitForState(stateManager, () => {
				const s = stateManager.getSessionState(subagentUri);
				const inner = s?.activeTurn?.responseParts.find(
					rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'tc-inner'
				);
				return inner?.kind === ResponsePartKind.ToolCall && inner.toolCall.status === ToolCallStatus.Running ? s : undefined;
			});
			const innerPart = subState?.activeTurn?.responseParts.find(
				rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'tc-inner'
			);
			assert.ok(innerPart, 'inner client tool call should exist on subagent session');
			assert.strictEqual(
				innerPart!.kind === ResponsePartKind.ToolCall ? innerPart.toolCall.status : undefined,
				ToolCallStatus.Running,
				'inner client tool call should advance to Running after pending_confirmation'
			);

			// The parent session must NOT have a stray tool call for the
			// inner toolCallId — that would be a ChatToolCallReady
			// without a matching ChatToolCallStart.
			const parentState = stateManager.getSessionState(sessionUri.toString());
			const parentInner = parentState?.activeTurn?.responseParts.find(
				rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'tc-inner'
			);
			assert.strictEqual(parentInner, undefined, 'parent session must not contain the inner tool call');
		});

		test('pending_confirmation without an active turn still dispatches (does not hang)', async () => {
			// Regression: when a hook-triggered continuation runs after
			// the protocol turn has completed, the state manager has no
			// active turn. Action signals go through a fallback path, but
			// pending_confirmation was silently dropped — causing the
			// permission deferred to never resolve and the session to hang.
			setupSession(URI.file('/workspace').toString());
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			// Start a tool in the active turn
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-noop', toolName: 'view', displayName: 'Read',
					contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});

			// Complete the turn — state manager no longer has an active turn
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallComplete, turnId: 'turn-1',
					toolCallId: 'tc-noop', result: { success: true, pastTenseMessage: 'Read file' },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 },
			});

			// Verify no active turn
			assert.strictEqual(stateManager.getActiveTurnId(sessionUri.toString()), undefined);

			// Simulate the hook-triggered continuation: tool actions
			// arrive without a new protocol turn being started
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: '',
					toolCallId: 'tc-orphan', toolName: 'view', displayName: 'Read',
					contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});

			// Now the pending_confirmation arrives — this must NOT be dropped
			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-orphan', toolName: 'view', displayName: 'Read',
					invocationMessage: 'Reading file.ts', toolInput: '{"path":"file.ts"}',
					confirmationTitle: undefined, edits: undefined,
				},
				permissionKind: 'read', permissionPath: '/workspace/file.ts',
			});

			// The respondToPermissionRequest should have been called
			// (auto-approved because read is inside the working directory).
			// _handleToolReady is async (awaits getAutoApproval -> realpath),
			// so wait for the approval to settle deterministically.
			await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || undefined);
			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'tc-orphan', approved: true },
			], 'pending_confirmation without active turn should still be processed and auto-approved');
		});
	});

	// ---- ChatToolCallComplete routing -----------------------------------

	suite('handleAction — chat/toolCallComplete routing', () => {

		test('forwards session + default chat URI for a default-chat completion', () => {
			// Regression: agents key their sessions by session id, but the
			// chat URI's path is a base64 blob. The session URI must be passed
			// so the lookup resolves instead of silently dropping the call.
			setupSession();

			sideEffects.handleAction(defaultChatUri, {
				type: ActionType.ChatToolCallComplete,
				turnId: 'turn-1',
				toolCallId: 'tc-default',
				result: { success: true, pastTenseMessage: 'done' },
			});

			assert.deepStrictEqual(
				agent.clientToolCallCompleteCalls.map(c => ({ session: c.session.toString(), chat: c.chat?.toString(), toolCallId: c.toolCallId })),
				[{ session: sessionUri.toString(), chat: defaultChatUri, toolCallId: 'tc-default' }],
			);
		});

		test('forwards owning session + chat URI for an additional-chat completion', () => {
			setupSession();
			const peerChatUri = buildChatUri(sessionUri.toString(), 'peer-1');

			sideEffects.handleAction(peerChatUri, {
				type: ActionType.ChatToolCallComplete,
				turnId: 'turn-1',
				toolCallId: 'tc-peer',
				result: { success: true, pastTenseMessage: 'done' },
			});

			assert.deepStrictEqual(
				agent.clientToolCallCompleteCalls.map(c => ({ session: c.session.toString(), chat: c.chat?.toString(), toolCallId: c.toolCallId })),
				[{ session: sessionUri.toString(), chat: peerChatUri, toolCallId: 'tc-peer' }],
			);
		});

		test('forwards parent peer chat URI for a subagent-chat completion', () => {
			setupSession();
			const peerChatUri = buildChatUri(sessionUri.toString(), 'peer-subagent-parent');
			stateManager.addChat(sessionUri.toString(), peerChatUri);
			startTurn('turn-peer', peerChatUri);
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'subagent_started',
				chat: URI.parse(peerChatUri),
				toolCallId: 'tc-parent',
				agentName: 'explore',
				agentDisplayName: 'Explore',
			});

			const subagentChatUri = buildSubagentChatUri(sessionUri.toString(), 'tc-parent');
			sideEffects.handleAction(subagentChatUri, {
				type: ActionType.ChatToolCallComplete,
				turnId: 'turn-subagent',
				toolCallId: 'tc-inner',
				result: { success: true, pastTenseMessage: 'done' },
			});

			assert.deepStrictEqual(
				agent.clientToolCallCompleteCalls.map(c => ({ session: c.session.toString(), chat: c.chat?.toString(), toolCallId: c.toolCallId })),
				[{ session: sessionUri.toString(), chat: peerChatUri, toolCallId: 'tc-inner' }],
			);
		});
	});

	// ---- Session-level auto-approve (config) ----------------------------

	suite('session config auto-approve', () => {

		function setupSessionWithConfig(autoApproveLevel: string): void {
			setupSession(URI.file('/workspace').toString());
			// Set config on the session state directly (as agentService.ts does)
			stateManager.setSessionConfig(sessionUri.toString(), {
				schema: {
					type: 'object',
					properties: {
						autoApprove: {
							type: 'string',
							title: 'Approvals',
							enum: ['default', 'autoApprove', 'autopilot'],
							default: 'default',
							sessionMutable: true,
						},
					},
				},
				values: { autoApprove: autoApproveLevel },
			});
		}

		test('auto-approves all writes when autoApprove is set to bypass', async () => {
			setupSessionWithConfig('autoApprove');
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-bypass-1', toolName: 'write', displayName: 'Write', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'tc-bypass-1', invocationMessage: 'Write .env', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});

			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-bypass-1', toolName: '', displayName: '',
					invocationMessage: 'Write .env', toolInput: undefined,
					confirmationTitle: undefined, edits: undefined,
				},
				permissionKind: 'write', permissionPath: '/workspace/.env',
			});

			await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || undefined);
			// .env would normally be blocked, but session-level auto-approve overrides
			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'tc-bypass-1', approved: true },
			]);
		});

		test('auto-approves shell commands when autoApprove is set to bypass', async () => {
			setupSessionWithConfig('autoApprove');
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-bypass-shell-1', toolName: 'shell', displayName: 'Shell', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'tc-bypass-shell-1', invocationMessage: 'Run rm -rf /', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});

			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-bypass-shell-1', toolName: '', displayName: '',
					invocationMessage: 'Run rm -rf /', toolInput: 'rm -rf /',
					confirmationTitle: undefined, edits: undefined,
				},
				permissionKind: 'shell', permissionPath: undefined,
			});

			await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || undefined);
			// Dangerous command would normally be blocked, but session-level
			// bypass auto-approve overrides.
			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'tc-bypass-shell-1', approved: true },
			]);
		});

		test('does NOT auto-approve a shell command that opted out of the sandbox, even in bypass mode', () => {
			setupSessionWithConfig('autoApprove');
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-sandboxbypass-1', toolName: 'shell', displayName: 'Shell', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});

			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-sandboxbypass-1', toolName: '', displayName: '',
					invocationMessage: 'Run cat ~/something.txt', toolInput: 'cat ~/something.txt',
					confirmationTitle: 'Run command', edits: undefined,
				},
				permissionKind: 'shell', permissionPath: undefined,
				requestSandboxBypass: true,
			});

			// A read-only command like `cat` (or even session-level bypass)
			// would normally auto-approve, but opting out of the sandbox is an
			// elevation of privilege the user must confirm, so no auto-approval
			// response is sent.
			assert.deepStrictEqual(agent.respondToPermissionCalls, []);
		});

		test('marks pending client tool approval for client-side auto-approval in bypass mode', async () => {
			setupSessionWithConfig('autoApprove');
			startTurn('turn-1', defaultChatUri);
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-client-approve-1', toolName: 'runTask', displayName: 'Run Task', contributor: { kind: ToolCallContributorKind.Client, clientId: 'test-client' },
					_meta: { toolKind: 'terminal' },
				},
			});

			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-client-approve-1', toolName: 'runTask', displayName: 'Run Task',
					invocationMessage: 'Run task', toolInput: '{"task":"build"}',
					confirmationTitle: 'Run task', edits: undefined,
				},
				permissionKind: 'custom-tool', permissionPath: undefined,
			});

			const state = await waitForState(stateManager, () => {
				const s = stateManager.getSessionState(sessionUri.toString());
				const p = s?.activeTurn?.responseParts.find(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === 'tc-client-approve-1');
				return p?.kind === ResponsePartKind.ToolCall && p.toolCall.status === ToolCallStatus.PendingConfirmation ? s : undefined;
			});
			const part = state?.activeTurn?.responseParts.find(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === 'tc-client-approve-1');
			assert.ok(part?.kind === ResponsePartKind.ToolCall);
			assert.deepStrictEqual({
				status: part.toolCall.status,
				meta: part.toolCall._meta,
				permissionCalls: agent.respondToPermissionCalls,
			}, {
				status: ToolCallStatus.PendingConfirmation,
				meta: { toolKind: 'terminal', autoApproveBySetting: true },
				permissionCalls: [],
			});

			sideEffects.handleAction(defaultChatUri, {
				type: ActionType.ChatToolCallConfirmed,
				turnId: 'turn-1',
				toolCallId: 'tc-client-approve-1',
				approved: true,
				confirmed: ToolCallConfirmationReason.Setting,
			});

			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'tc-client-approve-1', approved: true },
			]);
		});

		test('does NOT auto-approve when autoApprove is default', () => {
			setupSessionWithConfig('default');
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-default-1', toolName: 'write', displayName: 'Write', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'tc-default-1', invocationMessage: 'Write .env', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});

			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-default-1', toolName: '', displayName: '',
					invocationMessage: 'Write .env', toolInput: undefined,
					confirmationTitle: undefined, edits: undefined,
				},
				permissionKind: 'write', permissionPath: '/workspace/.env',
			});

			// .env should still be blocked with default config
			assert.strictEqual(agent.respondToPermissionCalls.length, 0);
		});

		test('respects mid-session config change via SessionConfigChanged', async () => {
			setupSessionWithConfig('default');
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			// Change to bypass mid-session
			stateManager.dispatchServerAction(sessionUri.toString(), {
				type: ActionType.SessionConfigChanged,
				config: { autoApprove: 'autoApprove' },
			});

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-mid-1', toolName: 'write', displayName: 'Write', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'tc-mid-1', invocationMessage: 'Write .env', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});

			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-mid-1', toolName: '', displayName: '',
					invocationMessage: 'Write .env', toolInput: undefined,
					confirmationTitle: undefined, edits: undefined,
				},
				permissionKind: 'write', permissionPath: '/workspace/.env',
			});

			await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || undefined);
			// Should now be auto-approved after config change
			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'tc-mid-1', approved: true },
			]);
		});

	});

	// ---- Edit auto-approve ----------------------------------------------

	suite('edit auto-approve', () => {

		test('auto-approves writes to regular source files', async () => {
			setupSession(URI.file('/workspace').toString());
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-auto-1', toolName: 'write', displayName: 'Write', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'tc-auto-1', invocationMessage: 'Write file', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});

			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-auto-1', toolName: '', displayName: '',
					invocationMessage: 'Write src/app.ts', toolInput: undefined,
					confirmationTitle: undefined, edits: undefined,
				},
				permissionKind: 'write', permissionPath: '/workspace/src/app.ts',
			});

			await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || undefined);
			// Auto-approved writes call respondToPermissionRequest directly
			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'tc-auto-1', approved: true },
			]);
		});

		test('blocks writes to .env files', () => {
			setupSession(URI.file('/workspace').toString());
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-env-1', toolName: 'write', displayName: 'Write', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'tc-env-1', invocationMessage: 'Write .env', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});

			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-env-1', toolName: '', displayName: '',
					invocationMessage: 'Write .env', toolInput: undefined,
					confirmationTitle: 'Write .env', edits: undefined,
				},
				permissionKind: 'write', permissionPath: '/workspace/.env',
			});

			// Should NOT auto-approve — .env is excluded
			assert.strictEqual(agent.respondToPermissionCalls.length, 0);

			// Should dispatch a tool_ready action for the client to confirm
			const readyAction = envelopes.find(e => e.action.type === ActionType.ChatToolCallReady);
			assert.ok(readyAction, 'should dispatch tool_ready for blocked write');
		});

		test('blocks writes to package.json', () => {
			setupSession(URI.file('/workspace').toString());
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-pkg-1', toolName: 'write', displayName: 'Write', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'tc-pkg-1', invocationMessage: 'Write package.json', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});

			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-pkg-1', toolName: '', displayName: '',
					invocationMessage: 'Write package.json', toolInput: undefined,
					confirmationTitle: 'Write package.json', edits: undefined,
				},
				permissionKind: 'write', permissionPath: '/workspace/package.json',
			});

			assert.strictEqual(agent.respondToPermissionCalls.length, 0);
		});

		test('blocks writes to .lock files', () => {
			setupSession(URI.file('/workspace').toString());
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-lock-1', toolName: 'write', displayName: 'Write', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'tc-lock-1', invocationMessage: 'Write yarn.lock', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});

			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-lock-1', toolName: '', displayName: '',
					invocationMessage: 'Write yarn.lock', toolInput: undefined,
					confirmationTitle: 'Write yarn.lock', edits: undefined,
				},
				permissionKind: 'write', permissionPath: '/workspace/yarn.lock',
			});

			assert.strictEqual(agent.respondToPermissionCalls.length, 0);
		});

		test('blocks writes to .git directory', () => {
			setupSession(URI.file('/workspace').toString());
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-git-1', toolName: 'write', displayName: 'Write', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'tc-git-1', invocationMessage: 'Write .git/config', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});

			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-git-1', toolName: '', displayName: '',
					invocationMessage: 'Write .git/config', toolInput: undefined,
					confirmationTitle: 'Write .git/config', edits: undefined,
				},
				permissionKind: 'write', permissionPath: '/workspace/.git/config',
			});

			assert.strictEqual(agent.respondToPermissionCalls.length, 0);
		});
	});

	// ---- Read auto-approve -------------------------------------------------

	suite('read auto-approve', () => {

		test('auto-approves reads inside working directory', async () => {
			setupSession(URI.file('/workspace').toString());
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-read-1', toolName: 'read', displayName: 'Read', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'tc-read-1', invocationMessage: 'Read file', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});

			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-read-1', toolName: '', displayName: '',
					invocationMessage: 'Read src/app.ts', toolInput: undefined,
					confirmationTitle: undefined, edits: undefined,
				},
				permissionKind: 'read', permissionPath: '/workspace/src/app.ts',
			});

			await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || undefined);
			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'tc-read-1', approved: true },
			]);
		});

		test('does not auto-approve reads outside working directory', () => {
			setupSession(URI.file('/workspace').toString());
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			const envelopes: ActionEnvelope[] = [];
			disposables.add(stateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-read-2', toolName: 'read', displayName: 'Read', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'tc-read-2', invocationMessage: 'Read file', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});

			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-read-2', toolName: '', displayName: '',
					invocationMessage: 'Read /etc/passwd', toolInput: undefined,
					confirmationTitle: undefined, edits: undefined,
				},
				permissionKind: 'read', permissionPath: '/etc/passwd',
			});

			assert.strictEqual(agent.respondToPermissionCalls.length, 0);

			const readyAction = envelopes.find(e => e.action.type === ActionType.ChatToolCallReady);
			assert.ok(readyAction, 'should dispatch tool_ready for read outside working directory');
		});
	});

	// ---- Title persistence --------------------------------------------------

	suite('title persistence', () => {

		let sessionDb: SessionDatabase;

		setup(async () => {
			sessionDb = disposables.add(await SessionDatabase.open(':memory:'));
		});

		teardown(async () => {
			await sessionDb.close();
		});

		test('SessionTitleChanged persists to the database', async () => {
			const sessionDataService = createSessionDataService(sessionDb);
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
			const localAgent = new MockAgent();
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localSideEffects = createTestSideEffects(disposables, localStateManager, {
				getAgent: () => localAgent,
				agents: observableValue<readonly IAgent[]>('agents', [localAgent]),
				sessionDataService,
				onTurnComplete: () => { },
			});

			localStateManager.createSession({
				resource: sessionUri.toString(),
				provider: 'mock',
				title: 'Initial',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				project: { uri: 'file:///test-project', displayName: 'Test Project' },
			});

			localSideEffects.handleAction(sessionUri.toString(), {
				type: ActionType.SessionTitleChanged,
				title: 'Custom Title',
			});

			// Wait for the async persistence
			await new Promise(r => setTimeout(r, 50));

			assert.strictEqual(await sessionDb.getMetadata('customTitle'), 'Custom Title');
		});

		test('handleListSessions returns persisted custom title', async () => {
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent();
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(localAgent);

			// Create a session on the agent backend
			await localAgent.createSession();

			// Persist a custom title in the DB
			await sessionDb.setMetadata('customTitle', 'My Custom Title');

			const sessions = await localService.listSessions();
			assert.strictEqual(sessions.length, 1);
			// Custom title comes from the DB and is returned via the agent's listSessions
			// The mock agent summary is used; the service doesn't read the DB for list
			assert.ok(sessions[0].summary);
		});

		test('handleRestoreSession uses persisted custom title', async () => {
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent();
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(localAgent);

			// Create a session on the agent backend
			const { session } = await localAgent.createSession();
			const sessions = await localAgent.listSessions();
			const sessionResource = sessions[0].session;

			// Persist a custom title in the DB
			await sessionDb.setMetadata('customTitle', 'Restored Title');

			// Set up minimal messages for restore
			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'msg-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'msg-2', content: 'Hi', toolRequests: [] },
			];

			await localService.restoreSession(sessionResource);

			const state = localService.stateManager.getSessionState(sessionResource.toString());
			assert.ok(state);
			assert.strictEqual(state!.title, 'Restored Title');
		});

		test('restore interleaves a persisted local turn after its anchor', async () => {
			const sessionDataService = createSessionDataService(sessionDb);
			const localAgent = new MockAgent();
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: undefined } as IProductService, createNoopGitService()));
			localService.registerProvider(localAgent);

			const { session } = await localAgent.createSession();
			const sessions = await localAgent.listSessions();
			const sessionResource = sessions[0].session;

			// The SDK transcript yields a single real turn keyed by the first
			// user message id (`buildTurnsFromHistory`).
			localAgent.sessionMessages = [
				{ type: 'message', session, role: 'user', messageId: 'real-1', content: 'Hello', toolRequests: [] },
				{ type: 'message', session, role: 'assistant', messageId: 'a-1', content: 'Hi', toolRequests: [] },
			];

			// A host-injected local turn recorded against that real turn.
			const localTurn = {
				id: 'local-1',
				message: { text: '!echo hi', origin: { kind: MessageKind.User } },
				responseParts: [{ kind: ResponsePartKind.Markdown, id: 'p1', content: 'ran' }],
				usage: undefined,
				state: 2, // TurnState.Complete
			};
			await sessionDb.insertLocalTurn({ turnId: 'local-1', chatUri: buildDefaultChatUri(sessionResource.toString()), anchorTurnId: 'real-1', seq: 1, payload: JSON.stringify(localTurn) });

			await localService.restoreSession(sessionResource);

			const state = localService.stateManager.getSessionState(sessionResource.toString());
			assert.deepStrictEqual(state?.turns.map(t => t.id), ['real-1', 'local-1']);
		});

		test('SessionConfigChanged persists merged config values to the database', async () => {
			const sessionDataService = createSessionDataService(sessionDb);
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
			const localAgent = new MockAgent();
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localSideEffects = createTestSideEffects(disposables, localStateManager, {
				getAgent: () => localAgent,
				agents: observableValue<readonly IAgent[]>('agents', [localAgent]),
				sessionDataService,
				onTurnComplete: () => { },
			});

			const session = localStateManager.createSession({
				resource: sessionUri.toString(),
				provider: 'mock',
				title: 'Initial',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				project: { uri: 'file:///test-project', displayName: 'Test Project' },
			});
			session.config = { schema: { type: 'object', properties: {} }, values: { autoApprove: 'default' } };

			// Mid-session change merges new values into existing.
			localStateManager.dispatchClientAction(sessionUri.toString(), {
				type: ActionType.SessionConfigChanged,
				config: { autoApprove: 'autoApprove' },
			}, { clientId: 'test-client', clientSeq: 1 });
			localSideEffects.handleAction(sessionUri.toString(), {
				type: ActionType.SessionConfigChanged,
				config: { autoApprove: 'autoApprove' },
			});

			await new Promise(r => setTimeout(r, 50));

			const persisted = await sessionDb.getMetadata('configValues');
			assert.ok(persisted);
			assert.deepStrictEqual(JSON.parse(persisted!), { autoApprove: 'autoApprove' });
		});

		test('SessionConfigChanged notifies the agent with the post-reducer merged values', async () => {
			// The client-action side-effects path is where a picker edit lands
			// (internal server writes use `dispatchServerAction` and never reach
			// `handleAction`), so forwarding a live config change to the provider
			// from here is inherently client-only. Pins that `onSessionConfigChanged`
			// receives the full merged config, not just the patch.
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
			const localAgent = new MockAgent();
			disposables.add(toDisposable(() => localAgent.dispose()));
			const localSideEffects = createTestSideEffects(disposables, localStateManager, {
				getAgent: () => localAgent,
				agents: observableValue<readonly IAgent[]>('agents', [localAgent]),
				sessionDataService: createSessionDataService(sessionDb),
				onTurnComplete: () => { },
			});

			const session = localStateManager.createSession({
				resource: sessionUri.toString(),
				provider: 'mock',
				title: 'Initial',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
			});
			// Seed a second key the patch does NOT touch: if the hook received the
			// raw patch instead of the merged values, `autoApprove` would be
			// missing — so asserting it survives pins the "merged values" contract.
			session.config = { schema: { type: 'object', properties: {} }, values: { permissionMode: 'default', autoApprove: 'default' } };

			localStateManager.dispatchClientAction(sessionUri.toString(), {
				type: ActionType.SessionConfigChanged,
				config: { permissionMode: 'bypassPermissions' },
			}, { clientId: 'test-client', clientSeq: 1 });
			localSideEffects.handleAction(sessionUri.toString(), {
				type: ActionType.SessionConfigChanged,
				config: { permissionMode: 'bypassPermissions' },
			});

			assert.deepStrictEqual(localAgent.onSessionConfigChangedCalls.map(c => ({ session: c.session.toString(), values: c.values })), [{
				session: sessionUri.toString(),
				values: { permissionMode: 'bypassPermissions', autoApprove: 'default' },
			}]);
		});
	});

	// ---- Subagent sessions ----------------------------------------------

	suite('subagent sessions', () => {

		test('subagent_started creates a subagent chat and dispatches content on parent tool call', () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			// Start a parent tool call
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-1', toolName: 'runSubagent', displayName: 'Run Subagent', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'tc-1', invocationMessage: 'Delegating task...',
					toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});

			// Fire subagent_started
			agent.fireProgress({
				kind: 'subagent_started', chat: URI.parse(defaultChatUri),
				toolCallId: 'tc-1',
				agentName: 'code-reviewer',
				agentDisplayName: 'Code Reviewer',
				agentDescription: 'Reviews code',
				taskPrompt: 'Review the auth module for security issues',
			});

			// Verify the subagent chat was created
			const subagentUri = buildSubagentChatUri(sessionUri.toString(), 'tc-1');
			const subState = stateManager.getSessionState(subagentUri);
			assert.ok(subState, 'subagent chat should exist');
			const subagentSummary = subState!.chats.find(c => c.resource === subagentUri);
			assert.strictEqual(subagentSummary?.title, 'Code Reviewer');
			assert.deepStrictEqual(subagentSummary?.origin, { kind: 'tool', chat: defaultChatUri, toolCallId: 'tc-1' });
			assert.ok(subState!.activeTurn, 'subagent chat should have an active turn');
			assert.strictEqual(subState!.activeTurn!.message.text, 'Review the auth module for security issues', 'subagent turn should render the spawning tool call prompt as its request');

			// Verify content was dispatched on the parent tool call
			const parentState = stateManager.getSessionState(sessionUri.toString());
			assert.ok(parentState?.activeTurn);
			const parentToolCall = parentState!.activeTurn!.responseParts.find(
				rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'tc-1'
			);
			assert.ok(parentToolCall);
			if (parentToolCall?.kind === ResponsePartKind.ToolCall && parentToolCall.toolCall.status === ToolCallStatus.Running) {
				assert.ok(parentToolCall.toolCall.content);
				assert.strictEqual(parentToolCall.toolCall.content![0].type, ToolResultContentType.Subagent);
			}
		});

		test('stamps _meta.subagentChatUri onto a subagent-spawning tool call as soon as toolKind is known', () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-1', toolName: 'task', displayName: 'Task', contributor: undefined,
					_meta: { toolKind: 'subagent', language: undefined },
				},
			});

			const expectedUri = buildSubagentChatUri(sessionUri.toString(), 'tc-1');
			const parentState = stateManager.getSessionState(sessionUri.toString());
			const toolCall = parentState?.activeTurn?.responseParts.find(
				rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'tc-1'
			);
			assert.ok(toolCall?.kind === ResponsePartKind.ToolCall);
			assert.strictEqual(readToolCallMeta(toolCall.toolCall).subagentChatUri, expectedUri);
			assert.strictEqual(stateManager.getSnapshot(expectedUri), undefined);
		});

		test('nested subagent_started routes discovery block and seeds each request prompt via the immediate parent chat (arbitrary depth)', () => {
			// Regression: for a subagent spawned by another subagent, the
			// `subagent_started` signal's `chat` is the top-level chat, but
			// its spawning tool call lives in the immediate parent's subagent
			// chat. The discovery `ChatToolCallContentChanged` must land there
			// (resolved via `parentToolCallId`) — dispatching it on the
			// top-level chat is a no-op, leaving the nested subagent
			// undiscoverable and hanging any client tool it runs. Driven three
			// levels deep to prove the resolution is not capped at two: each
			// level's block lands on its immediate parent chat via a single
			// flat-map lookup, independent of depth.
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			// Level-1 subagent spawned from the default chat.
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'tc-l1', toolName: 'task', displayName: 'Task', contributor: undefined, _meta: { toolKind: 'subagent', language: undefined } } });
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: 'turn-1', toolCallId: 'tc-l1', invocationMessage: 'Delegating...', toolInput: undefined, confirmed: ToolCallConfirmationReason.NotNeeded } });
			agent.fireProgress({ kind: 'subagent_started', chat: URI.parse(defaultChatUri), toolCallId: 'tc-l1', agentName: 'l1', agentDisplayName: 'L1', agentDescription: 'first', taskPrompt: 'l1 prompt' });

			// Level-2 subagent's spawning tool runs INSIDE the level-1
			// subagent (parentToolCallId = tc-l1), so it lands on the level-1
			// subagent chat rather than the default chat.
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), parentToolCallId: 'tc-l1', action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'tc-l2', toolName: 'task', displayName: 'Task', contributor: undefined, _meta: { toolKind: 'subagent', language: undefined } } });
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), parentToolCallId: 'tc-l1', action: { type: ActionType.ChatToolCallReady, turnId: 'turn-1', toolCallId: 'tc-l2', invocationMessage: 'Delegating...', toolInput: undefined, confirmed: ToolCallConfirmationReason.NotNeeded } });

			// Level-2 subagent starts. Its spawning tool (tc-l2) lives in the
			// level-1 subagent chat, so the signal carries parentToolCallId = tc-l1.
			agent.fireProgress({ kind: 'subagent_started', chat: URI.parse(defaultChatUri), toolCallId: 'tc-l2', agentName: 'l2', agentDisplayName: 'L2', agentDescription: 'second', taskPrompt: 'l2 prompt', parentToolCallId: 'tc-l1' });

			// Level-3 subagent's spawning tool runs INSIDE the level-2
			// subagent (parentToolCallId = tc-l2), landing on the level-2 chat.
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), parentToolCallId: 'tc-l2', action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'tc-l3', toolName: 'task', displayName: 'Task', contributor: undefined, _meta: { toolKind: 'subagent', language: undefined } } });
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), parentToolCallId: 'tc-l2', action: { type: ActionType.ChatToolCallReady, turnId: 'turn-1', toolCallId: 'tc-l3', invocationMessage: 'Delegating...', toolInput: undefined, confirmed: ToolCallConfirmationReason.NotNeeded } });

			// Level-3 subagent starts. Its spawning tool (tc-l3) lives in the
			// level-2 subagent chat, so the signal carries parentToolCallId = tc-l2.
			agent.fireProgress({ kind: 'subagent_started', chat: URI.parse(defaultChatUri), toolCallId: 'tc-l3', agentName: 'l3', agentDisplayName: 'L3', agentDescription: 'third', taskPrompt: 'l3 prompt', parentToolCallId: 'tc-l2' });

			const l1ChatUri = buildSubagentChatUri(sessionUri.toString(), 'tc-l1');
			const l2ChatUri = buildSubagentChatUri(sessionUri.toString(), 'tc-l2');
			const l3ChatUri = buildSubagentChatUri(sessionUri.toString(), 'tc-l3');

			assert.ok(stateManager.getSessionState(l2ChatUri), 'level-2 subagent chat should exist');
			assert.ok(stateManager.getSessionState(l3ChatUri), 'level-3 subagent chat should exist');

			// Asserts a subagent's discovery block landed on `parentChatUri`'s
			// `spawningToolId` tool call, pointing at `childChatUri`.
			const assertDiscoveryBlock = (parentChatUri: string, spawningToolId: string, childChatUri: string, label: string) => {
				const parentState = stateManager.getSessionState(parentChatUri);
				const spawningTool = parentState?.activeTurn?.responseParts.find(rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === spawningToolId);
				assert.ok(spawningTool && spawningTool.kind === ResponsePartKind.ToolCall, `${spawningToolId} should live in ${label}`);
				const tc = spawningTool.toolCall;
				// `content` only exists on the running/completed variants of the
				// ToolCallState union; the spawning tool is running here.
				assert.strictEqual(tc.status, ToolCallStatus.Running, `${spawningToolId} should be running in ${label}`);
				if (tc.status !== ToolCallStatus.Running) {
					return;
				}
				const block = tc.content?.find(c => hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent);
				assert.ok(block, `the discovery block for ${spawningToolId} must land on ${label}`);
				assert.strictEqual((block as { resource: string }).resource, childChatUri);
			};

			// Each level's discovery block lands on its immediate parent chat.
			assertDiscoveryBlock(l1ChatUri, 'tc-l2', l2ChatUri, 'the level-1 chat');
			assertDiscoveryBlock(l2ChatUri, 'tc-l3', l3ChatUri, 'the level-2 chat');

			// Each child chat's opening request is seeded from its own
			// `subagent_started` signal's `taskPrompt`.
			assert.deepStrictEqual(
				[l1ChatUri, l2ChatUri, l3ChatUri].map(uri => stateManager.getSessionState(uri)?.activeTurn?.message.text),
				['l1 prompt', 'l2 prompt', 'l3 prompt'],
			);

			// Nested spawning tools must NOT be misrouted to the top-level
			// default chat, where they do not exist.
			const defaultState = stateManager.getSessionState(sessionUri.toString());
			const l2ToolInDefault = defaultState?.activeTurn?.responseParts.find(rp => rp.kind === ResponsePartKind.ToolCall && (rp.toolCall.toolCallId === 'tc-l2' || rp.toolCall.toolCallId === 'tc-l3'));
			assert.strictEqual(l2ToolInDefault, undefined, 'nested spawning tools must not appear in the top-level chat');
		});

		test('events with parentToolCallId route to subagent session', () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			// Start parent tool + subagent
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'tc-1', toolName: 'runSubagent', displayName: 'Run Subagent', contributor: undefined, _meta: { toolKind: undefined, language: undefined } } });
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: 'turn-1', toolCallId: 'tc-1', invocationMessage: 'Delegating...', toolInput: undefined, confirmed: ToolCallConfirmationReason.NotNeeded } });
			agent.fireProgress({ kind: 'subagent_started', chat: URI.parse(defaultChatUri), toolCallId: 'tc-1', agentName: 'helper', agentDisplayName: 'Helper', agentDescription: 'Helps' });

			// Fire an inner tool start with parentToolCallId
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri), parentToolCallId: 'tc-1',
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'inner-tc-1', toolName: 'readFile', displayName: 'Read File', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri), parentToolCallId: 'tc-1',
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'inner-tc-1', invocationMessage: 'Reading file...', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});

			// Verify the inner tool call is on the subagent chat's turn, not the parent
			const subagentUri = buildSubagentChatUri(sessionUri.toString(), 'tc-1');
			const subState = stateManager.getSessionState(subagentUri);
			assert.ok(subState?.activeTurn);
			const innerTool = subState!.activeTurn!.responseParts.find(
				rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'inner-tc-1'
			);
			assert.ok(innerTool, 'inner tool call should be in subagent chat');

			// Verify the parent session does NOT have the inner tool call
			const parentState = stateManager.getSessionState(sessionUri.toString());
			const parentInnerTool = parentState!.activeTurn!.responseParts.find(
				rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'inner-tc-1'
			);
			assert.strictEqual(parentInnerTool, undefined, 'inner tool call should NOT be in parent session');
		});

		test('completeSubagentSession clears pending buffered events when subagent never started', () => {
			// Regression: if the parent tool completes (or fails) before any
			// `subagent_started` arrives, buffered inner events would
			// otherwise leak in `_pendingSubagentEvents` until session
			// disposal. After completion, a late `subagent_started` for the
			// same toolCallId must not replay stale events.
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'tc-1', toolName: 'runSubagent', displayName: 'Run Subagent', contributor: undefined, _meta: { toolKind: undefined, language: undefined } } });
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: 'turn-1', toolCallId: 'tc-1', invocationMessage: 'Delegating...', toolInput: undefined, confirmed: ToolCallConfirmationReason.NotNeeded } });

			// Inner event arrives but `subagent_started` never does.
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri), parentToolCallId: 'tc-1',
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'inner-1', toolName: 'read', displayName: 'Read', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri), parentToolCallId: 'tc-1',
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'inner-1', invocationMessage: 'Reading...', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});

			// Parent tool completes (e.g. it errored before delegating).
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallComplete, turnId: 'turn-1',
					toolCallId: 'tc-1',
					result: { success: false, pastTenseMessage: 'Failed' },
				},
			});

			// Now a late `subagent_started` for the same toolCallId arrives.
			// This is unusual but possible after a reconnect/replay. The
			// drain must NOT replay the (cleared) buffered inner tool call.
			agent.fireProgress({ kind: 'subagent_started', chat: URI.parse(defaultChatUri), toolCallId: 'tc-1', agentName: 'helper', agentDisplayName: 'Helper', agentDescription: 'Helps' });

			const subagentUri = buildSubagentChatUri(sessionUri.toString(), 'tc-1');
			const subState = stateManager.getSessionState(subagentUri);
			assert.ok(subState, 'subagent session should still be created');
			const innerTool = subState!.activeTurn?.responseParts.find(
				rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'inner-1'
			);
			assert.strictEqual(innerTool, undefined, 'stale buffered inner tool call must not be replayed');
		});

		test('subagent_completed signal completes the subagent turn', () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			// Start parent tool + subagent
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'tc-1', toolName: 'runSubagent', displayName: 'Run Subagent', contributor: undefined, _meta: { toolKind: undefined, language: undefined } } });
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: 'turn-1', toolCallId: 'tc-1', invocationMessage: 'Delegating...', toolInput: undefined, confirmed: ToolCallConfirmationReason.NotNeeded } });
			agent.fireProgress({ kind: 'subagent_started', chat: URI.parse(defaultChatUri), toolCallId: 'tc-1', agentName: 'helper', agentDisplayName: 'Helper', agentDescription: 'Helps' });

			// Completing the parent tool call must NOT tear down the
			// subagent session — background subagents keep running after
			// their parent tool call returns.
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallComplete, turnId: 'turn-1',
					toolCallId: 'tc-1',
					result: { success: true, pastTenseMessage: 'Started in background' },
				},
			});

			const subagentUri = buildSubagentChatUri(sessionUri.toString(), 'tc-1');
			let subState = stateManager.getSessionState(subagentUri);
			assert.ok(subState);
			assert.ok(subState!.activeTurn, 'subagent turn should still be active after parent tool completes');

			// The SDK's `subagent.completed`/`subagent.failed` event is what
			// actually closes the subagent session.
			agent.fireProgress({ kind: 'subagent_completed', chat: URI.parse(defaultChatUri), toolCallId: 'tc-1' });

			subState = stateManager.getSessionState(subagentUri);
			assert.strictEqual(subState!.activeTurn, undefined, 'subagent turn should be completed');
			assert.strictEqual(subState!.turns.length, 1);
		});

		test('cancelSubagentSessions cancels all subagent chats', () => {
			setupSession();
			startTurn('turn-1', defaultChatUri);
			disposables.add(sideEffects.registerProgressListener(agent));

			// Start two parent tool calls with subagents
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'tc-1', toolName: 'runSubagent', displayName: 'Sub 1', contributor: undefined, _meta: { toolKind: undefined, language: undefined } } });
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: 'turn-1', toolCallId: 'tc-1', invocationMessage: 'Delegating 1...', toolInput: undefined, confirmed: ToolCallConfirmationReason.NotNeeded } });
			agent.fireProgress({ kind: 'subagent_started', chat: URI.parse(defaultChatUri), toolCallId: 'tc-1', agentName: 'sub1', agentDisplayName: 'Sub 1', agentDescription: 'First' });

			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'tc-2', toolName: 'runSubagent', displayName: 'Sub 2', contributor: undefined, _meta: { toolKind: undefined, language: undefined } } });
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: 'turn-1', toolCallId: 'tc-2', invocationMessage: 'Delegating 2...', toolInput: undefined, confirmed: ToolCallConfirmationReason.NotNeeded } });
			agent.fireProgress({ kind: 'subagent_started', chat: URI.parse(defaultChatUri), toolCallId: 'tc-2', agentName: 'sub2', agentDisplayName: 'Sub 2', agentDescription: 'Second' });

			sideEffects.handleAction(defaultChatUri, {
				type: ActionType.ChatTurnCancelled,
				turnId: 'turn-1',
				duration: 1000,
			});

			// Both subagent chats should have their turns completed (cancelled)
			const sub1 = stateManager.getSessionState(buildSubagentChatUri(sessionUri.toString(), 'tc-1'));
			const sub2 = stateManager.getSessionState(buildSubagentChatUri(sessionUri.toString(), 'tc-2'));
			assert.strictEqual(sub1?.activeTurn, undefined, 'sub1 turn should be cancelled');
			assert.strictEqual(sub2?.activeTurn, undefined, 'sub2 turn should be cancelled');
		});

		test('removeSubagentSessions removes all subagent chats from state', () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'tc-1', toolName: 'runSubagent', displayName: 'Sub 1', contributor: undefined, _meta: { toolKind: undefined, language: undefined } } });
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: 'turn-1', toolCallId: 'tc-1', invocationMessage: 'Delegating...', toolInput: undefined, confirmed: ToolCallConfirmationReason.NotNeeded } });
			agent.fireProgress({ kind: 'subagent_started', chat: URI.parse(defaultChatUri), toolCallId: 'tc-1', agentName: 'sub', agentDisplayName: 'Sub', agentDescription: 'Has subagent' });

			const subagentUri = buildSubagentChatUri(sessionUri.toString(), 'tc-1');
			assert.ok(stateManager.getChatState(subagentUri));

			sideEffects.removeSubagentSessions(sessionUri.toString());

			assert.strictEqual(stateManager.getChatState(subagentUri), undefined, 'subagent chat should be removed');
		});

		test('deltas with parentToolCallId route to subagent session', () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'tc-1', toolName: 'runSubagent', displayName: 'Run Subagent', contributor: undefined, _meta: { toolKind: undefined, language: undefined } } });
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: 'turn-1', toolCallId: 'tc-1', invocationMessage: 'Delegating...', toolInput: undefined, confirmed: ToolCallConfirmationReason.NotNeeded } });
			agent.fireProgress({ kind: 'subagent_started', chat: URI.parse(defaultChatUri), toolCallId: 'tc-1', agentName: 'helper', agentDisplayName: 'Helper', agentDescription: 'Helps' });

			// Fire a delta with parentToolCallId
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri), parentToolCallId: 'tc-1',
				action: { type: ActionType.ChatResponsePart, turnId: 'turn-1', part: { kind: ResponsePartKind.Markdown, id: 'msg-sub', content: 'thinking...' } },
			});

			// Verify the delta went to the subagent session
			const subagentUri = buildSubagentChatUri(sessionUri.toString(), 'tc-1');
			const subState = stateManager.getSessionState(subagentUri);
			assert.ok(subState?.activeTurn);
			const markdownPart = subState!.activeTurn!.responseParts.find(
				rp => rp.kind === ResponsePartKind.Markdown
			);
			assert.ok(markdownPart, 'delta should create a markdown part in subagent session');
		});

		test('tool_complete preserves subagent content in completed tool call', () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'tc-1', toolName: 'task', displayName: 'Task', contributor: undefined, _meta: { toolKind: undefined, language: undefined } } });
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: 'turn-1', toolCallId: 'tc-1', invocationMessage: 'Delegating...', toolInput: undefined, confirmed: ToolCallConfirmationReason.NotNeeded } });
			agent.fireProgress({ kind: 'subagent_started', chat: URI.parse(defaultChatUri), toolCallId: 'tc-1', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' });

			// Verify subagent content is on the running tool
			const runningState = stateManager.getSessionState(sessionUri.toString());
			const runningTool = runningState?.activeTurn?.responseParts.find(
				rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'tc-1'
			);
			assert.ok(runningTool?.kind === ResponsePartKind.ToolCall);
			assert.strictEqual(runningTool.toolCall.status, ToolCallStatus.Running);

			// Complete the tool — the SDK result has its own content
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallComplete, turnId: 'turn-1',
					toolCallId: 'tc-1',
					result: { success: true, pastTenseMessage: 'Delegated', content: [{ type: ToolResultContentType.Text, text: 'Done' }] },
				},
			});

			// Verify the completed tool still has the subagent content entry
			const completedState = stateManager.getSessionState(sessionUri.toString());
			const completedTool = completedState?.activeTurn?.responseParts.find(
				rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'tc-1'
			);
			assert.ok(completedTool?.kind === ResponsePartKind.ToolCall);
			assert.strictEqual(completedTool.toolCall.status, ToolCallStatus.Completed);
			const content = completedTool.toolCall.content ?? [];
			const subagentEntry = content.find(c => hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent);
			assert.ok(subagentEntry, 'Completed tool should preserve subagent content entry');
			const textEntry = content.find(c => hasKey(c, { type: true }) && c.type === ToolResultContentType.Text);
			assert.ok(textEntry, 'Completed tool should also have the SDK result content');
		});

		test('inner tool_start arriving BEFORE subagent_started routes to subagent (not parent)', () => {
			// Reproduces the regression where inner subagent tool calls show up
			// flat at the top level of the parent session because the SDK can
			// emit `tool_start` (with parentToolCallId) before `subagent_started`.
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			// 1. Parent tool starts (the `task` invocation).
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'tc-parent', toolName: 'task', displayName: 'Task', contributor: undefined, _meta: { toolKind: undefined, language: undefined } } });
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: 'turn-1', toolCallId: 'tc-parent', invocationMessage: 'Delegating...', toolInput: undefined, confirmed: ToolCallConfirmationReason.NotNeeded } });

			// 2. Inner tool fires BEFORE subagent_started (race condition).
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri), parentToolCallId: 'tc-parent',
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'inner-tc-1', toolName: 'readFile', displayName: 'Read File', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri), parentToolCallId: 'tc-parent',
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'inner-tc-1', invocationMessage: 'Reading file...', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});

			// 3. subagent_started arrives later.
			agent.fireProgress({ kind: 'subagent_started', chat: URI.parse(defaultChatUri), toolCallId: 'tc-parent', agentName: 'helper', agentDisplayName: 'Helper', agentDescription: 'Helps' });

			const subagentUri = buildSubagentChatUri(sessionUri.toString(), 'tc-parent');
			const subState = stateManager.getSessionState(subagentUri);
			assert.ok(subState?.activeTurn, 'subagent session should exist');

			const innerTool = subState!.activeTurn!.responseParts.find(
				rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'inner-tc-1'
			);
			assert.ok(innerTool, 'inner tool fired before subagent_started should still end up in the subagent session');

			// Parent must NOT have the inner tool.
			const parentState = stateManager.getSessionState(sessionUri.toString());
			const parentInnerTool = parentState!.activeTurn!.responseParts.find(
				rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'inner-tc-1'
			);
			assert.strictEqual(parentInnerTool, undefined, 'inner tool must not leak into parent session');
		});

		test('reads inside parent working directory are auto-approved for tools in subagent sessions', async () => {
			// Subagent sessions don't carry their own workingDirectory or
			// autoApprove config. Without inheritance from the parent, every
			// tool call inside a subagent (even a read in the workspace) would
			// surface a confirmation dialog.
			setupSession(URI.file('/workspace').toString());
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			// Parent task tool spawns a subagent.
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'tc-parent', toolName: 'task', displayName: 'Task', contributor: undefined, _meta: { toolKind: undefined, language: undefined } } });
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: 'turn-1', toolCallId: 'tc-parent', invocationMessage: 'Delegating...', toolInput: undefined, confirmed: ToolCallConfirmationReason.NotNeeded } });
			agent.fireProgress({ kind: 'subagent_started', chat: URI.parse(defaultChatUri), toolCallId: 'tc-parent', agentName: 'helper', agentDisplayName: 'Helper', agentDescription: 'Helps' });

			// Inner tool inside the subagent requests permission to read a file
			// inside the parent workspace.
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri), parentToolCallId: 'tc-parent',
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'inner-read-1', toolName: 'read', displayName: 'Read', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri), parentToolCallId: 'tc-parent',
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'inner-read-1', invocationMessage: 'Read file', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});
			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'inner-read-1', toolName: '', displayName: '',
					invocationMessage: 'Read src/app.ts', toolInput: undefined,
					confirmationTitle: undefined, edits: undefined,
				},
				permissionKind: 'read', permissionPath: '/workspace/src/app.ts',
			});

			await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || undefined);
			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'inner-read-1', approved: true },
			]);
		});

		test('session-level autoApprove on the parent is inherited by tools in subagent sessions', async () => {
			setupSession(URI.file('/workspace').toString());
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			// Set the parent session to "Bypass Approvals" via session config.
			stateManager.setSessionConfig(sessionUri.toString(), {
				schema: {
					type: 'object',
					properties: {
						autoApprove: {
							type: 'string',
							title: 'Approvals',
							enum: ['default', 'autoApprove', 'autopilot'],
							default: 'default',
							sessionMutable: true,
						},
					},
				},
				values: { autoApprove: 'autoApprove' },
			});

			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'tc-parent', toolName: 'task', displayName: 'Task', contributor: undefined, _meta: { toolKind: undefined, language: undefined } } });
			agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: 'turn-1', toolCallId: 'tc-parent', invocationMessage: 'Delegating...', toolInput: undefined, confirmed: ToolCallConfirmationReason.NotNeeded } });
			agent.fireProgress({ kind: 'subagent_started', chat: URI.parse(defaultChatUri), toolCallId: 'tc-parent', agentName: 'helper', agentDisplayName: 'Helper', agentDescription: 'Helps' });

			// Inner write outside the workspace would normally NOT auto-approve,
			// but session-level autoApprove on the parent must apply.
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri), parentToolCallId: 'tc-parent',
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'inner-write-1', toolName: 'write', displayName: 'Write', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri), parentToolCallId: 'tc-parent',
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'inner-write-1', invocationMessage: 'Write file', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});
			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'inner-write-1', toolName: '', displayName: '',
					invocationMessage: 'Write /tmp/foo', toolInput: undefined,
					confirmationTitle: undefined, edits: undefined,
				},
				permissionKind: 'write', permissionPath: '/tmp/foo',
			});

			await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || undefined);
			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'inner-write-1', approved: true },
			]);
		});
	});

	// ---- Session inputNeeded production -------------------------------------

	suite('session inputNeeded production', () => {

		function sessionInputNeeded() {
			return stateManager.getSessionState(sessionUri.toString())?.inputNeeded ?? [];
		}

		test('chat input request mirrors its unresolved response part and is removed on completion', () => {
			setupSession();
			startTurn('turn-1');

			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatInputRequested,
				request: {
					id: 'req-1',
					questions: [{ kind: ChatInputQuestionKind.Text, id: 'question-1', message: 'Which value?' }],
				},
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatInputAnswerChanged,
				requestId: 'req-1',
				questionId: 'question-1',
				answer: {
					state: ChatInputAnswerState.Draft,
					value: { kind: ChatInputAnswerValueKind.Text, value: 'draft value' },
				},
			});

			const produced = sessionInputNeeded();
			assert.deepStrictEqual(produced.map(r => ({
				kind: r.kind,
				chat: r.chat,
				request: r.kind === SessionInputRequestKind.ChatInput ? r.request : undefined,
			})), [
				{
					kind: SessionInputRequestKind.ChatInput,
					chat: defaultChatUri,
					request: {
						id: 'req-1',
						questions: [{ kind: ChatInputQuestionKind.Text, id: 'question-1', message: 'Which value?' }],
						answers: {
							'question-1': {
								state: ChatInputAnswerState.Draft,
								value: { kind: ChatInputAnswerValueKind.Text, value: 'draft value' },
							},
						},
					},
				},
			]);

			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatInputCompleted,
				requestId: 'req-1',
				response: SessionInputResponseKind.Accept,
			});

			assert.deepStrictEqual(sessionInputNeeded(), []);
		});

		test('chat input request without an active turn is not mirrored', () => {
			setupSession();

			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatInputRequested,
				request: { id: 'req-1', questions: [] },
			});

			assert.deepStrictEqual(sessionInputNeeded(), []);
		});

		test('tool confirmation is produced while pending and removed once confirmed', () => {
			setupSession();
			startTurn('turn-1');

			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallStart, turnId: 'turn-1',
				toolCallId: 'tc-1', toolName: 'write', displayName: 'Write',
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallReady, turnId: 'turn-1',
				toolCallId: 'tc-1', invocationMessage: 'Write file', confirmationTitle: 'Write file',
			});

			const pending = sessionInputNeeded();
			assert.deepStrictEqual(
				pending.map(r => ({ kind: r.kind, chat: r.chat, toolCallId: r.kind === SessionInputRequestKind.ToolConfirmation ? r.toolCall.toolCallId : undefined })),
				[{ kind: SessionInputRequestKind.ToolConfirmation, chat: defaultChatUri, toolCallId: 'tc-1' }],
			);

			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallConfirmed, turnId: 'turn-1',
				toolCallId: 'tc-1', approved: true, confirmed: ToolCallConfirmationReason.UserAction,
			});

			assert.deepStrictEqual(sessionInputNeeded(), []);
		});

		test('client tool execution is produced while running and removed once complete', () => {
			setupSession();
			startTurn('turn-1');

			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallStart, turnId: 'turn-1',
				toolCallId: 'tc-client', toolName: 'toolSearch', displayName: 'Search for Tools',
				contributor: { kind: ToolCallContributorKind.Client, clientId: 'client-1' },
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallReady, turnId: 'turn-1',
				toolCallId: 'tc-client', invocationMessage: 'Searching', confirmed: ToolCallConfirmationReason.NotNeeded,
			});

			const running = sessionInputNeeded();
			assert.deepStrictEqual(
				running.map(r => ({ kind: r.kind, chat: r.chat, clientId: r.kind === SessionInputRequestKind.ToolClientExecution ? r.clientId : undefined })),
				[{ kind: SessionInputRequestKind.ToolClientExecution, chat: defaultChatUri, clientId: 'client-1' }],
			);

			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallComplete, turnId: 'turn-1',
				toolCallId: 'tc-client', result: { success: true, pastTenseMessage: 'Searched' },
			});

			assert.deepStrictEqual(sessionInputNeeded(), []);
		});

		test('MCP tool authentication is produced while auth is required and removed once resolved', () => {
			setupSession();
			startTurn('turn-1');

			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tc-mcp',
				toolName: 'get_file',
				displayName: 'Get File',
				contributor: { kind: ToolCallContributorKind.MCP, customizationId: 'mcp-1' },
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tc-mcp',
				invocationMessage: 'Getting file',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallAuthRequired,
				turnId: 'turn-1',
				toolCallId: 'tc-mcp',
				auth: {
					reason: McpAuthRequiredReason.InsufficientScope,
					resource: {
						resource: 'https://mcp.example.com',
						authorization_servers: ['https://auth.example.com'],
					},
					requiredScopes: ['repo'],
				},
			});

			const pending = sessionInputNeeded();
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallComplete,
				turnId: 'turn-1',
				toolCallId: 'tc-mcp',
				result: {
					success: false,
					pastTenseMessage: 'Cancelled tool call',
					error: { message: 'MCP authentication was cancelled', code: 'cancelled' },
				},
			});

			assert.deepStrictEqual({
				pending: pending.map(request => ({
					kind: request.kind,
					chat: request.chat,
					toolCallId: request.kind === SessionInputRequestKind.ToolAuthentication ? request.toolCall.toolCallId : undefined,
				})),
				resolved: sessionInputNeeded(),
			}, {
				pending: [{
					kind: SessionInputRequestKind.ToolAuthentication,
					chat: defaultChatUri,
					toolCallId: 'tc-mcp',
				}],
				resolved: [],
			});
		});

		test('ending the turn clears the chat\'s outstanding requests', () => {
			setupSession();
			startTurn('turn-1');

			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatInputRequested,
				request: { id: 'req-1', questions: [] },
			});
			assert.strictEqual(sessionInputNeeded().length, 1);

			stateManager.dispatchServerAction(defaultChatUri, { type: ActionType.ChatTurnCancelled, turnId: 'turn-1', duration: 1000 });

			assert.deepStrictEqual(sessionInputNeeded(), []);
		});

		test('a blocker inside a subagent is produced against the subagent chat', async () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'tc-parent', toolName: 'task', displayName: 'Delegate Task' },
			});
			agent.fireProgress({ kind: 'subagent_started', chat: URI.parse(defaultChatUri), toolCallId: 'tc-parent', agentName: 'helper', agentDisplayName: 'Helper' });
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri), parentToolCallId: 'tc-parent',
				action: { type: ActionType.ChatToolCallStart, turnId: 'turn-1', toolCallId: 'tc-inner', toolName: 'write', displayName: 'Write' },
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri), parentToolCallId: 'tc-parent',
				action: { type: ActionType.ChatToolCallReady, turnId: 'turn-1', toolCallId: 'tc-inner', invocationMessage: 'Write file', confirmationTitle: 'Write file' },
			});

			const subagentUri = buildSubagentChatUri(sessionUri.toString(), 'tc-parent');
			const produced = await waitForState(stateManager, () => {
				const entry = sessionInputNeeded().find(r => r.kind === SessionInputRequestKind.ToolConfirmation);
				return entry?.kind === SessionInputRequestKind.ToolConfirmation ? entry : undefined;
			});

			assert.deepStrictEqual({ chat: produced.chat, toolCallId: produced.toolCall.toolCallId }, { chat: subagentUri, toolCallId: 'tc-inner' });
		});
	});

	// ---- Session permissions ------------------------------------------------

	suite('session permissions', () => {

		test('tool_ready action includes confirmation options when confirmation is needed', async () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-perm-1', toolName: 'CustomTool', displayName: 'Custom Tool', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'tc-perm-1', invocationMessage: 'Running custom tool', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});

			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-perm-1', toolName: '', displayName: '',
					invocationMessage: 'Run custom tool', toolInput: undefined,
					confirmationTitle: 'Run custom tool', edits: undefined,
				},
				permissionKind: 'custom-tool', permissionPath: undefined,
			});

			const state = await waitForState(stateManager, () => {
				const s = stateManager.getSessionState(sessionUri.toString());
				const found = s?.activeTurn?.responseParts.find(
					rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'tc-perm-1'
				);
				return found?.kind === ResponsePartKind.ToolCall && found.toolCall.status === ToolCallStatus.PendingConfirmation ? s : undefined;
			});
			const tc = state!.activeTurn!.responseParts.find(
				rp => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === 'tc-perm-1'
			);
			assert.ok(tc && tc.kind === ResponsePartKind.ToolCall, 'tool call should exist');
			assert.strictEqual(tc.toolCall.status, ToolCallStatus.PendingConfirmation);
			assert.ok(Array.isArray(tc.toolCall.options), 'options should be an array');
			assert.deepStrictEqual(tc.toolCall.options!.map(o => o.id), ['allow-session', 'allow-once', 'skip']);
		});

		test('ChatToolCallConfirmed with allow-session adds tool to session permissions', () => {
			setupSession();
			stateManager.setSessionConfig(sessionUri.toString(), {
				schema: { type: 'object', properties: {} },
				values: {},
			});
			startTurn('turn-1', defaultChatUri);
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-perm-2', toolName: 'CustomTool', displayName: 'Custom Tool', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'tc-perm-2', invocationMessage: 'Running custom tool', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});

			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-perm-2', toolName: '', displayName: '',
					invocationMessage: 'Run custom tool', toolInput: undefined,
					confirmationTitle: 'Run custom tool', edits: undefined,
				},
				permissionKind: 'custom-tool', permissionPath: undefined,
			});

			sideEffects.handleAction(defaultChatUri, {
				type: ActionType.ChatToolCallConfirmed,
				turnId: 'turn-1',
				toolCallId: 'tc-perm-2',
				approved: true,
				confirmed: 'user-action' as const,
				selectedOptionId: 'allow-session',
			} as ChatAction);

			const updatedState = stateManager.getSessionState(sessionUri.toString());
			assert.deepStrictEqual(
				updatedState!.config!.values.permissions,
				{ allow: ['CustomTool'], deny: [] },
			);
		});

		test('subsequent tool_ready for same tool is auto-approved after allow-session permission', async () => {
			setupSession();
			stateManager.setSessionConfig(sessionUri.toString(), {
				schema: { type: 'object', properties: {} },
				values: { permissions: { allow: ['CustomTool'], deny: [] } },
			});
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-perm-3', toolName: 'CustomTool', displayName: 'Custom Tool', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'tc-perm-3', invocationMessage: 'Running custom tool', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});

			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'tc-perm-3', toolName: '', displayName: '',
					invocationMessage: 'Run custom tool', toolInput: undefined,
					confirmationTitle: 'Run custom tool', edits: undefined,
				},
				permissionKind: 'custom-tool', permissionPath: undefined,
			});

			await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || undefined);
			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'tc-perm-3', approved: true },
			]);
		});

		test('subagent tool calls inherit parent session permissions', async () => {
			setupSession();
			stateManager.setSessionConfig(sessionUri.toString(), {
				schema: { type: 'object', properties: {} },
				values: { permissions: { allow: ['CustomTool'], deny: [] } },
			});
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-parent', toolName: 'task', displayName: 'Task', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'tc-parent', invocationMessage: 'Delegating...', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});
			agent.fireProgress({
				kind: 'subagent_started', chat: URI.parse(defaultChatUri),
				toolCallId: 'tc-parent',
				agentName: 'helper',
				agentDisplayName: 'Helper',
				agentDescription: 'Helps',
			});

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri), parentToolCallId: 'tc-parent',
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'inner-perm-1', toolName: 'CustomTool', displayName: 'Custom Tool', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri), parentToolCallId: 'tc-parent',
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'inner-perm-1', invocationMessage: 'Running custom tool', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});

			agent.fireProgress({
				kind: 'pending_confirmation', chat: URI.parse(defaultChatUri),
				state: {
					status: ToolCallStatus.PendingConfirmation,
					toolCallId: 'inner-perm-1', toolName: '', displayName: '',
					invocationMessage: 'Run custom tool', toolInput: undefined,
					confirmationTitle: 'Run custom tool', edits: undefined,
				},
				permissionKind: 'custom-tool', permissionPath: undefined,
			});

			await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || undefined);
			assert.deepStrictEqual(agent.respondToPermissionCalls, [
				{ requestId: 'inner-perm-1', approved: true },
			]);
		});
	});

	// ---- Forwarding into IAgentHostChangesetService ------------------------

	suite('changeset forwarders', () => {

		test('stale tool completion does not attribute edits to the active turn', () => {
			setupSession();
			startTurn('turn-1');
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatTurnCancelled,
				turnId: 'turn-1',
				duration: 1000,
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-2',
				startedAt: '2025-01-01T00:01:00.000Z',
				message: { text: 'continue', origin: { kind: MessageKind.User } },
			});

			const changesets = new FakeChangesetService();
			const localSideEffects = createTestSideEffects(disposables, stateManager, {
				getAgent: () => agent,
				agents: agentList,
				sessionDataService: createNullSessionDataService(),
				onTurnComplete: () => { },
			}, undefined, NullTelemetryService, changesets);
			disposables.add(localSideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallComplete, turnId: 'turn-1',
					toolCallId: 'stale-tool',
					result: {
						success: true,
						pastTenseMessage: 'Wrote file',
						content: [{
							type: ToolResultContentType.FileEdit,
							after: { uri: 'file:///wd/a.ts', content: { uri: 'file:///wd/a.ts' } },
							diff: { added: 1, removed: 0 }
						}]
					},
				},
			});

			assert.deepStrictEqual({
				toolCallEdits: changesets.toolCallEdits,
				activeTurnId: stateManager.getSessionState(defaultChatUri)?.activeTurn?.id,
			}, {
				toolCallEdits: [],
				activeTurnId: 'turn-2',
			});
		});

		test('post-toolCallComplete edits fire onToolCallEditsApplied once', () => {
			setupSession();
			startTurn('turn-1');
			disposables.add(sideEffects.registerProgressListener(agent));

			const changesets = new FakeChangesetService();
			const localSideEffects = createTestSideEffects(disposables, stateManager, {
				getAgent: () => agent,
				agents: agentList,
				sessionDataService: createNullSessionDataService(),
				onTurnComplete: () => { },
			}, undefined, NullTelemetryService, changesets);
			disposables.add(localSideEffects.registerProgressListener(agent));

			// tool_start + tool_ready + tool_complete with a recorded file edit.
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallStart, turnId: 'turn-1',
					toolCallId: 'tc-edit-1', toolName: 'write', displayName: 'Write', contributor: undefined,
					_meta: { toolKind: undefined, language: undefined },
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallReady, turnId: 'turn-1',
					toolCallId: 'tc-edit-1', invocationMessage: 'Write file', toolInput: undefined,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});
			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: {
					type: ActionType.ChatToolCallComplete, turnId: 'turn-1',
					toolCallId: 'tc-edit-1',
					result: {
						success: true,
						pastTenseMessage: 'wrote',
						content: [{
							type: ToolResultContentType.FileEdit,
							after: { uri: 'file:///wd/a.ts', content: { uri: 'file:///wd/a.ts' } },
							diff: { added: 1, removed: 0 }
						}]
					},
				},
			});

			assert.deepStrictEqual(changesets.toolCallEdits, [{ session: sessionUri.toString(), turnId: 'turn-1' }]);
		});

		test('turn complete fires onTurnComplete once with the right turn id', async () => {
			setupSession();
			startTurn('turn-1');

			const changesets = new FakeChangesetService();
			const localSideEffects = createTestSideEffects(disposables, stateManager, {
				getAgent: () => agent,
				agents: agentList,
				sessionDataService: createNullSessionDataService(),
				onTurnComplete: () => { },
			}, undefined, NullTelemetryService, changesets);
			disposables.add(localSideEffects.registerProgressListener(agent));

			agent.fireProgress({
				kind: 'action', resource: URI.parse(defaultChatUri),
				action: { type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 },
			});

			// `_runTurnCompleteSideEffects` now defers the
			// `changesets.onTurnComplete` call behind the checkpoint capture
			// promise (`captureTurnCheckpoint(...).then(...)`). Yield a
			// microtask so the resolved promise's `.then` continuation
			// runs before we assert.
			await Promise.resolve();

			assert.deepStrictEqual(changesets.turnCompletes, [{ session: sessionUri.toString(), turnId: 'turn-1' }]);
		});

		test('ChatTruncated fires onSessionTruncated once', () => {
			setupSession();

			const changesets = new FakeChangesetService();
			const localSideEffects = createTestSideEffects(disposables, stateManager, {
				getAgent: () => agent,
				agents: agentList,
				sessionDataService: createNullSessionDataService(),
				onTurnComplete: () => { },
			}, undefined, NullTelemetryService, changesets);

			localSideEffects.handleAction(defaultChatUri, {
				type: ActionType.ChatTruncated,
				turnId: 'turn-1',
			});

			assert.deepStrictEqual(changesets.truncates, [sessionUri.toString()]);
		});

		test('truncating a chat forwards that chat to the agent (default and peer)', () => {
			setupSession();
			const peerChatUri = buildChatUri(sessionUri.toString(), 'peer-1');

			// Peer chat: the chat URI is forwarded so the agent targets that
			// chat's own backing rather than the session's default chat.
			sideEffects.handleAction(peerChatUri, { type: ActionType.ChatTruncated, turnId: 'turn-peer' });
			const peerCall = agent.truncateSessionCalls.at(-1);

			// Default chat: forwarded as the session's default chat URI.
			sideEffects.handleAction(defaultChatUri, { type: ActionType.ChatTruncated, turnId: 'turn-default' });
			const defaultCall = agent.truncateSessionCalls.at(-1);

			assert.deepStrictEqual({
				peerSession: peerCall?.session.toString(),
				peerTurnId: peerCall?.turnId,
				peerChat: peerCall?.chat?.toString(),
				defaultTurnId: defaultCall?.turnId,
				defaultChat: defaultCall?.chat?.toString(),
			}, {
				peerSession: sessionUri.toString(),
				peerTurnId: 'turn-peer',
				peerChat: peerChatUri,
				defaultTurnId: 'turn-default',
				defaultChat: defaultChatUri,
			});
		});
	});

});
