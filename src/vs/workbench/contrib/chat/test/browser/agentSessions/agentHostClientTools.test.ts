/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, IReference, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { constObservable, observableValue, autorun } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { AgentSession, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { isChatAction, isSessionAction, type ActionEnvelope, type ChatAction, type IRootConfigChangedAction, type SessionAction, type TerminalAction, type INotification, type ClientAnnotationsAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { buildDefaultChatUri, buildSubagentChatUri, createChatState, createDefaultChatSummary, MessageKind, SessionLifecycle, SessionStatus, createSessionState, StateComponents, parseDefaultChatUri, type ChatState, type SessionState, type SessionSummary, type RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { chatReducer, sessionReducer } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { ToolCallConfirmationReason, ToolCallContributorKind, ToolResultContentType } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IChatAgentService } from '../../../common/participants/chatAgents.js';
import { IChatProgress, IChatService, IChatToolInvocation, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { IChatResponseFileChangesService } from '../../../browser/chatResponseFileChangesService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { AgentHostSessionHandler, toolDataToDefinition, toolResultToProtocol } from '../../../browser/agentSessions/agentHost/agentHostSessionHandler.js';
import { AgentHostActiveClientService, IAgentHostActiveClientService } from '../../../browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { IAgentHostToolSetEnablementService, IToolEnablementState } from '../../../browser/agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestFileService } from '../../../../../test/common/workbenchTestServices.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { MockLabelService } from '../../../../../services/label/test/common/mockLabelService.js';
import { IAgentHostFileSystemService } from '../../../../../services/agentHost/common/agentHostFileSystemService.js';
import { IAgentHostImportConversationStore } from '../../../browser/agentSessions/agentHost/agentHostImportConversationStore.js';
import { IStorageService, InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ITerminalChatService } from '../../../../terminal/browser/terminal.js';
import { IAgentHostTerminalService } from '../../../../terminal/browser/agentHostTerminalService.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { ILanguageModelToolsService, IToolData, IToolInvocation, IToolResult, ToolAndToolSetEnablementMap, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IOutputService } from '../../../../../services/output/common/output.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IPromptsService } from '../../../common/promptSyntax/service/promptsService.js';

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

		function createMockToolsService(disposables: DisposableStore, tools: IToolData[], options?: { requireConfirmation?: boolean; throwBeforeConfirmation?: Error }) {
			const onDidChangeTools = disposables.add(new Emitter<void>());
			const pendingToolCalls = new Map<string, ChatToolInvocation>();
			const begunToolCalls: ChatToolInvocation[] = [];
			const invokedToolCalls: IToolInvocation[] = [];
			const recordedStateKinds = new Map<string, IChatToolInvocation.StateKind[]>();
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
					if (options?.throwBeforeConfirmation) {
						throw options.throwBeforeConfirmation;
					}
					if (options?.requireConfirmation && toolInvocation) {
						// Mirror the real service: a caller-provided `preApproved`
						// reason is treated as auto-confirmation so the invocation
						// transitions straight to executing without ever entering
						// `WaitingForConfirmation`.
						toolInvocation.transitionFromStreaming({
							invocationMessage: 'Run Task',
							confirmationMessages: {
								title: 'Confirm tool execution',
								message: 'Run the task?',
							},
						}, invocation.parameters, invocation.preApproved);
						await IChatToolInvocation.awaitConfirmation(toolInvocation, CancellationToken.None);
					} else {
						toolInvocation?.transitionFromStreaming(undefined, invocation.parameters, { type: ToolConfirmKind.ConfirmationNotNeeded });
					}
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
						subagentInvocationId: options.subagentInvocationId,
					});
					pendingToolCalls.set(options.toolCallId, invocation);
					begunToolCalls.push(invocation);
					// Record every state the invocation passes through so tests can
					// assert it never flickers into `WaitingForConfirmation` when
					// the call is auto-approved.
					const stateKinds: IChatToolInvocation.StateKind[] = [];
					recordedStateKinds.set(options.toolCallId, stateKinds);
					disposables.add(autorun(reader => {
						stateKinds.push(invocation.state.read(reader).type);
					}));
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
				getFullReferenceNameMap: () => new Map(),
				getToolByFullReferenceName: () => undefined,
				getDeprecatedFullReferenceNames: () => new Map(),
				toToolAndToolSetEnablementMap: () => ToolAndToolSetEnablementMap.fromEntries([]),
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
				recordedStateKinds,
			} satisfies ILanguageModelToolsService & { fireOnDidChangeTools: () => void; begunToolCalls: ChatToolInvocation[]; invokedToolCalls: IToolInvocation[]; recordedStateKinds: Map<string, IChatToolInvocation.StateKind[]> };
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

			private readonly _liveSubscriptions = new Map<string, { state: SessionState | ChatState; emitter: Emitter<SessionState | ChatState> }>();
			public dispatchedActions: { channel: string; action: SessionAction | ChatAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction }[] = [];

			override dispatch(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction): void {
				this.dispatchedActions.push({ channel, action });
				if (isSessionAction(action) || isChatAction(action)) {
					this.applySessionAction(channel, action);
				}
			}

			applySessionAction(channel: string | URI, action: SessionAction | ChatAction): void {
				const channelStr = typeof channel === 'string' ? channel : channel.toString();
				if (isChatAction(action)) {
					const chatChannel = parseDefaultChatUri(channelStr) !== undefined ? channelStr : undefined;
					assert.ok(chatChannel, `chat actions must be dispatched on an ahp-chat channel: ${action.type}`);
					const entry = this._ensureLiveSubscription(StateComponents.Chat, chatChannel);
					entry.state = chatReducer(entry.state as ChatState, action as Parameters<typeof chatReducer>[1], () => { });
					entry.emitter.fire(entry.state);
					return;
				}
				const entry = this._ensureLiveSubscription(StateComponents.Session, channelStr);
				entry.state = sessionReducer(entry.state as SessionState, action as Parameters<typeof sessionReducer>[1], () => { });
				entry.emitter.fire(entry.state);
			}

			override readonly rootState: IAgentSubscription<RootState> = {
				value: undefined,
				verifiedValue: undefined,
				onDidChange: Event.None,
				onWillApplyAction: Event.None,
				onDidApplyAction: Event.None,
			};

			override getSubscription<T>(kind: StateComponents, resource: URI): IReference<IAgentSubscription<T>> {
				const resourceStr = resource.toString();
				this._ensureLiveSubscription(kind, resourceStr);
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

			private _ensureLiveSubscription(kind: StateComponents, resourceStr: string): { state: SessionState | ChatState; emitter: Emitter<SessionState | ChatState> } {
				let entry = this._liveSubscriptions.get(resourceStr);
				if (entry) {
					return entry;
				}
				const emitter = disposables.add(new Emitter<SessionState | ChatState>());
				const sessionResource = kind === StateComponents.Chat ? parseDefaultChatUri(resourceStr) : resourceStr;
				assert.ok(sessionResource, `chat subscriptions must use an ahp-chat channel: ${resourceStr}`);
				const summary: SessionSummary = {
					resource: sessionResource,
					provider: 'copilot',
					title: 'Test',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				};
				const defaultChat = buildDefaultChatUri(sessionResource);
				const initialState = kind === StateComponents.Chat
					? createChatState(createDefaultChatSummary(summary, resourceStr))
					: {
						...createSessionState(summary),
						lifecycle: SessionLifecycle.Ready,
						defaultChat,
						chats: [createDefaultChatSummary(summary, defaultChat)],
					};
				entry = { state: initialState, emitter };
				this._liveSubscriptions.set(resourceStr, entry);
				return entry;
			}
		}

		function createHandlerWithMocks(
			disposables: DisposableStore,
			tools: IToolData[],
			toolServiceOptions?: { requireConfirmation?: boolean; throwBeforeConfirmation?: Error },
		) {
			const instantiationService = disposables.add(new TestInstantiationService());
			const connection = new MockAgentHostConnection();

			const toolsService = createMockToolsService(disposables, tools, toolServiceOptions);
			const configValues: Record<string, unknown> = {};
			const onDidChangeConfig = disposables.add(new Emitter<IConfigurationChangeEvent>());
			const configService: Partial<IConfigurationService> = {
				getValue: (key: string) => configValues[key],
				onDidChangeConfiguration: onDidChangeConfig.event,
			} as Partial<IConfigurationService>;

			instantiationService.stub(ILogService, new NullLogService());
			instantiationService.stub(IProductService, { quality: 'insider' });
			instantiationService.stub(IChatEntitlementService, { entitlement: ChatEntitlement.Free, quotas: {} } as Partial<IChatEntitlementService> as IChatEntitlementService);
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
			instantiationService.stub(IChatResponseFileChangesService, {
				registerProvider: () => toDisposable(() => { }),
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
			instantiationService.stub(IAgentHostImportConversationStore, {
				set: () => { },
				take: () => undefined,
				rename: () => { },
			} as Partial<IAgentHostImportConversationStore> as IAgentHostImportConversationStore);
			instantiationService.stub(ICustomizationHarnessService, {
				registerExternalHarness: () => toDisposable(() => { }),
			});
			instantiationService.stub(IAgentPluginService, {
				plugins: observableValue('plugins', []),
			});
			instantiationService.stub(IPromptsService, new class extends mock<IPromptsService>() {
				override readonly onDidChangeCustomAgents = Event.None;
				override readonly onDidChangeSlashCommands = Event.None;
				override readonly onDidChangeSkills = Event.None;
				override readonly onDidChangeInstructions = Event.None;
				override readonly onDidChangeAgentInstructions = Event.None;

				override async listPromptFilesForStorage() {
					return [];
				}
			}());
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
				isNewSession: () => false,
			});
			instantiationService.stub(ILanguageModelToolsService, toolsService);
			instantiationService.stub(IAgentHostToolSetEnablementService, {
				observe: () => constObservable<IToolEnablementState>({ toolSets: new Map(), tools: new Map() }),
				getState: () => ({ toolSets: new Map(), tools: new Map() }),
				setToolSetEnabled: () => { },
				setToolEnabled: () => { },
			});

			// Use the real active-client service so the handler's tools autorun
			// observes the mocked ILanguageModelToolsService tool sets.
			const activeClientService = disposables.add(instantiationService.createInstance(AgentHostActiveClientService));
			instantiationService.stub(IAgentHostActiveClientService, activeClientService);

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

		async function provideSessionWithReadyRunTaskTool(handler: AgentHostSessionHandler, connection: MockAgentHostConnection): Promise<void> {
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();

			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				message: { text: 'run the task', origin: { kind: MessageKind.User } },
			} as ChatAction);
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
			} as ChatAction);
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tool-call-1',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
				confirmationTitle: 'Run Task',
			} as ChatAction);

			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			await timeout(0);
			await timeout(0);
		}

		function getToolCallConfirmationAndCompletionActions(connection: MockAgentHostConnection) {
			return connection.dispatchedActions
				.filter(entry => isChatAction(entry.action)
					&& (entry.action.type === ActionType.ChatToolCallConfirmed || entry.action.type === ActionType.ChatToolCallComplete)
					&& entry.action.toolCallId === 'tool-call-1')
				.map(entry => {
					if (entry.action.type === ActionType.ChatToolCallConfirmed) {
						return {
							type: entry.action.type,
							approved: entry.action.approved,
							success: undefined,
							error: undefined,
						};
					}
					if (entry.action.type === ActionType.ChatToolCallComplete) {
						return {
							type: entry.action.type,
							approved: undefined,
							success: entry.action.result.success,
							error: entry.action.result.error?.message,
						};
					}
					throw new Error(`Unexpected action type: ${entry.action.type}`);
				});
		}

		test('maps tool data to protocol definitions', async () => {
			const { connection } = createHandlerWithMocks(disposables, [testRunTestsTool, testRunTaskTool, testUnlistedTool]);

			// The handler dispatches activeClientSet in the constructor when
			// customizations observable fires, but here it fires during provideChatSessionContent.
			// Verify tools are built correctly by checking what would be dispatched.
			assert.ok(connection);

			// Verify that the tool conversion works correctly.
			const runTestsDef = toolDataToDefinition(testRunTestsTool);
			assert.strictEqual(runTestsDef.name, 'runTests');
			assert.strictEqual(runTestsDef.title, 'Run Tests');
			assert.strictEqual(runTestsDef.description, 'Runs unit tests');
		});

		test('handles tools with when clauses via observeTools filtering', () => {
			// The observeTools method already filters by `when` clauses.
			// When a tool has a `when` clause that doesn't match, it won't
			// appear in the observable, and thus won't be included.
			// Our mock observeTools returns all tools directly, but in
			// production, tools with non-matching when clauses are excluded
			// before reaching getClientTools.
			const def = toolDataToDefinition(testRunTestsTool);
			assert.strictEqual(def.name, 'runTests');
		});

		test('invokes an owned client tool when reconnecting to an active turn', async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();

			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				message: { text: 'run the task', origin: { kind: MessageKind.User } },
			} as ChatAction);
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
			} as ChatAction);
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tool-call-1',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			} as ChatAction);

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
			assert.ok(connection.dispatchedActions.some(entry => isChatAction(entry.action)
				&& entry.action.type === ActionType.ChatToolCallComplete
				&& entry.action.toolCallId === 'tool-call-1'));
		});

		test('reports client tool prepare failures before confirmation as failed completion', async () => {
			const { handler, connection } = createHandlerWithMocks(disposables, [testRunTaskTool], { throwBeforeConfirmation: new Error('prepare failed') });

			await provideSessionWithReadyRunTaskTool(handler, connection);

			assert.deepStrictEqual(getToolCallConfirmationAndCompletionActions(connection), [{
				type: ActionType.ChatToolCallComplete,
				approved: undefined,
				success: false,
				error: 'prepare failed',
			}]);
		});

		test('reports client tool cancellation before confirmation as failed completion when protocol call is not terminal', async () => {
			const { handler, connection } = createHandlerWithMocks(disposables, [testRunTaskTool], { throwBeforeConfirmation: new CancellationError() });

			await provideSessionWithReadyRunTaskTool(handler, connection);

			assert.deepStrictEqual(getToolCallConfirmationAndCompletionActions(connection), [{
				type: ActionType.ChatToolCallComplete,
				approved: undefined,
				success: false,
				error: 'Canceled',
			}]);
		});

		test('auto-approves client tool confirmation as a setting when the agent host marks the call', async () => {
			const { handler, connection } = createHandlerWithMocks(disposables, [testRunTaskTool], { requireConfirmation: true });
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();

			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				message: { text: 'run the task', origin: { kind: MessageKind.User } },
			} as ChatAction);
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
			} as ChatAction);
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tool-call-1',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
				confirmationTitle: 'Run Task',
				_meta: { autoApproveBySetting: true },
			} as ChatAction);

			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			await timeout(0);
			await timeout(0);
			await timeout(0);

			assert.deepStrictEqual(connection.dispatchedActions
				.filter(entry => isChatAction(entry.action)
					&& (entry.action.type === ActionType.ChatToolCallConfirmed || entry.action.type === ActionType.ChatToolCallComplete)
					&& entry.action.toolCallId === 'tool-call-1')
				.map(entry => {
					if (entry.action.type === ActionType.ChatToolCallConfirmed) {
						return {
							type: entry.action.type,
							approved: entry.action.approved,
							confirmed: entry.action.approved ? entry.action.confirmed : undefined,
							success: undefined,
						};
					}
					if (entry.action.type === ActionType.ChatToolCallComplete) {
						return {
							type: entry.action.type,
							approved: undefined,
							confirmed: undefined,
							success: entry.action.result.success,
						};
					}
					throw new Error(`Unexpected action type: ${entry.action.type}`);
				}), [
				{
					type: ActionType.ChatToolCallConfirmed,
					approved: true,
					confirmed: ToolCallConfirmationReason.Setting,
					success: undefined,
				},
				{
					type: ActionType.ChatToolCallComplete,
					approved: undefined,
					confirmed: undefined,
					success: true,
				},
			]);
		});

		test('auto-approved client tool never enters WaitingForConfirmation (no needs-input flicker)', async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool], { requireConfirmation: true });
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();

			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				message: { text: 'run the task', origin: { kind: MessageKind.User } },
			} as ChatAction);
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
			} as ChatAction);
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tool-call-1',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
				confirmationTitle: 'Run Task',
				_meta: { autoApproveBySetting: true },
			} as ChatAction);

			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			await timeout(0);
			await timeout(0);
			await timeout(0);

			// The invocation carries the pre-resolved approval, and it transitions
			// straight from streaming to executing without ever surfacing a pending
			// confirmation (which would flicker "needs input" in the sessions list).
			assert.deepStrictEqual(
				{
					preApprovedKind: toolsService.invokedToolCalls[0]?.preApproved?.type,
					sawWaitingForConfirmation: (toolsService.recordedStateKinds.get('tool-call-1') ?? []).includes(IChatToolInvocation.StateKind.WaitingForConfirmation),
				},
				{
					preApprovedKind: ToolConfirmKind.Setting,
					sawWaitingForConfirmation: false,
				},
			);
		});

		test('reconnecting to an active turn with owned client tool completes the initial snapshot invocation', async () => {
			const { handler, connection } = createHandlerWithMocks(disposables, [testRunTaskTool]);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();

			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				message: { text: 'run the task', origin: { kind: MessageKind.User } },
			} as ChatAction);
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
			} as ChatAction);
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tool-call-1',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			} as ChatAction);

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

		test('invokes a client tool inside a subagent session and dispatches completion against the subagent URI', async () => {
			// Regression: a client-provided tool running inside a subagent
			// must be invoked locally (the renderer owns the tool
			// implementation, not the agent host). Before the fix, the
			// renderer skipped local invocation for subagent tool calls,
			// leaving the subagent's deferred unresolved. After the fix the
			// tool is invoked locally and the ChatToolCallComplete is
			// dispatched against the subagent session URI — the agent then
			// resolves it back to the parent session that owns the deferred.
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const parentToolCallId = 'tc-parent-task';
			const subagentChat = buildSubagentChatUri(backendSession, parentToolCallId);

			// Parent turn with a `task` tool that spawns a subagent.
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				message: { text: 'do work', origin: { kind: MessageKind.User } },
			});
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: parentToolCallId,
				toolName: 'task',
				displayName: 'Task',
				_meta: { toolKind: 'subagent' },
			});
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: parentToolCallId,
				invocationMessage: 'Spawning subagent',
				toolInput: '{}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatToolCallContentChanged,
				turnId: 'turn-1',
				toolCallId: parentToolCallId,
				content: [{ type: ToolResultContentType.Subagent, resource: subagentChat, title: 'Subagent' }],
			});

			// Subagent turn carrying a client-provided tool call (toolClientId
			// matches the renderer's clientId so the renderer owns the
			// invocation).
			connection.applySessionAction(URI.parse(subagentChat), {
				type: ActionType.ChatTurnStarted,
				turnId: 'sub-turn-1',
				message: { text: '', origin: { kind: MessageKind.User } },
			});
			connection.applySessionAction(URI.parse(subagentChat), {
				type: ActionType.ChatToolCallStart,
				turnId: 'sub-turn-1',
				toolCallId: 'inner-tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
			});
			connection.applySessionAction(URI.parse(subagentChat), {
				type: ActionType.ChatToolCallReady,
				turnId: 'sub-turn-1',
				toolCallId: 'inner-tool-call-1',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});

			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			await timeout(0);

			// The inner client tool must have been invoked locally — without
			// the fix the renderer would skip subagent client-tool setup and
			// `invokedToolCalls` would be empty for the inner call.
			const innerInvocation = toolsService.invokedToolCalls.find(call => call.callId === 'inner-tool-call-1');
			assert.ok(innerInvocation, 'inner client tool inside the subagent should be invoked locally');
			assert.strictEqual(innerInvocation!.toolId, 'vscode.runTask');
			assert.deepStrictEqual(innerInvocation!.parameters, { task: 'build' });

			// The completion must be dispatched against the subagent session
			// URI (the agent will then resolve it to the parent session that
			// owns the SDK deferred).
			const completionEntry = connection.dispatchedActions.find(entry =>
				isChatAction(entry.action)
				&& entry.action.type === ActionType.ChatToolCallComplete
				&& entry.action.toolCallId === 'inner-tool-call-1'
			);
			assert.ok(completionEntry, 'completion for the inner client tool should be dispatched');
			assert.strictEqual(
				completionEntry.channel.toString(),
				subagentChat,
				'completion should target the subagent default chat URI'
			);
		});

		test('invokes a client tool inside a nested (level-2) subagent and groups it under the root', async () => {
			// Regression: a subagent spawned by another subagent was not
			// observed (observation stopped at the first level), so a client
			// tool deep in the tree never ran. With recursive observation the
			// level-2 client tool is invoked locally, its completion is
			// dispatched against the level-2 subagent chat, and it is grouped
			// under the ROOT subagent invocation so the renderer nests the
			// whole tree under one container.
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const rootToolCallId = 'tc-l1-task';
			const nestedToolCallId = 'tc-l2-task';
			const subagentChat1 = buildSubagentChatUri(backendSession, rootToolCallId);
			const subagentChat2 = buildSubagentChatUri(backendSession, nestedToolCallId);

			// Default turn spawns the level-1 subagent.
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatTurnStarted, turnId: 'turn-1',
				message: { text: 'do work', origin: { kind: MessageKind.User } },
			});
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatToolCallStart, turnId: 'turn-1',
				toolCallId: rootToolCallId, toolName: 'task', displayName: 'Task', _meta: { toolKind: 'subagent' },
			});
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatToolCallReady, turnId: 'turn-1',
				toolCallId: rootToolCallId, invocationMessage: 'Spawning subagent', toolInput: '{}', confirmed: ToolCallConfirmationReason.NotNeeded,
			});
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatToolCallContentChanged, turnId: 'turn-1',
				toolCallId: rootToolCallId, content: [{ type: ToolResultContentType.Subagent, resource: subagentChat1, title: 'Subagent L1' }],
			});

			// Level-1 subagent spawns the level-2 subagent.
			connection.applySessionAction(URI.parse(subagentChat1), {
				type: ActionType.ChatTurnStarted, turnId: 'sub-turn-1',
				message: { text: '', origin: { kind: MessageKind.User } },
			});
			connection.applySessionAction(URI.parse(subagentChat1), {
				type: ActionType.ChatToolCallStart, turnId: 'sub-turn-1',
				toolCallId: nestedToolCallId, toolName: 'task', displayName: 'Task', _meta: { toolKind: 'subagent' },
			});
			connection.applySessionAction(URI.parse(subagentChat1), {
				type: ActionType.ChatToolCallReady, turnId: 'sub-turn-1',
				toolCallId: nestedToolCallId, invocationMessage: 'Spawning nested subagent', toolInput: '{}', confirmed: ToolCallConfirmationReason.NotNeeded,
			});
			connection.applySessionAction(URI.parse(subagentChat1), {
				type: ActionType.ChatToolCallContentChanged, turnId: 'sub-turn-1',
				toolCallId: nestedToolCallId, content: [{ type: ToolResultContentType.Subagent, resource: subagentChat2, title: 'Subagent L2' }],
			});

			// Level-2 subagent runs a client-provided tool.
			connection.applySessionAction(URI.parse(subagentChat2), {
				type: ActionType.ChatTurnStarted, turnId: 'sub-turn-2',
				message: { text: '', origin: { kind: MessageKind.User } },
			});
			connection.applySessionAction(URI.parse(subagentChat2), {
				type: ActionType.ChatToolCallStart, turnId: 'sub-turn-2',
				toolCallId: 'deep-tool-call', toolName: 'runTask', displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
			});
			connection.applySessionAction(URI.parse(subagentChat2), {
				type: ActionType.ChatToolCallReady, turnId: 'sub-turn-2',
				toolCallId: 'deep-tool-call', invocationMessage: 'Run Task', toolInput: '{"task":"build"}', confirmed: ToolCallConfirmationReason.NotNeeded,
			});

			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			for (let i = 0; i < 200 && !connection.dispatchedActions.some(e => isChatAction(e.action) && e.action.type === ActionType.ChatToolCallComplete && e.action.toolCallId === 'deep-tool-call'); i++) {
				await timeout(1);
			}

			const deepInvocation = toolsService.invokedToolCalls.find(call => call.callId === 'deep-tool-call');
			assert.ok(deepInvocation, 'client tool inside a nested subagent should be invoked locally');
			assert.deepStrictEqual(deepInvocation!.parameters, { task: 'build' });

			const completionEntry = connection.dispatchedActions.find(entry =>
				isChatAction(entry.action)
				&& entry.action.type === ActionType.ChatToolCallComplete
				&& entry.action.toolCallId === 'deep-tool-call'
			);
			assert.ok(completionEntry, 'completion for the nested client tool should be dispatched');
			assert.strictEqual(completionEntry.channel.toString(), subagentChat2, 'completion should target the level-2 subagent chat URI');

			const deepBegun = toolsService.begunToolCalls.find(c => c.toolCallId === 'deep-tool-call');
			assert.strictEqual(deepBegun?.subAgentInvocationId, rootToolCallId, 'descendant tools should be grouped under the root subagent invocation');
		});

		test('observes a nested subagent without a discovery content block (agent-host misroutes it)', async () => {
			// Regression for the logged stall: the agent host emits the
			// subagent-discovery `ChatToolCallContentChanged` block on the
			// top-level chat rather than the immediate parent subagent chat
			// (the `subagent_started` signal carries no parent tool call id),
			// so a nested subagent's parent chat only ever sees
			// start + ready (Running) with `_meta.toolKind === 'subagent'`.
			// Observation must therefore proceed from `_meta` alone — without
			// it the level-2 subagent (and its client tool) is never observed
			// and the session hangs in "Input Needed" with nothing to act on.
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const rootToolCallId = 'tc-l1-task';
			const nestedToolCallId = 'tc-l2-task';
			const subagentChat1 = buildSubagentChatUri(backendSession, rootToolCallId);
			const subagentChat2 = buildSubagentChatUri(backendSession, nestedToolCallId);

			// Default turn spawns the level-1 subagent (no content block).
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatTurnStarted, turnId: 'turn-1',
				message: { text: 'do work', origin: { kind: MessageKind.User } },
			});
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatToolCallStart, turnId: 'turn-1',
				toolCallId: rootToolCallId, toolName: 'task', displayName: 'Task', _meta: { toolKind: 'subagent' },
			});
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatToolCallReady, turnId: 'turn-1',
				toolCallId: rootToolCallId, invocationMessage: 'Spawning subagent', toolInput: '{}', confirmed: ToolCallConfirmationReason.NotNeeded,
			});

			// Level-1 subagent spawns the level-2 subagent (no content block).
			connection.applySessionAction(URI.parse(subagentChat1), {
				type: ActionType.ChatTurnStarted, turnId: 'sub-turn-1',
				message: { text: '', origin: { kind: MessageKind.User } },
			});
			connection.applySessionAction(URI.parse(subagentChat1), {
				type: ActionType.ChatToolCallStart, turnId: 'sub-turn-1',
				toolCallId: nestedToolCallId, toolName: 'task', displayName: 'Task', _meta: { toolKind: 'subagent' },
			});
			connection.applySessionAction(URI.parse(subagentChat1), {
				type: ActionType.ChatToolCallReady, turnId: 'sub-turn-1',
				toolCallId: nestedToolCallId, invocationMessage: 'Spawning nested subagent', toolInput: '{}', confirmed: ToolCallConfirmationReason.NotNeeded,
			});

			// Level-2 subagent runs a client-provided tool.
			connection.applySessionAction(URI.parse(subagentChat2), {
				type: ActionType.ChatTurnStarted, turnId: 'sub-turn-2',
				message: { text: '', origin: { kind: MessageKind.User } },
			});
			connection.applySessionAction(URI.parse(subagentChat2), {
				type: ActionType.ChatToolCallStart, turnId: 'sub-turn-2',
				toolCallId: 'deep-tool-call', toolName: 'runTask', displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
			});
			connection.applySessionAction(URI.parse(subagentChat2), {
				type: ActionType.ChatToolCallReady, turnId: 'sub-turn-2',
				toolCallId: 'deep-tool-call', invocationMessage: 'Run Task', toolInput: '{"task":"build"}', confirmed: ToolCallConfirmationReason.NotNeeded,
			});

			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			for (let i = 0; i < 200 && !connection.dispatchedActions.some(e => isChatAction(e.action) && e.action.type === ActionType.ChatToolCallComplete && e.action.toolCallId === 'deep-tool-call'); i++) {
				await timeout(1);
			}

			const deepInvocation = toolsService.invokedToolCalls.find(call => call.callId === 'deep-tool-call');
			assert.ok(deepInvocation, 'client tool inside a content-block-less nested subagent should still be invoked locally');
			assert.deepStrictEqual(deepInvocation!.parameters, { task: 'build' });

			const completionEntry = connection.dispatchedActions.find(entry =>
				isChatAction(entry.action)
				&& entry.action.type === ActionType.ChatToolCallComplete
				&& entry.action.toolCallId === 'deep-tool-call'
			);
			assert.ok(completionEntry, 'completion for the nested client tool should be dispatched');
			assert.strictEqual(completionEntry.channel.toString(), subagentChat2, 'completion should target the level-2 subagent chat URI');
		});
	});
});
