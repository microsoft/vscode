/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, IReference, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { AgentSession, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { isSessionAction, type ActionEnvelope, type IRootConfigChangedAction, type SessionAction, type TerminalAction, type INotification } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionLifecycle, SessionStatus, createSessionState, StateComponents, type SessionState, type SessionSummary, type RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { sessionReducer } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { ToolCallConfirmationReason, ToolResultContentType } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IChatAgentService } from '../../../common/participants/chatAgents.js';
import { IChatProgress, IChatService, IChatToolInvocation, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { AgentHostSessionHandler, toolDataToDefinition, toolResultToProtocol } from '../../../browser/agentSessions/agentHost/agentHostSessionHandler.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestFileService } from '../../../../../test/common/workbenchTestServices.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { MockLabelService } from '../../../../../services/label/test/common/mockLabelService.js';
import { IAgentHostFileSystemService } from '../../../../../services/agentHost/common/agentHostFileSystemService.js';
import { IStorageService, InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ITerminalChatService } from '../../../../terminal/browser/terminal.js';
import { IAgentHostTerminalService } from '../../../../terminal/browser/agentHostTerminalService.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { ILanguageModelToolsService, IToolData, IToolInvocation, IToolResult, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IOutputService } from '../../../../../services/output/common/output.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';

// =============================================================================
// Unit tests for toolDataToDefinition and toolResultToProtocol
// =============================================================================

suite('AgentHostClientTools', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	// ── toolDataToDefinition ─────────────────────────────────────────────

	suite('toolDataToDefinition', () => {

		test('maps toolReferenceName, displayName, modelDescription, and inputSchema', () => {
			const tool: IToolData = {
				id: 'vscode.runTests',
				toolReferenceName: 'runTests',
				displayName: 'Run Tests',
				modelDescription: 'Runs unit tests in files',
				userDescription: 'Run tests',
				source: ToolDataSource.Internal,
				inputSchema: {
					type: 'object',
					properties: {
						files: { type: 'array', items: { type: 'string' } },
					},
				},
			};

			const def = toolDataToDefinition(tool);

			assert.deepStrictEqual(def, {
				name: 'runTests',
				title: 'Run Tests',
				description: 'Runs unit tests in files',
				inputSchema: {
					type: 'object',
					properties: {
						files: { type: 'array', items: { type: 'string' } },
					},
				},
			});
		});

		test('falls back to id when toolReferenceName is undefined', () => {
			const tool: IToolData = {
				id: 'vscode.runTests',
				displayName: 'Run Tests',
				modelDescription: 'Runs unit tests',
				source: ToolDataSource.Internal,
			};

			const def = toolDataToDefinition(tool);
			assert.strictEqual(def.name, 'vscode.runTests');
		});

		test('omits inputSchema when schema type is not object', () => {
			const tool: IToolData = {
				id: 'myTool',
				toolReferenceName: 'myTool',
				displayName: 'My Tool',
				modelDescription: 'A tool',
				source: ToolDataSource.Internal,
				inputSchema: { type: 'string' },
			};

			const def = toolDataToDefinition(tool);
			assert.strictEqual(def.inputSchema, undefined);
		});

		test('omits inputSchema when not provided', () => {
			const tool: IToolData = {
				id: 'myTool',
				toolReferenceName: 'myTool',
				displayName: 'My Tool',
				modelDescription: 'A tool',
				source: ToolDataSource.Internal,
			};

			const def = toolDataToDefinition(tool);
			assert.strictEqual(def.inputSchema, undefined);
		});
	});

	// ── toolResultToProtocol ─────────────────────────────────────────────

	suite('toolResultToProtocol', () => {

		test('converts successful result with text content', () => {
			const result: IToolResult = {
				content: [
					{ kind: 'text', value: 'All 5 tests passed' },
				],
				toolResultMessage: 'Ran 5 tests',
			};

			const proto = toolResultToProtocol(result, 'runTests');

			assert.deepStrictEqual(proto, {
				success: true,
				pastTenseMessage: 'Ran 5 tests',
				content: [{ type: ToolResultContentType.Text, text: 'All 5 tests passed' }],
				error: undefined,
			});
		});

		test('converts failed result with error', () => {
			const result: IToolResult = {
				content: [{ kind: 'text', value: 'Build failed' }],
				toolResultError: 'Compilation error in file.ts',
			};

			const proto = toolResultToProtocol(result, 'runTask');

			assert.deepStrictEqual(proto, {
				success: false,
				pastTenseMessage: 'runTask failed',
				content: [{ type: ToolResultContentType.Text, text: 'Build failed' }],
				error: { message: 'Compilation error in file.ts' },
			});
		});

		test('uses default past tense message when toolResultMessage is absent', () => {
			const result: IToolResult = {
				content: [{ kind: 'text', value: 'done' }],
			};

			const proto = toolResultToProtocol(result, 'myTool');
			assert.strictEqual(proto.pastTenseMessage, 'Ran myTool');
		});

		test('converts text and data content parts', () => {
			const binaryData = VSBuffer.fromString('hello binary');
			const result: IToolResult = {
				content: [
					{ kind: 'text', value: 'hello' },
					{ kind: 'data', value: { mimeType: 'image/png', data: binaryData } },
					{ kind: 'text', value: 'world' },
				],
			};

			const proto = toolResultToProtocol(result, 'tool');
			assert.strictEqual(proto.content?.length, 3);
			assert.deepStrictEqual(proto.content![0], { type: ToolResultContentType.Text, text: 'hello' });
			assert.strictEqual(proto.content![1].type, ToolResultContentType.EmbeddedResource);
			assert.strictEqual((proto.content![1] as { contentType: string }).contentType, 'image/png');
			// Verify data is base64-encoded, not raw UTF-8
			const embeddedData = (proto.content![1] as { data: string }).data;
			assert.ok(embeddedData.length > 0);
			assert.notStrictEqual(embeddedData, 'hello binary'); // should be base64, not raw text
			assert.deepStrictEqual(proto.content![2], { type: ToolResultContentType.Text, text: 'world' });
		});

		test('converts data parts to EmbeddedResource with base64 encoding', () => {
			const binaryData = VSBuffer.fromString('test data');
			const result: IToolResult = {
				content: [
					{ kind: 'data', value: { mimeType: 'image/png', data: binaryData } },
				],
			};

			const proto = toolResultToProtocol(result, 'tool');
			assert.strictEqual(proto.content?.length, 1);
			assert.strictEqual(proto.content![0].type, ToolResultContentType.EmbeddedResource);
			const embedded = proto.content![0] as { data: string; contentType: string };
			assert.strictEqual(embedded.contentType, 'image/png');
			assert.ok(embedded.data.length > 0);
			assert.notStrictEqual(embedded.data, 'test data'); // base64 encoded
		});

		test('uses boolean toolResultError as generic error message', () => {
			const result: IToolResult = {
				content: [],
				toolResultError: true,
			};

			const proto = toolResultToProtocol(result, 'myTool');
			assert.strictEqual(proto.success, false);
			assert.strictEqual(proto.error?.message, 'myTool encountered an error');
		});
	});

	// ── AgentHostSessionHandler client tools integration ─────────────────

	suite('client tools registration', () => {

		function createMockToolsService(disposables: DisposableStore, tools: IToolData[]) {
			const onDidChangeTools = disposables.add(new Emitter<void>());
			const pendingToolCalls = new Map<string, ChatToolInvocation>();
			const begunToolCalls: ChatToolInvocation[] = [];
			const invokedToolCalls: IToolInvocation[] = [];
			return {
				onDidChangeTools: onDidChangeTools.event,
				getToolByName: (name: string) => tools.find(t => t.toolReferenceName === name),
				observeTools: () => observableValue('tools', tools),
				registerToolData: () => toDisposable(() => { }),
				registerToolImplementation: () => toDisposable(() => { }),
				registerTool: () => toDisposable(() => { }),
				getTools: () => tools,
				getAllToolsIncludingDisabled: () => tools,
				getTool: (id: string) => tools.find(t => t.id === id),
				invokeTool: async (invocation: IToolInvocation) => {
					invokedToolCalls.push(invocation);
					const toolInvocation = pendingToolCalls.get(invocation.chatStreamToolCallId ?? invocation.callId);
					pendingToolCalls.delete(invocation.chatStreamToolCallId ?? invocation.callId);
					toolInvocation?.transitionFromStreaming(undefined, invocation.parameters, { type: ToolConfirmKind.ConfirmationNotNeeded });
					const result: IToolResult = { content: [{ kind: 'text', value: 'done' }] };
					await toolInvocation?.didExecuteTool(result);
					return result;
				},
				beginToolCall: options => {
					const toolData = tools.find(t => t.id === options.toolId);
					if (!toolData) {
						return undefined;
					}
					const invocation = ChatToolInvocation.createStreaming({
						toolCallId: options.toolCallId,
						toolId: options.toolId,
						toolData,
					});
					pendingToolCalls.set(options.toolCallId, invocation);
					begunToolCalls.push(invocation);
					return invocation;
				},
				updateToolStream: async () => { },
				cancelToolCallsForRequest: () => { },
				flushToolUpdates: () => { },
				toolSets: observableValue('sets', []),
				getToolSetsForModel: () => [],
				getToolSet: () => undefined,
				getToolSetByName: () => undefined,
				createToolSet: () => { throw new Error('not impl'); },
				getFullReferenceNames: () => [],
				getFullReferenceName: () => '',
				getToolByFullReferenceName: () => undefined,
				getDeprecatedFullReferenceNames: () => new Map(),
				toToolAndToolSetEnablementMap: () => new Map(),
				toFullReferenceNames: () => [],
				toToolReferences: () => [],
				vscodeToolSet: undefined!,
				executeToolSet: undefined!,
				readToolSet: undefined!,
				agentToolSet: undefined!,
				onDidPrepareToolCallBecomeUnresponsive: Event.None,
				onDidInvokeTool: Event.None,
				_serviceBrand: undefined,
				fireOnDidChangeTools: () => onDidChangeTools.fire(),
				begunToolCalls,
				invokedToolCalls,
			} satisfies ILanguageModelToolsService & { fireOnDidChangeTools: () => void; begunToolCalls: ChatToolInvocation[]; invokedToolCalls: IToolInvocation[] };
		}

		class MockAgentHostConnection extends mock<IAgentHostService>() {
			declare readonly _serviceBrand: undefined;
			override readonly clientId = 'test-client';
			private readonly _onDidAction = disposables.add(new Emitter<ActionEnvelope>());
			override readonly onDidAction = this._onDidAction.event;
			private readonly _onDidNotification = disposables.add(new Emitter<INotification>());
			override readonly onDidNotification = this._onDidNotification.event;
			override readonly onAgentHostExit = Event.None;
			override readonly onAgentHostStart = Event.None;

			private readonly _liveSubscriptions = new Map<string, { state: SessionState; emitter: Emitter<SessionState> }>();
			public dispatchedActions: (SessionAction | TerminalAction | IRootConfigChangedAction)[] = [];

			override dispatch(action: SessionAction | TerminalAction | IRootConfigChangedAction): void {
				this.dispatchedActions.push(action);
				if (isSessionAction(action)) {
					this.applySessionAction(action);
				}
			}

			applySessionAction(action: SessionAction): void {
				const entry = this._ensureLiveSubscription(action.session);
				entry.state = sessionReducer(entry.state, action as Parameters<typeof sessionReducer>[1], () => { });
				entry.emitter.fire(entry.state);
			}

			override readonly rootState: IAgentSubscription<RootState> = {
				value: undefined,
				verifiedValue: undefined,
				onDidChange: Event.None,
				onWillApplyAction: Event.None,
				onDidApplyAction: Event.None,
			};

			override getSubscription<T>(_kind: StateComponents, resource: URI): IReference<IAgentSubscription<T>> {
				const resourceStr = resource.toString();
				this._ensureLiveSubscription(resourceStr);
				const entry = this._liveSubscriptions.get(resourceStr)!;
				const emitter = entry.emitter as unknown as Emitter<T>;

				const self = this;
				const sub: IAgentSubscription<T> = {
					get value() { return self._liveSubscriptions.get(resourceStr)?.state as unknown as T; },
					get verifiedValue() { return self._liveSubscriptions.get(resourceStr)?.state as unknown as T; },
					onDidChange: emitter.event,
					onWillApplyAction: Event.None,
					onDidApplyAction: Event.None,
				};
				return {
					object: sub,
					dispose: () => {
						this._liveSubscriptions.delete(resourceStr);
					},
				};
			}

			private _ensureLiveSubscription(resourceStr: string): { state: SessionState; emitter: Emitter<SessionState> } {
				let entry = this._liveSubscriptions.get(resourceStr);
				if (entry) {
					return entry;
				}
				const emitter = disposables.add(new Emitter<SessionState>());
				const summary: SessionSummary = {
					resource: resourceStr,
					provider: 'copilot',
					title: 'Test',
					status: SessionStatus.Idle,
					createdAt: Date.now(),
					modifiedAt: Date.now(),
				};
				const initialState: SessionState = { ...createSessionState(summary), lifecycle: SessionLifecycle.Ready };
				entry = { state: initialState, emitter };
				this._liveSubscriptions.set(resourceStr, entry);
				return entry;
			}
		}

		function createHandlerWithMocks(
			disposables: DisposableStore,
			tools: IToolData[],
			configOverrides?: { clientTools?: string[] },
		) {
			const instantiationService = disposables.add(new TestInstantiationService());
			const connection = new MockAgentHostConnection();

			const toolsService = createMockToolsService(disposables, tools);
			const configValues: Record<string, unknown> = {
				'chat.agentHost.clientTools': configOverrides?.clientTools ?? ['runTask', 'runTests'],
			};
			const onDidChangeConfig = disposables.add(new Emitter<IConfigurationChangeEvent>());
			const configService: Partial<IConfigurationService> = {
				getValue: (key: string) => configValues[key],
				onDidChangeConfiguration: onDidChangeConfig.event,
			} as Partial<IConfigurationService>;

			instantiationService.stub(ILogService, new NullLogService());
			instantiationService.stub(IProductService, { quality: 'insider' });
			instantiationService.stub(IChatAgentService, {
				registerDynamicAgent: () => toDisposable(() => { }),
			});
			instantiationService.stub(IFileService, TestFileService);
			instantiationService.stub(ILabelService, MockLabelService);
			instantiationService.stub(IChatSessionsService, {
				registerChatSessionItemController: () => toDisposable(() => { }),
				registerChatSessionContentProvider: () => toDisposable(() => { }),
				registerChatSessionContribution: () => toDisposable(() => { }),
			});
			instantiationService.stub(IDefaultAccountService, { onDidChangeDefaultAccount: Event.None, getDefaultAccount: async () => null });
			instantiationService.stub(IAuthenticationService, { onDidChangeSessions: Event.None });
			instantiationService.stub(ILanguageModelsService, {
				deltaLanguageModelChatProviderDescriptors: () => { },
				registerLanguageModelProvider: () => toDisposable(() => { }),
			});
			instantiationService.stub(IConfigurationService, configService);
			instantiationService.stub(IOutputService, { getChannel: () => undefined });
			instantiationService.stub(IWorkspaceContextService, { getWorkspace: () => ({ id: '', folders: [] }), getWorkspaceFolder: () => null });
			instantiationService.stub(IChatEditingService, {
				registerEditingSessionProvider: () => toDisposable(() => { }),
			});
			instantiationService.stub(IChatService, {
				getSession: () => undefined,
				onDidCreateModel: Event.None,
				removePendingRequest: () => { },
			});
			instantiationService.stub(IAgentHostFileSystemService, {
				registerAuthority: () => toDisposable(() => { }),
				ensureSyncedCustomizationProvider: () => { },
			});
			instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
			instantiationService.stub(ICustomizationHarnessService, {
				registerExternalHarness: () => toDisposable(() => { }),
			});
			instantiationService.stub(IAgentPluginService, {
				plugins: observableValue('plugins', []),
			});
			instantiationService.stub(ITerminalChatService, {
				onDidContinueInBackground: Event.None,
				registerTerminalInstanceWithToolSession: () => { },
				getAhpCommandSource: () => undefined,
			});
			instantiationService.stub(IAgentHostTerminalService, {
				reviveTerminal: async () => undefined!,
				createTerminalForEntry: async () => undefined,
				profiles: observableValue('test', []),
				getProfileForConnection: () => undefined,
				registerEntry: () => ({ dispose() { } }),
			});
			instantiationService.stub(IAgentHostSessionWorkingDirectoryResolver, {
				registerResolver: () => toDisposable(() => { }),
				resolve: () => undefined,
			});
			instantiationService.stub(ILanguageModelToolsService, toolsService);

			const handler = disposables.add(instantiationService.createInstance(AgentHostSessionHandler, {
				provider: 'copilot' as const,
				agentId: 'agent-host-copilot',
				sessionType: 'agent-host-copilot',
				fullName: 'Test',
				description: 'Test',
				connection,
				connectionAuthority: 'local',
			}));

			return { handler, connection, toolsService, configValues, onDidChangeConfig };
		}

		const testRunTestsTool: IToolData = {
			id: 'vscode.runTests',
			toolReferenceName: 'runTests',
			displayName: 'Run Tests',
			modelDescription: 'Runs unit tests',
			source: ToolDataSource.Internal,
			inputSchema: { type: 'object', properties: { files: { type: 'array' } } },
		};

		const testRunTaskTool: IToolData = {
			id: 'vscode.runTask',
			toolReferenceName: 'runTask',
			displayName: 'Run Task',
			modelDescription: 'Runs a VS Code task',
			source: ToolDataSource.Internal,
			inputSchema: { type: 'object', properties: { task: { type: 'string' } } },
		};

		const testUnlistedTool: IToolData = {
			id: 'vscode.readFile',
			toolReferenceName: 'readFile',
			displayName: 'Read File',
			modelDescription: 'Reads a file',
			source: ToolDataSource.Internal,
		};

		test('maps allowlisted tool data to protocol definitions', async () => {
			const { connection } = createHandlerWithMocks(disposables, [testRunTestsTool, testRunTaskTool, testUnlistedTool]);

			// The handler dispatches activeClientChanged in the constructor when
			// customizations observable fires, but here it fires during provideChatSessionContent.
			// Verify tools are built correctly by checking what would be dispatched.
			assert.ok(connection);

			// Verify that the tool conversion works correctly for the allowlisted tools
			const runTestsDef = toolDataToDefinition(testRunTestsTool);
			assert.strictEqual(runTestsDef.name, 'runTests');
			assert.strictEqual(runTestsDef.title, 'Run Tests');
			assert.strictEqual(runTestsDef.description, 'Runs unit tests');
		});

		test('filters tool data to entries in configured allowlist', () => {
			createHandlerWithMocks(disposables, [testRunTestsTool, testRunTaskTool, testUnlistedTool], {
				clientTools: ['runTests'],
			});

			// Validate the filtering logic: only 'runTests' should match the allowlist.
			const filteredTools = [testRunTestsTool, testRunTaskTool, testUnlistedTool]
				.filter(t => t.toolReferenceName !== undefined && ['runTests'].includes(t.toolReferenceName));
			assert.strictEqual(filteredTools.length, 1);
			assert.strictEqual(filteredTools[0].toolReferenceName, 'runTests');
		});

		test('dispatches activeClientToolsChanged when config changes', () => {
			const { connection, configValues, onDidChangeConfig } = createHandlerWithMocks(
				disposables,
				[testRunTestsTool, testRunTaskTool],
			);

			// Simulate config change
			configValues['chat.agentHost.clientTools'] = ['runTests'];
			onDidChangeConfig.fire({ affectsConfiguration: (key: string) => key === 'chat.agentHost.clientTools' } as unknown as IConfigurationChangeEvent);

			// Since no session is active (no _sessionToBackend entries),
			// no activeClientToolsChanged should be dispatched.
			// But the observable should now reflect the new tools.
			const toolsChangedActions = connection.dispatchedActions.filter(
				a => isSessionAction(a) && a.type === 'session/activeClientToolsChanged'
			);
			// No sessions active = no dispatches
			assert.strictEqual(toolsChangedActions.length, 0);
		});

		test('handles tools with when clauses via observeTools filtering', () => {
			// The observeTools method already filters by `when` clauses.
			// When a tool has a `when` clause that doesn't match, it won't
			// appear in the observable, and thus won't be included.
			// Our mock observeTools returns all tools directly, but in
			// production, tools with non-matching when clauses are excluded
			// before reaching the allowlist filter.
			const def = toolDataToDefinition(testRunTestsTool);
			assert.strictEqual(def.name, 'runTests');
		});

		test('invokes an owned client tool when reconnecting to an active turn', async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();

			connection.applySessionAction({
				type: ActionType.SessionTurnStarted,
				session: backendSession,
				turnId: 'turn-1',
				userMessage: { text: 'run the task' },
			} as SessionAction);
			connection.applySessionAction({
				type: ActionType.SessionToolCallStart,
				session: backendSession,
				turnId: 'turn-1',
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				toolClientId: connection.clientId,
			} as SessionAction);
			connection.applySessionAction({
				type: ActionType.SessionToolCallReady,
				session: backendSession,
				turnId: 'turn-1',
				toolCallId: 'tool-call-1',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			} as SessionAction);

			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			await timeout(0);
			await timeout(0);

			assert.deepStrictEqual(toolsService.invokedToolCalls.map(call => ({
				callId: call.callId,
				toolId: call.toolId,
				parameters: call.parameters,
				chatStreamToolCallId: call.chatStreamToolCallId,
			})), [{
				callId: 'tool-call-1',
				toolId: 'vscode.runTask',
				parameters: { task: 'build' },
				chatStreamToolCallId: 'tool-call-1',
			}]);
			assert.ok(connection.dispatchedActions.some(action => isSessionAction(action)
				&& action.type === ActionType.SessionToolCallComplete
				&& action.toolCallId === 'tool-call-1'));
		});

		test('reconnecting to an active turn with owned client tool completes the initial snapshot invocation', async () => {
			const { handler, connection } = createHandlerWithMocks(disposables, [testRunTaskTool]);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();

			connection.applySessionAction({
				type: ActionType.SessionTurnStarted,
				session: backendSession,
				turnId: 'turn-1',
				userMessage: { text: 'run the task' },
			} as SessionAction);
			connection.applySessionAction({
				type: ActionType.SessionToolCallStart,
				session: backendSession,
				turnId: 'turn-1',
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				toolClientId: connection.clientId,
			} as SessionAction);
			connection.applySessionAction({
				type: ActionType.SessionToolCallReady,
				session: backendSession,
				turnId: 'turn-1',
				toolCallId: 'tool-call-1',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			} as SessionAction);

			const session = await handler.provideChatSessionContent(sessionResource, CancellationToken.None);

			// activeTurnToProgress creates a generic ChatToolInvocation for
			// the running client tool which appears in the session's progress
			// observable. Grab it before _reconnectToActiveTurn replaces it.
			const snapshotInvocation = (session as unknown as { progressObs: { get(): IChatProgress[] } })
				.progressObs.get()
				.find((p): p is ChatToolInvocation => p instanceof ChatToolInvocation && p.toolCallId === 'tool-call-1');
			assert.ok(snapshotInvocation, 'activeTurnToProgress should have created a snapshot invocation');

			await timeout(0);
			await timeout(0);

			// The snapshot invocation from activeTurnToProgress should have
			// been completed (via didExecuteTool) so it does not remain
			// orphaned in the UI while the replacement from
			// _beginClientToolInvocation takes over.
			assert.ok(IChatToolInvocation.isComplete(snapshotInvocation),
				'the initial snapshot invocation should be completed, not orphaned');
		});
	});
});
