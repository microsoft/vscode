/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/sessionBoard.contribution.js';
import { sharedMutationObserver, size } from '../../../../../base/browser/dom.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { constObservable, ISettableObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { IMenuService, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IFileService, IFileStatWithMetadata } from '../../../../../platform/files/common/files.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ListService, IListService } from '../../../../../platform/list/browser/listService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { QuickInputService } from '../../../../../platform/quickinput/browser/quickInputService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatInputNotificationService } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputNotificationService.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { ChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatQuestionCarouselData } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ChatToolInvocation } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { ILanguageModelToolsConfirmationService } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsConfirmationService.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { ChatWidgetHistoryService, IChatWidgetHistoryService } from '../../../../../workbench/contrib/chat/common/widget/chatWidgetHistoryService.js';
import { ITerminalChatService } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { CustomViewNode } from '../../../../browser/parts/customViewNode.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionsBoardVisibleContext } from '../../../../common/contextkeys.js';
import { ARCHIVE_SESSION_COMMAND_ID, ARCHIVE_WORK_SESSION_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionInputDraft, ISessionInputDraftService } from '../../../../services/sessions/browser/sessionInputDraftService.js';
import { ISessionReviewService } from '../../../../services/sessions/browser/sessionReviewService.js';
import { ISessionWorkTrackingService } from '../../../../services/sessions/browser/sessionWorkTrackingService.js';
import { ISessionsBoardService, SessionsBoardService } from '../../../../services/sessions/browser/sessionsBoardService.js';
import { ISessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { VisibleSession } from '../../../../services/sessions/browser/visibleSessions.js';
import { ISession, SessionStatus, SessionTypeAuthRequirement } from '../../../../services/sessions/common/session.js';
import { ISessionChangesStatsCache } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { IActiveSession, IProviderSessionType, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { ISessionReviewState, SessionReviewSection } from '../../../../services/sessions/common/sessionReview.js';
import { createNewChatInputFixtureServices } from '../../../chat/test/browser/newChatInput.fixture.js';
import { NEW_SESSION_ACTION_ID } from '../../../chat/common/constants.js';
import { NewChatInSessionsWindowAction } from '../../../chat/browser/newChatInSessionsWindowAction.js';
import { NewSessionActionViewItem } from '../../browser/sessionsActions.js';
import { ISessionIntentService } from '../../../intent/common/sessionIntent.js';
import { IDashboardWorkExecution, IDashboardWorkService } from '../../../intent/common/dashboardWork.js';
import { makeSession } from '../../../layout/test/browser/layoutControllerTestUtils.js';
import { SessionReviewController } from '../../browser/sessionReviewController.js';
import { SessionBoardView } from '../../browser/views/sessionBoardView.js';
import { ArchiveSessionAction } from '../../browser/views/sessionsViewActions.js';
import { addWorkCardRequest, SessionWorkCardTestChatService } from './sessionWorkCardContentTestUtils.js';
import { configureSessionReviewConversationServices, createNativeSessionReviewFixture, registerSessionReviewConversationServices } from './sessionReviewFixtureUtils.js';

type Scenario = 'draft' | 'waitingQuestion' | 'waitingApproval' | 'inProgress' | 'backgroundWork' | 'journey' | 'archiveJourney';
const renderDuration = 2000;

async function renderAgentInput(context: ComponentFixtureContext, width = 1100, scenario: Scenario = 'draft'): Promise<void> {
	const { container } = context;
	const renderDeadline = Date.now() + renderDuration;
	const disposableStore = new DisposableStore();
	const teardown: { closeNativeModal?: () => Promise<boolean> } = {};
	context.disposableStore.add(toDisposable(() => {
		if (teardown.closeNativeModal) {
			void teardown.closeNativeModal().then(() => disposableStore.dispose(), error => {
				console.error(error);
				disposableStore.dispose();
			});
		} else {
			disposableStore.dispose();
		}
	}));
	const height = 760;
	container.classList.add('monaco-workbench', 'agent-sessions-workbench');
	size(container, width, height);
	const catalog = observableValue<readonly ISession[]>('catalog', []);
	const regularFolder = URI.parse('fixture-cloud:/example/website');
	const regularDraft: IActiveSession = {
		...makeSession(URI.parse('fixture:/regular-cloud-draft'), { status: SessionStatus.Untitled }),
		sessionType: 'cloud', title: constObservable('Keep my cloud draft'), modelId: constObservable('fixture/cloud-model'),
		workspace: constObservable({
			uri: regularFolder, label: 'website', icon: Codicon.repo, isVirtualWorkspace: true, requiresWorkspaceTrust: false,
			folders: [{ root: regularFolder, workingDirectory: regularFolder, name: 'website', description: undefined }],
		}),
	};
	const pending = observableValue<ISession | undefined>('pending', regularDraft);
	const dashboardDraft = observableValue<ISession | undefined>('dashboardDraft', undefined);
	const dashboardSessions = observableValue<readonly ISession[]>('dashboardSessions', []);
	const executions = observableValue<readonly IDashboardWorkExecution[]>('executions', []);
	const reviewState = observableValue<ISessionReviewState | undefined>('review', undefined);
	const visibleSessions = observableValue<readonly IActiveSession[]>('visibleSessions', [regularDraft]);
	const changed = disposableStore.add(new Emitter<ISessionsChangeEvent>());
	const started = disposableStore.add(new Emitter<ISession>());
	const chatService = new SessionWorkCardTestChatService(disposableStore);
	const draftStates = new ResourceMap<ISettableObservable<ISessionInputDraft>>();
	const getDraft = (resource: URI) => {
		let state = draftStates.get(resource);
		if (!state) {
			state = observableValue<ISessionInputDraft>('draft', { inputText: '', attachments: [] });
			draftStates.set(resource, state);
		}
		return state;
	};
	getDraft(regularDraft.mainChat.get().resource).set({ inputText: 'Keep this unrelated Cloud draft exactly as it is.', attachments: [] }, undefined);
	const regularSnapshot = () => JSON.stringify({
		pending: pending.get()?.resource.toString(), type: regularDraft.sessionType, title: regularDraft.title.get(),
		model: regularDraft.modelId.get(), workspace: regularDraft.workspace.get(),
		draft: getDraft(regularDraft.mainChat.get().resource).get(),
	});
	const originalRegularDraft = regularSnapshot();
	const original = makeSession(URI.parse('fixture:/work-intake'), { isQuickChat: true, status: SessionStatus.Untitled });
	const state = observableValue('status', SessionStatus.Untitled);
	const archived = observableValue('archived', false);
	const title = observableValue('title', 'Add a hello world extension');
	const selectedModel = observableValue<string | undefined>('model', undefined);
	const chat = { ...original.mainChat.get(), status: state, title, modelId: selectedModel };
	const session: ISession = {
		...original, status: state, title, modelId: selectedModel, workspace: constObservable(undefined), isArchived: archived,
		mainChat: constObservable(chat), chats: constObservable([chat]),
		capabilities: constObservable({ supportsMultipleChats: false, supportsWorkspaceConversion: true }),
	};
	const visibleSession = disposableStore.add(new VisibleSession(session, chat));
	const checks = new Set<string>();
	let sends = 0;
	let stops = 0;
	let opens = 0;
	let archives = 0;
	let lastCommand: string | undefined;
	const updateEvidence = () => {
		if (pending.get() !== regularDraft || regularSnapshot() !== originalRegularDraft) {
			throw new Error('Dashboard work changed the unrelated regular Cloud draft');
		}
		container.dataset.dashboardFixtureState = JSON.stringify({
			sends, stops, opens, archives, archived: archived.get(), lastCommand, status: state.get(), review: reviewState.get()?.section,
			pendingResource: pending.get()?.resource.toString(), regularDraftUnchanged: true,
			questionAnswers: chatService.answers.length, checks: [...checks],
		});
	};
	const check = (name: string, condition: boolean) => {
		if (!condition) { throw new Error(name); }
		checks.add(name);
		updateEvidence();
	};
	const sampleTool: IToolData = {
		id: 'fixture.inspectWorkspace', displayName: 'Inspect Workspace', modelDescription: 'Read the sample workspace metadata', source: ToolDataSource.Internal,
	};
	let questionRequest: string | undefined;
	disposableStore.add(chatService.onDidReceiveQuestionCarouselAnswer(answer => {
		if (answer.requestId !== questionRequest) { return; }
		const model = chatService.getSession(chat.resource);
		if (!(model instanceof ChatModel)) { throw new Error('Missing sample chat'); }
		const request = model.getRequests().find(request => request.id === answer.requestId);
		if (!request) { throw new Error('Missing sample request'); }
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('I will inspect the known checkout and choose a suitable execution target. This is sample conversation data; no files or cloud resources were created.') });
		request.response?.complete();
		state.set(SessionStatus.Completed, undefined);
		updateEvidence();
	}));
	const target: IProviderSessionType = {
		providerId: session.providerId, sessionType: {
			id: session.sessionType, label: 'Local Copilot', icon: Codicon.copilot,
			authRequirement: SessionTypeAuthRequirement.None, supportsWorkspaceConversion: true, supportsWorktreeConfiguration: true,
		},
	};
	const model: ILanguageModelChatMetadataAndIdentifier = {
		identifier: 'fixture/auto',
		metadata: { extension: new ExtensionIdentifier('fixture.sessions'), id: 'auto', name: 'Auto', family: 'auto', vendor: 'fixture', version: '1', maxInputTokens: 128000, maxOutputTokens: 4096, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } },
	};
	const provider: ISessionsProvider = new class extends mock<ISessionsProvider>() {
		override readonly id = session.providerId;
		override readonly label = 'Local';
		override readonly icon = Codicon.deviceDesktop;
		override readonly onDidChangeModels = Event.None;
		override getModelsSnapshot() { return { models: [model], modelTarget: 'fixture', desiredModelResolution: { kind: 'available' as const, model } }; }
		override getModelPickerOptions() { return { useGroupedModelPicker: true, showFeatured: false, showUnavailableFeatured: false, showManageModelsAction: false }; }
		override getSessionTypes() { return [target.sessionType]; }
		override setModel(sessionId: string, _chatResource: URI, modelId: string): void {
			if (sessionId === regularDraft.sessionId) { throw new Error('Dashboard changed the regular draft model'); }
			selectedModel.set(modelId, undefined);
		}
		override async setWorktreeConfiguration(): Promise<void> { throw new Error('Dashboard fixtures must not configure a workspace'); }
	}();
	const layout = new class extends mock<IWorkbenchLayoutService>() {
		override readonly mainContainer = container;
		override readonly activeContainer = container;
		override readonly containers = [container];
		override readonly mainContainerDimension = { width, height };
		override readonly activeContainerDimension = { width, height };
		override readonly mainContainerOffset = { top: 0, quickPickTop: 60 };
		override readonly activeContainerOffset = { top: 0, quickPickTop: 60 };
		override readonly onDidLayoutMainContainer = Event.None;
		override readonly onDidLayoutContainer = Event.None;
		override readonly onDidLayoutActiveContainer = Event.None;
		override readonly onDidAddContainer = Event.None;
		override readonly onDidChangeActiveContainer = Event.None;
		override getContainer(): HTMLElement { return container; }
		override whenContainerStylesLoaded(): undefined { return undefined; }
		override focus(): void { }
	}();
	const instantiation = createNewChatInputFixtureServices({ ...context, disposableStore }, {
		additionalServices: reg => {
			registerSessionReviewConversationServices(reg, container, { width, height });
			reg.defineInstance(ILogService, disposableStore.add(new class extends NullLogService {
				override error(...args: unknown[]): void { console.error(...args); }
			}()));
			reg.defineInstance(IChatService, chatService);
			reg.definePartialInstance(ITerminalChatService, { getTerminalInstanceByExecutionId: () => undefined });
			reg.definePartialInstance(ILanguageModelToolsService, {
				onDidChangeTools: Event.None, onDidPrepareToolCallBecomeUnresponsive: Event.None, onDidInvokeTool: Event.None,
				getTools: () => [sampleTool], getTool: id => id === sampleTool.id ? sampleTool : undefined,
				observeTools: () => constObservable([sampleTool]), getToolSetsForModel: () => [],
			});
			reg.definePartialInstance(ILanguageModelToolsConfirmationService, { getPreConfirmActions: () => [], getPostConfirmActions: () => [] });
			reg.define(IChatWidgetHistoryService, ChatWidgetHistoryService);
			reg.define(IContextKeyService, ContextKeyService);
			reg.define(IMenuService, MenuService);
			reg.define(IQuickInputService, QuickInputService);
			reg.define(IListService, ListService);
			reg.defineInstance(ILayoutService, layout);
			reg.defineInstance(IWorkbenchLayoutService, layout);
			reg.define(ISessionsBoardService, SessionsBoardService);
			reg.definePartialInstance(IDashboardWorkService, {
				sessions: dashboardSessions, draft: dashboardDraft, executions,
				start: async () => {
					if (state.get() !== SessionStatus.Untitled) { throw new Error('Render a fresh fixture to create another work item'); }
					dashboardSessions.set([session], undefined);
					dashboardDraft.set(session, undefined);
					updateEvidence();
					return session;
				},
				getSessionForChat: resource => isEqual(resource, session.mainChat.get().resource) ? session : undefined,
				send: async (target, query) => {
					if (!isEqual(target.resource, session.resource)) { throw new Error('Dashboard sent an unrelated session'); }
					const model = chatService.getSession(chat.resource);
					if (!(model instanceof ChatModel)) { throw new Error('Missing sample chat'); }
					const firstSend = sends++ === 0;
					const request = addWorkCardRequest(model, query);
					if (!firstSend || scenario === 'backgroundWork' || scenario === 'inProgress') {
						model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('The implementation and verification belong to this conversation. These are simulated responses; no files, repositories, or cloud resources are changed.') });
						if (scenario !== 'inProgress') { request.response?.complete(); }
					} else if (scenario === 'waitingApproval') {
						model.acceptResponseProgress(request, new ChatToolInvocation({
							invocationMessage: 'Inspecting sample workspace metadata',
							confirmationMessages: {
								title: 'Read the sample workspace metadata?',
								message: new MarkdownString('This simulated request does not read files or provision resources. Stop Response cancels this response without approving the request.'),
								allowAutoConfirm: false,
							},
						}, sampleTool, 'fixture-inspect-workspace', undefined, {}));
					} else {
						model.acceptResponseProgress(request, new ChatQuestionCarouselData([{
							id: 'destination', type: 'singleSelect', title: 'Should this be a standalone extension or part of the existing project?',
							options: [{ id: 'existing', label: 'Use the existing project', value: 'existing' }, { id: 'standalone', label: 'Create a standalone extension', value: 'standalone' }],
						}], true, 'dashboard-destination'));
						questionRequest = request.id;
					}
					transaction(tx => {
						dashboardDraft.set(undefined, tx);
						catalog.set([session], tx);
						state.set(scenario === 'inProgress' ? SessionStatus.InProgress : !firstSend || scenario === 'backgroundWork' ? SessionStatus.Completed : SessionStatus.NeedsInput, tx);
					});
					if (firstSend) {
						changed.fire({ added: [session], removed: [], changed: [] });
						started.fire(session);
					}
					updateEvidence();
					return session;
				},
			});
			reg.definePartialInstance(ISessionsService, {
				activeSession: constObservable(regularDraft), visibleSessions, sessionReview: reviewState, isSessionBoardVisible: constObservable(true),
				canOpenSession: async () => true,
				openSession: async () => { throw new Error('Dashboard opened the regular Sessions UI'); },
				openNewSession: async () => { throw new Error('Dashboard opened the regular new-session UI'); },
				openSessionReview: async (target, section, options) => {
					if (!isEqual(target.resource, session.resource) || options?.chatResource && !isEqual(options.chatResource, chat.resource)) {
						throw new Error('Dashboard opened an unrelated conversation');
					}
					opens++;
					transaction(tx => {
						visibleSessions.set([regularDraft, visibleSession], tx);
						reviewState.set({ sessionResource: session.resource, section }, tx);
					});
					updateEvidence();
				},
				closeSessionReview: () => { reviewState.set(undefined, undefined); updateEvidence(); },
				setSessionReviewSection: section => {
					if (!reviewState.get()) { throw new Error('Cannot navigate before native review opens'); }
					reviewState.set({ sessionResource: session.resource, section }, undefined);
					updateEvidence();
				},
			});
			reg.definePartialInstance(ISessionsManagementService, {
				newSession: pending, onDidChangeSessions: changed.event, onDidChangeSessionTypes: Event.None,
				onDidReplaceSession: Event.None, onDidReplaceNewDraftSession: Event.None, onDidStartSession: started.event, onDidDeleteSession: Event.None,
				getSessions: () => [...catalog.get()], getSession: resource => catalog.get().find(session => isEqual(session.resource, resource)),
				getAllProviderSessionTypes: () => [target], getQuickChatSessionTypes: () => [target], getSessionTypesForFolder: () => [target],
				isNewSessionTargetAvailable: () => true,
				resolveWorkspace: () => { throw new Error('Dashboard fixtures must not resolve a real workspace'); },
				createNewSession: () => { throw new Error('Dashboard used the regular draft creation path'); },
				sendNewChatRequest: async () => { throw new Error('Dashboard sent the regular pending draft'); },
				sendRequest: async () => { throw new Error('Coordinator replies must route through dashboardWork.send'); },
				archiveSession: async target => {
					if (target !== session) { throw new Error('Archive targeted the unrelated regular session'); }
					archives++;
					archived.set(true, undefined);
					changed.fire({ added: [], removed: [], changed: [session] });
					updateEvidence();
				},
				cancelCurrentRequest: async (target, targetChat) => {
					if (!isEqual(target.resource, session.resource) || !isEqual(targetChat?.resource, chat.resource)) {
						throw new Error('Stop Response targeted the unrelated regular session');
					}
					const model = chatService.getSession(chat.resource);
					if (!(model instanceof ChatModel)) { throw new Error('Missing sample chat'); }
					const request = model.getRequests().at(-1);
					if (!request || request.response?.isComplete) { throw new Error('The simulated response is not running or waiting'); }
					stops++;
					model.cancelRequest(request);
					state.set(SessionStatus.Completed, undefined);
					updateEvidence();
				},
			});
			reg.definePartialInstance(ISessionsProvidersService, {
				onDidChangeProviders: Event.None, getProvider: <T extends ISessionsProvider>() => provider as T, getProviders: () => [provider],
			});
			reg.definePartialInstance(ISessionIntentService, { intakes: constObservable([]) });
			reg.definePartialInstance(ISessionGroupsService, { onDidChange: Event.None, getGroups: () => [], getGroup: () => undefined, getGroupOfSession: () => undefined });
			reg.definePartialInstance(ISessionChangesStatsCache, { get: () => undefined });
			reg.definePartialInstance(ISessionsListModelService, { onDidChange: Event.None, isSessionPinned: () => false, getSortKey: session => session.createdAt.getTime() });
			reg.definePartialInstance(ISessionWorkTrackingService, { getState: () => constObservable({}), markOpened: () => { } });
			reg.definePartialInstance(ISessionInputDraftService, { getDraft, setDraft: (resource, draft) => getDraft(resource).set(draft, undefined) });
			reg.definePartialInstance(IFileDialogService, { showOpenDialog: async () => { throw new Error('Fixture navigation must not open a real folder picker'); } });
			reg.definePartialInstance(IFileService, { stat: async () => new class extends mock<IFileStatWithMetadata>() { override readonly isDirectory = true; }() });
		},
	});
	instantiation.stub(ICommandService, new class extends mock<ICommandService>() {
		override readonly onWillExecuteCommand = Event.None;
		override readonly onDidExecuteCommand = Event.None;
		override async executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T | undefined> {
			lastCommand = id;
			updateEvidence();
			const command = CommandsRegistry.getCommand(id);
			if (!command || id !== NEW_SESSION_ACTION_ID && id !== ARCHIVE_WORK_SESSION_COMMAND_ID && id !== ARCHIVE_SESSION_COMMAND_ID && id !== 'sessions.work.newSession' && !id.startsWith('sessions.review.')) { throw new Error(`The intake fixture cannot run command ${id}`); }
			await instantiation.invokeFunction(command.handler, ...args);
			return undefined;
		}
	}());
	instantiation.stub(IActionViewItemService, {
		onDidChange: Event.None,
		lookUp: (menu, id) => menu === Menus.SessionsBoardControls && id === NEW_SESSION_ACTION_ID
			? (action, _options, scoped) => scoped.createInstance(NewSessionActionViewItem, action, 'dashboard', constObservable('default'))
			: undefined,
	});
	if (!CommandsRegistry.getCommand(ARCHIVE_SESSION_COMMAND_ID)) { disposableStore.add(registerAction2(ArchiveSessionAction)); }
	if (!CommandsRegistry.getCommand(NEW_SESSION_ACTION_ID)) { disposableStore.add(registerAction2(NewChatInSessionsWindowAction)); }
	configureSessionReviewConversationServices(instantiation);
	instantiation.stub(INotificationService, instantiation.get(INotificationService), 'error', (error: Parameters<INotificationService['error']>[0]) => { console.error(error); });
	instantiation.stub(IChatInputNotificationService, instantiation.get(IChatInputNotificationService), 'handleMessageSent', () => { });
	const configuration = instantiation.get(IConfigurationService);
	if (!(configuration instanceof TestConfigurationService)) { throw new Error('Expected fixture configuration'); }
	configuration.setUserConfiguration('chat', { editor: { fontSize: 13, fontFamily: 'default', fontWeight: 'default', lineHeight: 0, wordWrap: 'on' } });
	configuration.setUserConfiguration('editor', { fontFamily: 'monospace', fontLigatures: false, bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: false } });
	configuration.setUserConfiguration(ChatConfiguration.IncrementalRendering, false);
	configuration.setUserConfiguration(ChatConfiguration.ToolConfirmationCarousel, true);
	const keys = instantiation.get(IContextKeyService);
	ChatContextKeys.enabled.bindTo(keys).set(true);
	IsSessionsWindowContext.bindTo(keys).set(true);
	SessionsBoardVisibleContext.bindTo(keys).set(true);
	const chatModel = disposableStore.add(instantiation.createInstance(ChatModel, undefined, {
		initialLocation: ChatAgentLocation.Chat, canUseTools: true, resource: chat.resource, disableBackgroundKeepAlive: true,
	}));
	chatService.addSession(chatModel);
	const native = await createNativeSessionReviewFixture({ ...context, disposableStore }, instantiation, { width, height, conversation: true });
	teardown.closeNativeModal = () => native.parts.activeModalEditorPart?.close() ?? Promise.resolve(true);
	instantiation.stub(IEditorGroupsService, native.parts);
	instantiation.stub(IEditorService, native.editorService);
	instantiation.stub(ISessionReviewService, disposableStore.add(instantiation.createInstance(SessionReviewController)));
	const host = disposableStore.add(instantiation.createInstance(CustomViewNode, { id: 'fixture.dashboard-intake', ctor: new SyncDescriptor(SessionBoardView) }));
	container.appendChild(host.element);
	size(host.element, width, height);
	host.layout(width, height);
	const waitFor = async (condition: () => boolean, message: string) => {
		if (condition()) { return; }
		const waiting = disposableStore.add(new DisposableStore());
		try {
			await new Promise<void>((resolve, reject) => {
				waiting.add(sharedMutationObserver.observe(container, waiting, { attributes: true, childList: true, subtree: true })(() => {
					if (condition()) { resolve(); }
				}));
				waiting.add(disposableTimeout(() => reject(new Error(`${message}: ${container.dataset.dashboardFixtureState}`)), Math.max(0, renderDeadline - Date.now())));
			});
		} finally {
			waiting.dispose();
		}
	};
	const action = (selector: string) => {
		const element = container.querySelector<HTMLElement>(selector);
		if (!element) { throw new Error(`Missing native fixture control: ${selector}`); }
		return element;
	};
	action('.session-work-controls-actions .monaco-button').click();
	await waitFor(() => dashboardDraft.get() === session, 'New Work did not create a dashboard-owned draft');
	check('New Work stays draft-only', !reviewState.get() && !native.parts.activeModalEditorPart && sends === 0);
	const closeDraft = action('.session-work-intake-actions [aria-label="Close New Work"]');
	check('Close New Work is a labelled codicon', closeDraft.classList.contains('codicon-close') && !closeDraft.textContent);
	check('No regular SessionView or standalone NewChatWidget', !container.querySelector('.session-view, .new-chat-widget'));
	if (scenario === 'draft') {
		return;
	}
	const editor = instantiation.get(ICodeEditorService).listCodeEditors().find(editor => action('.session-work-intake').contains(editor.getDomNode()));
	if (!editor) { throw new Error('New Work must render the native input editor'); }
	editor.setValue('Add a hello world extension');
	const send = action('.session-work-intake [aria-label="Send"]');
	await waitFor(() => send.getAttribute('aria-disabled') !== 'true', 'The draft send button did not become available');
	send.click();
	await waitFor(() => !!container.querySelector('.modal-editor-part .chat-view[data-bound-chat-resource]'), 'First Send did not open the full native conversation review');
	check('First Send hides the creation surface', !!container.querySelector('.session-work-intake[hidden]'));
	check('Native review owns one conversation and one reply footer', container.querySelectorAll('.modal-editor-part .chat-view').length === 1 && container.querySelectorAll('.modal-editor-content-footer .session-review-composer').length === 1);
	check('First Send routes to Conversation review', sends === 1 && opens === 1 && reviewState.get()?.section === SessionReviewSection.Conversation);
	check('No top-of-board committed conversation', !container.querySelector('.session-work-intake .chat-view'));
	if (scenario === 'backgroundWork') {
		executions.set([
			{ id: 'implementation', source: session.resource, title: 'Implement hello world extension', target: 'Local worktree', phase: 'started' },
			{ id: 'verification', source: session.resource, title: 'Verify packaging', target: 'Cloud', phase: 'started' },
		], undefined);
		check('Related work remains in the native review footer', !!container.querySelector('.modal-editor-content-footer .session-review-related-work:not([hidden])'));
		return;
	}
	const stop = action('.session-review-response-actions [aria-label="Stop Response"]');
	check('Stop Response is a labelled codicon while running or waiting', stop.classList.contains('codicon-debug-stop') && !stop.textContent && !stop.closest('[hidden]'));
	if (scenario !== 'journey' && scenario !== 'archiveJourney') { return; }
	const card = action('.session-work-card');
	const originalCardId = card.closest<HTMLElement>('.session-card-board-slot')?.dataset.cardId;
	const reply = 'Keep this follow-up while changing the review view.';
	getDraft(chat.resource).set({ inputText: reply, attachments: [] }, undefined);
	const composer = action('.session-review-composer .monaco-editor');
	const initialBounds = action('.modal-editor-part').getBoundingClientRect();
	action('.modal-editor-action-container [aria-label="Maximize Modal Editor"]').click();
	await waitFor(() => native.parts.activeModalEditorPart?.maximized === true && !!container.querySelector('.modal-editor-action-container [aria-label="Restore Modal Editor"]'), 'Native maximize did not expose Restore');
	check('Native maximize expands the focused view', action('.modal-editor-part').getBoundingClientRect().width > initialBounds.width);
	action('.modal-editor-action-container [aria-label="Restore Modal Editor"]').click();
	await waitFor(() => native.parts.activeModalEditorPart?.maximized === false, 'Native restore did not run');
	check('Native restore preserves the reply editor and draft', action('.session-review-composer .monaco-editor') === composer && action('.modal-editor-part').getBoundingClientRect().width === initialBounds.width && getDraft(chat.resource).get().inputText === reply);
	stop.focus();
	stop.click();
	await waitFor(() => stops === 1 && state.get() === SessionStatus.Completed, 'Stop Response did not cancel the simulated waiting response');
	check('Stopping does not answer a question or close review', chatService.answers.length === 0 && !!reviewState.get() && !!chatModel.getRequests().at(-1)?.response?.isCanceled);
	action('.modal-editor-action-container [aria-label="Close Modal Editor"]').click();
	await waitFor(() => !native.parts.activeModalEditorPart && !reviewState.get(), 'Native close did not return to the dashboard');
	await waitFor(() => !!container.querySelector('.session-work-card'), 'Closing review after Stop Response must reveal the original work card, not leave it inside the collapsed All sessions section');
	const restoredCard = action('.session-work-card');
	check('Close restores the original dashboard work and draft', !!originalCardId && restoredCard.closest<HTMLElement>('.session-card-board-slot')?.dataset.cardId === originalCardId && getDraft(chat.resource).get().inputText === reply && !container.querySelector('.modal-editor-part'));
	check('Idle cards expose an archive codicon', !!restoredCard.querySelector('.codicon-archive[aria-label="Archive Session"]'));
	action('.session-work-card [aria-label="Open Work"]').click();
	await waitFor(() => !!container.querySelector('.modal-editor-part .chat-view[data-bound-chat-resource]'), 'Open Work did not reopen native review');
	check('Open Work uses review, not New Work', opens === 2 && !!container.querySelector('.session-work-intake[hidden]') && sends === 1);
	if (scenario === 'archiveJourney') {
		const archive = action('.session-review-navigation [aria-label="Archive Session"]');
		const context = instantiation.get(IContextKeyService).getContext(archive);
		check(`Archive is enabled (sessions=${context.getValue(IsSessionsWindowContext.key)}, chat=${context.getValue(ChatContextKeys.enabled.key)}, dashboard=${context.getValue(SessionsBoardVisibleContext.key)})`,
			!archive.classList.contains('disabled') && archive.getAttribute('aria-disabled') !== 'true');
		archive.click();
		await waitFor(() => archives === 1 && archived.get() && !native.parts.activeModalEditorPart, 'Archive did not close review and archive the selected session');
		instantiation.get(ISessionsBoardService).updateOptions({ view: 'archived' });
		await waitFor(() => !!container.querySelector('.session-work-card'), 'Archived work did not remain available in dashboard history');
		check('Archiving stays in the dashboard and preserves unrelated work', regularSnapshot() === originalRegularDraft && pending.get() === regularDraft && !container.querySelector('.session-view, .new-chat-widget'));
		return;
	}
	action('.modal-editor-action-container [aria-label="Close Modal Editor"]').click();
	await waitFor(() => !native.parts.activeModalEditorPart && !reviewState.get(), 'Reopened native review did not close');
	check('Cloud draft and original card survive the whole journey', action('.session-work-card') === restoredCard && regularSnapshot() === originalRegularDraft && pending.get() === regularDraft);
}

export default defineThemedFixtureGroup({ path: 'sessions/DashboardAgentWork/' }, {
	NewWork: defineComponentFixture({
		virtualTime: { durationMs: renderDuration },
		expectedVisualDescriptions: ['My work starts with a blank workspace-less native input and model/Send controls. There are no repository, worktree, provider or Cloud/Local selectors. The unrelated regular draft is not shown.'],
		render: context => renderAgentInput(context), additionalThemes: ['darkHighContrast', 'lightHighContrast'],
	}),
	Narrow: defineComponentFixture({
		virtualTime: { durationMs: renderDuration },
		expectedVisualDescriptions: ['The blank native dashboard input fits the narrow viewport without horizontal overflow or setup pickers.'],
		render: context => renderAgentInput(context, 540),
	}),
	WaitingQuestion: defineComponentFixture({
		virtualTime: { durationMs: renderDuration },
		render: context => renderAgentInput(context, 1100, 'waitingQuestion'),
		expectedVisualDescriptions: ['A full native review shows the pending question, one reply footer, and a labelled Stop Response codicon. The draft is closed and the dashboard stays behind the modal.'],
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
	}),
	WaitingApproval: defineComponentFixture({
		virtualTime: { durationMs: renderDuration },
		render: context => renderAgentInput(context, 1100, 'waitingApproval'),
		expectedVisualDescriptions: ['A simulated native tool approval remains unanswered in full review. Stop Response is available separately from the native maximize and close controls.'],
	}),
	InProgress: defineComponentFixture({
		virtualTime: { durationMs: renderDuration },
		render: context => renderAgentInput(context, 1100, 'inProgress'),
		expectedVisualDescriptions: ['An in-progress simulated response shows a labelled Stop Response codicon in the full native review footer.'],
	}),
	BackgroundWork: defineComponentFixture({ virtualTime: { durationMs: renderDuration }, render: context => renderAgentInput(context, 1100, 'backgroundWork') }),
	NativeJourney: defineComponentFixture({
		virtualTime: { durationMs: renderDuration },
		render: context => renderAgentInput(context, 1100, 'journey'),
		expectedVisualDescriptions: ['After first send, native maximize and restore, stopping the waiting response, closing, and reopening review, the original dashboard card remains. No New Work input or regular Sessions UI is visible.'],
	}),
	ArchiveJourney: defineComponentFixture({
		virtualTime: { durationMs: renderDuration },
		render: context => renderAgentInput(context, 1100, 'archiveJourney'),
		expectedVisualDescriptions: ['The selected sample session has been archived from native review and remains visible in the dashboard Archived view. No unrelated session or legacy composer was opened.'],
	}),
});
