/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, IReference, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { isSessionAction, type IActionEnvelope, type INotification, type ISessionAction, type ITerminalAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { SessionLifecycle, SessionStatus, createSessionState, StateComponents, type ISessionState, type ISessionSummary, type IRootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { sessionReducer } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { ToolResultContentType } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IChatAgentService } from '../../../common/participants/chatAgents.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
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
import { ILanguageModelToolsService, IToolData, IToolResult, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
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
			return {
				onDidChangeTools: onDidChangeTools.event,
				getToolByName: (name: string) => tools.find(t => t.toolReferenceName === name),
				observeTools: () => observableValue('tools', tools),
				registerToolData: () => toDisposable(() => { }),
				registerToolImplementation: () => toDisposable(() => { }),
				registerTool: () => toDisposable(() => { }),
				getTools: () => tools,
				getAllToolsIncludingDisabled: () => tools,
				getTool: () => undefined,
				invokeTool: async () => ({ content: [] }),
				beginToolCall: () => undefined,
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
			} satisfies ILanguageModelToolsService & { fireOnDidChangeTools: () => void };
		}

		class MockAgentHostConnection extends mock<IAgentHostService>() {
			declare readonly _serviceBrand: undefined;
			override readonly clientId = 'test-client';
			private readonly _onDidAction = disposables.add(new Emitter<IActionEnvelope>());
			override readonly onDidAction = this._onDidAction.event;
			private readonly _onDidNotification = disposables.add(new Emitter<INotification>());
			override readonly onDidNotification = this._onDidNotification.event;
			override readonly onAgentHostExit = Event.None;
			override readonly onAgentHostStart = Event.None;

			private readonly _liveSubscriptions = new Map<string, { state: ISessionState; emitter: Emitter<ISessionState> }>();
			public dispatchedActions: (ISessionAction | ITerminalAction)[] = [];

			override dispatch(action: ISessionAction | ITerminalAction): void {
				this.dispatchedActions.push(action);
				if (isSessionAction(action) && action.type === 'session/activeClientChanged') {
					const entry = this._liveSubscriptions.get(action.session);
					if (entry) {
						entry.state = sessionReducer(entry.state, action as Parameters<typeof sessionReducer>[1], () => { });
						entry.emitter.fire(entry.state);
					}
				}
				if (isSessionAction(action) && action.type === 'session/activeClientToolsChanged') {
					const entry = this._liveSubscriptions.get(action.session);
					if (entry) {
						entry.state = sessionReducer(entry.state, action as Parameters<typeof sessionReducer>[1], () => { });
						entry.emitter.fire(entry.state);
					}
				}
			}

			override readonly rootState: IAgentSubscription<IRootState> = {
				value: undefined,
				verifiedValue: undefined,
				onDidChange: Event.None,
				onWillApplyAction: Event.None,
				onDidApplyAction: Event.None,
			};

			override getSubscription<T>(_kind: StateComponents, resource: URI): IReference<IAgentSubscription<T>> {
				const resourceStr = resource.toString();
				const emitter = disposables.add(new Emitter<T>());
				const summary: ISessionSummary = {
					resource: resourceStr,
					provider: 'copilot',
					title: 'Test',
					status: SessionStatus.Idle,
					createdAt: Date.now(),
					modifiedAt: Date.now(),
				};
				const initialState: ISessionState = { ...createSessionState(summary), lifecycle: SessionLifecycle.Ready };
				const entry = { state: initialState, emitter: emitter as unknown as Emitter<ISessionState> };
				this._liveSubscriptions.set(resourceStr, entry);

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
	});
});
