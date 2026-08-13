/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { DisposableStore, IReference, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { constObservable, observableValue, autorun } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { AgentSession, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME, RUNTIME_TOOL_SEARCH_TOOL_NAME } from '../../../../../../platform/agentHost/common/toolSearchConstants.js';
import { isChatAction, isSessionAction, type ActionEnvelope, type ChatAction, type IRootConfigChangedAction, type SessionAction, type TerminalAction, type INotification, type ClientAnnotationsAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, buildSubagentChatUri, createChatState, createDefaultChatSummary, ChatInputResponseKind, MessageKind, SessionLifecycle, SessionStatus, createSessionState, StateComponents, parseDefaultChatUri, ToolCallCancellationReason, type ChatState, type SessionState, type SessionSummary, type RootState, type ToolInput } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { chatReducer, sessionReducer } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { ContentEncoding } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ConfirmationOptionKind, McpAuthRequiredReason, SessionInputRequestKind, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IChatAgentService } from '../../../common/participants/chatAgents.js';
import { IChatProgress, IChatService, IChatToolInvocation, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { IChatResponseFileChangesService } from '../../../browser/chatResponseFileChangesService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { PieceCtorKind, PromptNodeType } from '../../../common/tools/promptTsxTypes.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IConfigurationResolverService } from '../../../../../services/configurationResolver/common/configurationResolver.js';
import { AgentHostSessionHandler, toolDataToDefinition, toolResultToProtocol, UNOBSERVED_CLIENT_TOOL_GRACE_MS } from '../../../browser/agentSessions/agentHost/agentHostSessionHandler.js';
import { AgentHostActiveClientService, IAgentHostActiveClientService } from '../../../browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { IAgentHostCustomizationService, NullAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
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
import { IAgentHostSessionWorkingDirectorySynchronizer } from '../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectorySynchronizer.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { ILanguageModelToolsService, IToolData, IToolInvocation, IToolResult, ToolAndToolSetEnablementMap, ToolDataSource, ToolInvocationPresentation } from '../../../common/tools/languageModelToolsService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { IChatWidgetService } from '../../../browser/chat.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IOutputService } from '../../../../../services/output/common/output.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IPromptsService } from '../../../common/promptSyntax/service/promptsService.js';
import { IMcpService } from '../../../../mcp/common/mcpTypes.js';

// =============================================================================
// Unit tests for toolDataToDefinition and toolResultToProtocol
// =============================================================================

suite('AgentHostClientTools', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('shares a customization scope for equivalent root sets', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IFileService, TestFileService);
		instantiationService.stub(IAgentHostFileSystemService, {
			ensureSyncedCustomizationProvider: () => { },
		});
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(IConfigurationService, {
			getValue: () => false,
			onDidChangeConfiguration: Event.None,
		} as Partial<IConfigurationService> as IConfigurationService);
		instantiationService.stub(IConfigurationResolverService, {} as Partial<IConfigurationResolverService>);
		instantiationService.stub(IPromptsService, new class extends mock<IPromptsService>() {
			override readonly onDidChangeCustomAgents = Event.None;
			override readonly onDidChangeSlashCommands = Event.None;
			override readonly onDidChangeSkills = Event.None;
			override readonly onDidChangeInstructions = Event.None;
			override getDisabledPromptFiles() { return new ResourceSet(); }
			override async listPromptFilesForStorage() {
				return [];
			}
		}());
		instantiationService.stub(IAgentPluginService, {
			plugins: observableValue('plugins', []),
		});
		instantiationService.stub(IMcpService, {
			servers: observableValue('mcpServers', []),
		});
		instantiationService.stub(ILanguageModelToolsService, {
			observeTools: () => constObservable([]),
			toolSets: constObservable([]),
		} as Partial<ILanguageModelToolsService> as ILanguageModelToolsService);
		instantiationService.stub(IAgentHostToolSetEnablementService, {
			observe: () => constObservable<IToolEnablementState>({ toolSets: new Map(), tools: new Map() }),
			getState: () => ({ toolSets: new Map(), tools: new Map() }),
			setToolSetEnabled: () => { },
			setToolEnabled: () => { },
		});

		const service = disposables.add(instantiationService.createInstance(AgentHostActiveClientService));
		const registration = disposables.add(service.registerForAgent('agent-host-claude'));
		const rootA = URI.file('/Workspace-A');
		const rootB = URI.file('/Workspace-B');
		const unregisteredScope = service.acquireScope('unregistered-agent', []);
		const unresolvedScope = registration.acquireScope([URI.file('/unresolved-workspace')]);
		const unresolved = unresolvedScope.whenResolved();
		unresolvedScope.dispose();
		assert.strictEqual(await unresolved, undefined);
		const first = registration.acquireScope([rootB, rootA, rootA]);
		const second = registration.acquireScope([rootA, rootB]);
		await first.whenResolved();

		const sharedScopeState = {
			customizations: first.customizations === second.customizations,
			customAgents: first.customAgents === second.customAgents,
		};
		first.dispose();
		second.dispose();
		registration.dispose();

		assert.deepStrictEqual({
			unregisteredScope,
			sharedScopeState,
			scopeAfterRegistrationDisposal: service.acquireScope('agent-host-claude', []),
		}, {
			unregisteredScope: undefined,
			sharedScopeState: {
				customizations: true,
				customAgents: true,
			},
			scopeAfterRegistrationDisposal: undefined,
		});
	});

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

		test('converts prompt TSX results to text content', () => {
			const result: IToolResult = {
				content: [{
					kind: 'promptTsx',
					value: {
						node: {
							type: PromptNodeType.Piece,
							ctor: PieceCtorKind.Other,
							children: [
								{ type: PromptNodeType.Text, text: '<diagnostics>', lineBreakBefore: undefined },
								{ type: PromptNodeType.Text, text: '1 problem found', lineBreakBefore: true },
								{ type: PromptNodeType.Text, text: '</diagnostics>', lineBreakBefore: true },
							],
						},
					},
				}],
				toolResultMessage: 'Checked math.js, 1 problem found',
			};

			assert.deepStrictEqual(toolResultToProtocol(result, 'problems'), {
				success: true,
				pastTenseMessage: 'Checked math.js, 1 problem found',
				content: [{
					type: ToolResultContentType.Text,
					text: '<diagnostics>\n1 problem found\n</diagnostics>',
				}],
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

		test('preserves markdown tool result messages', () => {
			const result: IToolResult = {
				content: [],
				toolResultMessage: new MarkdownString('Opened [Browser](vscode-browser:/page-1?vscodeLinkType=browser)'),
			};

			assert.deepStrictEqual(toolResultToProtocol(result, 'open_browser_page').pastTenseMessage, {
				markdown: 'Opened [Browser](vscode-browser:/page-1?vscodeLinkType=browser)',
			});
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

		function createMockToolsService(disposables: DisposableStore, tools: IToolData[], options?: { requireConfirmation?: boolean; throwBeforeConfirmation?: Error; invokeResult?: DeferredPromise<IToolResult> }) {
			const onDidChangeTools = disposables.add(new Emitter<void>());
			const pendingToolCalls = new Map<string, ChatToolInvocation>();
			const begunToolCalls: ChatToolInvocation[] = [];
			const invokedToolCalls: IToolInvocation[] = [];
			const executedToolCalls: IToolInvocation[] = [];
			const invocationTokens: CancellationToken[] = [];
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
				invokeTool: async (invocation: IToolInvocation, _countTokens, token?: CancellationToken) => {
					invokedToolCalls.push(invocation);
					invocationTokens.push(token ?? CancellationToken.None);
					const toolInvocation = pendingToolCalls.get(invocation.chatStreamToolCallId ?? invocation.callId);
					pendingToolCalls.delete(invocation.chatStreamToolCallId ?? invocation.callId);
					if (options?.throwBeforeConfirmation) {
						throw options.throwBeforeConfirmation;
					}
					if (options?.requireConfirmation && toolInvocation) {
						const prepared = {
							invocationMessage: `Run ${(invocation.parameters as { task?: string }).task}`,
							confirmationMessages: {
								title: 'Confirm tool execution',
								message: 'Run the task?',
								approveCombination: {
									label: `Approve ${(invocation.parameters as { task?: string }).task}`,
									key: JSON.stringify(invocation.parameters),
									arguments: JSON.stringify(invocation.parameters),
								},
							},
							presentation: ToolInvocationPresentation.HiddenAfterComplete,
							toolSpecificData: {
								kind: 'simpleToolInvocation' as const,
								input: JSON.stringify(invocation.parameters),
								output: '',
							},
						};
						if (toolInvocation.state.get().type === IChatToolInvocation.StateKind.Streaming) {
							toolInvocation.transitionFromStreaming(prepared, invocation.parameters, invocation.preApproved);
						} else {
							toolInvocation.updatePreparedInvocation(prepared, invocation.parameters);
						}
						const confirmed = await IChatToolInvocation.awaitConfirmation(toolInvocation, token ?? CancellationToken.None);
						// Mirror the real service: a cancelled/denied confirmation
						// aborts execution instead of producing a result. A token
						// cancellation resolves as `Denied`, so move the still-waiting
						// invocation to a terminal state and reject.
						if (confirmed.type === ToolConfirmKind.Denied || confirmed.type === ToolConfirmKind.Skipped) {
							const state = toolInvocation.state.get();
							if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
								state.confirm(confirmed);
							}
							throw new CancellationError();
						}
					} else {
						const prepared = toolInvocation?.toolSpecificData?.kind === 'subagent'
							? {
								invocationMessage: 'Delegating task',
								toolSpecificData: {
									kind: 'subagent' as const,
									description: 'Prepared delegated task',
								},
							}
							: undefined;
						toolInvocation?.transitionFromStreaming(prepared, invocation.parameters, { type: ToolConfirmKind.ConfirmationNotNeeded });
					}
					executedToolCalls.push(invocation);
					const result: IToolResult = options?.invokeResult
						? await options.invokeResult.p
						: { content: [{ kind: 'text', value: 'done' }] };
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
				executedToolCalls,
				invocationTokens,
				recordedStateKinds,
			} satisfies ILanguageModelToolsService & { fireOnDidChangeTools: () => void; begunToolCalls: ChatToolInvocation[]; invokedToolCalls: IToolInvocation[]; executedToolCalls: IToolInvocation[]; invocationTokens: CancellationToken[]; recordedStateKinds: Map<string, IChatToolInvocation.StateKind[]> };
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
			override readonly initializeResult = constObservable(undefined);

			private readonly _liveSubscriptions = new Map<string, { state: SessionState | ChatState; emitter: Emitter<SessionState | ChatState> }>();
			public dispatchedActions: { channel: string; action: SessionAction | ChatAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction }[] = [];
			public readonly resourceReadUris: URI[] = [];
			public resourceReadData = '{"task":"build"}';
			public resourceReadEncoding = ContentEncoding.Utf8;
			public readonly resourceReadResponses = new Map<string, Promise<{ data: string; encoding: ContentEncoding }>>();

			override async resourceRead(uri: URI) {
				this.resourceReadUris.push(uri);
				return this.resourceReadResponses.get(uri.toString())
					?? { data: this.resourceReadData, encoding: this.resourceReadEncoding };
			}

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
			toolServiceOptions?: { requireConfirmation?: boolean; throwBeforeConfirmation?: Error; invokeResult?: DeferredPromise<IToolResult> },
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
			instantiationService.stub(IChatWidgetService, {
				getWidgetBySessionResource: () => undefined,
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
			instantiationService.stub(IAgentHostCustomizationService, new NullAgentHostCustomizationService());
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
			instantiationService.stub(IAgentHostSessionWorkingDirectorySynchronizer, {
				register: () => toDisposable(() => { }),
				reconcile: async () => { },
			} as Partial<IAgentHostSessionWorkingDirectorySynchronizer> as IAgentHostSessionWorkingDirectorySynchronizer);
			instantiationService.stub(IAgentHostUntitledProvisionalSessionService, {
				onDidChange: Event.None,
				get: () => undefined,
				getInitialSessionConfig: () => undefined,
				waitForPending: async () => undefined,
				getOrCreate: async () => undefined,
				applyConfigChange: async () => undefined,
				tryRebind: async () => undefined,
				disposeSession: async () => { },
				getResolvedConfig: () => undefined,
				refreshResolvedConfig: async () => { },
			} as Partial<IAgentHostUntitledProvisionalSessionService> as IAgentHostUntitledProvisionalSessionService);
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

		const testSubagentTool: IToolData = {
			id: 'runSubagent',
			toolReferenceName: 'task',
			displayName: 'Run Subagent',
			modelDescription: 'Runs a delegated task',
			source: ToolDataSource.Internal,
			inputSchema: { type: 'object', properties: {} },
		};

		const testUnlistedTool: IToolData = {
			id: 'vscode.readFile',
			toolReferenceName: 'readFile',
			displayName: 'Read File',
			modelDescription: 'Reads a file',
			source: ToolDataSource.Internal,
		};

		const testToolSearchTool: IToolData = {
			id: 'vscode.toolSearch',
			toolReferenceName: CLIENT_TOOL_SEARCH_REFERENCE_NAME,
			displayName: 'Search Tools',
			modelDescription: 'Searches for tools',
			source: ToolDataSource.Internal,
			inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
		};

		// A tool that might ask for pre-approval: the handler treats it as
		// requiring confirmation, so an unclaimed call waits for an observer.
		const testConfirmTool: IToolData = {
			id: 'vscode.deleteAll',
			toolReferenceName: 'deleteAll',
			displayName: 'Delete Everything',
			modelDescription: 'A destructive action that needs confirmation',
			source: ToolDataSource.Internal,
			canRequestPreApproval: true,
			inputSchema: { type: 'object', properties: {} },
		};

		async function provideSessionWithReadyRunTaskTool(handler: AgentHostSessionHandler, connection: MockAgentHostConnection): Promise<void> {
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();

			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
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
			applyRunningClientExecution(connection, buildDefaultChatUri(backendSession), 'turn-1', {
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
			});
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

		// The watcher is the single point of truth for client-tool execution:
		// it only acts on a `ToolClientExecution` blocker. Tests that drive a
		// client tool through a chat turn must therefore also surface the
		// matching running record so the tool actually runs.
		function applyRunningClientExecution(
			connection: MockAgentHostConnection,
			chat: string,
			turnId: string,
			toolCall: {
				toolCallId: string;
				toolName: string;
				displayName: string;
				invocationMessage: string;
				toolInput: ToolInput;
				confirmed?: ToolCallConfirmationReason;
				_meta?: Record<string, unknown>;
			},
		): void {
			connection.applySessionAction(URI.parse(AgentSession.uri('copilot', 'session-1').toString()), {
				type: ActionType.SessionInputNeededSet,
				request: {
					id: `exec-${toolCall.toolCallId}`,
					kind: SessionInputRequestKind.ToolClientExecution,
					clientId: connection.clientId,
					chat,
					turnId,
					toolCall: {
						status: ToolCallStatus.Running,
						toolCallId: toolCall.toolCallId,
						toolName: toolCall.toolName,
						displayName: toolCall.displayName,
						invocationMessage: toolCall.invocationMessage,
						toolInput: toolCall.toolInput,
						confirmed: toolCall.confirmed ?? ToolCallConfirmationReason.NotNeeded,
						contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
						...(toolCall._meta ? { _meta: toolCall._meta } : {}),
					},
				},
			});
		}

		function applyReferencedRunTask(
			connection: MockAgentHostConnection,
			chatURI: URI,
			toolInput: ToolInput,
			confirmed?: ToolCallConfirmationReason,
		): void {
			connection.applySessionAction(chatURI, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'run the task', origin: { kind: MessageKind.User } },
			});
			connection.applySessionAction(chatURI, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
			});
			connection.applySessionAction(chatURI, {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tool-call-1',
				invocationMessage: 'Run Task',
				toolInput,
				...(confirmed === undefined
					? { confirmationTitle: 'Run Task' }
					: { confirmed }),
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
				startedAt: '2025-01-01T00:00:00.000Z',
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
			applyRunningClientExecution(connection, buildDefaultChatUri(backendSession), 'turn-1', {
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
			});
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

		test('resolves base64 referenced input before invoking an owned client tool', async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const chatURI = URI.parse(buildDefaultChatUri(backendSession));
			const toolInputURI = URI.parse('session-db:/tool-input');
			const toolInput = { uri: toolInputURI.toString(), contentType: 'application/json' };
			connection.resourceReadData = encodeBase64(VSBuffer.fromString('{"task":"build"}'));
			connection.resourceReadEncoding = ContentEncoding.Base64;

			applyReferencedRunTask(connection, chatURI, toolInput, ToolCallConfirmationReason.NotNeeded);
			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			applyRunningClientExecution(connection, chatURI.toString(), 'turn-1', {
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				invocationMessage: 'Run Task',
				toolInput,
			});
			await timeout(0);
			await timeout(0);

			assert.deepStrictEqual({
				resourceReadUris: connection.resourceReadUris.map(uri => uri.toString()),
				parameters: toolsService.invokedToolCalls[0]?.parameters,
			}, {
				resourceReadUris: [toolInputURI.toString()],
				parameters: { task: 'build' },
			});
		});

		test('waits until referenced input is running before reading it', async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool], { requireConfirmation: true });
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const chatURI = URI.parse(buildDefaultChatUri(backendSession));
			const toolInputURI = URI.parse('session-db:/tool-input');
			const toolInput = { uri: toolInputURI.toString(), contentType: 'application/json' };

			applyReferencedRunTask(connection, chatURI, toolInput);
			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			await timeout(0);
			assert.strictEqual(connection.resourceReadUris.length, 0);

			IChatToolInvocation.confirmWith(
				toolsService.begunToolCalls.find(invocation => invocation.toolCallId === 'tool-call-1'),
				{ type: ToolConfirmKind.UserAction },
			);
			await timeout(0);
			connection.resourceReadData = '{"task":"confirmed"}';
			applyRunningClientExecution(connection, chatURI.toString(), 'turn-1', {
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				invocationMessage: 'Run Task',
				toolInput,
				confirmed: ToolCallConfirmationReason.UserAction,
			});
			await timeout(0);
			await timeout(0);

			assert.deepStrictEqual({
				resourceReadUris: connection.resourceReadUris.map(uri => uri.toString()),
				parameters: toolsService.invokedToolCalls[0]?.parameters,
			}, {
				resourceReadUris: [toolInputURI.toString()],
				parameters: { task: 'confirmed' },
			});
		});

		test('supersedes a hung referenced input read when the request changes', async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const chatURI = URI.parse(buildDefaultChatUri(backendSession));
			const firstInputURI = URI.parse('session-db:/tool-input-1');
			const secondInputURI = URI.parse('session-db:/tool-input-2');
			const firstInput = { uri: firstInputURI.toString(), contentType: 'application/json' };
			const secondInput = { uri: secondInputURI.toString(), contentType: 'application/json' };
			connection.resourceReadResponses.set(firstInputURI.toString(), new DeferredPromise<{ data: string; encoding: ContentEncoding }>().p);
			connection.resourceReadResponses.set(secondInputURI.toString(), Promise.resolve({
				data: '{"task":"latest"}',
				encoding: ContentEncoding.Utf8,
			}));

			applyReferencedRunTask(connection, chatURI, firstInput, ToolCallConfirmationReason.NotNeeded);
			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			applyRunningClientExecution(connection, chatURI.toString(), 'turn-1', {
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				invocationMessage: 'Run Task',
				toolInput: firstInput,
			});
			await timeout(0);
			applyRunningClientExecution(connection, chatURI.toString(), 'turn-1', {
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				invocationMessage: 'Run Task',
				toolInput: secondInput,
			});
			await timeout(0);
			await timeout(0);

			assert.deepStrictEqual({
				resourceReadUris: connection.resourceReadUris.map(uri => uri.toString()),
				parameters: toolsService.invokedToolCalls[0]?.parameters,
			}, {
				resourceReadUris: [firstInputURI.toString(), secondInputURI.toString()],
				parameters: { task: 'latest' },
			});
		});

		test('does not re-execute when the request changes after invocation starts', async () => {
			const invokeResult = new DeferredPromise<IToolResult>();
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool], { invokeResult });
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const chatURI = URI.parse(buildDefaultChatUri(backendSession));

			applyReferencedRunTask(connection, chatURI, '{"task":"first"}', ToolCallConfirmationReason.NotNeeded);
			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			applyRunningClientExecution(connection, chatURI.toString(), 'turn-1', {
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"first"}',
			});
			await timeout(0);
			assert.strictEqual(toolsService.invokedToolCalls.length, 1);

			applyRunningClientExecution(connection, chatURI.toString(), 'turn-1', {
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"second"}',
			});
			await timeout(0);
			assert.strictEqual(toolsService.invokedToolCalls.length, 1);

			invokeResult.complete({ content: [{ kind: 'text', value: 'done' }] });
			await timeout(0);
			await timeout(0);

			assert.deepStrictEqual({
				invocations: toolsService.invokedToolCalls.map(call => call.parameters),
				completions: connection.dispatchedActions.filter(entry => isChatAction(entry.action)
					&& entry.action.type === ActionType.ChatToolCallComplete
					&& entry.action.toolCallId === 'tool-call-1').length,
			}, {
				invocations: [{ task: 'first' }],
				completions: 1,
			});
		});

		test('settles local and protocol state when referenced input cannot be read', async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const chatURI = URI.parse(buildDefaultChatUri(backendSession));
			const toolInputURI = URI.parse('session-db:/tool-input');
			const toolInput = { uri: toolInputURI.toString(), contentType: 'application/json' };
			const read = new DeferredPromise<{ data: string; encoding: ContentEncoding }>();
			connection.resourceReadResponses.set(toolInputURI.toString(), read.p);

			applyReferencedRunTask(connection, chatURI, toolInput, ToolCallConfirmationReason.NotNeeded);
			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			applyRunningClientExecution(connection, chatURI.toString(), 'turn-1', {
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				invocationMessage: 'Run Task',
				toolInput,
			});
			await timeout(0);
			await read.error(new Error('read failed'));
			await timeout(0);

			const completion = connection.dispatchedActions.find(entry => isChatAction(entry.action)
				&& entry.action.type === ActionType.ChatToolCallComplete
				&& entry.action.toolCallId === 'tool-call-1');
			assert.deepStrictEqual({
				invocationState: toolsService.begunToolCalls[0]?.state.get().type,
				completionError: completion?.action.type === ActionType.ChatToolCallComplete ? completion.action.result.error?.message : undefined,
			}, {
				invocationState: IChatToolInvocation.StateKind.Completed,
				completionError: 'read failed',
			});
		});

		test('settles local and protocol state when referenced input resolves to invalid JSON', async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const chatURI = URI.parse(buildDefaultChatUri(backendSession));
			const toolInput = { uri: 'session-db:/tool-input', contentType: 'application/json' };
			connection.resourceReadData = 'not json';

			applyReferencedRunTask(connection, chatURI, toolInput, ToolCallConfirmationReason.NotNeeded);
			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			applyRunningClientExecution(connection, chatURI.toString(), 'turn-1', {
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				invocationMessage: 'Run Task',
				toolInput,
			});
			await timeout(0);
			await timeout(0);

			const completion = connection.dispatchedActions.find(entry => isChatAction(entry.action)
				&& entry.action.type === ActionType.ChatToolCallComplete
				&& entry.action.toolCallId === 'tool-call-1');
			assert.deepStrictEqual({
				invocationState: toolsService.begunToolCalls[0]?.state.get().type,
				completionError: completion?.action.type === ActionType.ChatToolCallComplete ? completion.action.result.error?.message : undefined,
			}, {
				invocationState: IChatToolInvocation.StateKind.Completed,
				completionError: 'Invalid tool input for "runTask": expected JSON object parameters.',
			});
		});

		test('waits for tool-search candidates and drops them from completion metadata', async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testToolSearchTool]);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const chatURI = URI.parse(buildDefaultChatUri(backendSession));
			const toolSearchCandidates = [{ name: 'calculator', description: 'Adds numbers' }];

			connection.applySessionAction(chatURI, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'find a calculator', origin: { kind: MessageKind.User } },
			} as ChatAction);
			connection.applySessionAction(chatURI, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-search-call-1',
				toolName: RUNTIME_TOOL_SEARCH_TOOL_NAME,
				displayName: 'Search Tools',
				contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
			} as ChatAction);
			connection.applySessionAction(chatURI, {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tool-search-call-1',
				invocationMessage: 'Search Tools',
				toolInput: '{"query":"calculator"}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				_meta: {
					futureMetadata: { preserve: true },
				},
			} as ChatAction);

			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			applyRunningClientExecution(connection, chatURI.toString(), 'turn-1', {
				toolCallId: 'tool-search-call-1',
				toolName: RUNTIME_TOOL_SEARCH_TOOL_NAME,
				displayName: 'Search Tools',
				invocationMessage: 'Search Tools',
				toolInput: '{"query":"calculator"}',
				_meta: {
					futureMetadata: { preserve: true },
				},
			});
			await timeout(0);
			assert.strictEqual(toolsService.invokedToolCalls.length, 0);

			connection.applySessionAction(chatURI, {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tool-search-call-1',
				invocationMessage: 'Search Tools',
				toolInput: '{"query":"calculator"}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				_meta: {
					toolSearchCandidates,
					futureMetadata: { preserve: true },
				},
			} as ChatAction);
			applyRunningClientExecution(connection, chatURI.toString(), 'turn-1', {
				toolCallId: 'tool-search-call-1',
				toolName: RUNTIME_TOOL_SEARCH_TOOL_NAME,
				displayName: 'Search Tools',
				invocationMessage: 'Search Tools',
				toolInput: '{"query":"calculator"}',
				_meta: {
					toolSearchCandidates,
					futureMetadata: { preserve: true },
				},
			});
			await timeout(0);
			await timeout(0);

			const completion = connection.dispatchedActions.find(entry => isChatAction(entry.action)
				&& entry.action.type === ActionType.ChatToolCallComplete
				&& entry.action.toolCallId === 'tool-search-call-1');
			assert.ok(completion && isChatAction(completion.action) && completion.action.type === ActionType.ChatToolCallComplete);
			assert.deepStrictEqual({
				parameters: toolsService.invokedToolCalls[0]?.parameters,
				meta: completion.action._meta,
			}, {
				parameters: {
					query: 'calculator',
					candidateTools: toolSearchCandidates,
				},
				meta: { futureMetadata: { preserve: true } },
			});
		});

		test('invalid tool-search input drops candidates while preserving unknown metadata', async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testToolSearchTool]);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const chatURI = URI.parse(buildDefaultChatUri(backendSession));

			connection.applySessionAction(chatURI, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'find a calculator', origin: { kind: MessageKind.User } },
			} as ChatAction);
			connection.applySessionAction(chatURI, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-search-call-invalid',
				toolName: RUNTIME_TOOL_SEARCH_TOOL_NAME,
				displayName: 'Search Tools',
				contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
			} as ChatAction);
			connection.applySessionAction(chatURI, {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tool-search-call-invalid',
				invocationMessage: 'Search Tools',
				toolInput: '{invalid',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				_meta: {
					toolSearchCandidates: [{ name: 'calculator', description: 'Adds numbers' }],
					futureMetadata: { preserve: true },
				},
			} as ChatAction);

			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			applyRunningClientExecution(connection, chatURI.toString(), 'turn-1', {
				toolCallId: 'tool-search-call-invalid',
				toolName: RUNTIME_TOOL_SEARCH_TOOL_NAME,
				displayName: 'Search Tools',
				invocationMessage: 'Search Tools',
				toolInput: '{invalid',
				_meta: {
					toolSearchCandidates: [{ name: 'calculator', description: 'Adds numbers' }],
					futureMetadata: { preserve: true },
				},
			});
			await timeout(0);
			await timeout(0);

			const completion = connection.dispatchedActions.find(entry => isChatAction(entry.action)
				&& entry.action.type === ActionType.ChatToolCallComplete
				&& entry.action.toolCallId === 'tool-search-call-invalid');
			assert.ok(completion && isChatAction(completion.action) && completion.action.type === ActionType.ChatToolCallComplete);
			assert.deepStrictEqual({
				invokedToolCalls: toolsService.invokedToolCalls.length,
				success: completion.action.result.success,
				meta: completion.action._meta,
			}, {
				invokedToolCalls: 0,
				success: false,
				meta: { futureMetadata: { preserve: true } },
			});
		});

		test('shows another client tool as cancellable progress without invoking or confirming it', async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const chatURI = URI.parse(buildDefaultChatUri(backendSession));

			connection.applySessionAction(chatURI, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'run the task', origin: { kind: MessageKind.User } },
			} as ChatAction);
			connection.applySessionAction(chatURI, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: 'owner-client' },
			} as ChatAction);
			connection.applySessionAction(chatURI, {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tool-call-1',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
				confirmationTitle: 'Allow Run Task?',
			} as ChatAction);

			const session = await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			await timeout(0);
			await timeout(0);
			const invocation = (session as unknown as { progressObs: { get(): IChatProgress[] } })
				.progressObs.get()
				.find((part): part is ChatToolInvocation => part instanceof ChatToolInvocation && part.toolCallId === 'tool-call-1');
			assert.ok(invocation);

			const actionsBeforeSkip = getToolCallConfirmationAndCompletionActions(connection);
			const stateBeforeSkip = invocation.state.get().type;
			const messageBeforeSkip = invocation.invocationMessage;
			invocation.otherClientToolCall?.cancel();
			await timeout(0);

			assert.deepStrictEqual({
				messageBeforeSkip,
				messageAfterSkip: invocation.invocationMessage,
				stateBeforeSkip,
				stateAfterSkip: invocation.state.get().type,
				invokedToolCallCount: toolsService.invokedToolCalls.length,
				actionsBeforeSkip,
				actionsAfterSkip: getToolCallConfirmationAndCompletionActions(connection),
			}, {
				messageBeforeSkip: 'Running Run Task on another client...',
				messageAfterSkip: 'Run Task',
				stateBeforeSkip: IChatToolInvocation.StateKind.Executing,
				stateAfterSkip: IChatToolInvocation.StateKind.Completed,
				invokedToolCallCount: 0,
				actionsBeforeSkip: [],
				actionsAfterSkip: [{
					type: ActionType.ChatToolCallConfirmed,
					approved: false,
					success: undefined,
					error: undefined,
				}],
			});
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
				startedAt: '2025-01-01T00:00:00.000Z',
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
			applyRunningClientExecution(connection, buildDefaultChatUri(backendSession), 'turn-1', {
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
				confirmed: ToolCallConfirmationReason.Setting,
				_meta: { autoApproveBySetting: true },
			});
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

		test('protocol-confirmed client tool never enters WaitingForConfirmation (no needs-input flicker)', async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool], { requireConfirmation: true });
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();

			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
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
			applyRunningClientExecution(connection, buildDefaultChatUri(backendSession), 'turn-1', {
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
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
					preApprovedKind: ToolConfirmKind.ConfirmationNotNeeded,
					sawWaitingForConfirmation: false,
				},
			);
		});

		async function provideSessionWithPendingConfirmationClientTool(handler: AgentHostSessionHandler, connection: MockAgentHostConnection): Promise<URI> {
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const chatURI = URI.parse(buildDefaultChatUri(backendSession));

			connection.applySessionAction(chatURI, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'run the task', origin: { kind: MessageKind.User } },
			} as ChatAction);
			connection.applySessionAction(chatURI, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
			} as ChatAction);
			connection.applySessionAction(chatURI, {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tool-call-1',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
				confirmationTitle: 'Run Task',
				options: [
					{ id: 'allow-once', label: 'Allow Once', kind: ConfirmationOptionKind.Approve },
					{ id: 'skip', label: 'Skip', kind: ConfirmationOptionKind.Deny },
				],
			} as ChatAction);

			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			connection.applySessionAction(AgentSession.uri('copilot', 'session-1'), {
				type: ActionType.SessionInputNeededSet,
				request: {
					id: 'confirmation-tool-call-1',
					kind: SessionInputRequestKind.ToolConfirmation,
					chat: chatURI.toString(),
					turnId: 'turn-1',
					toolCall: {
						status: ToolCallStatus.PendingConfirmation,
						toolCallId: 'tool-call-1',
						toolName: 'runTask',
						displayName: 'Run Task',
						invocationMessage: 'Run Task',
						toolInput: '{"task":"build"}',
						confirmationTitle: 'Run Task',
						contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
					},
				},
			});
			await timeout(0);
			await timeout(0);
			return chatURI;
		}

		test('invokes a ready client tool and reflects its local confirmation', async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool], { requireConfirmation: true });
			await provideSessionWithPendingConfirmationClientTool(handler, connection);

			const invocation = toolsService.begunToolCalls.find(invocation => invocation.toolCallId === 'tool-call-1');
			const stateBeforeApproval = invocation?.state.get().type;
			const parametersBeforeExecution = invocation?.parameters;

			const hydratedInvocation = invocation && {
				state: invocation.state.get().type,
				parameters: invocation.parameters,
				invocationMessage: invocation.invocationMessage,
				confirmationTitle: invocation.confirmationMessages?.title,
				approveCombination: invocation.confirmationMessages?.approveCombination,
				presentation: invocation.presentation,
				toolSpecificData: invocation.toolSpecificData,
			};
			const confirmationAccepted = IChatToolInvocation.confirmWith(invocation, { type: ToolConfirmKind.UserAction });
			await timeout(0);
			await timeout(0);

			assert.deepStrictEqual({
				stateBeforeApproval,
				parametersBeforeExecution,
				hydratedInvocation,
				confirmationAccepted,
				invocationsAfterClientExecution: toolsService.invokedToolCalls.length,
				actions: connection.dispatchedActions
					.filter(entry => isChatAction(entry.action)
						&& (entry.action.type === ActionType.ChatToolCallConfirmed || entry.action.type === ActionType.ChatToolCallComplete)
						&& entry.action.toolCallId === 'tool-call-1')
					.map(entry => {
						if (entry.action.type === ActionType.ChatToolCallConfirmed) {
							return { type: entry.action.type, approved: entry.action.approved, confirmed: entry.action.approved ? entry.action.confirmed : undefined };
						}
						if (entry.action.type === ActionType.ChatToolCallComplete) {
							return { type: entry.action.type, success: entry.action.result.success };
						}
						throw new Error(`Unexpected action type: ${entry.action.type}`);
					}),
			}, {
				stateBeforeApproval: IChatToolInvocation.StateKind.WaitingForConfirmation,
				parametersBeforeExecution: { task: 'build' },
				hydratedInvocation: {
					state: IChatToolInvocation.StateKind.WaitingForConfirmation,
					parameters: { task: 'build' },
					invocationMessage: 'Run build',
					confirmationTitle: 'Confirm tool execution',
					approveCombination: {
						label: 'Approve build',
						key: '{"task":"build"}',
						arguments: '{"task":"build"}',
					},
					presentation: ToolInvocationPresentation.HiddenAfterComplete,
					toolSpecificData: {
						kind: 'simpleToolInvocation',
						input: '{"task":"build"}',
						output: '',
					},
				},
				confirmationAccepted: true,
				invocationsAfterClientExecution: 1,
				actions: [
					{ type: ActionType.ChatToolCallConfirmed, approved: true, confirmed: ToolCallConfirmationReason.UserAction },
					{ type: ActionType.ChatToolCallComplete, success: true },
				],
			});
		});

		test('ignores protocol confirmation when the client tool does not require it', async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
			await provideSessionWithPendingConfirmationClientTool(handler, connection);
			await timeout(0);

			const invocation = toolsService.begunToolCalls[0];
			const confirmation = connection.dispatchedActions.find(entry => isChatAction(entry.action)
				&& entry.action.type === ActionType.ChatToolCallConfirmed
				&& entry.action.toolCallId === 'tool-call-1');
			assert.deepStrictEqual({
				invocations: toolsService.invokedToolCalls.length,
				preApproved: toolsService.invokedToolCalls[0]?.preApproved,
				sawWaitingForConfirmation: (toolsService.recordedStateKinds.get('tool-call-1') ?? []).includes(IChatToolInvocation.StateKind.WaitingForConfirmation),
				confirmationMessages: invocation.confirmationMessages,
				confirmation: confirmation?.action,
			}, {
				invocations: 1,
				preApproved: undefined,
				sawWaitingForConfirmation: false,
				confirmationMessages: undefined,
				confirmation: {
					type: ActionType.ChatToolCallConfirmed,
					turnId: 'turn-1',
					toolCallId: 'tool-call-1',
					approved: true,
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});
		});

		test('preserves the client tool confirmation reason through execution', async () => {
			const reasons = [
				ToolCallConfirmationReason.NotNeeded,
				ToolCallConfirmationReason.Setting,
				ToolCallConfirmationReason.UserAction,
			];

			const results: unknown[] = [];
			for (const reason of reasons) {
				const local = disposables.add(new DisposableStore());
				const { handler, connection, toolsService } = createHandlerWithMocks(local, [testRunTaskTool], { requireConfirmation: true });
				await provideSessionWithPendingConfirmationClientTool(handler, connection);
				const confirmedReason = reason === ToolCallConfirmationReason.NotNeeded
					? { type: ToolConfirmKind.ConfirmationNotNeeded as const }
					: reason === ToolCallConfirmationReason.Setting
						? { type: ToolConfirmKind.Setting as const, id: 'test-setting' }
						: { type: ToolConfirmKind.UserAction as const };

				IChatToolInvocation.confirmWith(
					toolsService.begunToolCalls.find(invocation => invocation.toolCallId === 'tool-call-1'),
					confirmedReason,
				);
				await timeout(0);
				await timeout(0);

				const confirmedAction = connection.dispatchedActions.find(entry => isChatAction(entry.action)
					&& entry.action.type === ActionType.ChatToolCallConfirmed
					&& entry.action.toolCallId === 'tool-call-1');
				results.push({
					reason,
					dispatchedConfirmed: confirmedAction && confirmedAction.action.type === ActionType.ChatToolCallConfirmed && confirmedAction.action.approved
						? confirmedAction.action.confirmed
						: undefined,
					completed: connection.dispatchedActions.some(entry => isChatAction(entry.action)
						&& entry.action.type === ActionType.ChatToolCallComplete
						&& entry.action.toolCallId === 'tool-call-1'
						&& entry.action.result.success === true),
				});

				disposables.delete(local);
			}

			assert.deepStrictEqual(results, reasons.map(reason => ({
				reason,
				dispatchedConfirmed: reason,
				completed: true,
			})));
		});

		test('does not execute again when the protocol advances the locally invoked tool to running', async () => {
			const invokeResult = new DeferredPromise<IToolResult>();
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool], { invokeResult });
			const chatURI = await provideSessionWithPendingConfirmationClientTool(handler, connection);

			applyRunningClientExecution(connection, chatURI.toString(), 'turn-1', {
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
			await timeout(0);

			assert.deepStrictEqual({
				invoked: toolsService.invokedToolCalls.filter(invocation => invocation.chatStreamToolCallId === 'tool-call-1').length,
				dispatchedApproval: connection.dispatchedActions.some(entry => isChatAction(entry.action)
					&& entry.action.type === ActionType.ChatToolCallConfirmed
					&& entry.action.toolCallId === 'tool-call-1'
					&& entry.action.approved === true),
			}, {
				invoked: 1,
				dispatchedApproval: true,
			});
			invokeResult.complete({ content: [{ kind: 'text', value: 'done' }] });
			await timeout(0);
		});

		test('cancels a confirming client tool when its confirmation request disappears', async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool], { requireConfirmation: true });
			await provideSessionWithPendingConfirmationClientTool(handler, connection);

			connection.applySessionAction(AgentSession.uri('copilot', 'session-1'), {
				type: ActionType.SessionInputNeededRemoved,
				id: 'confirmation-tool-call-1',
			});
			await timeout(0);
			await timeout(0);

			assert.deepStrictEqual({
				cancelled: toolsService.invocationTokens[0]?.isCancellationRequested,
				state: toolsService.begunToolCalls[0]?.state.get().type,
			}, {
				cancelled: true,
				state: IChatToolInvocation.StateKind.Cancelled,
			});
		});

		test('does not execute a client tool skipped from another client while confirming', async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool], { requireConfirmation: true });
			const chatURI = await provideSessionWithPendingConfirmationClientTool(handler, connection);

			connection.applySessionAction(chatURI, {
				type: ActionType.ChatToolCallConfirmed,
				turnId: 'turn-1',
				toolCallId: 'tool-call-1',
				approved: false,
				reason: ToolCallCancellationReason.Skipped,
				reasonMessage: 'Run Task was skipped from another client',
			});
			await timeout(0);
			await timeout(0);

			assert.deepStrictEqual({
				executed: toolsService.executedToolCalls.length,
				state: toolsService.begunToolCalls[0]?.state.get().type,
				completions: connection.dispatchedActions.filter(entry => isChatAction(entry.action)
					&& entry.action.type === ActionType.ChatToolCallComplete
					&& entry.action.toolCallId === 'tool-call-1').length,
			}, {
				executed: 0,
				state: IChatToolInvocation.StateKind.Cancelled,
				completions: 0,
			});
		});

		test('transfers cancellation authority from confirmation to execution', async () => {
			const invokeResult = new DeferredPromise<IToolResult>();
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool], { requireConfirmation: true, invokeResult });
			const chatURI = await provideSessionWithPendingConfirmationClientTool(handler, connection);
			const invocation = toolsService.begunToolCalls[0];

			IChatToolInvocation.confirmWith(invocation, { type: ToolConfirmKind.UserAction });
			connection.applySessionAction(AgentSession.uri('copilot', 'session-1'), {
				type: ActionType.SessionInputNeededRemoved,
				id: 'confirmation-tool-call-1',
			});
			await timeout(0);
			assert.strictEqual(toolsService.invocationTokens[0]?.isCancellationRequested, false);

			applyRunningClientExecution(connection, chatURI.toString(), 'turn-1', {
				toolCallId: 'tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
				confirmed: ToolCallConfirmationReason.UserAction,
			});
			await timeout(0);
			connection.applySessionAction(AgentSession.uri('copilot', 'session-1'), {
				type: ActionType.SessionInputNeededRemoved,
				id: 'exec-tool-call-1',
			});
			await timeout(0);

			assert.deepStrictEqual({
				cancelled: toolsService.invocationTokens[0]?.isCancellationRequested,
				confirmations: connection.dispatchedActions.filter(entry => isChatAction(entry.action)
					&& entry.action.type === ActionType.ChatToolCallConfirmed
					&& entry.action.toolCallId === 'tool-call-1').length,
			}, {
				cancelled: true,
				confirmations: 1,
			});

			invokeResult.complete({ content: [{ kind: 'text', value: 'done' }] });
			await timeout(0);
		});

		test('reconnecting to an active turn with owned client tool completes the initial snapshot invocation', async () => {
			const { handler, connection } = createHandlerWithMocks(disposables, [testRunTaskTool]);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();

			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
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

		test('auto-denies an unclaimed session confirmation after the grace period', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { handler, connection } = createHandlerWithMocks(disposables, []);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const subagentChat = buildSubagentChatUri(backendSession, 'task-call-1');
			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);

			// No turn observer ever renders this confirmation, so nothing can
			// answer it; the watcher denies it once the grace window expires.
			connection.applySessionAction(URI.parse(backendSession), {
				type: ActionType.SessionInputNeededSet,
				request: {
					id: 'approval-1',
					kind: SessionInputRequestKind.ToolConfirmation,
					chat: subagentChat,
					turnId: 'subagent-turn-1',
					toolCall: {
						status: ToolCallStatus.PendingConfirmation,
						toolCallId: 'powershell-call-1',
						toolName: 'powershell',
						displayName: 'PowerShell',
						invocationMessage: 'Run PowerShell',
					},
				},
			});
			await timeout(UNOBSERVED_CLIENT_TOOL_GRACE_MS + 1);

			assert.deepStrictEqual(
				connection.dispatchedActions
					.filter(entry => entry.action.type === ActionType.ChatToolCallConfirmed && entry.action.toolCallId === 'powershell-call-1')
					.map(entry => ({ channel: entry.channel, action: entry.action })),
				[{
					channel: subagentChat,
					action: {
						type: ActionType.ChatToolCallConfirmed,
						turnId: 'subagent-turn-1',
						toolCallId: 'powershell-call-1',
						approved: false,
						reason: ToolCallCancellationReason.Denied,
					},
				}],
			);
		}));

		test('cancels an unclaimed chat input request after the grace period', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { handler, connection } = createHandlerWithMocks(disposables, []);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const subagentChat = buildSubagentChatUri(backendSession, 'task-call-1');
			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);

			// No turn observer renders this elicitation, so nothing can answer
			// it; the watcher cancels it once the grace window expires.
			connection.applySessionAction(URI.parse(backendSession), {
				type: ActionType.SessionInputNeededSet,
				request: {
					id: 'input-1',
					kind: SessionInputRequestKind.ChatInput,
					chat: subagentChat,
					request: { id: 'elicit-1', message: 'Pick one', questions: [] },
				},
			});
			await timeout(5001);

			assert.deepStrictEqual(
				connection.dispatchedActions
					.filter(entry => entry.action.type === ActionType.ChatInputCompleted)
					.map(entry => ({ channel: entry.channel, action: entry.action })),
				[{
					channel: subagentChat,
					action: {
						type: ActionType.ChatInputCompleted,
						requestId: 'elicit-1',
						response: ChatInputResponseKind.Cancel,
					},
				}],
			);
		}));

		test('does not cancel a chat input request a turn observer is rendering', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { handler, connection } = createHandlerWithMocks(disposables, []);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const chatURI = buildDefaultChatUri(backendSession);

			// The default-chat turn observer renders the elicitation, so it
			// claims the request and the watcher must leave it alone.
			connection.applySessionAction(URI.parse(chatURI), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'ask me', origin: { kind: MessageKind.User } },
			} as ChatAction);
			connection.applySessionAction(URI.parse(chatURI), {
				type: ActionType.ChatInputRequested,
				request: { id: 'elicit-1', message: 'Pick one', questions: [] },
			} as ChatAction);
			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			await timeout(0);

			connection.applySessionAction(URI.parse(backendSession), {
				type: ActionType.SessionInputNeededSet,
				request: {
					id: 'input-1',
					kind: SessionInputRequestKind.ChatInput,
					chat: chatURI,
					request: { id: 'elicit-1', message: 'Pick one', questions: [] },
				},
			});
			await timeout(5001);

			assert.strictEqual(connection.dispatchedActions.some(entry => entry.action.type === ActionType.ChatInputCompleted), false);

			// Settle the elicitation so the rendered carousel's cancellation
			// listener is disposed before teardown.
			connection.applySessionAction(URI.parse(chatURI), {
				type: ActionType.ChatInputCompleted,
				requestId: 'elicit-1',
				response: ChatInputResponseKind.Cancel,
			} as ChatAction);
			await timeout(0);
		}));

		test('cancels an unclaimed MCP authentication tool call after the grace period', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { handler, connection } = createHandlerWithMocks(disposables, []);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const subagentChat = buildSubagentChatUri(backendSession, 'task-call-1');
			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);

			// No turn observer renders this auth-required MCP tool call, so
			// nobody can drive authentication; the watcher cancels it once the
			// grace window expires.
			connection.applySessionAction(URI.parse(backendSession), {
				type: ActionType.SessionInputNeededSet,
				request: {
					id: 'auth-1',
					kind: SessionInputRequestKind.ToolAuthentication,
					chat: subagentChat,
					turnId: 'subagent-turn-1',
					toolCall: {
						status: ToolCallStatus.AuthRequired,
						toolCallId: 'mcp-call-1',
						toolName: 'notionSearch',
						displayName: 'Notion Search',
						invocationMessage: 'Search Notion',
						confirmed: ToolCallConfirmationReason.UserAction,
						contributor: { kind: ToolCallContributorKind.MCP, customizationId: 'notion-mcp' },
						auth: { reason: McpAuthRequiredReason.Required, resource: { resource: 'https://mcp.notion.com/mcp', authorization_servers: [] } },
					},
				},
			});
			await timeout(5001);

			assert.deepStrictEqual(
				connection.dispatchedActions
					.filter(entry => entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === 'mcp-call-1')
					.map(entry => ({ channel: entry.channel, action: entry.action })),
				[{
					channel: subagentChat,
					action: {
						type: ActionType.ChatToolCallComplete,
						turnId: 'subagent-turn-1',
						toolCallId: 'mcp-call-1',
						result: {
							success: false,
							pastTenseMessage: 'Cancelled tool call',
							error: { message: 'MCP authentication was cancelled', code: 'cancelled' },
						},
					},
				}],
			);
		}));

		test('does not cancel an MCP authentication tool call a turn observer is rendering', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { handler, connection } = createHandlerWithMocks(disposables, []);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const chatURI = buildDefaultChatUri(backendSession);

			// The default-chat observer renders the MCP tool call as it pauses
			// for authentication, so it claims the call and the watcher must
			// leave it alone.
			connection.applySessionAction(URI.parse(chatURI), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'search notion', origin: { kind: MessageKind.User } },
			} as ChatAction);
			connection.applySessionAction(URI.parse(chatURI), {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'mcp-call-1',
				toolName: 'notionSearch',
				displayName: 'Notion Search',
				contributor: { kind: ToolCallContributorKind.MCP, customizationId: 'notion-mcp' },
			} as ChatAction);
			connection.applySessionAction(URI.parse(chatURI), {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'mcp-call-1',
				invocationMessage: 'Search Notion',
				toolInput: '{}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			} as ChatAction);
			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			await timeout(0);
			connection.applySessionAction(URI.parse(chatURI), {
				type: ActionType.ChatToolCallAuthRequired,
				turnId: 'turn-1',
				toolCallId: 'mcp-call-1',
				auth: { reason: McpAuthRequiredReason.Required, resource: { resource: 'https://mcp.notion.com/mcp', authorization_servers: [] } },
			} as ChatAction);
			await timeout(0);

			connection.applySessionAction(URI.parse(backendSession), {
				type: ActionType.SessionInputNeededSet,
				request: {
					id: 'auth-1',
					kind: SessionInputRequestKind.ToolAuthentication,
					chat: chatURI,
					turnId: 'turn-1',
					toolCall: {
						status: ToolCallStatus.AuthRequired,
						toolCallId: 'mcp-call-1',
						toolName: 'notionSearch',
						displayName: 'Notion Search',
						invocationMessage: 'Search Notion',
						confirmed: ToolCallConfirmationReason.UserAction,
						contributor: { kind: ToolCallContributorKind.MCP, customizationId: 'notion-mcp' },
						auth: { reason: McpAuthRequiredReason.Required, resource: { resource: 'https://mcp.notion.com/mcp', authorization_servers: [] } },
					},
				},
			});
			await timeout(5001);

			assert.strictEqual(connection.dispatchedActions.some(entry => entry.action.type === ActionType.ChatToolCallComplete && entry.action.toolCallId === 'mcp-call-1'), false);
		}));

		test('renders a subagent client tool as the same invocation the watcher executes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			// The subagent observer renders the shared invocation and the
			// watcher executes it: both act on one object, invoked exactly once,
			// and the card renders in the subagent's own group.
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testSubagentTool, testRunTaskTool]);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const parentToolCallId = 'client-task-1';
			const subagentChat = buildSubagentChatUri(backendSession, parentToolCallId);
			const parentChat = URI.parse(buildDefaultChatUri(backendSession));

			connection.applySessionAction(parentChat, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'delegate work', origin: { kind: MessageKind.User } },
			});
			connection.applySessionAction(parentChat, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: parentToolCallId,
				toolName: 'task',
				displayName: 'Delegated Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
				_meta: { toolKind: 'subagent', subagentChatUri: subagentChat },
			});
			const session = await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			await timeout(0);
			connection.applySessionAction(parentChat, {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: parentToolCallId,
				invocationMessage: 'Delegating task',
				toolInput: '{}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});

			// The subagent runs a client tool.
			connection.applySessionAction(URI.parse(subagentChat), {
				type: ActionType.ChatTurnStarted,
				turnId: 'sub-turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: '', origin: { kind: MessageKind.User } },
			});
			connection.applySessionAction(URI.parse(subagentChat), {
				type: ActionType.ChatToolCallStart,
				turnId: 'sub-turn-1',
				toolCallId: 'runTask-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
			});
			connection.applySessionAction(URI.parse(subagentChat), {
				type: ActionType.ChatToolCallReady,
				turnId: 'sub-turn-1',
				toolCallId: 'runTask-call-1',
				invocationMessage: 'Run Task',
				toolInput: '{}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
			await timeout(0);

			// The host reports it as a running client-execution obligation.
			connection.applySessionAction(URI.parse(backendSession), {
				type: ActionType.SessionInputNeededSet,
				request: {
					id: 'exec-1',
					kind: SessionInputRequestKind.ToolClientExecution,
					clientId: connection.clientId,
					chat: subagentChat,
					turnId: 'sub-turn-1',
					toolCall: {
						status: ToolCallStatus.Running,
						toolCallId: 'runTask-call-1',
						toolName: 'runTask',
						displayName: 'Run Task',
						invocationMessage: 'Run Task',
						toolInput: '{}',
						confirmed: ToolCallConfirmationReason.NotNeeded,
					},
				},
			});
			await timeout(0);

			const rendered = (session as unknown as { progressObs: { get(): IChatProgress[] } }).progressObs.get()
				.find((part): part is ChatToolInvocation => part instanceof ChatToolInvocation && part.toolCallId === 'runTask-call-1');

			assert.deepStrictEqual({
				renderedInSubagentGroup: rendered?.subAgentInvocationId,
				renderedIsTheBegunInvocation: rendered === toolsService.begunToolCalls.find(inv => inv.toolCallId === 'runTask-call-1'),
				begun: toolsService.begunToolCalls.filter(inv => inv.toolCallId === 'runTask-call-1').length,
				invoked: toolsService.invokedToolCalls.filter(inv => inv.chatStreamToolCallId === 'runTask-call-1').length,
			}, {
				renderedInSubagentGroup: parentToolCallId,
				renderedIsTheBegunInvocation: true,
				begun: 1,
				invoked: 1,
			});
		}));

		test('runs an unclaimed non-confirmable client tool headlessly without waiting for the grace window', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const subagentChat = buildSubagentChatUri(backendSession, 'task-call-1');
			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);

			connection.applySessionAction(URI.parse(backendSession), {
				type: ActionType.SessionInputNeededSet,
				request: {
					id: 'execution-1',
					kind: SessionInputRequestKind.ToolClientExecution,
					chat: subagentChat,
					turnId: 'subagent-turn-1',
					clientId: connection.clientId,
					toolCall: {
						status: ToolCallStatus.Running,
						toolCallId: 'client-tool-1',
						toolName: 'runTask',
						displayName: 'Run Task',
						invocationMessage: 'Run Task',
						toolInput: '{"task":"build"}',
						confirmed: ToolCallConfirmationReason.NotNeeded,
						contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
					},
				},
			});
			// No grace wait: a non-confirmable tool that nobody is rendering
			// runs immediately and headlessly.
			await timeout(0);

			assert.deepStrictEqual({
				// Executed headlessly: no chat `context`, so the invocation does
				// not depend on the owning turn still being live.
				invocation: toolsService.invokedToolCalls.map(call => ({
					callId: call.callId,
					parameters: call.parameters,
					hasContext: call.context !== undefined,
					preApprovedKind: call.preApproved?.type,
				})),
				completion: connection.dispatchedActions.find(entry =>
					entry.channel === subagentChat
					&& entry.action.type === ActionType.ChatToolCallComplete),
			}, {
				invocation: [{
					callId: 'client-tool-1',
					parameters: { task: 'build' },
					hasContext: false,
					preApprovedKind: ToolConfirmKind.ConfirmationNotNeeded,
				}],
				completion: {
					channel: subagentChat,
					action: {
						type: ActionType.ChatToolCallComplete,
						turnId: 'subagent-turn-1',
						toolCallId: 'client-tool-1',
						result: {
							success: true,
							pastTenseMessage: 'Ran runTask',
							content: [{ type: 'text', text: 'done' }],
							error: undefined,
						},
					},
				},
			});
		}));

		test('executes a claimed client tool exactly once, with chat context', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const chat = buildDefaultChatUri(backendSession);
			connection.applySessionAction(URI.parse(chat), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'run the task', origin: { kind: MessageKind.User } },
			});
			connection.applySessionAction(URI.parse(chat), {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'client-tool-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
			});
			connection.applySessionAction(URI.parse(chat), {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'client-tool-1',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			connection.applySessionAction(URI.parse(backendSession), {
				type: ActionType.SessionInputNeededSet,
				request: {
					id: 'execution-1',
					kind: SessionInputRequestKind.ToolClientExecution,
					chat,
					turnId: 'turn-1',
					clientId: connection.clientId,
					toolCall: {
						status: ToolCallStatus.Running,
						toolCallId: 'client-tool-1',
						toolName: 'runTask',
						displayName: 'Run Task',
						invocationMessage: 'Run Task',
						toolInput: '{"task":"build"}',
						confirmed: ToolCallConfirmationReason.NotNeeded,
						contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
					},
				},
			});
			await timeout(5001);

			assert.deepStrictEqual({
				// A live turn observer renders the call, so the watcher runs it
				// once with chat context (not per-observer, not headless).
				invocations: toolsService.invokedToolCalls
					.filter(invocation => invocation.chatStreamToolCallId === 'client-tool-1')
					.map(invocation => invocation.context !== undefined),
				declines: connection.dispatchedActions.filter(entry =>
					entry.action.type === ActionType.ChatToolCallComplete
					&& entry.action.result.error?.code === 'clientUnavailable').length,
			}, {
				invocations: [true],
				declines: 0,
			});
		}));

		// Two sibling resources (default chat + peer chat) share one backend
		// session and therefore one session-level `inputNeeded` queue. Opening
		// each used to install its own watcher, so a single client-tool request
		// was invoked once per open resource — running real side effects N
		// times. The watcher is now ref-counted per backend session, so it
		// executes exactly once no matter how many siblings are open.
		async function openSiblingResourcesWithClaimedClientTool(
			handler: AgentHostSessionHandler,
			connection: MockAgentHostConnection,
		): Promise<{ sessionResource: URI; peerResource: URI; chat: string }> {
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const peerResource = URI.from({ scheme: 'agent-host-copilot', path: '/session-1', fragment: 'peer-1' });
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const chat = buildDefaultChatUri(backendSession);
			const peerChat = buildChatUri(backendSession, 'peer-1');
			const summary: SessionSummary = {
				resource: backendSession,
				provider: 'copilot',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: '2025-01-01T00:00:00.000Z',
				modifiedAt: '2025-01-01T00:00:00.000Z',
			};

			// Advertise the peer chat so the sibling resource resolves and
			// installs its own turn/inputNeeded watchers against the shared
			// backend session.
			connection.applySessionAction(URI.parse(backendSession), {
				type: ActionType.SessionChatAdded,
				summary: createDefaultChatSummary(summary, peerChat),
			} as SessionAction);

			connection.applySessionAction(URI.parse(chat), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'run the task', origin: { kind: MessageKind.User } },
			});
			connection.applySessionAction(URI.parse(chat), {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'client-tool-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
			});
			connection.applySessionAction(URI.parse(chat), {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'client-tool-1',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});

			// Only the default chat carries the tool call, so only its observer
			// claims it — the peer observer renders an empty chat.
			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			await handler.provideChatSessionContent(peerResource, CancellationToken.None);

			applyRunningClientExecution(connection, chat, 'turn-1', {
				toolCallId: 'client-tool-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
			});
			await timeout(5001);
			return { sessionResource, peerResource, chat };
		}

		test('two sibling resources on one backend session execute a client tool exactly once', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
			await openSiblingResourcesWithClaimedClientTool(handler, connection);

			assert.deepStrictEqual({
				invocations: toolsService.invokedToolCalls.filter(invocation => invocation.chatStreamToolCallId === 'client-tool-1').length,
			}, {
				invocations: 1,
			});
		}));

		test('a claimed client tool executes with the claiming observer\'s session resource as context', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testRunTaskTool]);
			const { sessionResource } = await openSiblingResourcesWithClaimedClientTool(handler, connection);

			assert.deepStrictEqual(
				toolsService.invokedToolCalls
					.filter(invocation => invocation.chatStreamToolCallId === 'client-tool-1')
					.map(invocation => invocation.context?.sessionResource.toString()),
				[sessionResource.toString()],
			);
		}));

		test('denies an unclaimed confirmable client tool after the grace window without executing it', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testConfirmTool]);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const subagentChat = buildSubagentChatUri(backendSession, 'task-call-1');
			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);

			// A tool that might ask for confirmation, with no observer to render
			// it: running headlessly would pop a modal nobody could answer, so
			// the watcher waits and then denies once the grace window expires.
			connection.applySessionAction(URI.parse(backendSession), {
				type: ActionType.SessionInputNeededSet,
				request: {
					id: 'execution-1',
					kind: SessionInputRequestKind.ToolClientExecution,
					chat: subagentChat,
					turnId: 'subagent-turn-1',
					clientId: connection.clientId,
					toolCall: {
						status: ToolCallStatus.Running,
						toolCallId: 'client-tool-1',
						toolName: 'deleteAll',
						displayName: 'Delete Everything',
						invocationMessage: 'Delete everything',
						toolInput: '{}',
						confirmed: ToolCallConfirmationReason.UserAction,
						contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
					},
				},
			});
			await timeout(5001);

			assert.deepStrictEqual({
				invocations: toolsService.invokedToolCalls.filter(invocation => invocation.chatStreamToolCallId === 'client-tool-1').length,
				denial: connection.dispatchedActions.find(entry =>
					entry.channel === subagentChat
					&& entry.action.type === ActionType.ChatToolCallComplete
					&& entry.action.toolCallId === 'client-tool-1')?.action,
			}, {
				invocations: 0,
				denial: {
					type: ActionType.ChatToolCallComplete,
					turnId: 'subagent-turn-1',
					toolCallId: 'client-tool-1',
					result: {
						success: false,
						pastTenseMessage: 'Couldn\'t run Delete Everything',
						error: {
							message: 'Delete Everything needs confirmation but no session was available to answer it.',
							code: 'clientUnavailable',
						},
					},
				},
			});
		}));

		test('does not run foreign or already-resolved client tools', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { handler, connection } = createHandlerWithMocks(disposables, [testRunTaskTool]);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const subagentChat = buildSubagentChatUri(backendSession, 'task-call-1');
			await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			const request = {
				id: 'execution-1',
				kind: SessionInputRequestKind.ToolClientExecution,
				chat: subagentChat,
				turnId: 'subagent-turn-1',
				clientId: 'other-client',
				toolCall: {
					status: ToolCallStatus.Running,
					toolCallId: 'client-tool-1',
					toolName: 'runTask',
					displayName: 'Run Task',
					invocationMessage: 'Run Task',
					toolInput: '{"task":"build"}',
					confirmed: ToolCallConfirmationReason.NotNeeded,
					contributor: { kind: ToolCallContributorKind.Client, clientId: 'other-client' },
				},
			} as const;
			connection.applySessionAction(URI.parse(backendSession), {
				type: ActionType.SessionInputNeededSet,
				request,
			});
			connection.applySessionAction(URI.parse(backendSession), {
				type: ActionType.SessionInputNeededSet,
				request: { ...request, id: 'execution-2', clientId: connection.clientId },
			});
			connection.applySessionAction(URI.parse(backendSession), {
				type: ActionType.SessionInputNeededRemoved,
				id: 'execution-2',
			});
			await timeout(5001);

			assert.strictEqual(connection.dispatchedActions.some(entry => entry.action.type === ActionType.ChatToolCallComplete), false);
		}));

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
				startedAt: '2025-01-01T00:00:00.000Z',
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
				startedAt: '2025-01-01T00:00:00.000Z',
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
			applyRunningClientExecution(connection, subagentChat, 'sub-turn-1', {
				toolCallId: 'inner-tool-call-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
			await timeout(0);
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

		test('observes child tools from a client-provided delegated task', async () => {
			const { handler, connection, toolsService } = createHandlerWithMocks(disposables, [testSubagentTool]);
			const sessionResource = URI.parse('agent-host-copilot:/session-1');
			const backendSession = AgentSession.uri('copilot', 'session-1').toString();
			const parentToolCallId = 'client-task-1';
			const subagentChat = buildSubagentChatUri(backendSession, parentToolCallId);

			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'delegate work', origin: { kind: MessageKind.User } },
			});
			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: parentToolCallId,
				toolName: 'task',
				displayName: 'Delegated Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: connection.clientId },
				_meta: { toolKind: 'subagent', subagentChatUri: subagentChat },
			});

			const session = await handler.provideChatSessionContent(sessionResource, CancellationToken.None);
			await timeout(0);
			const parentInvocation = toolsService.begunToolCalls.find(part => part.toolCallId === parentToolCallId);
			assert.strictEqual(parentInvocation?.toolSpecificData?.kind, 'subagent');

			connection.applySessionAction(URI.parse(buildDefaultChatUri(backendSession)), {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: parentToolCallId,
				invocationMessage: 'Delegating task',
				toolInput: '{}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
			// The delegated `task` tool is client-contributed, so the watcher
			// runs it locally; invoking it is what prepares the subagent
			// container (mock sets the `Prepared delegated task` description).
			applyRunningClientExecution(connection, buildDefaultChatUri(backendSession), 'turn-1', {
				toolCallId: parentToolCallId,
				toolName: 'task',
				displayName: 'Delegated Task',
				invocationMessage: 'Delegating task',
				toolInput: '{}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
			await timeout(0);
			connection.applySessionAction(URI.parse(subagentChat), {
				type: ActionType.ChatTurnStarted,
				turnId: 'sub-turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: '', origin: { kind: MessageKind.User } },
			});
			connection.applySessionAction(URI.parse(subagentChat), {
				type: ActionType.ChatToolCallStart,
				turnId: 'sub-turn-1',
				toolCallId: 'child-tool-1',
				toolName: 'bash',
				displayName: 'Bash',
			});
			connection.applySessionAction(URI.parse(subagentChat), {
				type: ActionType.ChatToolCallReady,
				turnId: 'sub-turn-1',
				toolCallId: 'child-tool-1',
				invocationMessage: 'Inspecting changes',
				toolInput: '{}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});

			await timeout(0);
			await timeout(0);

			const progress = (session as unknown as { progressObs: { get(): IChatProgress[] } }).progressObs.get();
			const childInvocations = progress.filter((part): part is ChatToolInvocation =>
				part instanceof ChatToolInvocation && part.toolCallId === 'child-tool-1');
			assert.deepStrictEqual({
				parent: parentInvocation?.toolSpecificData,
				childCount: childInvocations.length,
				childSubAgentInvocationId: childInvocations[0]?.subAgentInvocationId,
			}, {
				parent: {
					kind: 'subagent',
					description: 'Prepared delegated task',
					agentName: undefined,
					chatResource: subagentChat,
					isActive: true,
					startedAt: Date.parse('2025-01-01T00:00:00.000Z'),
					duration: undefined,
				},
				childCount: 1,
				childSubAgentInvocationId: parentToolCallId,
			});
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
				type: ActionType.ChatTurnStarted, turnId: 'turn-1', startedAt: '2025-01-01T00:00:00.000Z',
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
				type: ActionType.ChatTurnStarted, turnId: 'sub-turn-1', startedAt: '2025-01-01T00:00:00.000Z',
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
				type: ActionType.ChatTurnStarted, turnId: 'sub-turn-2', startedAt: '2025-01-01T00:00:00.000Z',
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
			applyRunningClientExecution(connection, subagentChat2, 'sub-turn-2', {
				toolCallId: 'deep-tool-call',
				toolName: 'runTask',
				displayName: 'Run Task',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
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
				type: ActionType.ChatTurnStarted, turnId: 'turn-1', startedAt: '2025-01-01T00:00:00.000Z',
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
				type: ActionType.ChatTurnStarted, turnId: 'sub-turn-1', startedAt: '2025-01-01T00:00:00.000Z',
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
				type: ActionType.ChatTurnStarted, turnId: 'sub-turn-2', startedAt: '2025-01-01T00:00:00.000Z',
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
			applyRunningClientExecution(connection, subagentChat2, 'sub-turn-2', {
				toolCallId: 'deep-tool-call',
				toolName: 'runTask',
				displayName: 'Run Task',
				invocationMessage: 'Run Task',
				toolInput: '{"task":"build"}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
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
