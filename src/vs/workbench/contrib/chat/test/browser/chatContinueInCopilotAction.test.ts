/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../base/common/uri.js';
import { hasKey } from '../../../../../base/common/types.js';
import { mockObject, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IManagedSettingsService } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ContinueChatInCopilotAction } from '../../browser/actions/chatContinueInAction.js';
import { AgentHostImportConversationStore, IAgentHostImportConversation, IAgentHostImportConversationStore } from '../../browser/agentSessions/agentHost/agentHostImportConversationStore.js';
import { ChatViewId, IChatWidget, IChatWidgetService } from '../../browser/chat.js';
import { ChatInputPart } from '../../browser/widget/input/chatInputPart.js';
import { ChatViewPane } from '../../browser/widgetHosts/viewPane/chatViewPane.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { IChatSessionsService, SessionType } from '../../common/chatSessionsService.js';
import { ChatModeKind } from '../../common/constants.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { IChatModel, IChatModelInputState, IChatRequestModeInfo, IChatRequestModel, IChatResponseModel, IInputModel } from '../../common/model/chatModel.js';
import { LocalChatSessionUri, getChatSessionType } from '../../common/model/chatUri.js';
import { ChatViewModel } from '../../common/model/chatViewModel.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../common/languageModels.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { IAgentHostNewSessionFolderService } from '../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { IWorkspaceContextService, type IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IHistoryService } from '../../../../services/history/common/history.js';
import { IAgentSessionsService } from '../../browser/agentSessions/agentSessionsService.js';
import { IAgentSession, IAgentSessionsModel } from '../../browser/agentSessions/agentSessionsModel.js';
import { AgentHostClientConnectionKind } from '../../../../../platform/agentHost/common/agentHostTelemetry.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';

suite('Continue in Copilot policy recovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const sidebar of [false, true]) {
		for (const scenario of ['local', 'selected-model', 'historical-model', 'unresolved-model', 'custom-agent', SessionType.AgentHostClaude, SessionType.AgentHostCodex, 'empty', 'unavailable', 'unsupported', 'archived-unsupported', 'archived-remote', 'prepare-failed', 'import-failed', 'import-missing', 'history-missing', 'history-load-error', 'open-failed', 'open-cancelled', 'double-click', 'archived', 'unresolved-history', 'missing-history', 'cancelled', 'in-progress', 'hidden', 'switched', 'hidden-during-preparation', 'hidden-during-materialization', 'switched-during-materialization', 'cleanup-failed']) {
			test(`preserves draft and does not send for ${scenario} in ${sidebar ? 'panel' : 'editor'}`, async () => {
				const services = store.add(new TestInstantiationService());
				const imports = new AgentHostImportConversationStore();
				const source = scenario === SessionType.AgentHostClaude || scenario === SessionType.AgentHostCodex
					? URI.from({ scheme: scenario, path: '/source' }) : LocalChatSessionUri.forSession('source');
				const inputUri = URI.parse('vscode-chat-input:source');
				const agentFile = URI.file('/workspace/.github/agents/reviewer.agent.md');
				// The request's model is resolved per turn; the input's selected model, else the last turn's, becomes the session model.
				const requestModelId = scenario === 'selected-model' || scenario === 'historical-model' ? 'copilot/gpt-5' : scenario === 'unresolved-model' ? 'byok/llama' : undefined;
				const selectedModelId = scenario === 'selected-model' ? 'copilot/claude-sonnet-5' : scenario === 'unresolved-model' ? 'byok/llama' : 'old-model';
				const expected = {
					turnModel: requestModelId === 'copilot/gpt-5' ? { id: 'gpt-5' } : undefined,
					sessionModel: scenario === 'selected-model' ? { id: 'claude-sonnet-5' } : scenario === 'historical-model' ? { id: 'gpt-5' } : undefined,
				};
				const request = upcastPartial<IChatRequestModel>({
					message: { text: 'Original question', parts: [] },
					modelId: requestModelId,
					response: upcastPartial<IChatResponseModel>({
						entireResponse: upcastPartial<IChatResponseModel['entireResponse']>({ value: [{ kind: 'markdownContent', content: new MarkdownString('Original answer') }] }),
						contentReferences: [], codeCitations: [],
						response: upcastPartial<IChatResponseModel['response']>({ getMarkdown: () => 'Original answer' }),
					}),
				});
				const model = upcastPartial<IChatModel>({ sessionResource: source, title: 'Local conversation title', getRequests: () => scenario === 'empty' ? [] : [request], hasRequests: scenario !== 'empty', requestInProgress: constObservable(scenario === 'in-progress') });
				const attachment = { kind: 'file' as const, id: 'file', name: 'example.txt', value: URI.file('/workspace/example.txt') };
				const widget = upcastPartial<IChatWidget>({
					visible: true,
					viewModel: upcastPartial<ChatViewModel>({ sessionResource: source, model }),
					viewContext: sidebar ? { viewId: ChatViewId } : {},
					input: upcastPartial<ChatInputPart>({
						selectedLanguageModel: constObservable(upcastPartial<ILanguageModelChatMetadataAndIdentifier>({ identifier: selectedModelId })),
						currentModeInfo: upcastPartial<IChatRequestModeInfo>(scenario === 'custom-agent'
							? { kind: ChatModeKind.Agent, isBuiltin: false, modeInstructions: { uri: agentFile, name: 'reviewer', content: '', toolReferences: [] } }
							: { kind: ChatModeKind.Agent, isBuiltin: true, modeInstructions: undefined }),
					}),
					getInput: () => 'Unsent follow-up',
					getInputState: () => upcastPartial<IChatModelInputState>({ inputText: 'Unsent follow-up', attachments: [attachment], selections: [] }),
				});
				let target: URI | undefined;
				let imported: IAgentHostImportConversation | undefined;
				let draft: Partial<IChatModelInputState> | undefined;
				const preparation: string[] = [];
				const telemetry: { event: string; data: object | undefined }[] = [];
				const importEvents: (object | undefined)[] = [];
				const migrationEvents: object[] = [];
				// A move of a Local chat is also reported as a Local chat migration; Claude and Codex chats are not.
				const localSourceScenario = scenario !== SessionType.AgentHostClaude && scenario !== SessionType.AgentHostCodex;
				const migrationKind = scenario === 'empty' ? 'newChat' : scenario === 'unsupported' || scenario === 'archived-unsupported' ? 'transcript' : 'migrate';
				const expectedMigration = (outcome: 'succeeded' | 'failed' | 'cancelled', failureReason = 'none') => localSourceScenario ? (['started', outcome] as const).map(event => ({
					entryPoint: 'move', trigger: sidebar ? 'automatic' : 'manual', policyRequired: false, kind: migrationKind,
					target: SessionType.AgentHostCopilot, location: sidebar ? 'panel' : 'editor', turns: migrationKind === 'migrate' ? 1 : 0,
					outcome: event, failureReason: event === 'started' ? 'none' : failureReason, timed: true,
				})) : [];
				const assertTelemetry = (outcome: 'succeeded' | 'failed' | 'cancelled', failureReason?: string) => assert.deepStrictEqual({ telemetry, migrationEvents }, {
					telemetry: ['started', outcome].map(outcome => ({
						event: 'chat.enterprisePolicyRecovery',
						data: { action: scenario === 'empty' ? 'newChat' : 'migrate', location: sidebar ? 'panel' : 'editor', outcome },
					})),
					migrationEvents: expectedMigration(outcome, failureReason),
				});
				services.stub(ITelemetryService, {
					publicLog2: (event, data) => {
						if (event === 'chat.importConversation') {
							importEvents.push(data);
						} else if (event === 'chat.localChatMigration') {
							const { durationMs, ...rest } = data as { durationMs: number };
							migrationEvents.push({ ...rest, timed: typeof durationMs === 'number' && durationMs >= 0 });
						} else {
							telemetry.push({ event, data });
						}
					}
				});
				services.stub(IManagedSettingsService, { getManagedSettingValue: () => undefined });
				services.stub(IConfigurationService, { inspect: () => ({}) });
				let archived = scenario === 'archived' || scenario === 'archived-unsupported' || scenario === 'archived-remote';
				let historyResolved = scenario !== 'unresolved-history';
				const openStarted = new DeferredPromise<void>();
				const opening = new DeferredPromise<void>();
				const materializationStarted = new DeferredPromise<void>();
				const materializing = new DeferredPromise<void>();
				const cancelDuringMaterialization = scenario === 'hidden-during-materialization' || scenario === 'switched-during-materialization' || scenario === 'cleanup-failed';
				const real = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/imported' });
				let provisionalResource: URI | undefined;
				let preparedFolder: URI | undefined;
				let backendExists = false;
				let listed = false;
				const deleted: URI[] = [];
				const published: URI[] = [];
				const aliases: URI[] = [];
				const open = (resource: URI) => {
					preparation.push('open');
					if (scenario === 'open-failed') {
						throw new Error('Open failed');
					}
					if (scenario !== 'open-cancelled') {
						target = resource;
					}
				};
				const targetModel = upcastPartial<IChatModel>({
					getRequests: () => scenario === 'history-missing' || scenario === 'unsupported' || scenario === 'archived-unsupported' ? []
						: scenario === 'history-load-error' ? [upcastPartial<IChatRequestModel>({ message: { text: '', parts: [] }, isSystemInitiated: true })]
							: [request],
					inputModel: upcastPartial<IInputModel>({ setState: state => { draft = state; } }),
				});
				services.stub(IChatWidgetService, {
					getWidgetByInputUri: () => widget,
					getWidgetBySessionResource: resource => target?.toString() === resource.toString() ? widget : undefined,
				});
				services.stub(IAgentSessionsService, {
					model: upcastPartial<IAgentSessionsModel>({ resolve: async () => { historyResolved = true; } }),
					getSession: () => scenario === 'missing-history' || !historyResolved ? undefined : upcastPartial<IAgentSession>({
						isArchived: () => archived,
						setArchived: value => { archived = value; preparation.push('archive'); },
					}),
				});
				services.stub(IAgentHostImportConversationStore, imports);
				services.stub(ILogService, new NullLogService());
				services.stub(IChatService, {
					getSession: () => targetModel,
					sendRequest: async () => assert.fail('Policy recovery must not send a request'),
				});
				services.stub(IChatSessionsService, {
					canResolveChatSession: async () => {
						if (scenario === 'cancelled') {
							throw new CancellationError();
						}
						if (scenario === 'hidden') {
							Object.defineProperty(widget, 'visible', { value: false });
						} else if (scenario === 'switched') {
							Object.defineProperty(widget, 'viewModel', { value: undefined });
						}
						return scenario !== 'unavailable';
					},
					createNewChatSessionItem: async (_type, request) => {
						preparation.push('import');
						assert.strictEqual(request.prompt, '');
						if (scenario === 'import-failed') {
							throw new Error('Import rejected');
						}
						if (scenario === 'import-missing') {
							return undefined;
						}
						imported = imports.take(request.untitledResource!);
						provisionalResource = real;
						listed = true;
						materializationStarted.complete();
						if (cancelDuringMaterialization) {
							await materializing.p;
						}
						return { resource: real, label: 'Imported', timing: { created: 0, lastRequestStarted: undefined, lastRequestEnded: undefined } };
					},
					deleteChatSessionItem: async resource => {
						deleted.push(resource);
						if (scenario === 'cleanup-failed') {
							throw new Error('Cleanup failed');
						}
						backendExists = false;
						listed = false;
					},
					registerSessionResourceAlias: (_untitled, resource) => { aliases.push(resource); },
					notifySessionMaterialized: resource => { published.push(resource); },
				});
				services.stub(IAgentHostUntitledProvisionalSessionService, {
					getOrCreate: async (resource, _provider, workingDirectory) => {
						preparation.push('prepare');
						provisionalResource = resource;
						preparedFolder = workingDirectory;
						backendExists = scenario !== 'prepare-failed';
						if (scenario === 'hidden-during-preparation') {
							Object.defineProperty(widget, 'visible', { value: false });
						}
						return scenario === 'prepare-failed' ? undefined : real;
					},
					get: resource => provisionalResource?.toString() === resource.toString() ? real : undefined,
					disposeSession: async resource => {
						preparation.push('release draft');
						if (provisionalResource?.toString() === resource.toString()) {
							provisionalResource = undefined;
							backendExists = false;
						}
					},
					releaseSession: resource => {
						assert.strictEqual(resource.toString(), provisionalResource?.toString());
						provisionalResource = undefined;
						preparation.push('release imported ownership');
					},
				});
				// A multi-root window with folders /a and /b, whose last active editor is in /b.
				const chosenFolders = new Map<string, URI>();
				let defaultFolderChanged = false;
				services.stub(IAgentHostNewSessionFolderService, {
					setFolder: (resource, folder, options) => {
						chosenFolders.set(resource.toString(), folder);
						defaultFolderChanged ||= options?.updateDefault !== false;
					},
					clear: resource => { chosenFolders.delete(resource.toString()); },
					resolveNewSessionPrimary: resource => chosenFolders.get(resource.toString()),
				});
				services.stub(IWorkspaceContextService, {
					getWorkspaceFolder: uri => ['/a', '/b'].map(path => URI.file(path)).find(folder => uri.path === folder.path || uri.path.startsWith(`${folder.path}/`)) ? upcastPartial<IWorkspaceFolder>({ uri: URI.file(uri.path.split('/').slice(0, 2).join('/')) }) : null,
				});
				services.stub(IHistoryService, { getLastActiveWorkspaceRoot: () => URI.file('/b/src/index.ts') });
				services.stub(IAgentHostService, {
					supportsConversationImport: scenario !== 'unsupported' && scenario !== 'archived-unsupported',
					clientConnectionKind: scenario === 'archived-remote' ? AgentHostClientConnectionKind.RemoteExtensionHost : AgentHostClientConnectionKind.Local,
				});
				services.stub(ICustomizationHarnessService, {});
				services.stub(ILanguageModelToolsService, {});
				const languageModels: Record<string, Partial<ILanguageModelChatMetadata>> = {
					'copilot/gpt-5': { id: 'gpt-5', vendor: 'copilot' },
					'copilot/claude-sonnet-5': { id: 'claude-sonnet-5', vendor: 'copilot' },
					'byok/llama': { id: 'llama', vendor: 'byok' },
				};
				services.stub(ILanguageModelsService, { lookupLanguageModel: identifier => languageModels[identifier] && upcastPartial<ILanguageModelChatMetadata>(languageModels[identifier]) });
				services.stub(IProgressService, { withProgress: (_options, task) => task({ report: () => { } }) });
				services.stub(IEditorGroupsService, { groups: [] });
				services.stub(IEditorService, {
					openEditor: async input => {
						if (hasKey(input, { resource: true }) && URI.isUri(input.resource)) {
							open(input.resource);
						}
						openStarted.complete();
						if (scenario === 'double-click') {
							await opening.p;
						}
						return undefined;
					}
				});
				const views = mockObject<IViewsService>()();
				views.openView.resolves(upcastPartial<ChatViewPane>({
					loadSession: async resource => {
						open(resource);
						openStarted.complete();
						if (scenario === 'double-click') {
							await opening.p;
						}
						return undefined;
					}, focus: () => { },
					beginSessionsListSuppression: () => Disposable.None,
				}));
				services.stub(IViewsService, { openView: views.openView });
				const action = new ContinueChatInCopilotAction();
				// The policy move runs on its own when the panel opens a chat, and when the user chooses it in an editor.
				const execute = () => services.invokeFunction(accessor => action.run(accessor, { $mid: MarshalledId.ChatViewContext, sessionResource: source, inputUri, ...(sidebar ? { trigger: 'automatic' } : {}) }));
				const run = execute();
				if (cancelDuringMaterialization) {
					await materializationStarted.p;
					if (scenario === 'switched-during-materialization') {
						Object.defineProperty(widget, 'viewModel', { value: undefined });
					} else {
						Object.defineProperty(widget, 'visible', { value: false });
					}
					materializing.complete();
					const cleanupFailed = scenario === 'cleanup-failed';
					await assert.rejects(run, cleanupFailed ? /Cleanup failed/ : CancellationError);
					assertTelemetry(cleanupFailed ? 'failed' : 'cancelled', cleanupFailed ? 'unexpected' : undefined);
					assert.deepStrictEqual({
						target, draft, archived, backendExists, listed, provisionalResource,
						deleted, published, aliases, sourceRequests: model.getRequests().length, sourceDraft: widget.getInput(),
					}, {
						target: undefined, draft: undefined, archived: false,
						backendExists: cleanupFailed, listed: cleanupFailed, provisionalResource: cleanupFailed ? real : undefined,
						deleted: [real], published: [], aliases: [], sourceRequests: 1, sourceDraft: 'Unsent follow-up',
					});
					return;
				}
				if (scenario === 'double-click') {
					await openStarted.p;
					services.stub(IChatWidgetService, { getWidgetByInputUri: () => upcastPartial<IChatWidget>({ ...widget }) });
					const duplicate = execute();
					try {
						assert.strictEqual(archived, false, 'Do not archive before the destination opens');
					} finally {
						opening.complete();
					}
					await duplicate;
				}
				if (scenario === 'hidden' || scenario === 'switched' || scenario === 'hidden-during-preparation') {
					await assert.rejects(run, CancellationError);
					assertTelemetry('cancelled');
					assert.deepStrictEqual({ target, archived, draft, preparation, importEvents, chosenFolders: chosenFolders.size }, {
						target: undefined, archived: false, draft: undefined,
						preparation: scenario === 'hidden-during-preparation' ? ['prepare', 'release draft'] : [],
						importEvents: [],
						chosenFolders: 0,
					});
					return;
				}
				if (scenario === 'unavailable' || scenario === 'history-missing' || scenario === 'history-load-error' || scenario === 'prepare-failed' || scenario === 'import-failed' || scenario === 'import-missing' || scenario === 'open-failed' || scenario === 'open-cancelled' || scenario === 'archived' || scenario === 'missing-history' || scenario === 'cancelled' || scenario === 'in-progress') {
					const error = scenario === 'import-failed' ? /Import rejected/
						: scenario === 'cancelled' ? /Canceled/
							: scenario === 'history-missing' || scenario === 'history-load-error' ? /didn't load the moved conversation/
								: /Couldn't move this chat to Copilot/;
					await assert.rejects(run, error);
					assertTelemetry(scenario === 'cancelled' ? 'cancelled' : 'failed', ({
						'unavailable': 'targetUnavailable', 'prepare-failed': 'prepareFailed', 'import-failed': 'importFailed', 'import-missing': 'sessionNotCreated',
						'history-missing': 'historyMissing', 'history-load-error': 'historyMissing', 'open-failed': 'openFailed', 'open-cancelled': 'openFailed',
						'archived': 'sourceArchived', 'missing-history': 'sourceMissing', 'in-progress': 'requestInProgress',
					} as Record<string, string>)[scenario]);
					assert.deepStrictEqual({ target, draft: widget.getInput(), destinationDraft: draft, history: model.getRequests().length, preparation, archived, importEvents, chosenFolders: chosenFolders.size }, {
						target: scenario === 'history-missing' || scenario === 'history-load-error' ? real : undefined, draft: 'Unsent follow-up', destinationDraft: undefined, history: 1, archived: scenario === 'archived',
						preparation: scenario === 'unavailable' || scenario === 'archived' || scenario === 'missing-history' || scenario === 'cancelled' || scenario === 'in-progress' ? [] : scenario === 'prepare-failed' ? ['prepare', 'release draft']
							: scenario === 'open-failed' || scenario === 'open-cancelled' || scenario === 'history-missing' || scenario === 'history-load-error' ? ['prepare', 'import', 'release draft', 'open'] : ['prepare', 'import', 'release draft'],
						// A move that did not complete reports no import.
						importEvents: [],
						// Nor does it leave a folder chosen for a chat that never opened.
						chosenFolders: 0,
					});
					return;
				}
				await run;
				const transcriptOnly = scenario === 'unsupported' || scenario === 'archived-unsupported';
				const newChat = scenario === 'empty' || transcriptOnly;
				const localSource = scenario !== SessionType.AgentHostClaude && scenario !== SessionType.AgentHostCodex;
				assert.deepStrictEqual(telemetry.map(entry => entry.data), ['started', 'succeeded'].map(outcome => ({
					action: scenario === 'empty' ? 'newChat' : transcriptOnly ? 'transcript' : 'migrate', location: sidebar ? 'panel' : 'editor', outcome,
				})));
				// A concurrent duplicate attempt is counted once.
				assert.deepStrictEqual(migrationEvents, expectedMigration('succeeded'));
				assert.deepStrictEqual({
					target: target && getChatSessionType(target),
					title: imported?.title,
					history: imported?.turns.map(turn => ({ text: turn.message.text, model: turn.message.model, response: turn.responseParts.map(part => part.kind === 'markdown' ? { kind: part.kind, content: part.content } : part) })),
					draft: draft && { ...draft, attachments: draft.attachments?.map(entry => entry.id.startsWith('chat-delegation-transcript-') ? { transcript: entry.value } : entry) },
					preparation, archived, backendExists, listed, deleted, aliases, published, modelOverride: imported?.model, originalDraft: widget.getInput(), originalRequests: model.getRequests().length,
					importEvents,
					folder: { prepared: preparedFolder?.path, chosen: [...chosenFolders.values()].map(folder => folder.path), defaultChanged: defaultFolderChanged },
				}, {
					target: SessionType.AgentHostCopilot,
					title: newChat ? undefined : 'Local conversation title',
					history: newChat ? undefined : [{ text: 'Original question', model: expected.turnModel, response: [{ kind: 'markdown', content: 'Original answer' }] }],
					draft: {
						inputText: 'Unsent follow-up',
						attachments: transcriptOnly ? [{ transcript: 'The following is the conversation history from a previous Local session. Continue working on it.\n\nUser: Original question\nAssistant: Original answer' }, attachment] : [attachment],
						selections: [],
						...(scenario === 'custom-agent' ? { mode: { id: agentFile.toString(), kind: ChatModeKind.Agent } } : {}),
					},
					preparation: newChat ? ['open'] : ['prepare', 'import', 'release draft', 'open', 'release imported ownership', 'archive'],
					// A transcript continuation leaves the source archive state alone.
					archived: !newChat || scenario === 'archived-unsupported',
					backendExists: !newChat, listed: !newChat, deleted: [],
					aliases: newChat ? [] : [real],
					published: newChat ? [] : [real],
					modelOverride: expected.sessionModel, originalDraft: 'Unsent follow-up', originalRequests: scenario === 'empty' ? 0 : 1,
					// Only an actual import reports what it carried over.
					importEvents: newChat ? [] : [{
						source: 'move', turns: 1, editedFiles: 0,
						skippedResponseParts: 0, skippedResponsePartKinds: '',
						skippedAttachments: 0, skippedAttachmentKinds: '',
						droppedToolOutputs: 0,
					}],
					// A moved Local chat continues in the folder of the window's last active editor (its conversation ran no
					// terminal command), chosen for the new chat only. Claude and Codex chats keep the window's default.
					folder: {
						prepared: !newChat && localSource ? '/b' : undefined,
						chosen: scenario !== 'empty' && localSource ? ['/b'] : [],
						defaultChanged: false,
					},
				});
			});
		}
	}
});
