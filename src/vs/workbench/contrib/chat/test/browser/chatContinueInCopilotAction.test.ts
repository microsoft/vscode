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
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { IChatModel, IChatModelInputState, IChatRequestModel, IChatResponseModel, IInputModel } from '../../common/model/chatModel.js';
import { LocalChatSessionUri, getChatSessionType } from '../../common/model/chatUri.js';
import { ChatViewModel } from '../../common/model/chatViewModel.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../common/languageModels.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { IAgentHostNewSessionFolderService } from '../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { IAgentSessionsService } from '../../browser/agentSessions/agentSessionsService.js';
import { IAgentSession, IAgentSessionsModel } from '../../browser/agentSessions/agentSessionsModel.js';

suite('Continue in Copilot policy recovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const sidebar of [false, true]) {
		for (const scenario of ['local', SessionType.AgentHostClaude, SessionType.AgentHostCodex, 'empty', 'unavailable', 'prepare-failed', 'import-failed', 'import-missing', 'open-failed', 'open-cancelled', 'double-click', 'archived', 'unresolved-history', 'missing-history', 'cancelled', 'in-progress']) {
			test(`preserves draft and does not send for ${scenario} in ${sidebar ? 'panel' : 'editor'}`, async () => {
				const services = store.add(new TestInstantiationService());
				const imports = new AgentHostImportConversationStore();
				const source = scenario === SessionType.AgentHostClaude || scenario === SessionType.AgentHostCodex
					? URI.from({ scheme: scenario, path: '/source' }) : LocalChatSessionUri.forSession('source');
				const inputUri = URI.parse('vscode-chat-input:source');
				const request = upcastPartial<IChatRequestModel>({
					message: { text: 'Original question', parts: [] },
					response: upcastPartial<IChatResponseModel>({
						entireResponse: upcastPartial<IChatResponseModel['entireResponse']>({ value: [{ kind: 'markdownContent', content: new MarkdownString('Original answer') }] }),
					}),
				});
				const model = upcastPartial<IChatModel>({ sessionResource: source, getRequests: () => scenario === 'empty' ? [] : [request], requestInProgress: constObservable(scenario === 'in-progress') });
				const attachment = { kind: 'file' as const, id: 'file', name: 'example.txt', value: URI.file('/workspace/example.txt') };
				const widget = upcastPartial<IChatWidget>({
					viewModel: upcastPartial<ChatViewModel>({ sessionResource: source, model }),
					viewContext: sidebar ? { viewId: ChatViewId } : {},
					input: upcastPartial<ChatInputPart>({
						selectedLanguageModel: constObservable(upcastPartial<ILanguageModelChatMetadataAndIdentifier>({ identifier: 'old-model' })),
					}),
					getInput: () => 'Unsent follow-up',
					getInputState: () => upcastPartial<IChatModelInputState>({ inputText: 'Unsent follow-up', attachments: [attachment], selections: [] }),
				});
				let target: URI | undefined;
				let imported: IAgentHostImportConversation | undefined;
				let draft: Partial<IChatModelInputState> | undefined;
				const preparation: string[] = [];
				const telemetry: { event: string; data: object | undefined }[] = [];
				const assertTelemetry = (outcome: 'succeeded' | 'failed' | 'cancelled') => assert.deepStrictEqual(telemetry, ['started', outcome].map(outcome => ({
					event: 'chat.enterprisePolicyRecovery',
					data: { action: scenario === 'empty' ? 'newChat' : 'migrate', location: sidebar ? 'panel' : 'editor', outcome },
				})));
				services.stub(ITelemetryService, { publicLog2: (event, data) => { telemetry.push({ event, data }); } });
				let archived = scenario === 'archived';
				let historyResolved = scenario !== 'unresolved-history';
				const openStarted = new DeferredPromise<void>();
				const opening = new DeferredPromise<void>();
				const real = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/imported' });
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
						return { resource: real, label: 'Imported', timing: { created: 0, lastRequestStarted: undefined, lastRequestEnded: undefined } };
					},
					registerSessionResourceAlias: () => { },
					notifySessionMaterialized: () => { },
				});
				services.stub(IAgentHostUntitledProvisionalSessionService, {
					getOrCreate: async () => { preparation.push('prepare'); return scenario === 'prepare-failed' ? undefined : real; },
					get: () => real,
					disposeSession: async () => { preparation.push('release draft'); },
					releaseSession: () => { preparation.push('retain imported session'); },
				});
				services.stub(IAgentHostNewSessionFolderService, { resolveNewSessionPrimary: () => undefined });
				services.stub(ICustomizationHarnessService, {});
				services.stub(ILanguageModelToolsService, {});
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
				const execute = () => services.invokeFunction(accessor => action.run(accessor, { $mid: MarshalledId.ChatViewContext, sessionResource: source, inputUri }));
				const run = execute();
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
				if (scenario === 'unavailable' || scenario === 'prepare-failed' || scenario === 'import-failed' || scenario === 'import-missing' || scenario === 'open-failed' || scenario === 'open-cancelled' || scenario === 'archived' || scenario === 'missing-history' || scenario === 'cancelled' || scenario === 'in-progress') {
					const error = scenario === 'import-failed' ? /Import rejected/
						: scenario === 'cancelled' ? /Canceled/
							: /Couldn't move this chat to Copilot/;
					await assert.rejects(run, error);
					assertTelemetry(scenario === 'cancelled' ? 'cancelled' : 'failed');
					assert.deepStrictEqual({ target, draft: widget.getInput(), history: model.getRequests().length, preparation, archived }, {
						target: undefined, draft: 'Unsent follow-up', history: 1, archived: scenario === 'archived',
						preparation: scenario === 'unavailable' || scenario === 'archived' || scenario === 'missing-history' || scenario === 'cancelled' || scenario === 'in-progress' ? [] : scenario === 'prepare-failed' ? ['prepare', 'release draft']
							: scenario === 'open-failed' || scenario === 'open-cancelled' ? ['prepare', 'import', 'release draft', 'open'] : ['prepare', 'import', 'release draft'],
					});
					return;
				}
				await run;
				assertTelemetry('succeeded');
				assert.deepStrictEqual({
					target: target && getChatSessionType(target),
					history: imported?.turns.map(turn => ({ text: turn.message.text, response: turn.responseParts.map(part => part.kind === 'markdown' ? { kind: part.kind, content: part.content } : part) })),
					draft, preparation, archived, modelOverride: imported?.model, originalDraft: widget.getInput(), originalRequests: model.getRequests().length,
				}, {
					target: SessionType.AgentHostCopilot,
					history: scenario === 'empty' ? undefined : [{ text: 'Original question', response: [{ kind: 'markdown', content: 'Original answer' }] }],
					draft: { inputText: 'Unsent follow-up', attachments: [attachment], selections: [] },
					preparation: scenario === 'empty' ? ['open'] : ['prepare', 'import', 'release draft', 'open', 'retain imported session', 'archive'],
					archived: scenario !== 'empty',
					modelOverride: undefined, originalDraft: 'Unsent follow-up', originalRequests: scenario === 'empty' ? 0 : 1,
				});
			});
		}
	}
});
