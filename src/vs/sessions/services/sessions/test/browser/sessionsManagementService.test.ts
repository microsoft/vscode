/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import assert from 'assert';
import { setARIAContainer } from '../../../../../base/browser/ui/aria/aria.js';
import { Orientation } from '../../../../../base/browser/ui/sash/sash.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { createErrorWithActions } from '../../../../../base/common/errorMessage.js';
import { toAction } from '../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, IReader, observableValue, waitForState } from '../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase, isEqual } from '../../../../../base/common/resources.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, NotificationMessage } from '../../../../../platform/notification/common/notification.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { LocalSelectionTransfer } from '../../../../../platform/dnd/browser/dnd.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService, ResourceTrustRequestOptions } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { NullTelemetryService, NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ChatViewPaneTarget, IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatRequestVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatModelReference, IChatRequestSubmittedEvent, IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatEditorOptions } from '../../../../../workbench/contrib/chat/browser/widgetHosts/editor/chatEditor.js';
import { IChatWidgetHistoryService } from '../../../../../workbench/contrib/chat/common/widget/chatWidgetHistoryService.js';
import { PreferredGroup } from '../../../../../workbench/services/editor/common/editorService.js';
import { nullExtensionDescription } from '../../../../../workbench/services/extensions/common/extensions.js';
import { IPathService } from '../../../../../workbench/services/path/common/pathService.js';
import { ILifecycleService } from '../../../../../workbench/services/lifecycle/common/lifecycle.js';
import { ICopilotHomeService } from '../../../../../platform/environment/common/copilotHome.js';
import { TestCopilotHomeService } from '../../../../../platform/environment/test/common/testCopilotHomeService.js';
import { TestPathService, TestProgressService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { TestLifecycleService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { SessionTypeAuthRequirement, ChatInteractivity, ChatOriginKind, IChat, ISession, ISessionType, ISessionWorkspace, ISideChatSelection, SESSION_WORKSPACE_GROUP_REMOTE, SessionRemoteConnectionFailureReason, SessionRemoteConnectionStatus, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { IAutomationSessionTemplate } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IChatMovedEvent, ISessionChatMoveDestination, type IForkChatOptions, type INestedChatWorkspace, NestedChatWorkspaceError, ISessionChangeEvent, ISessionChangesetOperationInvokedEvent, ISendRequestOptions, ISessionModelsSnapshot, ISessionModelPickerOptions, ISessionsProvider, ISessionsProviderCreateSessionOptions, ISessionWorktreeConfiguration, type ICreateNewChatOptions } from '../../../../../workbench/contrib/sessions/common/sessionsProvider.js';
import { SessionsManagementService } from '../../../../../workbench/contrib/sessions/browser/sessionsManagementService.js';
import { VisibleSessions } from '../../../../../workbench/services/sessions/browser/visibleSessions.js';
import { ISessionsManagementService, IChatDeletedEvent, ICreateNewSessionOptions, inheritableSessionTarget, INewSessionDraftSlot, ISendRequestSentEvent, trackNewSessionRequestEnd, WorkspaceNotTrustedError } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISessionsService, SessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISessionGridState } from '../../../../../workbench/browser/parts/sessions/sessionGridState.js';
import { ISessionOpenTelemetryService, SessionOpenTelemetryService } from '../../../../../workbench/contrib/sessions/browser/sessionOpenTelemetryService.js';
import { ISessionGridSlot, ISessionsPartService, SessionGridRequest } from '../../../../../workbench/services/sessions/browser/sessionsPartService.js';
import { AbstractCustomView, ICustomViewService } from '../../../../../workbench/contrib/sessions/browser/customView.js';
import { CustomViewService } from '../../../customView/browser/customViewService.js';
import { IWindowCanvasDescriptor, IWindowCanvasService } from '../../../../../workbench/contrib/sessions/browser/windowCanvas.js';
import { ISessionGridPane, SessionGridPaneKind } from '../../../../../workbench/services/sessions/browser/sessionGridPane.js';
import { TestWindowCanvasService } from '../../../canvas/test/browser/testWindowCanvasService.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService, SessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { SessionsHasClosedItemContext } from '../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { COPILOT_CLI_EH_SCHEME, COPILOT_CLI_LOCAL_AH_SCHEME } from '../../../../../workbench/contrib/chat/browser/copilotCliEventsUri.js';
import type { SessionView } from '../../../../../workbench/contrib/sessions/browser/parts/sessionView.js';
import { Direction } from '../../../../../base/browser/ui/grid/grid.js';
import { SessionsGridContent } from '../../../../../workbench/contrib/sessions/browser/parts/sessionsGridContent.js';
import { SessionGridLayout } from '../../../../../workbench/browser/parts/sessions/sessionGridLayout.js';
import { createSessionsPartTestHarness } from '../../../../test/browser/sessionViewTestUtils.js';
import { getChatLayoutOwnerAfterReplacement } from '../../../../common/chatLayout.js';
import { SESSIONS_CHAT_TABS_SETTING, SessionsChatTabsMode } from '../../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { DraggedSessionIdentifier, fillSessionChatDragData, getSessionChatDragData, SessionsDataTransfers } from '../../../../../workbench/contrib/sessions/browser/dnd.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ChatHostOpenerService, IChatHostOpenerService } from '../../../../../workbench/services/sessions/browser/chatHostOpener.js';
import { SessionActivatingActionRunner } from '../../../../../workbench/contrib/sessions/browser/sessionActionRunner.js';
import { navigationServiceOf } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
import { SessionHostService } from '../../../../../workbench/contrib/sessions/browser/sessionHostService.js';
import { createMainWindowInstantiationService, getMainWindowHost, ISessionHost, ISessionHostService, SessionHost, SessionHostKind } from '../../../../../workbench/services/sessions/browser/sessionHost.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { getSingletonServiceDescriptors } from '../../../../../platform/instantiation/common/extensions.js';
import { InstantiationService } from '../../../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ISessionPaneContent } from '../../../../../workbench/services/sessions/common/sessionPane.js';

const stubChat = {
	resource: URI.parse('test:///chat'),
	createdAt: new Date(),
	workspace: constObservable(undefined),
	title: constObservable('Chat'),
	updatedAt: constObservable(new Date()),
	status: constObservable(0),
	changes: constObservable([]),
	changesets: constObservable([]),
	checkpoints: constObservable(undefined),
	modelId: constObservable(undefined),
	modelSource: constObservable(undefined),
	mode: constObservable(undefined),
	isArchived: constObservable(false),
	isRead: constObservable(true),
	interactivity: constObservable(ChatInteractivity.Full),
	description: constObservable(undefined),
	lastTurnEnd: constObservable(undefined),
} satisfies IChat;

function stubSession(overrides: Partial<ISession> & Pick<ISession, 'sessionId' | 'providerId'>): ISession {
	return {
		resource: URI.parse(`test:///${overrides.sessionId}`),
		sessionType: 'test',
		harness: 'copilot',
		environment: 'local',
		application: constObservable({ id: 'vscode', label: 'VS Code' }),
		icon: Codicon.vm,
		createdAt: new Date(),
		workspace: constObservable(undefined),
		title: constObservable('Test'),
		updatedAt: constObservable(new Date()),
		status: constObservable(0),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		loading: constObservable(false),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
		chats: constObservable([]),
		mainChat: constObservable(stubChat),
		capabilities: constObservable({ supportsMultipleChats: false }),
		...overrides,
	};
}

class TestChatWidgetService extends mock<IChatWidgetService>() {
	readonly opened: URI[] = [];
	private _widgetSessionResources = new Set<string>();

	override async openSession(sessionResource: URI, _target?: typeof ChatViewPaneTarget | PreferredGroup, _options?: IChatEditorOptions): Promise<IChatWidget | undefined> {
		this.opened.push(sessionResource);
		return undefined;
	}

	/** Simulate a session being displayed in a chat widget. */
	setWidgetSessionResource(resource: URI): void {
		this._widgetSessionResources.add(resource.toString());
	}

	clearWidgetSessionResources(): void {
		this._widgetSessionResources.clear();
	}

	override getWidgetBySessionResource(sessionResource: URI): IChatWidget | undefined {
		if (this._widgetSessionResources.has(sessionResource.toString())) {
			return {} as IChatWidget; // truthy stub
		}
		return undefined;
	}
}

class TestChatService extends mock<IChatService>() {
	private readonly _onDidSubmitRequest = new Emitter<IChatRequestSubmittedEvent>();
	override readonly onDidSubmitRequest = this._onDidSubmitRequest.event;
	readonly cancelledResources: URI[] = [];
	readonly loadedResources: URI[] = [];
	disposedModelRefs = 0;
	cancelError: Error | undefined;
	modelRefAvailable = true;
	readonly resourcesWithRequests: URI[] = [];

	override getSession(sessionResource: URI): IChatModel | undefined {
		return this.resourcesWithRequests.some(resource => resource.toString() === sessionResource.toString()) ? { hasRequests: true } as IChatModel : undefined;
	}

	override async acquireOrLoadSession(sessionResource: URI): Promise<IChatModelReference | undefined> {
		this.loadedResources.push(sessionResource);
		if (!this.modelRefAvailable) {
			return undefined;
		}
		return { object: {} as IChatModel, dispose: () => { this.disposedModelRefs++; } } as IChatModelReference;
	}

	submitRequest(event: IChatRequestSubmittedEvent): void {
		this._onDidSubmitRequest.fire(event);
	}

	dispose(): void {
		this._onDidSubmitRequest.dispose();
	}

	override async cancelCurrentRequestForSession(sessionResource: URI): Promise<void> {
		this.cancelledResources.push(sessionResource);
		if (this.cancelError) {
			throw this.cancelError;
		}
	}
}

class TestWorkspaceTrustManagementService extends mock<IWorkspaceTrustManagementService>() {
	trusted = true;
	readonly requestedUris: URI[] = [];

	override async getUriTrustInfo(uri: URI) {
		this.requestedUris.push(uri);
		return { uri, trusted: this.trusted };
	}
}

class TestSessionsProvidersService extends mock<ISessionsProvidersService>() {
	override readonly onDidChangeProviders = Event.None;

	constructor(private readonly _providers: readonly ISessionsProvider[]) {
		super();
	}

	override registerProvider(_provider: ISessionsProvider): IDisposable {
		throw new Error('not implemented');
	}

	override getProviders(): ISessionsProvider[] {
		return [...this._providers].sort((a, b) => a.order - b.order);
	}

	override getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
		return this._providers.find(provider => provider.id === providerId) as T | undefined;
	}
}

class TestSessionsProvider extends mock<ISessionsProvider>() {
	override readonly id: string = 'test';
	override readonly label = 'Test';
	override readonly icon = Codicon.vm;
	override readonly order: number = 0;
	override readonly sessionTypes: readonly ISessionType[] = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'test', label: 'Test', icon: Codicon.vm, supportsWorktreeConfiguration: true }];
	override readonly onDidChangeSessionTypes = Event.None;
	override readonly onDidChangeSessions = Event.None;
	override readonly onDidMoveChat: Event<IChatMovedEvent> = Event.None;
	override readonly browseActions = [];

	constructor(private readonly _session: ISession) {
		super();
	}

	override getSessions(): ISession[] { return [this._session]; }
	override resolveWorkspace(_folderUri: URI): ISessionWorkspace | undefined { return undefined; }
	override createNewSession(_folderUri?: URI, _sessionTypeId?: string): ISession { return this._session; }
	override getSessionTypes(_folderUri: URI): ISessionType[] { return [...this.sessionTypes]; }
	override async renameChat(): Promise<void> { }
	override getModelsSnapshot(): ISessionModelsSnapshot { return { models: [], desiredModelResolution: { kind: 'notRequested' }, modelTarget: undefined }; }
	override getModelPickerOptions(): ISessionModelPickerOptions { return { showUnavailableFeatured: false, showManageModelsAction: false }; }
	override readonly onDidChangeModels = Event.None;
	override setModel(_sessionId: string, _chatResource: URI, _modelId: string): void { }
	override async archiveSession(): Promise<void> { }
	override async unarchiveSession(): Promise<void> { }
	override async setSessionReadState(_sessionId: string, _isRead: boolean): Promise<void> { }
	override async deleteSession(): Promise<void> { }
	override async deleteSessions(_sessionIds: readonly string[]): Promise<void> { }
	override async deleteChat(_sessionId: string, _chatUri: URI): Promise<boolean> { return true; }
	override deleteNewSession(_sessionId: string): void { }
	override async sendRequest(_sessionId: string, _chatResource: URI, _options: ISendRequestOptions): Promise<ISession> { return this._session; }
	override async createNewChat(): Promise<IChat> { return this._session.mainChat.get(); }
	override async forkChat(_sessionId: string, _sourceChat: URI, _turnId: string): Promise<IChat> { throw new Error('not implemented'); }
	override async createSideChat(_sessionId: string, _sourceChat: URI, _turnId: string, _selection?: ISideChatSelection): Promise<IChat> { throw new Error('not implemented'); }
}

function createSessionsManagementService(
	session: ISession,
	disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>,
	provider: ISessionsProvider | readonly ISessionsProvider[] | TestSessionsProvidersService | SessionsProvidersService = new TestSessionsProvider(session),
	workspaceTrustManagementService = new TestWorkspaceTrustManagementService(),
	workspaceTrustRequestService?: IWorkspaceTrustRequestService,
	configurationService: IConfigurationService = new TestConfigurationService(),
	partServiceOverride?: TestSessionsPartService,
	storageOverride?: InMemoryStorageService,
	openTelemetryService?: ISessionOpenTelemetryService,
): { service: ISessionsManagementService; view: SessionsService; chatWidgetService: TestChatWidgetService; chatService: TestChatService; contextKeyService: MockContextKeyService; customViewService: ICustomViewService; canvasService: TestWindowCanvasService; layoutService: IWorkbenchLayoutService; focusPane: Emitter<string>; sessionsPartService: TestSessionsPartService; notifications: (NotificationMessage | NotificationMessage[])[] } {
	const instantiationService = disposables.add(new TestInstantiationService());
	const notifications: (NotificationMessage | NotificationMessage[])[] = [];
	instantiationService.stub(INotificationService, { error: message => notifications.push(message) });
	const chatWidgetService = new TestChatWidgetService();
	const chatService = disposables.add(new TestChatService());
	const providersService = provider instanceof TestSessionsProvidersService || provider instanceof SessionsProvidersService ? provider : new TestSessionsProvidersService(Array.isArray(provider) ? provider : [provider]);
	const contextKeyService = disposables.add(new MockContextKeyService());
	const customViewService = disposables.add(new CustomViewService(new NullLogService(), disposables.add(new InMemoryStorageService())));
	const canvasService = new TestWindowCanvasService(customViewService);
	const layoutService = createSessionLayoutService();

	instantiationService.stub(IStorageService, storageOverride ?? disposables.add(new InMemoryStorageService()));
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(IConfigurationService, configurationService);
	instantiationService.stub(IContextKeyService, contextKeyService);
	instantiationService.stub(ISessionsProvidersService, providersService);
	instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
	instantiationService.stub(IChatWidgetService, chatWidgetService);
	instantiationService.stub(IProgressService, new TestProgressService());
	instantiationService.stub(IChatService, chatService);
	instantiationService.stub(IChatWidgetHistoryService, new class extends mock<IChatWidgetHistoryService>() {
		override moveHistory(): void { }
	});
	instantiationService.stub(IPathService, new TestPathService(URI.file('/home/test')));
	instantiationService.stub(ICopilotHomeService, new TestCopilotHomeService(URI.file('/home/test')));
	instantiationService.stub(IRemoteAgentHostService, upcastPartial<IRemoteAgentHostService>({ connections: [] }));
	instantiationService.stub(IWorkspaceTrustManagementService, workspaceTrustManagementService);
	if (workspaceTrustRequestService) {
		instantiationService.stub(IWorkspaceTrustRequestService, workspaceTrustRequestService);
	}

	const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
	const focusPane = disposables.add(new Emitter<string>());
	const sessionsPartService = partServiceOverride ?? new TestSessionsPartService(focusPane.event);
	const view = createView(instantiationService, service, disposables, customViewService, sessionsPartService, openTelemetryService, canvasService, layoutService);
	return { service, view, chatWidgetService, chatService, contextKeyService, customViewService, canvasService, layoutService, focusPane, sessionsPartService, notifications };
}

function createSessionLayoutService(): IWorkbenchLayoutService {
	const hiddenParts = new Set<Parts>();
	return upcastPartial<IWorkbenchLayoutService>({
		isVisible: part => !hiddenParts.has(part),
		setPartHidden: (hidden, part) => { if (hidden) { hiddenParts.add(part); } else { hiddenParts.delete(part); } },
	});
}

/** Sessions part stub that records focus requests without rendering views. */
class TestSessionsPartService extends mock<ISessionsPartService>() {
	readonly sessionViews = new Map<string | undefined, SessionView>();
	readonly focusedSessions: (string | undefined)[] = [];
	focusedSessionView: SessionView | undefined;
	constructor(override readonly onDidFocusPane: Event<string> = Event.None, private readonly content?: SessionsGridContent) {
		super();
	}
	override readonly onDidToggleMaximizeSession = Event.None;
	override get onDidInteractWithGrid() { return this.content?.onDidInteractWithGrid ?? Event.None; }
	override getGridLayout() { return this.content?.getGridLayout(); }
	override getPaneAtPosition(index: number) { return this.content?.getPaneAtPosition(index); }
	override getNeighborPane(pane: ISessionGridPane, direction: Direction) { return this.content?.getNeighborPane(pane, direction); }
	override getViewOfPane(pane: ISessionGridPane) { return this.content?.getViewOfPane(pane); }
	override toggleMaximizePane(pane: ISessionGridPane): void { this.content?.toggleMaximizePane(pane); }
	override resizePane(pane: ISessionGridPane, direction: Direction, amount: number): void { this.content?.resizePane(pane, direction, amount); }
	override getSessionPlacement(id: string) { return this.content?.getSessionPlacement(id); }
	override resizeSession(id: string | undefined, direction: Direction, amount: number): void { this.content?.resizeSession(id, direction, amount); }
	override updatePanes(panes: readonly ISessionGridPane[], activePane: ISessionGridPane | undefined, slots?: readonly ISessionGridSlot[], request?: SessionGridRequest): void {
		this.content?.updatePanes(panes, activePane, slots, request);
	}
	override focusNewSessionSlot(): void {
		this.focusedSessions.push(undefined);
		this.content?.focusNewSessionSlot();
	}
	override focusPane(pane: ISessionGridPane): void {
		this.focusedSessions.push(pane.session.get()?.sessionId);
		this.content?.focusPane(pane.id);
	}
	override getSessionView(session: string | ISession | undefined): SessionView | undefined {
		const sessionId = typeof session === 'object' ? session.sessionId : session;
		return this.content?.getSessionView(sessionId) ?? this.sessionViews.get(sessionId);
	}
	override getFocusedSessionView(): SessionView | undefined { return this.content?.getFocusedSessionView() ?? this.focusedSessionView; }
	override getActiveSessionView(): SessionView | undefined { return this.content?.getActiveSessionView(); }
	override getSessionViewOfHost(host: ISessionHost): SessionView | undefined { return this.content?.getSessionViewOfHost(host); }
	override getPaneIdOfHost(host: ISessionHost): string | undefined { return this.content?.getPaneIdOfHost(host); }
}

/** The session the grid's active pane shows: `undefined` for the new-session slot, and while no pane is active. */
function activeSessionOf(grid: Pick<ISessionsService, 'activePane'>, reader?: IReader): ISession | undefined {
	return grid.activePane.read(reader)?.session.read(reader);
}

/** The chat the grid's active pane shows. */
function activeChatOf(grid: Pick<ISessionsService, 'activePane'>, reader?: IReader): IChat | undefined {
	return grid.activePane.read(reader)?.chat.read(reader);
}

/** The chat `pane` shows while it is a detached pane: `undefined` for a slot. */
function detachedChatOf(pane: ISessionGridPane | undefined, reader?: IReader): URI | undefined {
	return pane?.kind === SessionGridPaneKind.Detached ? pane.chat.read(reader)?.resource : undefined;
}

/** The sessions the grid's slots show, in order: `undefined` for the new-session slot. */
function slotSessionsOf(grid: Pick<ISessionsService, 'slotPanes'>, reader?: IReader): readonly (ISession | undefined)[] {
	return grid.slotPanes.read(reader).map(pane => pane.session.read(reader));
}

/** The slot of the grid that shows the session `sessionId`. */
function slotPaneOf(grid: Pick<ISessionsService, 'slotPanes'>, sessionId: string): ISessionGridPane | undefined {
	return grid.slotPanes.get().find(pane => pane.session.get()?.sessionId === sessionId);
}

/** The new-session slot of the grid. */
function newSessionSlotOf(grid: Pick<ISessionsService, 'slotPanes'>): ISessionGridPane | undefined {
	return grid.slotPanes.get().find(pane => !pane.session.get());
}

/** The pane of the grid slot `id`. */
function paneWithId(grid: Pick<ISessionsService, 'panes'>, id: string): ISessionGridPane | undefined {
	return grid.panes.get().find(pane => pane.id === id);
}

/** The id of the session the pane next to the slot of `sessionId` shows, in `direction`. */
function neighborOfSlot(grid: Pick<ISessionsService, 'slotPanes'>, content: SessionsGridContent, sessionId: string, direction: Direction): string | undefined {
	const pane = grid.slotPanes.get().find(candidate => candidate.session.get()?.sessionId === sessionId);
	return pane && content.getNeighborPane(pane, direction)?.session.get()?.sessionId;
}

class TestCustomView extends AbstractCustomView {
	readonly title = constObservable('Test Custom View');

	render(_container: HTMLElement): void { }
	layout(_width: number, _height: number): void { }
}

function showTestCustomView(customViewService: ICustomViewService, disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>): void {
	disposables.add(customViewService.registerCustomView({
		id: 'test.customView',
		ctor: new SyncDescriptor(TestCustomView),
	}));
	customViewService.showCustomView('test.customView');
}

/**
 * Builds a {@link SessionsService} over an already-created management
 * service, stubbing the management service instance and a passive part so the
 * view's opening/restore/visible-session behaviour can be tested.
 */
function createView(
	instantiationService: TestInstantiationService,
	service: ISessionsManagementService,
	disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>,
	customViewService: ICustomViewService = disposables.add(new CustomViewService(new NullLogService(), disposables.add(new InMemoryStorageService()))),
	sessionsPartService: ISessionsPartService = new TestSessionsPartService(),
	openTelemetryService: ISessionOpenTelemetryService = disposables.add(new SessionOpenTelemetryService(NullTelemetryService)),
	canvasService: TestWindowCanvasService = new TestWindowCanvasService(customViewService),
	layoutService: IWorkbenchLayoutService = createSessionLayoutService(),
): SessionsService {
	instantiationService.stub(ISessionsManagementService, service);
	instantiationService.stub(ISessionsPartService, sessionsPartService);
	instantiationService.stub(ICustomViewService, customViewService);
	instantiationService.stub(IWindowCanvasService, canvasService);
	instantiationService.stub(IWorkbenchLayoutService, layoutService);
	instantiationService.stub(IConfigurationService, new TestConfigurationService());
	instantiationService.stub(ISessionOpenTelemetryService, openTelemetryService);
	const onDidChangeActiveWindow = disposables.add(new Emitter<number>());
	instantiationService.stub(IHostService, new class extends mock<IHostService>() {
		override readonly onDidChangeActiveWindow = onDidChangeActiveWindow.event;
	}());
	const chatHostOpenerService = new ChatHostOpenerService();
	instantiationService.stub(IChatHostOpenerService, chatHostOpenerService);
	const view = disposables.add(instantiationService.createInstance(SessionsService));
	activeWindowChanges.set(view, onDidChangeActiveWindow);
	chatHostOpeners.set(view, chatHostOpenerService);
	return view;
}

/** Makes a window the active one, for the {@link SessionsService} {@link createView} built. */
const activeWindowChanges = new WeakMap<SessionsService, Emitter<number>>();

/** Where chats another surface shows open and close, for the {@link SessionsService} {@link createView} built. */
const chatHostOpeners = new WeakMap<SessionsService, IChatHostOpenerService>();

suite('SessionsManagementService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('managed worktree inventory isolates provider failures and forwards only their known repositories', async () => {
		const session = stubSession({ sessionId: 'session', providerId: 'healthy' });
		const calls: { provider: string; repositories: string[] }[] = [];
		const entry = { repository: URI.file('/repo').toString(), worktree: URI.file('/repo.worktrees/leftover').toString(), branch: 'agents/leftover', cleanupStatus: { state: 'unknown' as const } };
		const healthy = new class extends TestSessionsProvider {
			override readonly id = 'healthy';
			override async listManagedWorktrees(repositories: readonly URI[] = []) {
				calls.push({ provider: this.id, repositories: repositories.map(uri => uri.toString()) });
				return [entry];
			}
		}(session);
		const failing = new class extends TestSessionsProvider {
			override readonly id = 'offline';
			override async listManagedWorktrees(repositories: readonly URI[] = []): Promise<never> {
				calls.push({ provider: this.id, repositories: repositories.map(uri => uri.toString()) });
				throw new Error('Host disconnected');
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, [healthy, failing]);
		assert.ok(service.listManagedWorktrees);
		const result = await service.listManagedWorktrees([
			{ ...entry, providerId: healthy.id },
			{ ...entry, providerId: failing.id, repository: URI.file('/remote').toString() },
		]);
		assert.deepStrictEqual({ calls, result }, {
			calls: [
				{ provider: 'healthy', repositories: [entry.repository] },
				{ provider: 'offline', repositories: [URI.file('/remote').toString()] },
			],
			result: [{ ...entry, providerId: healthy.id }],
		});
	});

	test('lists the sessions as their providers list them, and finds and reports the changes of also those outside a listing scope', () => {
		const listed = stubSession({ sessionId: 'listed', providerId: 'scoped' });
		const hidden = stubSession({ sessionId: 'hidden', providerId: 'scoped' });
		const onDidChangeAllSessions = disposables.add(new Emitter<ISessionChangeEvent>());
		const scoped = new class extends TestSessionsProvider {
			override readonly id = 'scoped';
			override readonly onDidChangeAllSessions = onDidChangeAllSessions.event;
			override getAllSessions(): ISession[] { return [listed, hidden]; }
		}(listed);
		const { service } = createSessionsManagementService(listed, disposables, [scoped]);
		const changes: string[] = [];
		disposables.add(service.onDidChangeSession(batch => changes.push(batch.map(({ session, kind }) => `${kind} ${session.sessionId}`).join(', '))));
		onDidChangeAllSessions.fire({ added: [], removed: [], changed: [hidden] });

		assert.deepStrictEqual({
			listed: service.getSessions().map(session => session.sessionId),
			found: service.getSession(hidden.resource)?.sessionId,
			changes,
		}, { listed: ['listed'], found: 'hidden', changes: ['changed hidden'] });
	});

	suite('session grid integration', () => {
		function created(id: string): ISession {
			const chat: IChat = { ...stubChat, resource: URI.parse(`test:///${id}/chat`), status: constObservable(SessionStatus.Completed) };
			return stubSession({ sessionId: id, providerId: 'test', status: constObservable(SessionStatus.Completed), mainChat: constObservable(chat), chats: constObservable([chat]) });
		}

		function harness(sessions: ISession[], options: {
			storage?: InMemoryStorageService;
			prepare?: (session: ISession) => Promise<void>;
			resolve?: (resource: URI) => Promise<URI | undefined>;
			trust?: () => Promise<boolean>;
			createChat?: () => Promise<IChat>;
		} = {}) {
			const ui = createSessionsPartTestHarness(disposables);
			const sessionsChanged = disposables.add(new Emitter<ISessionChangeEvent>());
			const provider = new class extends TestSessionsProvider {
				override readonly onDidChangeSessions = sessionsChanged.event;
				override getSessions() { return sessions; }
				override async prepareSessionForOpen(session: ISession): Promise<void> { await options.prepare?.(session); }
				override async resolveSessionResource(resource: URI): Promise<URI | undefined> { return options.resolve?.(resource); }
				override async createNewChat(): Promise<IChat> { return options.createChat ? options.createChat() : super.createNewChat(); }
			}(sessions[0]);
			const partService = new TestSessionsPartService(ui.content.onDidFocusPane, ui.content);
			const trustRequest = new class extends mock<IWorkspaceTrustRequestService>() {
				override async requestResourcesTrust(): Promise<boolean> { return options.trust?.() ?? true; }
			};
			const trustManagement = options.trust ? new class extends TestWorkspaceTrustManagementService {
				override async getUriTrustInfo(uri: URI) { return { uri, trusted: false }; }
			} : undefined;
			const services = createSessionsManagementService(sessions[0], disposables, provider, trustManagement, trustRequest, undefined, partService, options.storage);
			ui.instantiationService.stub(ISessionsService, services.view);
			ui.instantiationService.stub(ISessionsManagementService, services.service);
			ui.part.layout(1202, 802, 0, 0);
			return { ...ui, ...services, sessionsChanged };
		}

		test('opens exact chats of one session in a grid and retains the selected chat on reopening', async () => {
			const session = created('parent');
			const main = session.mainChat.get();
			const child = { ...main, resource: main.resource.with({ fragment: 'child' }) };
			const parent = { ...session, chats: constObservable([main, child]) };
			const { view } = harness([parent]);
			const targets = [main, child].map(chat => ({ session: parent, chatResource: chat.resource }));
			await view.openChatsInGrid(targets);
			view.activatePane(view.panes.get()[1]);
			await view.openChatsInGrid([...targets, targets[0]]);
			assert.deepStrictEqual({
				chats: view.panes.get().map(pane => pane.chat.get()?.resource.toString()),
				active: activeChatOf(view)?.resource.toString(),
			}, { chats: [main.resource.toString(), child.resource.toString()], active: child.resource.toString() });
		});

		test('the main window focuses the active session only while no other window holds focus', async () => {
			const a = created('a');
			const b = created('b');
			const { view, sessionsPartService } = harness([a, b]);
			const chatWindowId = mainWindow.vscodeWindowId + 1;
			await view.openSession(a.resource);
			sessionsPartService.focusedSessions.length = 0;

			activeWindowChanges.get(view)!.fire(chatWindowId);
			await view.openSession(b.resource);
			const whileChatWindowFocused = [...sessionsPartService.focusedSessions];
			sessionsPartService.focusedSessions.length = 0;

			// Becoming active applies the skipped focus (b), then a normal open focuses.
			activeWindowChanges.get(view)!.fire(mainWindow.vscodeWindowId);
			await view.openSession(a.resource);

			assert.deepStrictEqual({ whileChatWindowFocused, whileMainFocused: sessionsPartService.focusedSessions }, { whileChatWindowFocused: [], whileMainFocused: ['b', 'a'] });
		});

		for (const [focusAfterMove, expected] of [['went away', ['a']], ['unchanged', ['a']], ['removed', ['a']], ['moved elsewhere', []]] as const) {
			test(`after a chat moves into a chat window, the main window ${expected.length ? 'focuses its active session once' : 'keeps its focused element'} when it becomes active and its focus ${focusAfterMove}`, async () => {
				const a = created('a');
				const b = created('b');
				const { view, sessionsPartService } = harness([a, b]);
				const list = mainWindow.document.body.appendChild(mainWindow.document.createElement('input'));
				const other = mainWindow.document.body.appendChild(mainWindow.document.createElement('input'));
				disposables.add(toDisposable(() => { list.remove(); other.remove(); }));
				await view.openSession(a.resource);
				await view.openSessionsAt([b], a.sessionId, 'right');
				if (focusAfterMove === 'went away') {
					(mainWindow.document.activeElement as HTMLElement | null)?.blur();
				} else {
					list.focus();
				}
				disposables.add(view.hideChatFromGrid(b, b.mainChat.get().resource));
				if (focusAfterMove === 'removed') {
					// Detached focus: reported as the list only by the recorded reference.
					list.remove();
				}
				sessionsPartService.focusedSessions.length = 0;

				const windowChanges = activeWindowChanges.get(view)!;
				windowChanges.fire(mainWindow.vscodeWindowId + 1);
				const whileChatWindowFocused = [...sessionsPartService.focusedSessions];
				if (focusAfterMove === 'moved elsewhere') {
					other.focus();
				}
				windowChanges.fire(mainWindow.vscodeWindowId);
				windowChanges.fire(mainWindow.vscodeWindowId);

				assert.deepStrictEqual({ whileChatWindowFocused, afterMainActive: sessionsPartService.focusedSessions }, { whileChatWindowFocused: [], afterMainActive: expected });
			});
		}

		test('a session that is not active leaving the grid for a chat window does not move the main window\'s focus when it becomes active', async () => {
			const a = created('a');
			const b = created('b');
			const { view, sessionsPartService } = harness([a, b]);
			await view.openSession(a.resource);
			await view.openSessionsAt([b], a.sessionId, 'right');
			await view.openSession(a.resource);
			const activeBefore = activeSessionOf(view)?.sessionId;
			const windowChanges = activeWindowChanges.get(view)!;
			windowChanges.fire(mainWindow.vscodeWindowId + 1);
			disposables.add(view.hideChatFromGrid(b, b.mainChat.get().resource));
			sessionsPartService.focusedSessions.length = 0;

			windowChanges.fire(mainWindow.vscodeWindowId);

			assert.deepStrictEqual({ activeBefore, focused: sessionsPartService.focusedSessions }, { activeBefore: 'a', focused: [] });
		});

		test('a chat that leaves the grid for a chat window does not move focus into the main window\'s next session', async () => {
			const a = created('a');
			const b = created('b');
			const { view, sessionsPartService } = harness([a, b]);
			await view.openSession(a.resource);
			await view.openSessionsAt([b], a.sessionId, 'right');
			sessionsPartService.focusedSessions.length = 0;

			const hold = view.hideChatFromGrid(b, b.mainChat.get().resource);
			disposables.add(hold);

			assert.deepStrictEqual({
				visible: slotSessionsOf(view).map(session => session?.sessionId),
				active: activeSessionOf(view)?.sessionId,
				focused: sessionsPartService.focusedSessions,
			}, { visible: ['a'], active: 'a', focused: [] });
		});

		test('hosts stand for grid panes: the grid host for the active pane, a view\'s host for its slot or detached pane, other hosts for none', async () => {
			const session = created('parent');
			const main = session.mainChat.get();
			const child = { ...main, resource: main.resource.with({ fragment: 'child' }) };
			const parent = { ...session, chats: constObservable([main, child]) };
			const { content, view } = harness([parent]);
			const paneOf = (host: ISessionHost) => {
				const pane = view.getPaneOfHost(host);
				const chat = pane?.chat.get();
				return pane && `${pane.kind}:${pane.session.get()?.sessionId ?? 'new session'}:${chat ? chat.resource.fragment || 'main' : 'no chat'}`;
			};
			const of = (host: ISessionHost | undefined) => host && { active: view.isActivePane(host), detached: view.isDetachedPane(host), grid: !!view.getPaneOfHost(host) || host === view.gridHost, pane: paneOf(host) };
			const empty = { grid: of(view.gridHost), emptySlot: of(content.getSessionView(undefined)?.host) };
			await view.openSession(parent.resource);
			await view.moveChatToGrid(parent.sessionId, child.resource, (Reflect.get(view, '_visibility') as VisibleSessions).getGridSlots()[0].id, 'right');
			const [slot, detached] = view.panes.get();
			const chatWindow = new SessionHost({ kind: SessionHostKind.ChatWindow, parent: undefined, session: constObservable(detached?.session.get()), chat: constObservable(detached?.chat.get()), contextKeyService: upcastPartial<IContextKeyService>({}) });

			assert.deepStrictEqual({
				empty,
				grid: of(view.gridHost),
				slot: of(content.getViewOfPane(slot)?.host),
				detached: of(content.getViewOfPane(detached)?.host),
				chatWindow: of(chatWindow),
			}, {
				empty: { grid: { active: true, detached: false, grid: true, pane: 'slot:new session:no chat' }, emptySlot: { active: true, detached: false, grid: true, pane: 'slot:new session:no chat' } },
				grid: { active: true, detached: true, grid: true, pane: 'detached:parent:child' },
				slot: { active: false, detached: false, grid: true, pane: 'slot:parent:main' },
				detached: { active: true, detached: true, grid: true, pane: 'detached:parent:child' },
				chatWindow: { active: false, detached: false, grid: false, pane: undefined },
			});
		});

		test('a pill activates the pane of the grid its host is in, also from a host nested in it; from the main window outside a pane, such as the Inbox, the pane of this grid that shows its chat, else its session\'s slot; a pill in a chat window leaves the grid as it is; the action runs', async () => {
			const session = created('a');
			const main = session.mainChat.get();
			const child = { ...main, resource: main.resource.with({ fragment: 'child' }) };
			const a = { ...session, chats: constObservable([main, child]) };
			const [b, c] = ['b', 'c'].map(created);
			const { content, view } = harness([a, b, c]);
			await view.openSessionsInGrid([a, b]);
			await view.moveChatToGrid(a.sessionId, child.resource, view.slotPanes.get()[0].id, 'right');
			const name = (pane: ISessionGridPane | undefined) => pane && `${pane.kind}:${pane.session.get()?.sessionId}`;
			const paneB = view.slotPanes.get().find(pane => pane.session.get()?.sessionId === 'b')!;
			const hostOfA = content.getViewOfPane(slotPaneOf(view, 'a')!)!.host;
			const hostIn = (kind: SessionHostKind, parent: ISessionHost | undefined) => new SessionHost({ kind, parent, session: constObservable(a), chat: constObservable(undefined), contextKeyService: upcastPartial<IContextKeyService>({}) });
			const run = async (host: ISessionHost, target?: { session: ISession; chatResource: URI }) => {
				view.activatePane(paneB);
				const ran: string[] = [];
				await disposables.add(new SessionActivatingActionRunner(host, view, () => ({ session: target?.session, chatResource: target?.chatResource }))).run(toAction({ id: 'pill', label: 'Pill', run: () => { ran.push('pill'); } }));
				return `${ran.join()} ${name(view.activePane.get())}`;
			};
			const ofA = { session: a, chatResource: main.resource };
			const ofChild = { session: a, chatResource: child.resource };

			assert.deepStrictEqual({
				pane: await run(hostOfA),
				composerInPane: await run(hostIn(SessionHostKind.Composer, hostOfA)),
				inbox: await run(view.gridHost, ofA),
				inboxOfDetachedChat: await run(view.gridHost, ofChild),
				nestedInMainWindow: await run(hostIn(SessionHostKind.Composer, view.gridHost), ofA),
				inboxOfSessionNotInGrid: await run(view.gridHost, { session: c, chatResource: c.mainChat.get().resource }),
				inboxWithoutTarget: await run(view.gridHost),
				chatWindow: await run(hostIn(SessionHostKind.ChatWindow, undefined), ofA),
				chatWindowEditor: await run(hostIn(SessionHostKind.Pane, hostIn(SessionHostKind.ChatWindow, undefined)), ofA),
			}, {
				pane: 'pill slot:a',
				composerInPane: 'pill slot:a',
				inbox: 'pill slot:a',
				inboxOfDetachedChat: 'pill detached:a',
				nestedInMainWindow: 'pill slot:a',
				inboxOfSessionNotInGrid: 'pill slot:b',
				inboxWithoutTarget: 'pill slot:b',
				chatWindow: 'pill slot:b',
				chatWindowEditor: 'pill slot:b',
			});
		});

		test('the pane members act on the panes the grid shows: a pane that has left the grid is a no-op, the live new-session slot\'s pane closes', async () => {
			const [a, b] = ['a', 'b'].map(created);
			const { view } = harness([a, b]);
			await view.openSessionsInGrid([a, b]);
			await view.openNewSession({ toSide: true });
			const removed = view.slotPanes.get()[0];
			view.closePane(removed);
			const grid = () => ({
				slots: view.slotPanes.get().map(pane => pane.session.get()?.sessionId ?? 'new session'),
				active: view.activePane.get()?.session.get()?.sessionId ?? 'new session',
			});
			const afterClosing = grid();
			view.activatePane(removed);
			view.focusPaneInDirection(removed, Direction.Right);
			view.movePaneInDirection(removed, Direction.Right);
			view.resizePaneInDirection(removed, Direction.Right);
			view.collapseToPane(removed);
			view.closePane(removed);
			const afterRemovedPane = grid();
			const slotOf = (sessionId: string | undefined) => view.slotPanes.get().find(pane => pane.session.get()?.sessionId === sessionId)!;
			view.activatePane(slotOf('b'));
			view.closePane(slotOf(undefined));

			assert.deepStrictEqual({ afterClosing, afterRemovedPane, afterClosingNewSessionPane: grid() }, {
				afterClosing: { slots: ['new session', 'b'], active: 'new session' },
				afterRemovedPane: { slots: ['new session', 'b'], active: 'new session' },
				afterClosingNewSessionPane: { slots: ['b'], active: 'b' },
			});
		});

		test('a pane\'s content closes its own pane: a detached pane returns its chat, a slot leaves the grid, and a stale content, of a replaced session or a pane that left, closes nothing', async () => {
			const session = created('parent');
			const main = session.mainChat.get();
			const child = { ...main, resource: main.resource.with({ fragment: 'child' }) };
			const parent = { ...session, chats: constObservable([main, child]) };
			const other = created('other');
			const replacement = created('replacement');
			const { content, view } = harness([parent, other, replacement]);
			await view.openSessionsInGrid([parent, other]);
			await view.moveChatToGrid(parent.sessionId, child.resource, view.panes.get()[0].id, 'right');
			const grid = () => view.panes.get().map(pane => `${pane.kind}:${pane.session.get()?.sessionId ?? 'new session'}${pane.kind === 'detached' ? `:${pane.chat.get()?.resource.fragment}` : ''}`);
			const contentOf = (sessionId: string, detached = false) => {
				const pane = view.panes.get().find(candidate => candidate.session.get()?.sessionId === sessionId && (candidate.kind === SessionGridPaneKind.Detached) === detached);
				return (Reflect.get(content.getViewOfPane(pane!)!, '_contentObs') as IObservable<ISessionPaneContent | undefined>).get()!;
			};
			const detachedContent = contentOf('parent', true);
			const before = grid();
			detachedContent.close();
			const afterDetached = grid();
			// The provider replaces the session of a slot: the content of the replaced session is stale.
			const replacedContent = contentOf('other');
			(Reflect.get(view, '_visibility') as VisibleSessions).updateSession(other, replacement);
			replacedContent.close();
			const afterStaleReplaced = grid();
			contentOf('replacement').close();
			const afterSlot = grid();
			// A live new-session slot, which no stale content may close.
			await view.openNewSession({ toSide: true });
			const withNewSession = grid();
			detachedContent.close();
			replacedContent.close();

			assert.deepStrictEqual({ before, afterDetached, afterStaleReplaced, afterSlot, withNewSession, afterStale: grid() }, {
				before: ['slot:parent', 'slot:other', 'detached:parent:child'],
				afterDetached: ['slot:parent', 'slot:other'],
				afterStaleReplaced: ['slot:parent', 'slot:replacement'],
				afterSlot: ['slot:parent'],
				withNewSession: ['slot:parent', 'slot:new session'],
				afterStale: ['slot:parent', 'slot:new session'],
			});
		});

		test('the hosts of a slot and a detached pane of one session, and the grid host, show the provider\'s session object, each with its own chat', async () => {
			const session = created('parent');
			const main = session.mainChat.get();
			const child = { ...main, resource: main.resource.with({ fragment: 'child' }) };
			const parent = { ...session, chats: constObservable([main, child]) };
			const { content, view } = harness([parent]);
			await view.openSession(parent.resource);
			await view.moveChatToGrid(parent.sessionId, child.resource, (Reflect.get(view, '_visibility') as VisibleSessions).getGridSlots()[0].id, 'right');
			const [slot, detached] = view.panes.get();
			const hosts = [view.gridHost, content.getViewOfPane(slot)!.host, content.getViewOfPane(detached)!.host];

			assert.deepStrictEqual(hosts.map(host => ({
				provider: host.session.get() === parent,
				chat: host.chat.get()?.resource.fragment || 'main',
			})), [
				{ provider: true, chat: 'child' },
				{ provider: true, chat: 'main' },
				{ provider: true, chat: 'child' },
			]);
		});

		test('the grid host is one instance: the one the host lookups register and the main window\'s UI injects, showing the grid\'s active pane; the root has none', async () => {
			const a = created('a');
			const b = created('b');
			const { view } = harness([a, b]);
			const sessionHostService = disposables.add(new SessionHostService(navigationServiceOf(view), upcastPartial<IEditorGroupsService>({ getGroup: () => undefined })));
			// Resolved as the main window's UI resolves it: through the main window's instantiation service.
			// Strict, as the workbench's: it rejects a service it does not know.
			const root = disposables.add(new InstantiationService(new ServiceCollection([ISessionsService, view], [ISessionHostService, sessionHostService]), true));
			const injected = disposables.add(createMainWindowInstantiationService(root)).invokeFunction(accessor => accessor.get(ISessionHost));
			class RootConsumer {
				constructor(@ISessionHost readonly host: ISessionHost) { }
			}
			let rootInjection: string;
			try {
				root.createInstance(RootConsumer);
				rootInjection = 'created';
			} catch {
				rootInjection = 'throws';
			}
			await view.openSession(a.resource);
			await view.openSessionsAt([b], a.sessionId, 'right', { activate: false });
			const shownBefore = view.gridHost.session.get()?.sessionId;
			view.activatePane(slotPaneOf(view, 'b'));

			assert.deepStrictEqual({
				registered: sessionHostService.getHostOfWindow(mainWindow.vscodeWindowId) === view.gridHost,
				mainWindowHost: getMainWindowHost(sessionHostService) === view.gridHost,
				disposable: (view.gridHost as Partial<IDisposable>).dispose !== undefined,
				hosts: sessionHostService.hosts.get().filter(host => host.kind === SessionHostKind.MainWindow).length,
				injected: injected === view.gridHost,
				rootRegistration: getSingletonServiceDescriptors().some(([id]) => id === ISessionHost),
				rootInjection,
				shownBefore,
				shownAfter: view.gridHost.session.get()?.sessionId,
			}, { registered: true, mainWindowHost: true, disposable: false, hosts: 1, injected: true, rootRegistration: false, rootInjection: 'throws', shownBefore: 'a', shownAfter: 'b' });
		});

		test('the active pane is always one of the grid panes: a detached pane, a draft and a quick chat', async () => {
			const session = created('parent');
			const main = session.mainChat.get();
			const child = { ...main, resource: main.resource.with({ fragment: 'child' }) };
			const parent = { ...session, chats: constObservable([main, child]) };
			const { view } = harness([parent]);
			await view.openChatsInGrid([main, child].map(chat => ({ session: parent, chatResource: chat.resource })));
			view.activatePane(view.panes.get()[1]);
			const detached = view.activePane.get();

			const folderUri = URI.file('/workspace');
			const workspace: ISessionWorkspace = {
				uri: folderUri, label: 'workspace', icon: Codicon.folder,
				folders: [{ root: folderUri, workingDirectory: folderUri, name: 'workspace', description: undefined }],
				requiresWorkspaceTrust: false, isVirtualWorkspace: false,
			};
			const drafts = [];
			for (const quickChat of [false, true]) {
				const draft = stubSession({
					sessionId: quickChat ? 'quick-chat' : 'draft', providerId: 'test', status: constObservable(SessionStatus.Untitled),
					isQuickChat: constObservable(quickChat), workspace: constObservable(quickChat ? undefined : workspace),
				});
				const provider = new class extends TestSessionsProvider {
					override readonly supportsQuickChats = true;
					override resolveWorkspace(): ISessionWorkspace { return workspace; }
					override createQuickChat(): ISession { return draft; }
				}(draft);
				const services = createSessionsManagementService(draft, disposables, provider);
				if (quickChat) {
					services.view.openQuickChat({ providerId: provider.id });
				} else {
					await services.view.openNewSession({ folderUri, providerId: provider.id });
				}
				const active = activeSessionOf(services.view);
				drafts.push({ active: active?.sessionId, inPanes: !!active && services.view.panes.get().includes(services.view.activePane.get()!) });
			}

			assert.deepStrictEqual({
				detached: { chat: detachedChatOf(detached)?.toString(), inPanes: !!detached && view.panes.get().includes(detached) },
				drafts,
			}, {
				detached: { chat: child.resource.toString(), inPanes: true },
				drafts: [{ active: 'draft', inPanes: true }, { active: 'quick-chat', inPanes: true }],
			});
		});

		test('a child tab can be dragged outside its parent into an independent pane beside another session', async () => {
			const a = created('a');
			const b = created('b');
			const child: IChat = {
				...a.mainChat.get(), resource: URI.parse('test:///a/child'), title: constObservable('Child'),
				origin: { kind: ChatOriginKind.SideChat, parentChat: a.mainChat.get().resource },
			};
			const parent = { ...a, chats: constObservable([a.mainChat.get(), child]) };
			const { content, view, container } = harness([parent, b]);
			await view.openSessionsInGrid([parent, b]);
			const tab = content.getSessionView('a')!.element.querySelector<HTMLElement>(`.chat-composite-bar-tab[data-chat-resource="${child.resource}"]`)!;
			const dataTransfer = new DataTransfer();
			tab.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
			content.getSessionView('b')!.element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer }));
			const overlay = container.querySelector<HTMLElement>('#monaco-workbench-session-drop-overlay');
			assert.ok(overlay, 'the outer grid must accept a child chat drag');
			overlay.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
			tab.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
			await timeout(0);
			const detached = content.getFocusedSessionView();
			assert.deepStrictEqual({
				owners: slotSessionsOf(view).map(session => session?.sessionId),
				panes: container.querySelectorAll('.session-view').length,
				owner: detached?.getSession()?.sessionId,
				chat: detached?.pane.get()?.kind === SessionGridPaneKind.Detached ? detached.pane.get()?.chat.get()?.resource.toString() : undefined,
				parent: child.origin?.parentChat?.toString(),
				shown: content.shownChatCount.get(),
			}, {
				owners: ['a', 'b'], panes: 3, owner: 'a', chat: child.resource.toString(),
				parent: a.mainChat.get().resource.toString(), shown: 3,
			});
		});

		for (const sourceIsParent of [false, true]) {
			test(`main-chat placement targets the standalone child pane, not its owner (same owner: ${sourceIsParent})`, async () => {
				const a = created('a');
				const b = created('b');
				const child: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/child'), title: constObservable('Child') };
				const parent = { ...a, chats: constObservable([a.mainChat.get(), child]) };
				const { content, view } = harness([parent, b]);
				await view.openSessionsInGrid([parent, b]);
				const visibility = Reflect.get(view, '_visibility') as VisibleSessions;
				await view.moveChatToGrid(parent.sessionId, child.resource, visibility.getGridSlots()[1].id, 'down');
				const childSlot = visibility.getRenderedGridSlots().find(slot => detachedChatOf(paneWithId(view, slot.id))?.toString() === child.resource.toString())!;
				const source = sourceIsParent ? parent : b;
				const sourceSlot = visibility.getGridSlots()[visibility.getSlot(source.sessionId)!.index];
				await view.moveChatToGrid(source.sessionId, source.mainChat.get().resource, childSlot.id, 'right');
				const grid = Reflect.get(content, '_gridWidget') as SessionGridLayout;
				assert.deepStrictEqual({
					leftNeighbor: grid.neighbor(sourceSlot.id, Direction.Left),
					mainChat: activeChatOf(view)?.resource.toString(),
					activeOwner: activeSessionOf(view)?.sessionId,
					sourcePaneRetained: visibility.getGridSlots()[visibility.getSlot(source.sessionId)!.index].id,
					detachedChild: detachedChatOf(paneWithId(view, childSlot.id))?.toString(),
					panes: grid.order.length,
				}, {
					leftNeighbor: childSlot.id,
					mainChat: source.mainChat.get().resource.toString(),
					activeOwner: source.sessionId,
					sourcePaneRetained: sourceSlot.id,
					detachedChild: child.resource.toString(),
					panes: 3,
				});
			});
		}

		for (const sourceIsParent of [false, true]) {
			test(`keyboard movement targets the neighboring standalone child pane (same owner: ${sourceIsParent})`, async () => {
				const a = created('a');
				const b = created('b');
				const child: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/child'), title: constObservable('Child') };
				const parent = { ...a, chats: constObservable([a.mainChat.get(), child]) };
				const { content, view } = harness([parent, b]);
				await view.openSessionsInGrid([parent, b]);
				const visibility = Reflect.get(view, '_visibility') as VisibleSessions;
				await view.moveChatToGrid(parent.sessionId, child.resource, visibility.getGridSlots()[1].id, 'down');
				const childSlot = visibility.getRenderedGridSlots().find(slot => detachedChatOf(paneWithId(view, slot.id)))!;
				const source = sourceIsParent ? parent : b;
				view.toggleSessionStickiness(source);
				await view.moveChatToGrid(source.sessionId, source.mainChat.get().resource, childSlot.id, 'right');
				const sourceSlot = visibility.getGridSlots()[visibility.getSlot(source.sessionId)!.index];
				const grid = Reflect.get(content, '_gridWidget') as SessionGridLayout;
				assert.strictEqual(grid.neighbor(sourceSlot.id, Direction.Left), childSlot.id);
				view.movePaneInDirection(view.activePane.get()!, Direction.Left);
				assert.deepStrictEqual({
					rightNeighbor: grid.neighbor(sourceSlot.id, Direction.Right),
					activeSession: activeSessionOf(view)?.sessionId,
					activeChat: activeChatOf(view)?.resource.toString(),
					pinned: view.activePane.get()?.sticky.get(),
					child: detachedChatOf(paneWithId(view, childSlot.id))?.toString(),
					panes: grid.order.length,
				}, {
					rightNeighbor: childSlot.id,
					activeSession: source.sessionId,
					activeChat: source.mainChat.get().resource.toString(),
					pinned: true,
					child: child.resource.toString(),
					panes: 3,
				});
			});
		}

		test('multiple-mode split session panes retain session controls when the shared header is hidden', async () => {
			const a = created('a');
			const child: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/child') };
			const parent = { ...a, chats: constObservable([a.mainChat.get(), child]) };
			const { content, view } = harness([parent]);
			await view.openSession(parent.resource);
			await view.openChatToSide(parent, child.resource);
			const pane = content.getSessionView(parent.sessionId)!;
			const sharedHeader = pane.element.querySelector<HTMLElement>('.session-view-centered-content > .session-header-bar')!;
			assert.deepStrictEqual({
				sharedHeaderHidden: sharedHeader.style.display,
				tabToolbars: [...pane.element.querySelectorAll('.session-chat-tabs-actions')].map(toolbar => toolbar.classList.contains('hidden')),
			}, { sharedHeaderHidden: 'none', tabToolbars: [false, false] });
		});

		test('keyboard movement can move the empty composer past a standalone child pane', async () => {
			const a = created('a');
			const b = created('b');
			const child: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/child') };
			const parent = { ...a, chats: constObservable([a.mainChat.get(), child]) };
			const { content, view } = harness([parent, b]);
			await view.openSessionsInGrid([parent, b]);
			const visibility = Reflect.get(view, '_visibility') as VisibleSessions;
			await view.moveChatToGrid(parent.sessionId, child.resource, visibility.getGridSlots()[1].id, 'down');
			const childSlot = visibility.getRenderedGridSlots().find(slot => detachedChatOf(paneWithId(view, slot.id)))!;
			visibility.insertAtGridSlot(undefined, childSlot.id, 'right', true);
			const composerSlot = visibility.getGridSlots()[visibility.getSlot(undefined)!.index];
			const grid = Reflect.get(content, '_gridWidget') as SessionGridLayout;
			assert.strictEqual(grid.neighbor(composerSlot.id, Direction.Left), childSlot.id);
			view.movePaneInDirection(newSessionSlotOf(view)!, Direction.Left);
			assert.deepStrictEqual({ neighbor: grid.neighbor(composerSlot.id, Direction.Right), active: activeSessionOf(view), panes: grid.order.length }, {
				neighbor: childSlot.id, active: undefined, panes: 4,
			});
		});

		for (const closeRoute of ['pane', 'tab']) {
			test(`closing a standalone child via its ${closeRoute} cancels a restore waiting for another session`, async () => {
				const a = created('a');
				const b = created('b');
				const child: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/child'), title: constObservable('Child') };
				const parent = { ...a, chats: constObservable([a.mainChat.get(), child]) };
				const storage = disposables.add(new InMemoryStorageService());
				const first = harness([parent, b], { storage });
				await first.view.openSessionsInGrid([parent, b]);
				const firstVisibility = Reflect.get(first.view, '_visibility') as VisibleSessions;
				await first.view.moveChatToGrid(parent.sessionId, child.resource, firstVisibility.getGridSlots()[1].id, 'down');
				await storage.flush();
				first.view.dispose();

				const sessions: ISession[] = [parent];
				const second = harness(sessions, { storage });
				const restoring = second.view.restoreVisibleSessions();
				await waitForState(second.view.activePane, pane => detachedChatOf(pane)?.toString() === child.resource.toString());
				await timeout(0);
				const childPane = second.view.activePane.get()!;
				const beforeClose = second.container.querySelectorAll('.session-view').length;
				if (closeRoute === 'tab') {
					await second.view.closeChat(childPane.session.get()!, child);
				} else {
					second.view.closePane(childPane);
				}
				const afterClose = second.container.querySelectorAll('.session-view').length;
				sessions.push(b);
				second.sessionsChanged.fire({ added: [b], removed: [], changed: [] });
				await restoring;
				assert.deepStrictEqual({
					beforeClose, afterClose,
					afterLateSession: second.container.querySelectorAll('.session-view').length,
					visible: slotSessionsOf(second.view).map(session => session?.sessionId),
					detached: second.view.panes.get().some(pane => !!detachedChatOf(pane)),
				}, { beforeClose: 2, afterClose: 1, afterLateSession: 1, visible: [parent.sessionId], detached: false });
			});
		}

		test('detaching a chat without dragging creates a pane that survives closing its parent', async () => {
			const a = created('a');
			const child: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/child') };
			const parent = { ...a, chats: constObservable([a.mainChat.get(), child]) };
			const { content, view, container } = harness([parent]);
			await view.openSession(parent.resource);
			await view.openChat(parent, child.resource);
			await view.detachChat(view.activePane.get()!, child.resource);
			const pane = content.getFocusedSessionView();
			view.closeSession(parent);
			await view.detachChat(view.activePane.get()!, child.resource);
			assert.deepStrictEqual({
				roots: slotSessionsOf(view).length,
				panes: container.querySelectorAll('.session-view').length,
				active: detachedChatOf(view.activePane.get())?.toString(),
				retained: content.getFocusedSessionView() === pane,
			}, { roots: 0, panes: 1, active: child.resource.toString(), retained: true });
		});

		for (const createDraft of [false, true]) {
			test(`child-only navigation creates a valid destination without replacing another session (new draft: ${createDraft})`, async () => {
				const a = created('a');
				const b = created('b');
				const child: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/child') };
				const sibling: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/sibling') };
				const draft: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/draft'), status: constObservable(SessionStatus.Untitled) };
				const chats = observableValue<readonly IChat[]>('chats', [a.mainChat.get(), child, sibling]);
				const parent = { ...a, chats };
				const { content, view, container } = harness([parent, b], {
					createChat: async () => {
						chats.set([...chats.get(), draft], undefined);
						return draft;
					},
				});
				await view.openSessionsInGrid([parent, b]);
				await view.closeChat(slotSessionsOf(view)[0]!, sibling);
				const visibility = Reflect.get(view, '_visibility') as VisibleSessions;
				await view.moveChatToGrid(parent.sessionId, child.resource, visibility.getGridSlots()[1].id, 'down');
				const childPane = view.activePane.get()!;
				const childView = content.getFocusedSessionView();
				const otherView = content.getSessionView(b.sessionId);
				view.closeSession(parent);
				// From the views of the detached pane, which navigate within it.
				const from = content.getViewOfPane(childPane)!.host;
				if (createDraft) {
					await view.openNewChatInSession(parent, { forceNew: true, from });
				} else {
					await view.openChat(parent, sibling.resource, { from });
				}
				const requested = createDraft ? draft : sibling;
				assert.deepStrictEqual({
					activeChat: activeChatOf(view)?.resource.toString(),
					scope: detachedChatOf(view.activePane.get()),
					panes: container.querySelectorAll('.session-view').length,
					childRetained: childView?.element.isConnected,
					otherRetained: content.getSessionView(b.sessionId) === otherView,
					requestedVisible: view.activePane.get()?.tabs.visibleChatTabs.get().some(chat => chat.resource.toString() === requested.resource.toString()),
				}, { activeChat: requested.resource.toString(), scope: undefined, panes: 3, childRetained: true, otherRetained: true, requestedVisible: true });
			});
		}

		for (const origin of ['detached view', 'grid host', 'none'] as const) {
			test(`opening another chat of a session whose slot is closed, from ${origin === 'none' ? 'no host, as the sessions list does, replaces a slot' : `the ${origin} of its detached pane, puts its slot beside that pane and replaces none`}`, async () => {
				const a = created('a');
				const b = created('b');
				const child: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/child') };
				const sibling: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/sibling') };
				const parent = { ...a, chats: constObservable([a.mainChat.get(), child, sibling]) };
				const { content, view } = harness([parent, b]);
				await view.openSessionsInGrid([parent, b]);
				await view.closeChat(parent, sibling);
				await view.moveChatToGrid(parent.sessionId, child.resource, slotPaneOf(view, b.sessionId)!.id, 'down');
				const childPane = view.activePane.get()!;
				view.closeSession(parent);
				const from = origin === 'detached view' ? content.getViewOfPane(childPane)!.host : origin === 'grid host' ? view.gridHost : undefined;

				await view.openChat(parent, sibling.resource, { from });

				const grid = Reflect.get(content, '_gridWidget') as SessionGridLayout;
				const slotOfA = slotPaneOf(view, parent.sessionId);
				assert.deepStrictEqual({
					panes: view.panes.get().map(pane => `${pane.kind}:${pane.session.get()?.sessionId}${detachedChatOf(pane) ? `:${detachedChatOf(pane)!.path}` : ''}`),
					active: `${view.activePane.get()?.kind}:${activeChatOf(view)?.resource.path}`,
					besideChild: !!slotOfA && grid.neighbor(childPane.id, Direction.Right) === slotOfA.id,
				}, origin === 'none' ? {
					panes: ['slot:a', 'detached:a:/a/child'],
					active: 'slot:/a/sibling',
					besideChild: false,
				} : {
					panes: ['slot:b', 'slot:a', 'detached:a:/a/child'],
					active: 'slot:/a/sibling',
					besideChild: true,
				});
			});
		}

		test('a whole-session drag can place its main pane beside its own standalone child', async () => {
			const a = created('a');
			const b = created('b');
			const child: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/child') };
			const parent = { ...a, chats: constObservable([a.mainChat.get(), child]) };
			const { content, view } = harness([parent, b]);
			await view.openSessionsInGrid([parent, b]);
			const visibility = Reflect.get(view, '_visibility') as VisibleSessions;
			await view.moveChatToGrid(parent.sessionId, child.resource, visibility.getGridSlots()[1].id, 'down');
			const childSlot = visibility.getRenderedGridSlots().find(slot => detachedChatOf(paneWithId(view, slot.id)))!;
			const childPane = content.getFocusedSessionView()!.element;
			const transfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();
			disposables.add(toDisposable(() => transfer.clearData(DraggedSessionIdentifier.prototype)));
			transfer.setData([new DraggedSessionIdentifier(parent.sessionId, parent.resource)], DraggedSessionIdentifier.prototype);
			const dataTransfer = new DataTransfer();
			dataTransfer.setData(SessionsDataTransfers.SESSION, JSON.stringify({ sessionId: parent.sessionId, resource: parent.resource.toString() }));
			const bounds = childPane.getBoundingClientRect();
			const clientX = bounds.right - 10;
			const clientY = bounds.top + bounds.height / 2;
			childPane.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer, clientX, clientY }));
			const overlay = childPane.querySelector<HTMLElement>('#monaco-workbench-session-drop-overlay');
			assert.ok(overlay);
			overlay.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, clientX, clientY }));
			await timeout(0);
			const mainSlot = visibility.getGridSlots()[visibility.getSlot(parent.sessionId)!.index];
			const grid = Reflect.get(content, '_gridWidget') as SessionGridLayout;
			assert.deepStrictEqual({
				target: grid.neighbor(mainSlot.id, Direction.Left),
				child: detachedChatOf(paneWithId(view, childSlot.id))?.toString(),
				panes: grid.order.length,
			}, { target: childSlot.id, child: child.resource.toString(), panes: 3 });
		});

		for (const hasDraft of [false, true]) {
			test(`a new-session pane can be dragged beside an independent child without replacing its composer (draft: ${hasDraft})`, async () => {
				const a = created('a');
				const child: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/child') };
				const parent = { ...a, chats: constObservable([a.mainChat.get(), child]) };
				const draft = stubSession({ sessionId: 'draft', providerId: 'test', status: constObservable(SessionStatus.Untitled) });
				const { content, view, service } = harness([parent]);
				await view.openSession(parent.resource);
				const visibility = Reflect.get(view, '_visibility') as VisibleSessions;
				await view.moveChatToGrid(parent.sessionId, child.resource, visibility.getGridSlots()[0].id, 'down');
				const childSlot = visibility.getRenderedGridSlots().find(slot => detachedChatOf(paneWithId(view, slot.id)))!;
				const target = content.getFocusedSessionView()!.element;
				view.insertAt(hasDraft ? draft : undefined, parent.sessionId, 'right');
				const source = content.getFocusedSessionView()!;
				const composer = source.element.querySelector('textarea')!;
				composer.value = 'Keep this draft prompt';
				const sourceSlot = visibility.getGridSlots()[visibility.getSlot(hasDraft ? draft.sessionId : undefined)!.index];
				const dragArea = source.element.querySelector<HTMLElement>('.chat-composite-bar-toolbar-floating')!;
				const sourceBounds = source.element.getBoundingClientRect();
				dragArea.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: sourceBounds.left + 100, clientY: sourceBounds.top + 16 }));
				const dataTransfer = new DataTransfer();
				const drag = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer });
				dragArea.dispatchEvent(drag);
				const bounds = target.getBoundingClientRect();
				const clientX = bounds.right - 10;
				const clientY = bounds.top + bounds.height / 2;
				target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer, clientX, clientY }));
				const overlay = target.querySelector<HTMLElement>('#monaco-workbench-session-drop-overlay');
				assert.ok(overlay);
				overlay.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, clientX, clientY }));
				await timeout(0);
				dragArea.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
				const grid = Reflect.get(content, '_gridWidget') as SessionGridLayout;
				assert.deepStrictEqual({
					started: !drag.defaultPrevented,
					draftIsUnlisted: service.getSession(draft.resource) === undefined,
					target: grid.neighbor(sourceSlot.id, Direction.Left),
					retained: content.getFocusedSessionView() === source,
					prompt: source.element.querySelector('textarea')?.value,
					panes: grid.order.length,
					cleaned: !LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>().hasData(DraggedSessionIdentifier.prototype),
				}, { started: true, draftIsUnlisted: true, target: childSlot.id, retained: true, prompt: 'Keep this draft prompt', panes: 3, cleaned: true });
			});
		}

		test('an existing session can be dropped beside the empty new-session pane', async () => {
			const a = created('a');
			const { content, view } = harness([a]);
			await view.openSession(a.resource);
			const source = content.getFocusedSessionView()!;
			view.insertAt(undefined, a.sessionId, 'right');
			const target = content.getFocusedSessionView()!;
			const visibility = Reflect.get(view, '_visibility') as VisibleSessions;
			const targetSlot = visibility.getGridSlots()[visibility.getSlot(undefined)!.index];
			const transfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();
			disposables.add(toDisposable(() => transfer.clearData(DraggedSessionIdentifier.prototype)));
			transfer.setData([new DraggedSessionIdentifier(a.sessionId, a.resource)], DraggedSessionIdentifier.prototype);
			const bounds = target.element.getBoundingClientRect();
			const dataTransfer = new DataTransfer();
			const clientX = bounds.right - 10;
			const clientY = bounds.top + bounds.height / 2;
			target.element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer, clientX, clientY }));
			const overlay = target.element.querySelector<HTMLElement>('#monaco-workbench-session-drop-overlay');
			assert.ok(overlay);
			overlay.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, clientX, clientY }));
			await timeout(0);
			const grid = Reflect.get(content, '_gridWidget') as SessionGridLayout;
			const sourceSlot = visibility.getGridSlots()[visibility.getSlot(a.sessionId)!.index];
			assert.deepStrictEqual({
				target: grid.neighbor(sourceSlot.id, Direction.Left),
				retainedSource: content.getFocusedSessionView() === source,
				retainedTarget: content.getSessionView(undefined) === target,
				panes: grid.order.length,
			}, { target: targetSlot.id, retainedSource: true, retainedTarget: true, panes: 2 });
		});

		for (const detached of [false, true]) {
			test(`a chat can be dropped beside the empty new-session pane (independent pane: ${detached})`, async () => {
				const a = created('a');
				const child: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/child') };
				const parent = { ...a, chats: constObservable([a.mainChat.get(), child]) };
				const { content, view } = harness([parent]);
				await view.openSession(parent.resource);
				const parentView = content.getFocusedSessionView()!;
				if (detached) {
					await view.detachChat(view.activePane.get()!, child.resource);
				}
				const childView = detached ? content.getFocusedSessionView() : undefined;
				view.insertAt(undefined, parent.sessionId, 'right');
				const target = content.getFocusedSessionView()!;
				const visibility = Reflect.get(view, '_visibility') as VisibleSessions;
				const targetSlot = visibility.getGridSlots()[visibility.getSlot(undefined)!.index];
				const bounds = target.element.getBoundingClientRect();
				const dataTransfer = new DataTransfer();
				fillSessionChatDragData(new DragEvent('dragstart', { dataTransfer }), parent.sessionId, child.resource, detached);
				const clientX = bounds.right - 10;
				const clientY = bounds.top + bounds.height / 2;
				target.element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer, clientX, clientY }));
				const overlay = target.element.querySelector<HTMLElement>('#monaco-workbench-session-drop-overlay');
				assert.ok(overlay);
				overlay.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, clientX, clientY }));
				await timeout(0);
				const grid = Reflect.get(content, '_gridWidget') as SessionGridLayout;
				const childSlot = view.panes.get().find(pane => detachedChatOf(pane)?.toString() === child.resource.toString())!;
				assert.deepStrictEqual({
					target: grid.neighbor(childSlot.id, Direction.Left),
					retainedParent: parentView.element.isConnected,
					retainedTarget: content.getSessionView(undefined) === target,
					retainedChild: !detached || content.getFocusedSessionView() === childView,
					activeChat: detachedChatOf(view.activePane.get())?.toString(),
					panes: grid.order.length,
				}, { target: targetSlot.id, retainedParent: true, retainedTarget: true, retainedChild: true, activeChat: child.resource.toString(), panes: 3 });
			});
		}

		for (const mode of [SessionsChatTabsMode.Single, SessionsChatTabsMode.Multiple]) {
			for (const alreadyVisible of [false, true]) {
				test(`parent-row drops select the main chat rather than the last active child (${mode}, visible: ${alreadyVisible})`, async () => {
					const a = created('a');
					const b = created('b');
					const selectedChild: IChat = {
						...a.mainChat.get(), resource: URI.parse('test:///a/selected-child'), title: constObservable('Selected child'),
						origin: { kind: ChatOriginKind.SideChat, parentChat: a.mainChat.get().resource },
					};
					const detachedChild: IChat = {
						...selectedChild, resource: URI.parse('test:///a/detached-child'), title: constObservable('Detached child'),
					};
					const parent = { ...a, chats: constObservable([a.mainChat.get(), selectedChild, detachedChild]) };
					const { content, view, container, configurationService } = harness([parent, b]);
					await configurationService.setUserConfiguration(SESSIONS_CHAT_TABS_SETTING, mode);
					configurationService.onDidChangeConfigurationEmitter.fire({
						source: ConfigurationTarget.USER,
						affectedKeys: new Set([SESSIONS_CHAT_TABS_SETTING]),
						change: { keys: [SESSIONS_CHAT_TABS_SETTING], overrides: [] },
						affectsConfiguration: key => key === SESSIONS_CHAT_TABS_SETTING,
					});
					await view.openSessionsInGrid([parent, b]);
					const visibility = Reflect.get(view, '_visibility') as VisibleSessions;
					if (alreadyVisible) {
						await view.moveChatToGrid(parent.sessionId, detachedChild.resource, visibility.getGridSlots()[1].id, 'down');
					}
					const standalone = view.panes.get().find(pane => detachedChatOf(pane));
					await view.openChat(parent, selectedChild.resource);
					assert.strictEqual(activeChatOf(view)?.resource.toString(), selectedChild.resource.toString());
					if (!alreadyVisible) {
						view.closeSession(parent);
					}
					const target = content.getSessionView(b.sessionId)!.element;
					const transfer = LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>();
					disposables.add(toDisposable(() => transfer.clearData(DraggedSessionIdentifier.prototype)));
					transfer.setData([new DraggedSessionIdentifier(parent.sessionId, parent.resource)], DraggedSessionIdentifier.prototype);
					const dataTransfer = new DataTransfer();
					dataTransfer.setData(SessionsDataTransfers.SESSION, JSON.stringify({ sessionId: parent.sessionId, resource: parent.resource.toString() }));
					const bounds = target.getBoundingClientRect();
					const clientX = bounds.left + bounds.width / 2;
					const clientY = bounds.bottom - 10;
					target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer, clientX, clientY }));
					const overlay = target.querySelector<HTMLElement>('#monaco-workbench-session-drop-overlay');
					assert.ok(overlay);
					overlay.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, clientX, clientY }));
					await timeout(0);
					assert.deepStrictEqual({
						activeOwner: activeSessionOf(view)?.sessionId,
						activeChat: activeChatOf(view)?.resource.toString(),
						paneChat: content.getFocusedSessionView()?.getActiveChat()?.resource.toString(),
						standaloneRetained: view.panes.get().find(pane => detachedChatOf(pane)) === standalone,
						panes: container.querySelectorAll('.session-view').length,
					}, {
						activeOwner: parent.sessionId,
						activeChat: parent.mainChat.get().resource.toString(),
						paneChat: parent.mainChat.get().resource.toString(),
						standaloneRetained: true,
						panes: alreadyVisible ? 3 : 2,
					});
				});
			}
		}

		for (const mode of [SessionsChatTabsMode.Single, SessionsChatTabsMode.Multiple]) {
			test(`closing a parent preserves its child pane and sidebar drags work while the parent is hidden (${mode})`, async () => {
				const a = created('a');
				const b = created('b');
				const children = ['first', 'second'].map(name => ({
					...a.mainChat.get(), resource: URI.parse(`test:///a/${name}`), title: constObservable(name),
					origin: { kind: ChatOriginKind.SideChat, parentChat: a.mainChat.get().resource },
				}));
				const parent = { ...a, chats: constObservable([a.mainChat.get(), ...children]) };
				const { content, view, container, chatViews, configurationService } = harness([parent, b]);
				await configurationService.setUserConfiguration(SESSIONS_CHAT_TABS_SETTING, mode);
				configurationService.onDidChangeConfigurationEmitter.fire({
					source: ConfigurationTarget.USER,
					affectedKeys: new Set([SESSIONS_CHAT_TABS_SETTING]),
					change: { keys: [SESSIONS_CHAT_TABS_SETTING], overrides: [] },
					affectsConfiguration: key => key === SESSIONS_CHAT_TABS_SETTING,
				});
				await view.openSessionsInGrid([parent, b]);
				const visibility = Reflect.get(view, '_visibility') as VisibleSessions;
				const dropChild = async (chat: IChat) => {
					const target = content.getSessionView(b.sessionId)!.element;
					const dataTransfer = new DataTransfer();
					fillSessionChatDragData(new DragEvent('dragstart', { dataTransfer }), parent.sessionId, chat.resource);
					const bounds = target.getBoundingClientRect();
					const clientX = bounds.right - 10;
					const clientY = bounds.top + bounds.height / 2;
					target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer, clientX, clientY }));
					const overlay = target.querySelector<HTMLElement>('#monaco-workbench-session-drop-overlay');
					assert.ok(overlay, 'sidebar child drags must have an outer grid drop target');
					overlay.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, clientX, clientY }));
					await timeout(0);
				};
				await dropChild(children[0]);
				const pane = content.getFocusedSessionView();
				const chatView = chatViews.find(chat => chat.chat?.resource.toString() === children[0].resource.toString())!;
				chatView.input.value = 'keep my draft';
				view.closeSession(parent);
				await view.openChat(parent, children[0].resource);
				const afterParentClose = {
					roots: slotSessionsOf(view).map(session => session?.sessionId),
					retained: content.getFocusedSessionView() === pane,
					disposed: chatView.disposed,
					input: chatView.input.value,
					panes: container.querySelectorAll('.session-view').length,
				};
				view.closeSession(activeSessionOf(view)!);
				await dropChild(children[0]);
				await dropChild(children[1]);
				const withoutParent = {
					roots: slotSessionsOf(view).map(session => session?.sessionId),
					children: view.panes.get().map(pane => detachedChatOf(pane)?.toString()).filter(chat => !!chat),
					panes: container.querySelectorAll('.session-view').length,
				};
				const childSlot = visibility.getRenderedGridSlots().find(slot => detachedChatOf(paneWithId(view, slot.id)))!;
				await view.openSessionsAt([parent], parent.sessionId, 'down', { referenceSlotId: childSlot.id, forceMainChat: true });
				assert.deepStrictEqual({
					afterParentClose,
					withoutParent,
					reopenedParent: content.getFocusedSessionView()?.getActiveChat()?.resource.toString(),
					parentTabs: view.activePane.get()?.tabs.visibleChatTabs.get().map(chat => chat.resource.toString()),
					panes: container.querySelectorAll('.session-view').length,
				}, {
					afterParentClose: { roots: ['b'], retained: true, disposed: false, input: 'keep my draft', panes: 2 },
					withoutParent: { roots: ['b'], children: children.map(chat => chat.resource.toString()), panes: 3 },
					reopenedParent: parent.mainChat.get().resource.toString(),
					parentTabs: [parent.mainChat.get().resource.toString()],
					panes: 4,
				});
			});
		}

		test('a child-only layout restores without reopening the parent, and Close All closes its panes', async () => {
			const a = created('a');
			const children = ['first', 'second'].map(name => ({ ...a.mainChat.get(), resource: URI.parse(`test:///a/${name}`) }));
			const parent = { ...a, chats: constObservable([a.mainChat.get(), ...children]) };
			const storage = disposables.add(new InMemoryStorageService());
			const first = harness([parent], { storage });
			await first.view.openSession(parent.resource);
			const visibility = Reflect.get(first.view, '_visibility') as VisibleSessions;
			for (const child of children) {
				await first.view.moveChatToGrid(parent.sessionId, child.resource, visibility.getGridSlots()[0].id, 'right');
			}
			first.view.closeSession(parent);
			const geometry = first.content.getGridLayout();
			await storage.flush();
			first.view.dispose();
			const restored = harness([parent], { storage });
			await restored.view.restoreVisibleSessions();
			const before = {
				roots: slotSessionsOf(restored.view).map(session => session?.sessionId),
				panes: restored.container.querySelectorAll('.session-view').length,
				geometry: restored.content.getGridLayout(),
				active: detachedChatOf(restored.view.activePane.get())?.toString(),
			};
			restored.view.closeAllSessions();
			assert.deepStrictEqual({ before, active: activeSessionOf(restored.view), shown: restored.content.shownChatCount.get() }, {
				before: { roots: [], panes: 2, geometry, active: children[1].resource.toString() },
				active: undefined, shown: 1,
			});
		});

		test('reload selects a surviving child when the previously active child was deleted', async () => {
			const a = created('a');
			const children = ['surviving', 'deleted'].map(name => ({ ...a.mainChat.get(), resource: URI.parse(`test:///a/${name}`) }));
			const chats = observableValue<readonly IChat[]>('chats', [a.mainChat.get(), ...children]);
			const parent = { ...a, chats };
			const storage = disposables.add(new InMemoryStorageService());
			const first = harness([parent], { storage });
			await first.view.openSession(parent.resource);
			const visibility = Reflect.get(first.view, '_visibility') as VisibleSessions;
			for (const child of children) {
				await first.view.moveChatToGrid(parent.sessionId, child.resource, visibility.getGridSlots()[0].id, 'right');
			}
			first.view.closeSession(parent);
			await storage.flush();
			first.view.dispose();
			first.part.dispose();
			chats.set([a.mainChat.get(), children[0]], undefined);
			const restored = harness([parent], { storage });
			await restored.view.restoreVisibleSessions();
			assert.deepStrictEqual({
				roots: slotSessionsOf(restored.view).length,
				panes: restored.view.panes.get().map(pane => detachedChatOf(pane)?.toString()),
				active: detachedChatOf(restored.view.activePane.get())?.toString(),
				focused: restored.content.getFocusedSessionView()?.getActiveChat()?.resource.toString(),
			}, { roots: 0, panes: [children[0].resource.toString()], active: children[0].resource.toString(), focused: children[0].resource.toString() });
		});

		for (const parentVisible of [false, true]) {
			test(`sidebar directional placement targets the active child rather than its owner (parent visible: ${parentVisible})`, async () => {
				const a = created('a');
				const b = created('b');
				const child: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/child') };
				const parent = { ...a, chats: constObservable([a.mainChat.get(), child]) };
				const { content, view, container } = harness([parent, b]);
				await view.openSessionsInGrid([parent]);
				const visibility = Reflect.get(view, '_visibility') as VisibleSessions;
				await view.moveChatToGrid(parent.sessionId, child.resource, visibility.getGridSlots()[0].id, 'right');
				const pane = content.getFocusedSessionView();
				if (!parentVisible) {
					view.closeSession(parent);
				}
				const childSlot = visibility.getRenderedGridSlots().find(slot => detachedChatOf(paneWithId(view, slot.id)))!.id;
				await view.openSessionsAt([b], activeSessionOf(view)?.sessionId, 'down', { source: 'sessionsList', activate: 'last' });
				const grid = Reflect.get(content, '_gridWidget') as SessionGridLayout;
				const targetSlot = visibility.getGridSlots()[visibility.getSlot(b.sessionId)!.index].id;
				assert.deepStrictEqual({
					above: grid.neighbor(targetSlot, Direction.Up),
					active: activeSessionOf(view)?.sessionId,
					panes: container.querySelectorAll('.session-view').length,
					childRetained: pane?.element.isConnected,
				}, { above: childSlot, active: b.sessionId, panes: parentVisible ? 3 : 2, childRetained: true });
			});
		}

		test('New Session to the Side opens beside a child whose parent pane is closed', async () => {
			const a = created('a');
			const child: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/child') };
			const parent = { ...a, chats: constObservable([a.mainChat.get(), child]) };
			const { content, view, container } = harness([parent]);
			await view.openSession(parent.resource);
			const visibility = Reflect.get(view, '_visibility') as VisibleSessions;
			await view.moveChatToGrid(parent.sessionId, child.resource, visibility.getGridSlots()[0].id, 'down');
			view.closeSession(parent);
			const pane = content.getFocusedSessionView();
			const childSlot = visibility.getRenderedGridSlots()[0].id;
			await view.openNewSession({ toSide: true });
			const grid = Reflect.get(content, '_gridWidget') as SessionGridLayout;
			const composer = visibility.getGridSlots()[0].id;
			assert.deepStrictEqual({
				panes: container.querySelectorAll('.session-view').length,
				active: activeSessionOf(view),
				retained: detachedChatOf(paneWithId(view, childSlot))?.toString(),
				connected: pane?.element.isConnected,
				leftNeighbor: grid.neighbor(composer, Direction.Left),
			}, { panes: 2, active: undefined, retained: child.resource.toString(), connected: true, leftNeighbor: childSlot });
		});

		test('a detached child of the session staying active when its root moves into a chat window does not move the main window\'s focus when it becomes active', async () => {
			const a = created('a');
			const main = a.mainChat.get();
			const child: IChat = { ...main, resource: URI.parse('test:///a/child') };
			const parent = { ...a, chats: constObservable([main, child]) };
			const { view, sessionsPartService } = harness([parent]);
			const list = mainWindow.document.body.appendChild(mainWindow.document.createElement('input'));
			disposables.add(toDisposable(() => list.remove()));
			await view.openSession(parent.resource);
			const visibility = Reflect.get(view, '_visibility') as VisibleSessions;
			await view.moveChatToGrid(parent.sessionId, child.resource, visibility.getGridSlots()[0].id, 'down');
			const childPane = view.panes.get().find(pane => pane.kind === SessionGridPaneKind.Detached)!;
			view.activatePane(childPane);
			list.focus();
			const windowChanges = activeWindowChanges.get(view)!;
			windowChanges.fire(mainWindow.vscodeWindowId + 1);
			disposables.add(view.hideChatFromGrid(parent, main.resource));
			sessionsPartService.focusedSessions.length = 0;

			windowChanges.fire(mainWindow.vscodeWindowId);

			assert.deepStrictEqual({ stillActive: view.activePane.get() === childPane, focused: sessionsPartService.focusedSessions }, { stillActive: true, focused: [] });
		});

		for (const activePane of ['child', 'parent'] as const) {
			test(`a session whose last tab moves into a chat window, with a chat in a pane of its own and a subagent chat it does not show, leaves only its own slot: the child keeps its pane, and becomes active without a composer (${activePane} active)`, async () => {
				const a = created('a');
				const main = a.mainChat.get();
				const child: IChat = { ...main, resource: URI.parse('test:///a/child') };
				const subagent: IChat = { ...main, resource: URI.parse('test:///a/subagent'), origin: { kind: ChatOriginKind.Tool } };
				const parent = { ...a, chats: constObservable([main, child, subagent]) };
				const { content, view, container } = harness([parent]);
				await view.openSession(parent.resource);
				const visibility = Reflect.get(view, '_visibility') as VisibleSessions;
				await view.moveChatToGrid(parent.sessionId, child.resource, visibility.getGridSlots()[0].id, 'down');
				const childPane = view.panes.get().find(pane => pane.kind === SessionGridPaneKind.Detached)!;
				const childSlot = childPane.id;
				const childView = content.getViewOfPane(childPane);
				view.activatePane(activePane === 'child' ? childPane : view.slotPanes.get()[0]);

				disposables.add(view.hideChatFromGrid(parent, main.resource));

				assert.deepStrictEqual({
					roots: slotSessionsOf(view).length,
					slots: visibility.getRenderedGridSlots().map(slot => slot.id),
					child: paneWithId(view, childSlot) === childPane && detachedChatOf(childPane)?.toString(),
					view: content.getViewOfPane(childPane) === childView && childView?.element.isConnected,
					panes: container.querySelectorAll('.session-view').length,
					active: view.activePane.get() === childPane,
				}, { roots: 0, slots: [childSlot], child: child.resource.toString(), view: true, panes: 1, active: true });
			});
		}

		for (const operation of ['remove', 'collapse'] as const) {
			test(`${operation} handles owners that have only standalone child panes without reopening their parents`, async () => {
				const sessions = ['a', 'b'].map(id => {
					const session = created(id);
					const child: IChat = { ...session.mainChat.get(), resource: URI.parse(`test:///${id}/child`) };
					return { ...session, chats: constObservable([session.mainChat.get(), child]) };
				});
				const [a, b] = sessions;
				const { content, view, container, sessionsChanged } = harness(sessions);
				await view.openSessionsInGrid(sessions);
				const visibility = Reflect.get(view, '_visibility') as VisibleSessions;
				for (const session of sessions) {
					await view.moveChatToGrid(session.sessionId, session.chats.get()[1].resource, visibility.getGridSlots()[0].id, 'down');
				}
				view.closeSession(a);
				view.closeSession(b);
				const survivingPane = content.getFocusedSessionView();
				const survivingSession = view.activePane.get()!;
				if (operation === 'remove') {
					await view.openChat(a, a.chats.get()[1].resource);
					sessions.splice(0, 1);
					sessionsChanged.fire({ added: [], removed: [a], changed: [] });
					await timeout(0);
				} else {
					view.collapseToPane(survivingSession);
				}
				assert.deepStrictEqual({
					roots: slotSessionsOf(view).length,
					panes: container.querySelectorAll('.session-view').length,
					active: detachedChatOf(view.activePane.get())?.toString(),
					retained: content.getFocusedSessionView() === survivingPane,
				}, { roots: 0, panes: 1, active: b.chats.get()[1].resource.toString(), retained: true });
			});
		}

		test('a hidden-parent child drag cannot resurrect a session removed during provider preparation', async () => {
			const a = created('a');
			const b = created('b');
			const child: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/child') };
			const parent = { ...a, chats: constObservable([a.mainChat.get(), child]) };
			const sessions = [parent, b];
			const started = new DeferredPromise<void>();
			const finish = new DeferredPromise<void>();
			const { view, container, sessionsChanged } = harness(sessions, {
				prepare: async session => {
					if (session === parent) {
						started.complete();
						await finish.p;
					}
				},
			});

			await view.openSession(b.resource);
			const visibility = Reflect.get(view, '_visibility') as VisibleSessions;
			const opening = view.moveChatToGrid(parent.sessionId, child.resource, visibility.getGridSlots()[0].id, 'right');
			await started.p;
			sessions.splice(0, 1);
			sessionsChanged.fire({ added: [], removed: [parent], changed: [] });
			finish.complete();
			await opening;
			assert.deepStrictEqual({
				active: activeSessionOf(view)?.sessionId,
				panes: container.querySelectorAll('.session-view').length,
				children: view.panes.get().filter(pane => detachedChatOf(pane)).length,
			}, { active: b.sessionId, panes: 1, children: 0 });
		});

		for (const survivorKind of ['parent', 'child'] as const) {
			test(`collapse retains only the exact ${survivorKind} pane when chats share an owner`, async () => {
				const session = created('parent');
				const chats = ['attempt', 'judge'].map(id => ({ ...session.mainChat.get(), resource: URI.parse(`test:///parent/${id}`) }));
				const parent = { ...session, chats: constObservable([session.mainChat.get(), ...chats]) };
				const { content, view, container } = harness([parent]);
				await view.openSession(parent.resource);
				const visibility = Reflect.get(view, '_visibility') as VisibleSessions;
				for (const chat of chats) {
					await view.moveChatToGrid(parent.sessionId, chat.resource, visibility.getGridSlots()[0].id, 'right');
				}
				await view.openChat(parent, survivorKind === 'child' ? chats[1].resource : parent.mainChat.get().resource);
				const survivor = view.activePane.get()!;
				const pane = content.getFocusedSessionView();
				view.collapseToPane(survivor);
				assert.deepStrictEqual({
					panes: container.querySelectorAll('.session-view').length,
					resources: view.panes.get().map(candidate => candidate.chat.get()?.resource.toString()),
					retained: content.getFocusedSessionView() === pane,
					active: view.activePane.get() === survivor,
				}, {
					panes: 1,
					resources: [(survivorKind === 'child' ? chats[1] : parent.mainChat.get()).resource.toString()],
					retained: true,
					active: true,
				});
			});
		}

		test('a hidden-parent child drag is cancelled if its destination closes during provider preparation', async () => {
			const a = created('a');
			const b = created('b');
			const child: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/child') };
			const parent = { ...a, chats: constObservable([a.mainChat.get(), child]) };
			const started = new DeferredPromise<void>();
			const finish = new DeferredPromise<void>();
			const { view, container } = harness([parent, b], {
				prepare: async session => {
					if (session === parent) {
						started.complete();
						await finish.p;
					}
				},
			});
			await view.openSession(b.resource);
			const visibility = Reflect.get(view, '_visibility') as VisibleSessions;
			const opening = view.moveChatToGrid(parent.sessionId, child.resource, visibility.getGridSlots()[0].id, 'right');
			await started.p;
			view.closeSession(b);
			finish.complete();
			await opening;
			assert.deepStrictEqual({
				active: activeSessionOf(view),
				panes: container.querySelectorAll('.session-view').length,
				children: view.panes.get().filter(pane => detachedChatOf(pane)).length,
			}, { active: undefined, panes: 1, children: 0 });
		});

		test('independent chat panes survive reload, route navigation, and close without closing their parent', async () => {
			const a = created('a');
			const b = created('b');
			const child: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/child'), title: constObservable('Child') };
			const parent = { ...a, chats: constObservable([a.mainChat.get(), child]) };
			const storage = disposables.add(new InMemoryStorageService());
			const first = harness([parent, b], { storage });
			await first.view.openSessionsInGrid([parent, b]);
			const targetId = (Reflect.get(first.view, '_visibility') as VisibleSessions).getGridSlots()[1].id;
			await first.view.moveChatToGrid(parent.sessionId, child.resource, targetId, 'down');
			await storage.flush();
			const geometry = first.content.getGridLayout();
			const parentView = first.container.querySelectorAll<HTMLElement>('.session-view')[0];
			parentView.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			assert.strictEqual(detachedChatOf(first.view.activePane.get()), undefined, 'focusing the parent must not reactivate the independent child');
			const restored = harness([parent, b], { storage });
			await restored.view.restoreVisibleSessions();
			await restored.view.openChat(parent, child.resource);
			const pane = restored.content.getFocusedSessionView();
			const before = {
				panes: restored.container.querySelectorAll('.session-view').length,
				geometry: restored.content.getGridLayout(),
				scope: detachedChatOf(restored.view.activePane.get())?.toString(),
				chat: pane?.getActiveChat()?.resource.toString(),
			};
			await restored.view.closeChat(activeSessionOf(restored.view)!, child);
			assert.deepStrictEqual({
				before,
				remaining: restored.container.querySelectorAll('.session-view').length,
				owners: slotSessionsOf(restored.view).map(session => session?.sessionId),
			}, {
				before: { panes: 3, geometry, scope: child.resource.toString(), chat: child.resource.toString() },
				remaining: 2, owners: ['a', 'b'],
			});
		});

		test('a standalone chat reattaches through its parent drop target and retains the parent relationship', async () => {
			const a = created('a');
			const b = created('b');
			const child: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/child'), origin: { kind: ChatOriginKind.SideChat, parentChat: a.mainChat.get().resource } };
			const parent = { ...a, chats: constObservable([a.mainChat.get(), child]) };
			const { content, view, container } = harness([parent, b]);
			await view.openSessionsInGrid([parent, b]);
			await view.moveChatToGrid(parent.sessionId, child.resource, (Reflect.get(view, '_visibility') as VisibleSessions).getGridSlots()[1].id, 'down');
			const detached = content.getFocusedSessionView()!;
			const tab = detached.element.querySelector<HTMLElement>('.chat-composite-bar-tab')!;
			const dataTransfer = new DataTransfer();
			tab.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
			const parentGroup = container.querySelectorAll<HTMLElement>('.session-view')[0].querySelector<HTMLElement>('.chat-group-view')!;
			parentGroup.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer }));
			const overlay = parentGroup.querySelector<HTMLElement>('#monaco-workbench-chat-group-drop-overlay');
			assert.ok(overlay);
			overlay.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer }));
			overlay.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
			await timeout(0);
			assert.deepStrictEqual({
				panes: container.querySelectorAll('.session-view').length,
				activeScope: detachedChatOf(view.activePane.get()),
				owner: activeSessionOf(view)?.sessionId,
				parent: child.origin?.parentChat?.toString(),
			}, { panes: 2, activeScope: undefined, owner: parent.sessionId, parent: a.mainChat.get().resource.toString() });
		});

		test('single mode blocks standalone chat reattachment while multiple mode still accepts it', async () => {
			const a = created('a');
			const b = created('b');
			const child: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/child'), title: constObservable('Child') };
			const parent = { ...a, chats: constObservable([a.mainChat.get(), child]) };
			const { content, view, container, configurationService } = harness([parent, b]);
			await view.openSessionsInGrid([parent, b]);
			await view.moveChatToGrid(parent.sessionId, child.resource, (Reflect.get(view, '_visibility') as VisibleSessions).getGridSlots()[1].id, 'down');
			const setMode = async (mode: SessionsChatTabsMode) => {
				await configurationService.setUserConfiguration(SESSIONS_CHAT_TABS_SETTING, mode);
				configurationService.onDidChangeConfigurationEmitter.fire({
					source: ConfigurationTarget.USER,
					affectedKeys: new Set([SESSIONS_CHAT_TABS_SETTING]),
					change: { keys: [SESSIONS_CHAT_TABS_SETTING], overrides: [] },
					affectsConfiguration: key => key === SESSIONS_CHAT_TABS_SETTING,
				});
			};
			await setMode(SessionsChatTabsMode.Single);
			const detached = content.getFocusedSessionView()!;
			const header = detached.element.querySelector<HTMLElement>('.session-header-bar')!;
			const headerDrag = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
			header.dispatchEvent(headerDrag);
			const parentView = container.querySelectorAll<HTMLElement>('.session-view')[0];
			const parentGroup = parentView.querySelector<HTMLElement>('.chat-group-view')!;
			parentGroup.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: headerDrag.dataTransfer }));
			const single = {
				hasOverlay: !!parentView.querySelector('#monaco-workbench-chat-group-drop-overlay'),
				panes: container.querySelectorAll('.session-view').length,
				detached: detachedChatOf(view.activePane.get())?.toString(),
				payload: getSessionChatDragData(headerDrag),
				marked: headerDrag.dataTransfer!.types.includes(SessionsDataTransfers.DETACHED_CHAT),
			};
			header.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
			await setMode(SessionsChatTabsMode.Multiple);
			const tab = detached.element.querySelector<HTMLElement>('.chat-composite-bar-tab')!;
			const tabDrag = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
			tab.dispatchEvent(tabDrag);
			const tabMarked = tabDrag.dataTransfer!.types.includes(SessionsDataTransfers.DETACHED_CHAT);
			const area = parentView.querySelector<HTMLElement>('.session-chat-tabs-bar')!;
			const bounds = area.getBoundingClientRect();
			const clientX = bounds.left + bounds.width / 2;
			const clientY = bounds.top + bounds.height / 2;
			area.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: tabDrag.dataTransfer, clientX, clientY }));
			const overlay = parentView.querySelector<HTMLElement>('#monaco-workbench-chat-group-drop-overlay');
			assert.ok(overlay);
			overlay.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: tabDrag.dataTransfer, clientX, clientY }));
			overlay.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: tabDrag.dataTransfer, clientX, clientY }));
			await timeout(0);
			assert.deepStrictEqual({
				single, tabMarked,
				multiple: { panes: container.querySelectorAll('.session-view').length, detached: detachedChatOf(view.activePane.get()) },
			}, {
				single: {
					hasOverlay: false, panes: 3, detached: child.resource.toString(),
					payload: { sessionId: parent.sessionId, resource: child.resource.toString(), isDetached: true }, marked: true,
				},
				tabMarked: true,
				multiple: { panes: 2, detached: undefined },
			});
		});

		for (const position of ['left', 'middle', 'right'] as const) {
			test(`dropping a standalone child onto the ${position} of its parent's tab area reattaches it without splitting`, async () => {
				const a = created('a');
				const b = created('b');
				const child: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/child'), title: constObservable('Child'), origin: { kind: ChatOriginKind.SideChat, parentChat: a.mainChat.get().resource } };
				const parent = { ...a, chats: constObservable([a.mainChat.get(), child]) };
				const { content, view, container } = harness([parent, b]);
				await view.openSessionsInGrid([parent, b]);
				await view.moveChatToGrid(parent.sessionId, child.resource, (Reflect.get(view, '_visibility') as VisibleSessions).getGridSlots()[1].id, 'down');
				const parentView = container.querySelectorAll<HTMLElement>('.session-view')[0];
				const tabArea = parentView.querySelector<HTMLElement>('.session-chat-tabs-bar')!;
				const bounds = tabArea.getBoundingClientRect();
				assert.ok(bounds.width > 0 && bounds.height > 0, 'the parent tab strip stays visible while its child is detached');
				const clientX = position === 'left' ? bounds.left + 4 : position === 'right' ? bounds.right - 4 : bounds.left + bounds.width / 2;
				const clientY = bounds.top + bounds.height / 2;
				const childTab = content.getFocusedSessionView()!.element.querySelector<HTMLElement>('.chat-composite-bar-tab')!;
				const dataTransfer = new DataTransfer();
				childTab.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
				tabArea.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer, clientX, clientY }));
				const overlay = parentView.querySelector<HTMLElement>('#monaco-workbench-chat-group-drop-overlay');
				assert.ok(overlay);
				const indicator = overlay.querySelector<HTMLElement>('.chat-group-drop-overlay-indicator')!;
				overlay.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer, clientX, clientY }));
				const preview = { width: indicator.style.width, height: indicator.style.height };
				overlay.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, clientX, clientY }));
				await timeout(0);
				assert.deepStrictEqual({
					preview,
					panes: container.querySelectorAll('.session-view').length,
					parentGroups: parentView.querySelectorAll('.chat-group-view').length,
					tabs: [...parentView.querySelectorAll('.chat-composite-bar-tab')].map(tab => tab.getAttribute('data-chat-resource')),
					active: parentView.querySelector('.chat-composite-bar-tab.active')?.getAttribute('data-chat-resource'),
					standalone: detachedChatOf(view.activePane.get()),
				}, {
					preview: { width: '100%', height: '100%' }, panes: 2, parentGroups: 1,
					tabs: [a.mainChat.get().resource.toString(), child.resource.toString()],
					active: child.resource.toString(), standalone: undefined,
				});
			});
		}

		test('restores a standalone chat after its provider finishes loading the chat catalog', async () => {
			const a = created('a');
			const b = created('b');
			const child: IChat = { ...a.mainChat.get(), resource: URI.parse('test:///a/child') };
			const chats = observableValue<readonly IChat[]>('chats', [a.mainChat.get(), child]);
			const loading = observableValue('loading', false);
			const parent = { ...a, chats, loading };
			const storage = disposables.add(new InMemoryStorageService());
			const first = harness([parent, b], { storage });
			await first.view.openSessionsInGrid([parent, b]);
			await first.view.moveChatToGrid(parent.sessionId, child.resource, (Reflect.get(first.view, '_visibility') as VisibleSessions).getGridSlots()[1].id, 'down');
			await storage.flush();
			chats.set([a.mainChat.get()], undefined);
			loading.set(true, undefined);
			const restored = harness([parent, b], { storage });
			const restoring = restored.view.restoreVisibleSessions();
			await timeout(0);
			chats.set([a.mainChat.get(), child], undefined);
			loading.set(false, undefined);
			await restoring;
			assert.deepStrictEqual({
				panes: restored.container.querySelectorAll('.session-view').length,
				scope: detachedChatOf(restored.view.activePane.get())?.toString(),
				focused: restored.content.getFocusedSessionView()?.getActiveChat()?.resource.toString(),
			}, { panes: 3, scope: child.resource.toString(), focused: child.resource.toString() });
		});

		test('a detached pane that is active remembers its chat as the session\'s active chat, which saving replaces by its slot\'s; closed tabs stay the slot\'s', async () => {
			const a = created('a');
			const main = a.mainChat.get();
			const child: IChat = { ...main, resource: URI.parse('test:///a/child') };
			const peer: IChat = { ...main, resource: URI.parse('test:///a/peer') };
			const parent = { ...a, chats: constObservable([main, child, peer]) };
			const storage = disposables.add(new InMemoryStorageService());
			const { view } = harness([parent], { storage });
			await view.openSession(parent.resource);
			const slot = slotSessionsOf(view)[0]!;
			await view.closeChat(slot, peer);
			await view.moveChatToGrid(parent.sessionId, child.resource, (Reflect.get(view, '_visibility') as VisibleSessions).getGridSlots()[0].id, 'right');
			const remembered = (Reflect.get(view, '_sessionStates') as ResourceMap<{ activeChatResource?: string }>).get(parent.resource)?.activeChatResource;
			await storage.flush();
			const states = JSON.parse(storage.get('agentSessions.activeSessionStates', StorageScope.WORKSPACE) ?? '[]') as { sessionResource: string; activeChatResource?: string; closedChatResources?: string[] }[];
			const state = states.find(entry => entry.sessionResource === parent.resource.toString());

			assert.deepStrictEqual({
				activePaneChat: detachedChatOf(view.activePane.get())?.toString(),
				remembered,
				saved: state?.activeChatResource,
				closed: state?.closedChatResources,
			}, { activePaneChat: child.resource.toString(), remembered: child.resource.toString(), saved: main.resource.toString(), closed: [peer.resource.toString()] });
		});

		test('a layout of only a detached pane is saved and restored; closing it attaches its chat, which reopening the session shows', async () => {
			const a = created('a');
			const main = a.mainChat.get();
			const child: IChat = { ...main, resource: URI.parse('test:///a/child') };
			const parent = { ...a, chats: constObservable([main, child]) };
			const storage = disposables.add(new InMemoryStorageService());
			const first = harness([parent], { storage });
			await first.view.openSession(parent.resource);
			await first.view.moveChatToGrid(parent.sessionId, child.resource, (Reflect.get(first.view, '_visibility') as VisibleSessions).getGridSlots()[0].id, 'right');
			first.view.closeSession(slotSessionsOf(first.view)[0]);
			const saved = first.view.panes.get().map(pane => detachedChatOf(pane)?.toString());
			await storage.flush();

			const restored = harness([parent], { storage });
			await restored.view.restoreVisibleSessions();
			const afterReload = {
				panes: restored.view.panes.get().map(pane => detachedChatOf(pane)?.toString()),
				active: detachedChatOf(restored.view.activePane.get())?.toString(),
			};
			restored.view.closePane(restored.view.activePane.get()!);
			await restored.view.openSession(parent.resource);

			assert.deepStrictEqual({ saved, afterReload, reopened: activeChatOf(restored.view)?.resource.toString() }, {
				saved: [child.resource.toString()],
				afterReload: { panes: [child.resource.toString()], active: child.resource.toString() },
				reopened: child.resource.toString(),
			});
		});

		test('a stored grid of slots and a detached chat restores and saves back byte for byte (v1)', async () => {
			const [a, b] = ['a', 'b'].map(created);
			const main = a.mainChat.get();
			const child: IChat = { ...main, resource: URI.parse('test:///a/child') };
			const parent = { ...a, chats: constObservable([main, child]) };
			const storage = disposables.add(new InMemoryStorageService());
			const first = harness([parent, b], { storage });
			await first.view.openSessionsInGrid([parent, b]);
			first.view.toggleSessionStickiness(b);
			await first.view.moveChatToGrid(parent.sessionId, child.resource, (Reflect.get(first.view, '_visibility') as VisibleSessions).getGridSlots()[1].id, 'down');
			await storage.flush();
			const stored = storage.get('agentSessions.gridState', StorageScope.WORKSPACE)!;
			first.view.dispose();

			const restored = harness([parent, b], { storage });
			await restored.view.restoreVisibleSessions();
			// What the restored grid writes itself, not what it was restored from.
			storage.remove('agentSessions.gridState', StorageScope.WORKSPACE);
			await storage.flush();
			const resaved = storage.get('agentSessions.gridState', StorageScope.WORKSPACE);
			const state = JSON.parse(stored) as ISessionGridState;

			assert.deepStrictEqual({
				bindings: state.sessions.map(binding => ({ resource: binding.resource, chat: binding.chatResource, sticky: binding.sticky })),
				panes: restored.view.panes.get().map(pane => ({ id: pane.id, kind: pane.kind, chat: detachedChatOf(pane)?.toString() })),
				active: restored.view.activePane.get()?.id,
				saved: resaved === stored,
			}, {
				bindings: [
					{ resource: parent.resource.toString(), chat: undefined, sticky: false },
					{ resource: b.resource.toString(), chat: undefined, sticky: true },
					{ resource: parent.resource.toString(), chat: child.resource.toString(), sticky: false },
				],
				panes: state.sessions.map(binding => ({ id: binding.id, kind: binding.chatResource ? SessionGridPaneKind.Detached : SessionGridPaneKind.Slot, chat: binding.chatResource })),
				active: state.active,
				saved: true,
			});
		});

		test('directional batch moves deduplicate, preserve pins, and retain created chat inputs', async () => {
			const [a, b, c] = ['a', 'b', 'c'].map(created);
			const { content, view, chatViews } = harness([a, b, c]);
			await view.openSessionsInGrid([a, b]);
			view.toggleSessionStickiness(a);
			const aView = content.getSessionView('a');
			const aChat = chatViews.find(chat => chat.chat?.resource.toString() === a.mainChat.get().resource.toString())!;
			aChat.input.value = 'still here';
			await view.openSessionsAt([a, a, c, b], 'b', 'down');
			assert.deepStrictEqual({
				visible: slotSessionsOf(view).map(session => session?.sessionId),
				sticky: view.slotPanes.get().map(pane => pane.session.get() ? pane.sticky.get() : undefined),
				active: activeSessionOf(view)?.sessionId,
				above: neighborOfSlot(view, content, 'a', Direction.Up),
				same: content.getSessionView('a') === aView,
				disposed: aChat.disposed, input: aChat.input.value,
			}, { visible: ['b', 'a', 'c'], sticky: [false, true, false], active: 'a', above: 'b', same: true, disposed: false, input: 'still here' });
		});

		test('a foreground remote open mounts its chat while provider preparation is pending', async () => {
			const active = created('active');
			const connectionStatus = observableValue<SessionRemoteConnectionStatus>('connectionStatus', { kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.Unknown });
			const target = {
				...created('target'),
				remoteConnectionStatus: connectionStatus,
			};
			const preparation = new DeferredPromise<void>();
			const { content, view, container } = harness([active, target], {
				prepare: async session => {
					if (session === target) {
						connectionStatus.set({ kind: 'connecting' }, undefined);
						await preparation.p;
					}
				},
			});
			await view.openSession(active.resource);
			const opening = view.openSession(target.resource);
			await timeout(0);
			const before = {
				active: activeSessionOf(view)?.sessionId,
				mounted: content.getSessionView('target')?.getSession()?.sessionId,
				focused: content.getSessionView('target')?.element.contains(container.ownerDocument.activeElement),
				progress: container.querySelector('.remote-host-unavailable-empty-state-progress')?.textContent,
			};
			preparation.complete();
			await opening;
			assert.deepStrictEqual({
				before,
				after: activeSessionOf(view)?.sessionId,
			}, {
				before: { active: 'target', mounted: 'target', focused: true, progress: 'Waiting for agent host connection...' },
				after: 'target',
			});
		});

		test('activating the active pane again records no navigation when no window shows it', async () => {
			const [first, second] = ['first', 'second'].map(created);
			const { view } = harness([first, second]);
			await view.openSessionsInGrid([first, second]);
			view.activatePane(slotPaneOf(view, second.sessionId));
			const navigation = view.navigationRequest.get();
			const active = view.activePane.get();
			view.activatePane(slotPaneOf(view, second.sessionId));
			assert.deepStrictEqual({ active: activeSessionOf(view)?.sessionId, samePane: view.activePane.get() === active, preservedNavigation: view.navigationRequest.get() === navigation }, {
				active: 'second', samePane: true, preservedNavigation: true,
			});
		});

		test('the main window\'s host follows the grid\'s active session', async () => {
			const [first, second, third] = ['first', 'second', 'third'].map(created);
			const { view } = harness([first, second, third]);
			const steps: { active: string | undefined; mainWindow: string | undefined }[] = [];
			const record = () => steps.push({
				active: activeSessionOf(view)?.sessionId,
				mainWindow: view.gridHost.session.get()?.sessionId,
			});
			await view.openSession(first.resource);
			record();
			await view.openSessionsInGrid([first, second]);
			view.activatePane(slotPaneOf(view, second.sessionId));
			record();
			await view.openSession(third.resource);
			record();
			view.closeSession(activeSessionOf(view));
			record();
			assert.deepStrictEqual(steps, [
				{ active: 'first', mainWindow: 'first' },
				{ active: 'second', mainWindow: 'second' },
				{ active: 'third', mainWindow: 'third' },
				{ active: 'first', mainWindow: 'first' },
			]);
		});

		test('explicitly reopening a retained inactive session reaches only its mounted group', async () => {
			const [first, second] = ['first', 'second'].map(created);
			const { content, view, chatViews } = harness([first, second]);
			await view.openSessionsInGrid([first, second]);
			view.activatePane(slotPaneOf(view, second.sessionId));
			const retained = content.getSessionView(first.sessionId);
			const reopened: { selected: string | undefined; requested: string }[] = [];
			for (const leaf of chatViews) {
				Object.assign(leaf, {
					reopenChat: async (resource: URI) => {
						reopened.push({ selected: leaf.chat?.resource.toString(), requested: resource.toString() });
					},
				});
			}

			await view.openSession(first.resource);

			assert.deepStrictEqual({ sameView: content.getSessionView(first.sessionId) === retained, reopened }, {
				sameView: true, reopened: [{ selected: first.mainChat.get().resource.toString(), requested: first.mainChat.get().resource.toString() }],
			});
		});

		test('explicitly reopening a pinned side chat reaches only its mounted group', async () => {
			const main = { ...stubChat, resource: URI.parse('test:///session/main'), status: constObservable(SessionStatus.Completed) };
			const side = { ...stubChat, resource: URI.parse('test:///session/side'), status: constObservable(SessionStatus.Completed), origin: { kind: ChatOriginKind.SideChat, parentChat: main.resource } };
			const session = stubSession({
				sessionId: 'session', providerId: 'test', status: constObservable(SessionStatus.Completed),
				mainChat: constObservable(main), chats: constObservable([main, side]), capabilities: constObservable({ supportsMultipleChats: true }),
			});
			const { content, view, chatViews } = harness([session]);
			await view.openChat(session, side.resource);
			const mounted = content.getSessionView(session.sessionId);
			assert.ok(mounted);
			mounted.toggleActiveChatPin();
			await view.openChat(session, main.resource);
			const pinned = chatViews.find(leaf => leaf.chat?.resource.toString() === side.resource.toString());
			assert.ok(pinned);
			const reopened: { selected: string | undefined; requested: string }[] = [];
			for (const leaf of chatViews) {
				Object.assign(leaf, {
					reopenChat: async (resource: URI) => {
						reopened.push({ selected: leaf.chat?.resource.toString(), requested: resource.toString() });
					},
				});
			}

			await view.openChat(session, side.resource);
			await view.openChat(session, side.resource);

			assert.deepStrictEqual({ disposed: pinned.disposed, groups: mounted.shownChatCount.get(), reopened }, {
				disposed: false, groups: 2,
				reopened: [
					{ selected: side.resource.toString(), requested: side.resource.toString() },
					{ selected: side.resource.toString(), requested: side.resource.toString() },
				],
			});
		});

		for (const open of ['openSession', 'openChat'] as const) {
			test(`${open} stops awaiting a retained chat retry after newer navigation`, async () => {
				const [first, second] = ['first', 'second'].map(created);
				const { content, view, chatViews } = harness([first, second]);
				await view.openSessionsInGrid([first, second]);
				const retained = content.getSessionView(first.sessionId);
				const leaf = chatViews.find(chat => chat.chat?.resource.toString() === first.mainChat.get().resource.toString());
				assert.ok(leaf);
				const retryStarted = new DeferredPromise<void>();
				const releaseRetry = new DeferredPromise<void>();
				const retryFinished = new DeferredPromise<void>();
				Object.assign(leaf, {
					reopenChat: async () => {
						retryStarted.complete();
						await releaseRetry.p;
						leaf.input.value = 'history restored';
						retryFinished.complete();
					},
				});
				let openingSettled = false;
				const opening = (open === 'openSession'
					? view.openSession(first.resource)
					: view.openChat(first, first.mainChat.get().resource)
				).then(() => { openingSettled = true; });
				await retryStarted.p;

				await view.openSession(second.resource);
				const afterNavigation = {
					openingSettled,
					retryFinished: retryFinished.isSettled,
					sameView: content.getSessionView(first.sessionId) === retained,
					disposed: leaf.disposed,
					visible: slotSessionsOf(view).map(session => session?.sessionId),
					active: activeSessionOf(view)?.sessionId,
				};
				releaseRetry.complete();
				await Promise.all([opening, retryFinished.p]);

				assert.deepStrictEqual({ afterNavigation, input: leaf.input.value, active: activeSessionOf(view)?.sessionId }, {
					afterNavigation: { openingSettled: true, retryFinished: false, sameView: true, disposed: false, visible: ['first', 'second'], active: 'second' },
					input: 'history restored', active: 'second',
				});
			});
		}

		test('navigation cancellation still waits for provider preparation', async () => {
			const [first, second] = ['first', 'second'].map(created);
			const preparationStarted = new DeferredPromise<void>();
			const preparation = new DeferredPromise<void>();
			let prepareFirst = false;
			const { view } = harness([first, second], {
				prepare: async session => {
					if (prepareFirst && session === first) {
						preparationStarted.complete();
						await preparation.p;
					}
				},
			});
			await view.openSessionsInGrid([first, second]);
			prepareFirst = true;
			let openingSettled = false;
			const opening = view.openSession(first.resource).then(() => { openingSettled = true; });
			await preparationStarted.p;

			await view.openSession(second.resource);
			const afterNavigation = { openingSettled, active: activeSessionOf(view)?.sessionId };
			preparation.complete();
			await opening;

			assert.deepStrictEqual({ afterNavigation, openingSettled, active: activeSessionOf(view)?.sessionId }, {
				afterNavigation: { openingSettled: false, active: 'second' }, openingSettled: true, active: 'second',
			});
		});

		test('balanced subset changes preserve caller order and retained widgets', async () => {
			const [a, b, c] = ['a', 'b', 'c'].map(created);
			const { content, view, chatViews } = harness([a, b, c]);
			await view.openSessionsInGrid([a, b, c]);
			view.activatePane(view.slotPanes.get()[1]);
			view.toggleSessionStickiness(c);
			const bView = content.getSessionView('b');
			const cView = content.getSessionView('c');
			const chats = chatViews.filter(chat => chat.kind === 'chat');
			await view.openSessionsInGrid([c, b, c]);
			assert.deepStrictEqual({
				visible: slotSessionsOf(view).map(session => session?.sessionId),
				active: activeSessionOf(view)?.sessionId, sticky: view.slotPanes.get().map(pane => pane.session.get() ? pane.sticky.get() : undefined),
				views: [content.getSessionView('b') === bView, content.getSessionView('c') === cView],
				disposals: chats.map(chat => chat.disposeCount),
			}, { visible: ['c', 'b'], active: 'b', sticky: [true, false], views: [true, true], disposals: [1, 0, 0] });
		});

		test('a session opened over the one the active slot shows takes over its chat view, without building a view in between', async () => {
			const [a, b] = ['a', 'b'].map(created);
			const { view, chatViews } = harness([a, b]);
			await view.openSession(a.resource);
			const shown = chatViews.filter(chat => chat.kind === 'chat' && !chat.disposed);
			const before = chatViews.length;
			await view.openSession(b.resource);
			assert.deepStrictEqual({
				created: chatViews.slice(before).map(chat => chat.kind),
				reused: shown.length === 1 && !shown[0].disposed,
				chat: shown[0]?.chat?.resource.toString(),
			}, { created: [], reused: true, chat: b.mainChat.get().resource.toString() });
		});

		test('ordinary external opening replaces only its leaf without resetting nested geometry', async () => {
			const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(created);
			const { content, view } = harness([a, b, c, d]);
			await view.openSessionsInGrid([a, b]);
			await view.openSessionsAt([c], 'b', 'down');
			content.resizePane(slotPaneOf(view, 'a')!, Direction.Left, 100);
			const geometry = content.getGridLayout();
			const aView = content.getSessionView('a');
			const cView = content.getSessionView('c');
			await view.openSession(d.resource);
			assert.deepStrictEqual({
				geometry: content.getGridLayout(), visible: slotSessionsOf(view).map(session => session?.sessionId),
				retained: content.getSessionView('a') === aView, replacedInPlace: content.getSessionView('d') === cView,
			}, { geometry, visible: ['a', 'b', 'd'], retained: true, replacedInPlace: true });
		});

		test('newer opening cancels a pending directional batch without partially inserting it', async () => {
			const [a, b, c] = ['a', 'b', 'c'].map(created);
			const started = new DeferredPromise<void>();
			const finish = new DeferredPromise<void>();
			const { content, view } = harness([a, b, c], {
				prepare: async session => {
					if (session === c) {
						started.complete();
						await finish.p;
					}
				}
			});
			await view.openSessionsInGrid([a, b]);
			const geometry = content.getGridLayout();
			const pending = view.openSessionsAt([c], 'a', 'up');
			await started.p;
			await view.openSession(b.resource);
			finish.complete();
			await pending;
			assert.deepStrictEqual({ geometry: content.getGridLayout(), visible: slotSessionsOf(view).map(session => session?.sessionId), active: activeSessionOf(view)?.sessionId },
				{ geometry, visible: ['a', 'b'], active: 'b' });
		});

		test('closing and reopening a nested session uses its surviving neighbor', async () => {
			const [a, b, c] = ['a', 'b', 'c'].map(created);
			const { content, view } = harness([a, b, c]);
			await view.openSessionsInGrid([a, b]);
			await view.openSessionsAt([c], 'b', 'down');
			view.closeSession(c);
			await view.reopenLastClosedItem();
			assert.deepStrictEqual({
				visible: slotSessionsOf(view).map(session => session?.sessionId),
				above: neighborOfSlot(view, content, 'c', Direction.Up),
				active: activeSessionOf(view)?.sessionId,
			}, { visible: ['a', 'b', 'c'], above: 'b', active: 'c' });
		});

		test('geometry, composer position, pins and maximization survive a phone save and reload', async () => {
			const [a, b, c] = ['a', 'b', 'c'].map(created);
			const storage = disposables.add(new InMemoryStorageService());
			const first = harness([a, b, c], { storage });
			await first.view.openSessionsInGrid([a, b]);
			await first.view.openSessionsAt([c], 'b', 'down');
			first.view.insertAt(undefined, 'a', 'left');
			first.view.toggleSessionStickiness(a);
			first.view.activatePane(slotPaneOf(first.view, 'c'));
			first.content.resizePane(slotPaneOf(first.view, 'a')!, Direction.Right, 70);
			first.content.toggleMaximizePane(slotPaneOf(first.view, 'c')!);
			first.container.classList.add('phone-layout');
			first.part.layout(390, 780, 0, 0);
			const geometry = first.content.getGridLayout();
			await storage.flush();
			const second = harness([a, b, c], { storage });
			await second.view.restoreVisibleSessions();
			assert.deepStrictEqual({
				geometry: second.content.getGridLayout(),
				visible: slotSessionsOf(second.view).map(session => session?.sessionId),
				active: activeSessionOf(second.view)?.sessionId,
				sticky: second.view.slotPanes.get().map(pane => pane.sticky.get()),
			}, { geometry, visible: [undefined, 'a', 'b', 'c'], active: 'c', sticky: [false, true, false, false] });
		});

		test('directional focus reaches the empty composer and returns to its neighbor', async () => {
			const a = created('a');
			const { view } = harness([a]);
			await view.openSession(a.resource);
			view.insertAt(undefined, 'a', 'down');
			view.focusPaneInDirection(newSessionSlotOf(view)!, Direction.Up);
			const first = view.activePane.get();
			view.focusPaneInDirection(first!, Direction.Down);
			assert.deepStrictEqual({ first: first?.session.get()?.sessionId, active: activeSessionOf(view), visible: slotSessionsOf(view).map(session => session?.sessionId) },
				{ first: 'a', active: undefined, visible: ['a', undefined] });
		});

		test('phone activation does not refocus the hidden previous session', async () => {
			const [a, b] = ['a', 'b'].map(created);
			const { view, part, content, container, chatViews } = harness([a, b]);
			await view.openSessionsInGrid([a, b]);
			container.classList.add('phone-layout');
			part.layout(390, 780, 0, 0);
			content.focusPane(slotPaneOf(view, 'a')!.id);
			view.activatePane(view.slotPanes.get()[1]);
			assert.deepStrictEqual({
				active: activeSessionOf(view)?.sessionId,
				chats: chatViews.filter(chat => chat.kind === 'chat').map(chat => ({ visible: chat.visible, focused: document.activeElement === chat.input, disposed: chat.disposed })),
			}, { active: 'b', chats: [{ visible: false, focused: false, disposed: false }, { visible: true, focused: true, disposed: false }] });
		});

		test('directional focus restores maximized geometry before navigating', async () => {
			const [a, b] = ['a', 'b'].map(created);
			const { content, view } = harness([a, b]);
			await view.openSessionsInGrid([a, b]);
			const geometry = content.getGridLayout();
			const bView = content.getSessionView('b');
			content.toggleMaximizePane(slotPaneOf(view, 'a')!);
			view.focusPaneInDirection(view.activePane.get()!, Direction.Right);
			assert.deepStrictEqual({
				active: activeSessionOf(view)?.sessionId, geometry: content.getGridLayout(), same: content.getSessionView('b') === bView,
			}, { active: 'b', geometry, same: true });
		});

		test('batch opening preserves background activation and the last-selection side-open convention', async () => {
			const [a, b, c] = ['a', 'b', 'c'].map(created);
			const { view } = harness([a, b, c]);
			await view.openSession(a.resource);
			await view.openSessionsAt([b, c], 'a', 'right', { activate: false });
			const background = activeSessionOf(view)?.sessionId;
			await view.openSessionsAt([b, c], 'a', 'down', { activate: 'last' });
			assert.deepStrictEqual({ background, active: activeSessionOf(view)?.sessionId, visible: slotSessionsOf(view).map(session => session?.sessionId) },
				{ background: 'a', active: 'c', visible: ['a', 'b', 'c'] });
		});

		test('chats that move into the main window show there: the session of the first one active, the sessions of the others beside it, without each becoming active in turn', async () => {
			const [a, b, c] = ['a', 'b', 'c'].map(created);
			const { view } = harness([a, b, c]);
			await view.openSession(a.resource);
			const activated: (string | undefined)[] = [];
			disposables.add(autorun(reader => activated.push(activeSessionOf(view, reader)?.sessionId)));

			await view.openMovedChats([b, c].map(session => ({ session, chatResource: session.mainChat.get().resource })));

			assert.deepStrictEqual({ activated, visible: slotSessionsOf(view).map(session => session?.sessionId) }, { activated: ['a', 'b'], visible: ['b', 'c'] });
		});

		test('reopening uses ordinary replacement after the recorded neighbor leaves', async () => {
			const [a, b, c] = ['a', 'b', 'c'].map(created);
			const { view } = harness([a, b, c]);
			await view.openSessionsInGrid([a, b]);
			await view.openSessionsAt([c], 'b', 'down');
			view.closeSession(c);
			await view.openSessionsInGrid([a]);
			await view.reopenLastClosedItem();
			assert.deepStrictEqual(slotSessionsOf(view).map(session => session?.sessionId), ['c']);
		});

		test('resource redirection merges sticky and active state and transfers maximization', async () => {
			const [a, b, c] = ['a', 'b', 'c'].map(created);
			const storage = disposables.add(new InMemoryStorageService());
			const first = harness([a, b, c], { storage });
			await first.view.openSessionsInGrid([a, b, c]);
			first.view.activatePane(first.view.slotPanes.get()[2]);
			first.view.toggleSessionStickiness(c);
			first.content.toggleMaximizePane(slotPaneOf(first.view, 'c')!);
			await storage.flush();
			const second = harness([a, b], { storage, resolve: async resource => resource.toString() === c.resource.toString() ? b.resource : undefined });
			await second.view.restoreVisibleSessions();
			assert.deepStrictEqual({
				visible: second.view.slotPanes.get().map(pane => ({ id: pane.session.get()?.sessionId, sticky: pane.session.get() ? pane.sticky.get() : undefined })),
				active: activeSessionOf(second.view)?.sessionId, wasMaximized: second.content.toggleMaximizePane(slotPaneOf(second.view, 'b')!) === false,
			}, { visible: [{ id: 'a', sticky: false }, { id: 'b', sticky: true }], active: 'b', wasMaximized: true });
		});

		for (const cancel of [false, true]) {
			test(`late restored leaves ${cancel ? 'cannot override a user arrangement' : 'recover saved geometry without replacing live widgets'}`, async () => {
				const [a, b] = ['a', 'b'].map(created);
				const storage = disposables.add(new InMemoryStorageService());
				const first = harness([a, b], { storage });
				await first.view.openSessionsInGrid([a, b]);
				first.content.resizePane(slotPaneOf(first.view, 'a')!, Direction.Right, 80);
				const geometry = first.content.getGridLayout();
				await storage.flush();
				const sessions = [a];
				const second = harness(sessions, { storage });
				const restored = second.view.restoreVisibleSessions();
				await waitForState(derived(reader => slotSessionsOf(second.view, reader)), sessions => sessions.some(session => session?.sessionId === 'a'));
				const aView = second.content.getSessionView('a');
				if (cancel) {
					second.view.arrangeSessions();
				}
				sessions.push(b);
				second.sessionsChanged.fire({ added: [b], removed: [], changed: [] });
				await restored;
				assert.deepStrictEqual({
					visible: slotSessionsOf(second.view).map(session => session?.sessionId),
					sameView: second.content.getSessionView('a') === aView,
					geometry: cancel ? undefined : second.content.getGridLayout(),
				}, { visible: cancel ? ['a'] : ['a', 'b'], sameView: true, geometry: cancel ? undefined : geometry });
			});
		}

		test('invalid grid state falls back to the legacy ordered session array', async () => {
			const [a, b] = ['a', 'b'].map(created);
			const storage = disposables.add(new InMemoryStorageService());
			storage.store('agentSessions.activeSessionStates', JSON.stringify([
				{ sessionResource: a.resource.toString(), visibleOrder: 0, isSticky: true },
				{ sessionResource: b.resource.toString(), visibleOrder: 1, isActive: true, gridLayout: 'grid' },
			]), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			storage.store('agentSessions.gridState', '{"version":99}', StorageScope.WORKSPACE, StorageTarget.MACHINE);
			const { content, view } = harness([a, b], { storage });
			await view.restoreVisibleSessions();
			assert.deepStrictEqual({
				visible: view.slotPanes.get().map(pane => ({ id: pane.session.get()?.sessionId, sticky: pane.session.get() ? pane.sticky.get() : undefined })),
				active: activeSessionOf(view)?.sessionId, right: neighborOfSlot(view, content, 'a', Direction.Right),
			}, { visible: [{ id: 'a', sticky: true }, { id: 'b', sticky: false }], active: 'b', right: 'b' });
		});

		for (const operation of ['directional', 'balanced', 'side'] as const) {
			for (const phase of ['resolution', 'trust', 'preparation'] as const) {
				for (const change of ['removed', 'replaced', 'unrelated'] as const) {
					test(`${operation} opening revalidates candidates ${change} during ${phase}`, async () => {
						const [a, b, baseC, d, e] = ['a', 'b', 'c', 'd', 'e'].map(created);
						const folder = URI.file('/workspace');
						const c: ISession = {
							...baseC, workspace: constObservable({
								uri: folder, label: 'Workspace', icon: Codicon.folder, isVirtualWorkspace: false, requiresWorkspaceTrust: true,
								folders: [{ root: folder, workingDirectory: folder, name: 'Workspace', description: undefined }],
							})
						};
						const sessions = [a, b, c, d, e];
						const started = new DeferredPromise<void>();
						const finish = new DeferredPromise<void>();
						const pause = async () => {
							started.complete();
							await finish.p;
						};
						const { content, view, sessionsChanged } = harness(sessions, {
							resolve: async resource => {
								if (phase === 'resolution' && resource.toString() === c.resource.toString()) { await pause(); }
								return resource;
							},
							prepare: async session => {
								if (phase === 'preparation' && session === c) { await pause(); }
							},
							trust: async () => {
								if (phase === 'trust') { await pause(); }
								return true;
							},
						});
						await view.openSessionsInGrid([a, b]);
						const geometry = content.getGridLayout();
						const opening = operation === 'side' ? view.openSessionToSide(c)
							: operation === 'balanced' ? view.openSessionsInGrid([a, c, d]) : view.openSessionsAt([c, d], 'a', 'down');
						await started.p;
						if (change === 'replaced') {
							const replacement = created('c');
							sessions[2] = replacement;
							sessionsChanged.fire({ added: [], removed: [], changed: [replacement] });
						} else {
							const removed = change === 'removed' ? c : e;
							sessions.splice(sessions.indexOf(removed), 1);
							sessionsChanged.fire({ added: [], removed: [removed], changed: [] });
						}
						finish.complete();
						await opening;
						const committed = change === 'unrelated';
						const opened = operation === 'side' ? ['a', 'b', 'c'] : operation === 'balanced' ? ['a', 'c', 'd'] : ['a', 'c', 'd', 'b'];
						assert.deepStrictEqual({
							visible: slotSessionsOf(view).map(session => session?.sessionId),
							active: activeSessionOf(view)?.sessionId,
							geometry: committed ? undefined : content.getGridLayout(),
						}, { visible: committed ? opened : ['a', 'b'], active: committed && operation !== 'balanced' ? 'c' : 'a', geometry: committed ? undefined : geometry });
					});
				}
			}
		}

		test('a batch does not adopt a replacement candidate while preparing an earlier candidate', async () => {
			const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(created);
			const sessions = [a, b, c, d];
			const started = new DeferredPromise<void>();
			const finish = new DeferredPromise<void>();
			const { view, sessionsChanged } = harness(sessions, {
				prepare: async session => {
					if (session === c) {
						started.complete();
						await finish.p;
					}
				}
			});
			await view.openSessionsInGrid([a, b]);
			const opening = view.openSessionsAt([c, d], 'a', 'down');
			await started.p;
			const replacement = created('d');
			sessions[3] = replacement;
			sessionsChanged.fire({ added: [], removed: [], changed: [replacement] });
			finish.complete();
			await opening;
			assert.deepStrictEqual(slotSessionsOf(view).map(session => session?.sessionId), ['a', 'b']);
		});

		test('side-open activates a selected reference without moving it or losing the last selected target', async () => {
			const [a, b, c] = ['a', 'b', 'c'].map(created);
			const { content, view } = harness([a, b, c]);
			await view.openSessionsInGrid([a, b]);
			const geometry = content.getGridLayout();
			await view.openSessionsAt([b], 'b', 'right', { activate: 'last' });
			const single = { active: activeSessionOf(view)?.sessionId, geometry: content.getGridLayout() };
			view.activatePane(view.slotPanes.get()[0]);
			await view.openSessionsAt([c, b], 'b', 'right', { activate: 'last' });
			assert.deepStrictEqual({ single, active: activeSessionOf(view)?.sessionId, visible: slotSessionsOf(view).map(session => session?.sessionId) },
				{ single: { active: 'b', geometry }, active: 'b', visible: ['a', 'b', 'c'] });
		});

		test('reopening a sole closed session follows ordinary replacement without a recorded neighbor', async () => {
			const [a, b] = ['a', 'b'].map(created);
			const { view } = harness([a, b]);
			await view.openSession(a.resource);
			view.closeSession(a);
			await view.openSession(b.resource);
			await view.reopenLastClosedItem();
			assert.deepStrictEqual(slotSessionsOf(view).map(session => session?.sessionId), ['a']);
		});

		for (const cancel of [false, true]) {
			test(`saving a partial restore ${cancel ? 'honors superseding user intent' : 'preserves unresolved bindings and maximization for the next restart'}`, async () => {
				const [a, b] = ['a', 'b'].map(created);
				const storage = disposables.add(new InMemoryStorageService());
				const first = harness([a, b], { storage });
				await first.view.openSessionsInGrid([a, b]);
				first.view.activatePane(first.view.slotPanes.get()[0]);
				first.content.toggleMaximizePane(slotPaneOf(first.view, 'a')!);
				await storage.flush();
				first.view.dispose();
				const saved = storage.get('agentSessions.gridState', StorageScope.WORKSPACE);
				const second = harness([a], { storage });
				const restoring = second.view.restoreVisibleSessions();
				await waitForState(derived(reader => slotSessionsOf(second.view, reader)), sessions => sessions.some(session => session?.sessionId === 'a'));
				if (cancel) {
					second.view.arrangeSessions();
				}
				await storage.flush();
				const partial = storage.get('agentSessions.gridState', StorageScope.WORKSPACE);
				second.view.arrangeSessions();
				await restoring;
				second.view.dispose();
				const third = harness([a, b], { storage });
				await third.view.restoreVisibleSessions();
				assert.deepStrictEqual({
					retained: partial === saved,
					visible: slotSessionsOf(third.view).map(session => session?.sessionId),
					wasMaximized: third.content.toggleMaximizePane(slotPaneOf(third.view, 'a')!) === false,
				}, { retained: !cancel, visible: cancel ? ['a'] : ['a', 'b'], wasMaximized: !cancel });
			});
		}
	});

	suite('provider catalogue changes', () => {

		for (const registerBeforeManagement of [true, false]) {
			test(`routes existing environment sessions without advertising their backends (${registerBeforeManagement ? 'initial' : 'late'} registration)`, async () => {
				const instantiationService = disposables.add(new TestInstantiationService());
				instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
				const providers = disposables.add(instantiationService.createInstance(SessionsProvidersService));
				const cloudSession = stubSession({ sessionId: 'cloud:draft', providerId: 'cloud' });
				const workspace = upcastPartial<ISessionWorkspace>({ uri: URI.file('/repository') });
				const cloud = new class extends TestSessionsProvider {
					override readonly id = 'cloud';
					override readonly supportsQuickChats = true;
					override getSessions(): ISession[] { return []; }
					override createQuickChat(): ISession { return cloudSession; }
					override resolveWorkspace(): ISessionWorkspace { return workspace; }
				}(cloudSession);
				const ownerRegistration = disposables.add(providers.registerProvider(cloud));
				const renamed: string[] = [];
				const resolvedBy: string[] = [];
				const sessions = ['first', 'second'].map(name => stubSession({
					sessionId: `agenthost-${name}:opaque-session`,
					providerId: `agenthost-${name}`,
					resource: URI.parse(`remote-${name}:/opaque-session`),
				}));
				const backendChanges = disposables.add(new Emitter<ISessionChangeEvent>());
				const registerBackends = () => {
					for (const session of sessions) {
						const backend = new class extends TestSessionsProvider {
							override readonly id = session.providerId;
							override readonly supportsQuickChats = true;
							override readonly onDidChangeSessions = session === sessions[0] ? backendChanges.event : Event.None;
							override resolveWorkspace(): ISessionWorkspace { return workspace; }
							override async renameSession(sessionId: string): Promise<void> { renamed.push(sessionId); }
							override async resolveSessionResource(resource: URI): Promise<URI | undefined> {
								if (extUriBiasedIgnorePathCase.isEqual(resource, session.resource)) {
									resolvedBy.push(this.id);
									return resource;
								}
								return undefined;
							}
						}(session);
						disposables.add(providers.registerSessionBackend(cloud.id, backend));
					}
				};
				if (registerBeforeManagement) {
					registerBackends();
				}
				const { service } = createSessionsManagementService(cloudSession, disposables, providers);
				if (!registerBeforeManagement) {
					registerBackends();
				}
				const changes: ISessionChangeEvent[] = [];
				disposables.add(service.onDidChangeSessions(change => changes.push(change)));
				backendChanges.fire({ added: [], removed: [], changed: [sessions[0]] });
				for (const session of sessions) {
					await service.renameSession(session, 'Renamed');
				}
				const listed = service.getSessions();
				const targets = service.getQuickChatSessionTypes().map(type => type.providerId);
				const allTargets = service.getAllProviderSessionTypes().map(type => type.providerId);
				const folderTargets = service.getSessionTypesForFolder(workspace.uri).map(type => type.providerId);
				const created = service.createQuickChat();
				const resolved = await Promise.all(sessions.map(session => service.resolveSessionResource(session.resource)));
				assert.throws(() => service.createQuickChat({ providerId: sessions[0].providerId }), /not found/);
				assert.throws(() => service.createNewSession(workspace.uri, { providerId: sessions[0].providerId }), /not found/);
				ownerRegistration.dispose();
				assert.deepStrictEqual({
					listed, targets, allTargets, folderTargets, created, resolved, resolvedBy, renamed,
					changed: changes.flatMap(change => change.changed),
					deleted: changes.flatMap(change => change.removed),
					afterOwnerRemoval: service.getSessions(),
				}, {
					listed: sessions, targets: ['cloud'], allTargets: ['cloud'], folderTargets: ['cloud'], created: cloudSession,
					resolved: sessions.map(session => session.resource),
					resolvedBy: sessions.map(session => session.providerId),
					renamed: sessions.map(session => session.sessionId),
					changed: [sessions[0]], deleted: [], afterOwnerRemoval: [],
				});
			});
		}

		function createProvidersService(): TestSessionsProvidersService {
			const providers: ISessionsProvider[] = [];
			const onDidChangeProviders = disposables.add(new Emitter<ISessionsProvidersChangeEvent>());
			return new class extends TestSessionsProvidersService {
				override readonly onDidChangeProviders = onDidChangeProviders.event;
				override registerProvider(provider: ISessionsProvider): IDisposable {
					providers.push(provider);
					onDidChangeProviders.fire({ added: [provider], removed: [] });
					return toDisposable(() => {
						providers.splice(providers.indexOf(provider), 1);
						onDidChangeProviders.fire({ added: [], removed: [provider] });
					});
				}
			}(providers);
		}

		test('without a listing scope, the changes of each session are those of the listed sessions', () => {
			const first = stubSession({ sessionId: 'first', providerId: 'test' });
			const second = stubSession({ sessionId: 'second', providerId: 'test' });
			const onDidChangeSessions = disposables.add(new Emitter<ISessionChangeEvent>());
			const provider = new class extends TestSessionsProvider {
				override readonly onDidChangeSessions = onDidChangeSessions.event;
			}(first);
			const providersService = createProvidersService();
			const { service } = createSessionsManagementService(first, disposables, providersService);
			const listed: ISessionChangeEvent[] = [];
			const each: string[] = [];
			disposables.add(service.onDidChangeSessions(e => listed.push(e)));
			disposables.add(service.onDidChangeSession(batch => each.push(batch.map(({ session, kind }) => `${kind} ${session.sessionId}`).join(', '))));

			disposables.add(providersService.registerProvider(provider));
			onDidChangeSessions.fire({ added: [second], removed: [first], changed: [] });

			// One batch for each change of the listed sessions
			const fromListed = listed.map(e => [...e.added.map(s => `added ${s.sessionId}`), ...e.removed.map(s => `removed ${s.sessionId}`), ...e.changed.map(s => `changed ${s.sessionId}`)].join(', '));
			assert.deepStrictEqual({ each, count: listed.length }, { each: fromListed, count: 2 });
		});

		test('reports an empty change of a provider, such as its invalidation of what it lists, as an empty batch', () => {
			const session = stubSession({ sessionId: 'only', providerId: 'test' });
			const onDidChangeSessions = disposables.add(new Emitter<ISessionChangeEvent>());
			const provider = new class extends TestSessionsProvider {
				override readonly onDidChangeSessions = onDidChangeSessions.event;
			}(session);
			const providersService = createProvidersService();
			const { service } = createSessionsManagementService(session, disposables, providersService);
			disposables.add(providersService.registerProvider(provider));
			const batches: number[] = [];
			disposables.add(service.onDidChangeSession(batch => batches.push(batch.length)));

			onDidChangeSessions.fire({ added: [], removed: [], changed: [] });

			assert.deepStrictEqual(batches, [0]);
		});

		test('reports the sessions of a provider that registers, also those outside its listing scope, in one change', () => {
			const sessions = ['a', 'b', 'c'].map(sessionId => stubSession({ sessionId, providerId: 'test' }));
			const provider = new class extends TestSessionsProvider {
				override getSessions(): ISession[] { return sessions.slice(0, 1); }
				override getAllSessions(): ISession[] { return sessions; }
			}(sessions[0]);
			const providersService = createProvidersService();
			const { service } = createSessionsManagementService(sessions[0], disposables, providersService);
			const batches: string[][] = [];
			disposables.add(service.onDidChangeSession(batch => batches.push(batch.map(({ session, kind }) => `${kind} ${session.sessionId}`))));

			disposables.add(providersService.registerProvider(provider));

			assert.deepStrictEqual(batches, [['added a', 'added b', 'added c']]);
		});

		test('announces cached sessions when a provider registers', () => {
			const session = stubSession({ sessionId: 'cached', providerId: 'test' });
			const providersService = createProvidersService();
			const { service } = createSessionsManagementService(session, disposables, providersService);
			const changes: ISessionChangeEvent[] = [];
			let listed = service.getSessions();
			disposables.add(service.onDidChangeSessions(e => {
				changes.push(e);
				listed = service.getSessions();
			}));

			disposables.add(providersService.registerProvider(new TestSessionsProvider(session)));

			assert.deepStrictEqual({
				changes,
				listed,
				sameSession: service.getSession(session.resource) === session,
			}, {
				changes: [{ added: [session], removed: [], changed: [] }],
				listed: [session],
				sameSession: true,
			});
		});

		test('forwards changeset operation invocations while their provider is registered', () => {
			const session = stubSession({ sessionId: 'cached', providerId: 'test' });
			const onDidInvokeChangesetOperation = disposables.add(new Emitter<ISessionChangesetOperationInvokedEvent>());
			const provider = new class extends TestSessionsProvider {
				override readonly onDidInvokeChangesetOperation = onDidInvokeChangesetOperation.event;
			}(session);
			const providersService = createProvidersService();
			const { service } = createSessionsManagementService(session, disposables, providersService);
			const invocations: ISessionChangesetOperationInvokedEvent[] = [];
			disposables.add(service.onDidInvokeChangesetOperation(e => invocations.push(e)));
			const registration = disposables.add(providersService.registerProvider(provider));

			onDidInvokeChangesetOperation.fire({ session, operationId: 'commit' });
			registration.dispose();
			onDidInvokeChangesetOperation.fire({ session, operationId: 'sync' });

			assert.deepStrictEqual(invocations, [{ session, operationId: 'commit' }]);
		});

		test('seeds cached sessions before subscribing to reentrant provider changes', () => {
			const session = stubSession({ sessionId: 'cached', providerId: 'test' });
			const onDidChangeSessions = disposables.add(new Emitter<ISessionChangeEvent>());
			let reads = 0;
			const provider = new class extends TestSessionsProvider {
				override readonly onDidChangeSessions = onDidChangeSessions.event;
				override getSessions(): ISession[] {
					if (++reads === 1) {
						onDidChangeSessions.fire({ added: [session], removed: [], changed: [] });
					}
					return [session];
				}
			}(session);
			const providersService = createProvidersService();
			const { service } = createSessionsManagementService(session, disposables, providersService);
			const changes: ISessionChangeEvent[] = [];
			const snapshots: ISession[][] = [];
			disposables.add(service.onDidChangeSessions(e => {
				changes.push(e);
				snapshots.push(service.getSessions());
			}));

			disposables.add(providersService.registerProvider(provider));

			assert.deepStrictEqual({ changes, snapshots, reads }, {
				changes: [{ added: [session], removed: [], changed: [] }],
				snapshots: [[session]],
				reads: 2,
			});
		});

		test('refreshes the catalogue without deletions when a provider clears its cache and unregisters', () => {
			const session = stubSession({ sessionId: 'cached', providerId: 'test' });
			const sessions = [session];
			let reads = 0;
			const provider = new class extends TestSessionsProvider {
				override getSessions(): ISession[] {
					reads++;
					return sessions;
				}
			}(session);
			const providersService = createProvidersService();
			const registration = disposables.add(providersService.registerProvider(provider));
			const { service } = createSessionsManagementService(session, disposables, providersService);
			const changes: ISessionChangeEvent[] = [];
			disposables.add(service.onDidChangeSessions(e => changes.push(e)));
			const readsBeforeRemoval = reads;

			sessions.length = 0;
			registration.dispose();

			assert.deepStrictEqual({
				changes,
				listed: service.getSessions(),
				readsAfterRemoval: reads - readsBeforeRemoval,
			}, {
				changes: [{ added: [], removed: [], changed: [] }],
				listed: [],
				readsAfterRemoval: 0,
			});
		});

		test('does not subscribe to a provider removed while its cached sessions are read', () => {
			const session = stubSession({ sessionId: 'cached', providerId: 'test' });
			const onDidChangeSessions = disposables.add(new Emitter<ISessionChangeEvent>());
			const provider = new class extends TestSessionsProvider {
				override readonly onDidChangeSessions = onDidChangeSessions.event;
				override getSessions(): ISession[] {
					registration.dispose();
					return [session];
				}
			}(session);
			const providersService = createProvidersService();
			const registration = disposables.add(providersService.registerProvider(provider));
			const { service } = createSessionsManagementService(session, disposables, providersService);
			const changes: ISessionChangeEvent[] = [];
			disposables.add(service.onDidChangeSessions(e => changes.push(e)));

			onDidChangeSessions.fire({ added: [session], removed: [], changed: [] });

			assert.deepStrictEqual({ changes, listed: service.getSessions(), listening: onDidChangeSessions.hasListeners() }, {
				changes: [],
				listed: [],
				listening: false,
			});
		});

		test('keeps session reads live and deduplicated across provider changes', () => {
			const legacy = stubSession({
				sessionId: 'legacy', providerId: 'test',
				resource: URI.from({ scheme: COPILOT_CLI_EH_SCHEME, path: '/shared' }),
			});
			const migrated = stubSession({
				sessionId: 'migrated', providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
				resource: URI.from({ scheme: COPILOT_CLI_LOCAL_AH_SCHEME, path: '/shared' }),
			});
			const added = stubSession({ sessionId: 'added', providerId: LOCAL_AGENT_HOST_PROVIDER_ID });
			const sessions = [migrated];
			const onDidChangeSessions = disposables.add(new Emitter<ISessionChangeEvent>());
			const provider = new class extends TestSessionsProvider {
				override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
				override readonly onDidChangeSessions = onDidChangeSessions.event;
				override getSessions(): ISession[] { return sessions; }
			}(migrated);
			const providersService = createProvidersService();
			disposables.add(providersService.registerProvider(new TestSessionsProvider(legacy)));
			const { service } = createSessionsManagementService(legacy, disposables, providersService);
			const changes: ISessionChangeEvent[] = [];
			const snapshots: ISession[][] = [];
			disposables.add(service.onDidChangeSessions(e => {
				changes.push(e);
				snapshots.push(service.getSessions());
			}));

			const registration = disposables.add(providersService.registerProvider(provider));
			const sameLegacySession = service.getSession(legacy.resource) === legacy;
			const sameMigratedSession = service.getSession(migrated.resource) === migrated;
			sessions.push(added);
			onDidChangeSessions.fire({ added: [], removed: [], changed: [] });
			registration.dispose();

			assert.deepStrictEqual({ changes, snapshots, sameLegacySession, sameMigratedSession }, {
				changes: [
					{ added: [migrated], removed: [], changed: [] },
					{ added: [], removed: [], changed: [] },
					{ added: [], removed: [], changed: [] },
				],
				snapshots: [[migrated], [migrated, added], [legacy]],
				sameLegacySession: true,
				sameMigratedSession: true,
			});
		});

		test('forwards real removals and replacements without treating provider loss as deletion', () => {
			const removed = stubSession({ sessionId: 'removed', providerId: 'test' });
			const original = stubSession({ sessionId: 'original', providerId: 'test' });
			const changed = stubSession({ sessionId: 'original', providerId: 'test', title: constObservable('Changed') });
			const added = stubSession({ sessionId: 'added', providerId: 'test' });
			const replacement = stubSession({ sessionId: 'replacement', providerId: 'test' });
			const onDidChangeSessions = disposables.add(new Emitter<ISessionChangeEvent>());
			const onDidReplaceSession = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
			let reads = 0;
			const provider = new class extends TestSessionsProvider {
				override readonly onDidChangeSessions = onDidChangeSessions.event;
				override readonly onDidReplaceSession = onDidReplaceSession.event;
				override getSessions(): ISession[] {
					reads++;
					return [removed, original];
				}
			}(original);
			const providersService = createProvidersService();
			const { service } = createSessionsManagementService(original, disposables, providersService);
			const registration = disposables.add(providersService.registerProvider(provider));
			const changes: ISessionChangeEvent[] = [];
			disposables.add(service.onDidChangeSessions(e => changes.push(e)));
			const readsBeforeChanges = reads;

			const change = { added: [added], removed: [removed], changed: [changed] };
			onDidChangeSessions.fire(change);
			onDidReplaceSession.fire({ from: added, to: replacement });
			registration.dispose();

			assert.deepStrictEqual({ changes, readsAfterChanges: reads - readsBeforeChanges }, {
				changes: [
					change,
					{ added: [], removed: [added], changed: [replacement] },
					{ added: [], removed: [], changed: [] },
				],
				readsAfterChanges: 0,
			});
		});

		test('preserves visible sessions and pending drafts when their provider unregisters', async () => {
			const active = stubSession({ sessionId: 'active', providerId: 'test' });
			const draft = stubSession({ sessionId: 'draft', providerId: 'test' });
			const automation = stubSession({ sessionId: 'automation', providerId: 'test' });
			const fallback = stubSession({ sessionId: 'fallback', providerId: 'retained' });
			const folderUri = URI.parse('test:///folder');
			let draftsCreated = 0;
			const deleted: string[] = [];
			const provider = new class extends TestSessionsProvider {
				override readonly automations = upcastPartial<NonNullable<ISessionsProvider['automations']>>({
					catalogueState: constObservable('ready'),
				});
				override resolveWorkspace(): ISessionWorkspace {
					return { uri: folderUri, label: 'Folder', icon: Codicon.folder, folders: [], requiresWorkspaceTrust: false, isVirtualWorkspace: false };
				}
				override createNewSession(): ISession { return draftsCreated++ === 0 ? draft : automation; }
				override deleteNewSession(sessionId: string): void { deleted.push(sessionId); }
			}(active);
			const retainedProvider = new class extends TestSessionsProvider {
				override readonly id = 'retained';
			}(fallback);
			const providersService = createProvidersService();
			disposables.add(providersService.registerProvider(retainedProvider));
			const registration = disposables.add(providersService.registerProvider(provider));
			const { service, view } = createSessionsManagementService(active, disposables, providersService);
			await view.openSession(fallback.resource);
			await view.openSessionToSide(active);
			service.createNewSession(folderUri);
			service.createAutomationSession(folderUri);
			const changes: ISessionChangeEvent[] = [];
			disposables.add(service.onDidChangeSessions(e => changes.push(e)));

			registration.dispose();
			await timeout(0);

			assert.deepStrictEqual({
				changes,
				listed: service.getSessions(),
				draft: service.newSession.get(),
				automation: service.automationSession.get(),
				visible: slotSessionsOf(view).map(session => session?.sessionId),
				active: activeSessionOf(view)?.sessionId,
				deleted,
			}, {
				changes: [{ added: [], removed: [], changed: [] }],
				listed: [fallback],
				draft,
				automation,
				visible: ['fallback', 'active'],
				active: 'active',
				deleted: [],
			});
		});

		test('ignores events from an unregistered provider after its ID is reused', () => {
			const original = stubSession({ sessionId: 'original', providerId: 'test' });
			const current = stubSession({ sessionId: 'current', providerId: 'test' });
			const stale = stubSession({ sessionId: 'stale', providerId: 'test' });
			const onDidChangeSessions = disposables.add(new Emitter<ISessionChangeEvent>());
			const onDidReplaceSession = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
			const onDidChangeSessionTypes = disposables.add(new Emitter<void>());
			const provider = new class extends TestSessionsProvider {
				override readonly onDidChangeSessions = onDidChangeSessions.event;
				override readonly onDidReplaceSession = onDidReplaceSession.event;
				override readonly onDidChangeSessionTypes = onDidChangeSessionTypes.event;
			}(original);
			const providersService = createProvidersService();
			const { service } = createSessionsManagementService(original, disposables, providersService);
			const registration = disposables.add(providersService.registerProvider(provider));
			registration.dispose();
			const currentRegistration = disposables.add(providersService.registerProvider(new TestSessionsProvider(current)));
			const changes: ISessionChangeEvent[] = [];
			const replacements: { readonly from: ISession; readonly to: ISession }[] = [];
			let typeChanges = 0;
			disposables.add(service.onDidChangeSessions(e => changes.push(e)));
			disposables.add(service.onDidReplaceSession(e => replacements.push(e)));
			disposables.add(service.onDidChangeSessionTypes(() => typeChanges++));

			onDidChangeSessions.fire({ added: [stale], removed: [], changed: [] });
			onDidReplaceSession.fire({ from: original, to: stale });
			onDidChangeSessionTypes.fire();
			const listed = service.getSessions();
			currentRegistration.dispose();

			assert.deepStrictEqual({ changes, replacements, typeChanges, listed }, {
				changes: [{ added: [], removed: [], changed: [] }],
				replacements: [],
				typeChanges: 1,
				listed: [current],
			});
		});
	});

	test('activates an existing empty composer from part focus without replacing its sibling session', async () => {
		const session = stubSession({ sessionId: 'existing', providerId: 'test' });
		const { view, focusPane } = createSessionsManagementService(session, disposables);
		await view.openSession(session.resource);
		await view.openNewSession({ toSide: true });
		const [existingPane, emptyPane] = view.slotPanes.get();
		focusPane.fire(existingPane.id);
		const before = activeSessionOf(view)?.sessionId;
		focusPane.fire(emptyPane.id);

		assert.deepStrictEqual({
			before,
			active: activeSessionOf(view)?.sessionId,
			visible: slotSessionsOf(view).map(session => session?.sessionId),
		}, {
			before: 'existing',
			active: undefined,
			visible: ['existing', undefined],
		});
	});

	test('routes external session import to the owning provider and propagates errors', async () => {
		const session = stubSession({
			sessionId: 'session', providerId: 'test', isExternal: constObservable(true),
			capabilities: constObservable({ supportsMultipleChats: false, supportsImport: true }),
		});
		const calls: string[] = [];
		let fail = false;
		const provider = new class extends TestSessionsProvider {
			override async importSession(sessionId: string): Promise<void> {
				calls.push(sessionId);
				if (fail) {
					throw new Error('Import failed');
				}
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);
		await service.importSession(session);
		fail = true;
		await assert.rejects(() => service.importSession(session), /Import failed/);
		await assert.rejects(() => service.importSession(stubSession({
			sessionId: 'unsupported', providerId: 'test', isExternal: constObservable(true),
		})), /not supported/);
		await service.importSession(stubSession({ sessionId: 'owned', providerId: 'test' }));
		assert.deepStrictEqual(calls, ['session', 'session']);
	});

	test('routes artifact removal to the owning provider and propagates errors', async () => {
		const session = stubSession({
			sessionId: 'session', providerId: 'test',
			capabilities: constObservable({ supportsMultipleChats: false, supportsRemoveArtifacts: true }),
		});
		const calls: string[][] = [];
		const provider = new class extends TestSessionsProvider {
			override async removeSessionArtifact(sessionId: string, artifactId: string): Promise<void> {
				calls.push([sessionId, artifactId]);
				if (artifactId === 'failure') {
					throw new Error('Removal failed');
				}
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);
		await service.removeSessionArtifact(session, 'artifact');
		await assert.rejects(() => service.removeSessionArtifact(session, 'failure'), /Removal failed/);
		await assert.rejects(() => service.removeSessionArtifact(stubSession({ sessionId: 'unsupported', providerId: 'test' }), 'artifact'), /not supported/);
		assert.deepStrictEqual(calls, [['session', 'artifact'], ['session', 'failure']]);
	});

	test('routes chat archive changes to the owning provider', async () => {
		const session = stubSession({ sessionId: 'session', providerId: 'test' });
		const chat = { ...stubChat, resource: URI.parse('test-chat:/peer') };
		const calls: { sessionId: string; chat: string; archived: boolean }[] = [];
		const provider = new class extends TestSessionsProvider {
			override async archiveChat(sessionId: string, chatResource: URI): Promise<void> {
				calls.push({ sessionId, chat: chatResource.toString(), archived: true });
			}
			override async unarchiveChat(sessionId: string, chatResource: URI): Promise<void> {
				calls.push({ sessionId, chat: chatResource.toString(), archived: false });
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		await service.archiveChat(session, chat);
		await service.unarchiveChat(session, chat);

		assert.deepStrictEqual(calls, [
			{ sessionId: 'session', chat: 'test-chat:/peer', archived: true },
			{ sessionId: 'session', chat: 'test-chat:/peer', archived: false },
		]);
	});

	test('cancelCurrentRequest loads the chat model then cancels the main chat request', async () => {
		const session = stubSession({ sessionId: 'session', providerId: 'test' });
		const { service, chatService } = createSessionsManagementService(session, disposables);

		await service.cancelCurrentRequest(session);

		assert.deepStrictEqual({
			loaded: chatService.loadedResources,
			cancelled: chatService.cancelledResources,
			disposedModelRefs: chatService.disposedModelRefs,
		}, {
			loaded: [stubChat.resource],
			cancelled: [stubChat.resource],
			disposedModelRefs: 1,
		});
	});

	test('cancelCurrentRequest disposes the loaded model when cancellation fails', async () => {
		const session = stubSession({ sessionId: 'session', providerId: 'test' });
		const { service, chatService } = createSessionsManagementService(session, disposables);
		chatService.cancelError = new Error('cancel failed');

		await assert.rejects(() => service.cancelCurrentRequest(session), /cancel failed/);

		assert.deepStrictEqual({
			loaded: chatService.loadedResources,
			cancelled: chatService.cancelledResources,
			disposedModelRefs: chatService.disposedModelRefs,
		}, {
			loaded: [stubChat.resource],
			cancelled: [stubChat.resource],
			disposedModelRefs: 1,
		});
	});

	test('cancelCurrentRequest rejects when the chat model cannot be loaded', async () => {
		const session = stubSession({ sessionId: 'session', providerId: 'test' });
		const { service, chatService } = createSessionsManagementService(session, disposables);
		chatService.modelRefAvailable = false;

		await assert.rejects(() => service.cancelCurrentRequest(session), /Failed to load chat session for cancellation/);

		assert.deepStrictEqual({
			loaded: chatService.loadedResources,
			cancelled: chatService.cancelledResources,
			disposedModelRefs: chatService.disposedModelRefs,
		}, {
			loaded: [stubChat.resource],
			cancelled: [],
			disposedModelRefs: 0,
		});
	});

	test('archiving an active session stops each running chat before archiving', async () => {
		const mainChat = { ...stubChat, status: constObservable(SessionStatus.InProgress) };
		const peerChat = { ...stubChat, resource: URI.parse('test:///peer'), status: constObservable(SessionStatus.NeedsInput) };
		const session = stubSession({
			sessionId: 'session', providerId: 'test',
			status: constObservable(SessionStatus.InProgress),
			mainChat: constObservable(mainChat),
			chats: constObservable([mainChat, peerChat]),
		});
		const calls: string[] = [];
		const provider = new class extends TestSessionsProvider {
			override async archiveSession(): Promise<void> {
				calls.push('archive');
			}
		}(session);
		const { service, chatService } = createSessionsManagementService(session, disposables, provider);
		chatService.cancelCurrentRequestForSession = async resource => {
			calls.push(`stop ${resource.path}`);
		};

		await service.archiveSession(session);

		assert.deepStrictEqual(calls, ['stop /chat', 'stop /peer', 'archive']);
	});

	test('archiving an idle session stops an active peer chat before archiving', async () => {
		const peerChat = { ...stubChat, resource: URI.parse('test:///peer'), status: constObservable(SessionStatus.InProgress) };
		const session = stubSession({
			sessionId: 'session', providerId: 'test',
			status: constObservable(SessionStatus.Completed),
			chats: constObservable([stubChat, peerChat]),
		});
		const calls: string[] = [];
		const provider = new class extends TestSessionsProvider {
			override async archiveSession(): Promise<void> {
				calls.push('archive');
			}
		}(session);
		const { service, chatService } = createSessionsManagementService(session, disposables, provider);
		chatService.cancelCurrentRequestForSession = async resource => {
			calls.push(`stop ${resource.path}`);
		};

		await service.archiveSession(session);

		assert.deepStrictEqual(calls, ['stop /peer', 'archive']);
	});

	test('archiving a running session with unloaded chats cancels its main chat before archiving', async () => {
		const session = stubSession({ sessionId: 'session', providerId: 'test', status: constObservable(SessionStatus.InProgress) });
		const { service, chatService } = createSessionsManagementService(session, disposables);

		await service.archiveSession(session);

		assert.deepStrictEqual({
			loaded: chatService.loadedResources,
			cancelled: chatService.cancelledResources,
		}, {
			loaded: [stubChat.resource],
			cancelled: [stubChat.resource],
		});
	});

	test('failed cancellation does not archive a running session', async () => {
		const session = stubSession({ sessionId: 'session', providerId: 'test', status: constObservable(SessionStatus.InProgress) });
		const calls: string[] = [];
		const provider = new class extends TestSessionsProvider {
			override async archiveSession(): Promise<void> {
				calls.push('archive');
			}
		}(session);
		const { service, chatService } = createSessionsManagementService(session, disposables, provider);
		chatService.cancelError = new Error('cancel failed');

		await assert.rejects(() => service.archiveSession(session), /cancel failed/);

		assert.deepStrictEqual(calls, []);
	});

	test('openSession waits for a loading session before opening chat content', async () => {
		const loading = observableValue('loading', true);
		const session = stubSession({ sessionId: 'loading', providerId: 'test', loading });
		const { view } = createSessionsManagementService(session, disposables);

		let resolved = false;
		const openPromise = view.openSession(session.resource).then(() => { resolved = true; });
		await Promise.resolve();

		assert.deepStrictEqual({ resolved }, { resolved: false });

		loading.set(false, undefined);
		await openPromise;

		assert.deepStrictEqual({ resolved }, { resolved: true });
	});

	test('collapsing the grid preserves pending chat navigation in a loading session', async () => {
		const loading = observableValue('loading', true);
		const peer = { ...stubChat, resource: URI.parse('test:///target/peer') };
		const staleA = stubSession({ sessionId: 'stale-a', providerId: 'test' });
		const staleB = stubSession({ sessionId: 'stale-b', providerId: 'test' });
		const target = stubSession({
			sessionId: 'target',
			providerId: 'test',
			loading,
			chats: constObservable([stubChat, peer]),
		});
		const provider = new class extends TestSessionsProvider {
			override getSessions(): ISession[] { return [staleA, staleB, target]; }
		}(staleA);
		const { view } = createSessionsManagementService(staleA, disposables, provider);
		await view.openSessionsInGrid([staleA, staleB]);

		const openPromise = view.openChat(target, peer.resource);
		await Promise.resolve();
		view.collapseToPane(view.activePane.get()!);

		loading.set(false, undefined);
		await openPromise;

		assert.deepStrictEqual({
			visible: slotSessionsOf(view).map(session => session?.sessionId),
			active: activeSessionOf(view)?.sessionId,
			activeChat: activeChatOf(view)?.resource.toString(),
		}, {
			visible: ['target'],
			active: 'target',
			activeChat: peer.resource.toString(),
		});
	});

	suite('read state', () => {
		function createReadStateSessions() {
			const isRead = observableValue('isRead', false);
			const status = observableValue('status', SessionStatus.Completed);
			const session = stubSession({ sessionId: 'unread', providerId: 'test', isRead, status });
			const other = stubSession({ sessionId: 'other', providerId: 'test' });
			const readChanges: boolean[] = [];
			const provider = new class extends TestSessionsProvider {
				override getSessions(): ISession[] { return [session, other]; }
				override async setSessionReadState(sessionId: string, read: boolean): Promise<void> {
					if (sessionId === session.sessionId) {
						isRead.set(read, undefined);
						readChanges.push(read);
					}
				}
			}(session);
			return { ...createSessionsManagementService(session, disposables, provider), session, other, isRead, status, readChanges };
		}

		test('opening a session leaves its parent state unchanged when the main chat is already read', async () => {
			const { session, view, readChanges } = createReadStateSessions();
			const readBeforeActive = session.isRead.get();
			await view.openSession(session.resource);

			assert.deepStrictEqual(
				{ readBeforeActive, readWhileActive: session.isRead.get(), activeId: activeSessionOf(view)?.sessionId, readChanges },
				{ readBeforeActive: false, readWhileActive: false, activeId: 'unread', readChanges: [] },
			);
		});

		test('markAllRead hands each provider its sessions in one call', async () => {
			const batched1 = stubSession({ sessionId: 'b1', providerId: 'batched' });
			const batched2 = stubSession({ sessionId: 'b2', providerId: 'batched' });
			const single1 = stubSession({ sessionId: 's1', providerId: 'single' });
			const single2 = stubSession({ sessionId: 's2', providerId: 'single' });
			const calls: string[] = [];
			const batched = new class extends TestSessionsProvider {
				override readonly id = 'batched';
				override getSessions(): ISession[] { return [batched1, batched2]; }
				override async setSessionReadState(sessionId: string, isRead: boolean): Promise<void> {
					calls.push(`batched one ${sessionId} ${isRead}`);
				}
				override async setSessionsReadState(sessionIds: readonly string[], isRead: boolean): Promise<void> {
					calls.push(`batched all ${sessionIds.join(',')} ${isRead}`);
				}
			}(batched1);
			const single = new class extends TestSessionsProvider {
				override readonly id = 'single';
				override getSessions(): ISession[] { return [single1, single2]; }
				override async setSessionReadState(sessionId: string, isRead: boolean): Promise<void> {
					calls.push(`single one ${sessionId} ${isRead}`);
				}
			}(single1);
			const { service } = createSessionsManagementService(batched1, disposables, [batched, single]);

			await service.markAllRead([batched1, single1, batched2, single2]);

			assert.deepStrictEqual(calls, [
				'batched all b1,b2 true',
				'single one s1 true',
				'single one s2 true',
			]);
		});

		test('preserves an explicit unread active single chat until the chat advances', async () => {
			const sessionIsRead = observableValue('sessionIsRead', false);
			const mainIsRead = observableValue('mainIsRead', true);
			const lastTurnEnd = observableValue<Date | undefined>('lastTurnEnd', new Date(1));
			const main = { ...stubChat, isRead: mainIsRead, lastTurnEnd };
			const session = stubSession({
				sessionId: 'explicit-unread',
				providerId: 'test',
				isRead: sessionIsRead,
				mainChat: constObservable(main),
				chats: constObservable([main]),
			});
			const readChanges: { readonly chat: string; readonly isRead: boolean }[] = [];
			const provider = new class extends TestSessionsProvider {
				override async setChatReadState(_sessionId: string, chatResource: URI, isRead: boolean): Promise<void> {
					readChanges.push({ chat: chatResource.toString(), isRead });
					mainIsRead.set(isRead, undefined);
				}
			}(session);
			const { service, view } = createSessionsManagementService(session, disposables, provider);
			await view.openSession(session.resource);

			await service.markUnread(session);
			const afterExplicitUnread = mainIsRead.get();
			lastTurnEnd.set(new Date(2), undefined);

			assert.deepStrictEqual({
				afterExplicitUnread,
				afterNewTurn: mainIsRead.get(),
				sessionIsRead: sessionIsRead.get(),
				readChanges,
			}, {
				afterExplicitUnread: false,
				afterNewTurn: true,
				sessionIsRead: false,
				readChanges: [
					{ chat: 'test:/chat', isRead: false },
					{ chat: 'test:/chat', isRead: true },
				],
			});
		});

		test('marks the active main chat as read once without changing the parent or peer', async () => {
			const mainIsRead = observableValue('mainIsRead', false);
			const main = { ...stubChat, resource: URI.parse('test:///main'), isRead: mainIsRead };
			const peer = { ...stubChat, resource: URI.parse('test:///peer') };
			const session = stubSession({
				sessionId: 'multi-chat',
				providerId: 'test',
				isRead: constObservable(false),
				mainChat: constObservable(main),
				chats: constObservable([main, peer]),
			});
			const readChanges: { sessionId: string; chat: string; isRead: boolean }[] = [];
			const provider = new class extends TestSessionsProvider {
				override async setChatReadState(sessionId: string, chatResource: URI, isRead: boolean): Promise<void> {
					if (mainIsRead.get() !== isRead) {
						mainIsRead.set(isRead, undefined);
						readChanges.push({ sessionId, chat: chatResource.toString(), isRead });
					}
				}
			}(session);
			const { view } = createSessionsManagementService(session, disposables, provider);

			await view.openSession(session.resource);
			const mainIsReadAfterOpen = mainIsRead.get();
			mainIsRead.set(false, undefined);

			assert.deepStrictEqual({
				mainIsReadAfterOpen,
				mainIsReadAfterStaleEcho: mainIsRead.get(),
				sessionIsRead: session.isRead.get(),
				peerIsRead: peer.isRead.get(),
				readChanges,
			}, {
				mainIsReadAfterOpen: true,
				mainIsReadAfterStaleEcho: false,
				sessionIsRead: false,
				peerIsRead: true,
				readChanges: [{ sessionId: 'multi-chat', chat: 'test:/main', isRead: true }],
			});
		});

		test('batches multiple chat read changes when the provider supports it', async () => {
			const first = { ...stubChat, resource: URI.parse('test:///first') };
			const second = { ...stubChat, resource: URI.parse('test:///second') };
			const session = stubSession({
				sessionId: 'batch-read',
				providerId: 'test',
				chats: constObservable([first, second]),
			});
			const batches: { sessionId: string; chats: string[]; isRead: boolean }[] = [];
			const provider = new class extends TestSessionsProvider {
				override async setChatReadStates(sessionId: string, chatResources: readonly URI[], isRead: boolean): Promise<void> {
					batches.push({ sessionId, chats: chatResources.map(resource => resource.toString()), isRead });
				}
			}(session);
			const { service } = createSessionsManagementService(session, disposables, provider);

			await service.markChatsRead(session, [first, second]);

			assert.deepStrictEqual(batches, [{
				sessionId: 'batch-read',
				chats: ['test:/first', 'test:/second'],
				isRead: true,
			}]);
		});

		test('marks only the targeted nested chat read and unread through its provider', async () => {
			const peerIsRead = observableValue('peerIsRead', false);
			const main = { ...stubChat, resource: URI.parse('test:/main') };
			const peer = { ...stubChat, resource: URI.parse('test:/peer'), isRead: peerIsRead };
			const session = stubSession({
				sessionId: 'nested-read',
				providerId: 'test',
				isRead: constObservable(false),
				mainChat: constObservable(main),
				chats: constObservable([main, peer]),
			});
			const changes: { sessionId: string; chat: string; isRead: boolean }[] = [];
			const provider = new class extends TestSessionsProvider {
				override async setChatReadState(sessionId: string, resource: URI, isRead: boolean): Promise<void> {
					changes.push({ sessionId, chat: resource.toString(), isRead });
					peerIsRead.set(isRead, undefined);
				}
			}(session);
			const { service } = createSessionsManagementService(session, disposables, provider);

			await service.markChatRead(session, peer);
			const afterRead = peerIsRead.get();
			await service.markChatUnread(session, peer);

			assert.deepStrictEqual({
				afterRead,
				afterUnread: peerIsRead.get(),
				mainIsRead: main.isRead.get(),
				sessionIsRead: session.isRead.get(),
				changes,
			}, {
				afterRead: true,
				afterUnread: false,
				mainIsRead: true,
				sessionIsRead: false,
				changes: [
					{ sessionId: 'nested-read', chat: 'test:/peer', isRead: true },
					{ sessionId: 'nested-read', chat: 'test:/peer', isRead: false },
				],
			});
		});

		test('falls back to individual chat read changes when batching is unsupported', async () => {
			const first = { ...stubChat, resource: URI.parse('test:///first') };
			const second = { ...stubChat, resource: URI.parse('test:///second') };
			const session = stubSession({
				sessionId: 'individual-read',
				providerId: 'test',
				chats: constObservable([first, second]),
			});
			const changes: { sessionId: string; chat: string; isRead: boolean }[] = [];
			const provider = new class extends TestSessionsProvider {
				override async setChatReadState(sessionId: string, chatResource: URI, isRead: boolean): Promise<void> {
					changes.push({ sessionId, chat: chatResource.toString(), isRead });
				}
			}(session);
			const { service } = createSessionsManagementService(session, disposables, provider);

			await service.markChatsRead(session, [first, second]);

			assert.deepStrictEqual(changes, [
				{ sessionId: 'individual-read', chat: 'test:/first', isRead: true },
				{ sessionId: 'individual-read', chat: 'test:/second', isRead: true },
			]);
		});

		test('retries marking the active chat read after provider loading completes', async () => {
			const mainIsRead = observableValue('mainIsRead', false);
			const loading = observableValue('loading', false);
			const main = { ...stubChat, resource: URI.parse('test:///main'), isRead: mainIsRead };
			const session = stubSession({
				sessionId: 'startup-read-retry',
				providerId: 'test',
				loading,
				mainChat: constObservable(main),
				chats: constObservable([main]),
			});
			const attempts: boolean[] = [];
			let ready = false;
			const provider = new class extends TestSessionsProvider {
				override async setChatReadState(_sessionId: string, _chatResource: URI, isRead: boolean): Promise<boolean> {
					attempts.push(ready);
					if (!ready) {
						return false;
					}
					mainIsRead.set(isRead, undefined);
					return true;
				}
			}(session);
			const { view } = createSessionsManagementService(session, disposables, provider);

			await view.openSession(session.resource);
			await timeout(0);
			const afterRejectedAttempt = mainIsRead.get();
			loading.set(true, undefined);
			ready = true;
			loading.set(false, undefined);
			await timeout(0);

			assert.deepStrictEqual({
				afterRejectedAttempt,
				afterReady: mainIsRead.get(),
				attempts,
			}, {
				afterRejectedAttempt: false,
				afterReady: true,
				attempts: [false, true],
			});
		});

		test('uses the main chat read operation when only a tool peer accompanies it', async () => {
			const sessionIsRead = observableValue('sessionIsRead', false);
			const mainIsRead = observableValue('mainIsRead', false);
			const main = { ...stubChat, resource: URI.parse('test:///main'), isRead: mainIsRead };
			const toolIsRead = observableValue('toolIsRead', false);
			const tool = {
				...stubChat,
				resource: URI.parse('test:///tool'),
				isRead: toolIsRead,
				origin: { kind: ChatOriginKind.Tool },
				interactivity: constObservable(ChatInteractivity.ReadOnly),
			};
			const session = stubSession({
				sessionId: 'tool-peer',
				providerId: 'test',
				isRead: sessionIsRead,
				mainChat: constObservable(main),
				chats: constObservable([main, tool]),
			});
			const readChanges: string[] = [];
			const provider = new class extends TestSessionsProvider {
				override async setChatReadState(_sessionId: string, chatResource: URI, read: boolean): Promise<void> {
					readChanges.push(`chat:${chatResource.toString()}:${read}`);
					if (chatResource.toString() === main.resource.toString()) {
						mainIsRead.set(read, undefined);
					}
				}
			}(session);
			const { view } = createSessionsManagementService(session, disposables, provider);

			await view.openSession(session.resource);

			assert.deepStrictEqual({
				session: session.isRead.get(),
				main: main.isRead.get(),
				tool: tool.isRead.get(),
				readChanges,
			}, {
				session: false,
				main: true,
				tool: false,
				readChanges: ['chat:test:/main:true'],
			});
		});

		test('preserves explicit unread on an already-read active nested chat until a new turn', async () => {
			const peerIsRead = observableValue('peerIsRead', true);
			const peerUpdatedAt = observableValue<Date | undefined>('peerUpdatedAt', new Date(1));
			const main = { ...stubChat, resource: URI.parse('test:/main') };
			const peer = { ...stubChat, resource: URI.parse('test:/peer'), isRead: peerIsRead, updatedAt: peerUpdatedAt };
			const session = stubSession({
				sessionId: 'active-nested-unread',
				providerId: 'test',
				mainChat: constObservable(main),
				chats: constObservable([main, peer]),
			});
			const changes: boolean[] = [];
			const provider = new class extends TestSessionsProvider {
				override async setChatReadState(_sessionId: string, resource: URI, isRead: boolean): Promise<void> {
					assert.strictEqual(resource.toString(), peer.resource.toString());
					changes.push(isRead);
					peerIsRead.set(isRead, undefined);
				}
			}(session);
			const { service, view } = createSessionsManagementService(session, disposables, provider);
			await view.openChat(session, peer.resource);

			await service.markChatUnread(session, peer);
			const afterUnread = peerIsRead.get();
			peerUpdatedAt.set(new Date(2), undefined);

			assert.deepStrictEqual({
				afterUnread,
				afterNewTurn: peerIsRead.get(),
				mainIsRead: main.isRead.get(),
				changes,
			}, { afterUnread: false, afterNewTurn: true, mainIsRead: true, changes: [false, true] });
		});

		test('marks the active peer chat as read once through its provider', async () => {
			const mainIsRead = observableValue('mainIsRead', false);
			const main = { ...stubChat, resource: URI.parse('test:///main'), isRead: mainIsRead };
			const peerIsRead = observableValue('peerIsRead', false);
			const peerUpdatedAt = observableValue<Date | undefined>('peerUpdatedAt', new Date(1));
			const peer = { ...stubChat, resource: URI.parse('test:///peer'), isRead: peerIsRead, updatedAt: peerUpdatedAt };
			const session = stubSession({
				sessionId: 'multi-chat',
				providerId: 'test',
				mainChat: constObservable(main),
				chats: constObservable([main, peer]),
			});
			const readChanges: { sessionId: string; chat: string; isRead: boolean }[] = [];
			const provider = new class extends TestSessionsProvider {
				override async setChatReadState(sessionId: string, chatResource: URI, isRead: boolean): Promise<void> {
					if (chatResource.toString() === peer.resource.toString()) {
						peerIsRead.set(isRead, undefined);
					} else if (chatResource.toString() === main.resource.toString()) {
						mainIsRead.set(isRead, undefined);
					}
					readChanges.push({ sessionId, chat: chatResource.toString(), isRead });
				}
			}(session);
			const { view } = createSessionsManagementService(session, disposables, provider);

			await view.openChat(session, peer.resource);
			const peerIsReadAfterOpen = peerIsRead.get();
			peerIsRead.set(false, undefined);
			const peerIsReadAfterStaleEcho = peerIsRead.get();
			peerUpdatedAt.set(new Date(2), undefined);
			const peerIsReadAfterNewTurn = peerIsRead.get();
			peerIsRead.set(false, undefined);

			assert.deepStrictEqual({
				activeChat: activeChatOf(view)?.resource.toString(),
				mainIsRead: mainIsRead.get(),
				peerIsReadAfterOpen,
				peerIsReadAfterStaleEcho,
				peerIsReadAfterNewTurn,
				peerIsReadAfterRepeatedEcho: peerIsRead.get(),
				readChanges,
			}, {
				activeChat: 'test:/peer',
				mainIsRead: false,
				peerIsReadAfterOpen: true,
				peerIsReadAfterStaleEcho: false,
				peerIsReadAfterNewTurn: true,
				peerIsReadAfterRepeatedEcho: false,
				readChanges: [
					{ sessionId: 'multi-chat', chat: 'test:/peer', isRead: true },
					{ sessionId: 'multi-chat', chat: 'test:/peer', isRead: true },
				],
			});
		});

		test('leaves a non-active session in its provider read state', async () => {
			const { session, other, view, readChanges } = createReadStateSessions();
			await view.openSession(other.resource);

			assert.deepStrictEqual(
				{ activeId: activeSessionOf(view)?.sessionId, otherRead: session.isRead.get(), readChanges },
				{ activeId: 'other', otherRead: false, readChanges: [] },
			);
		});

		test('explicit session row read actions update the main chat only', async () => {
			const sessionIsRead = observableValue('sessionIsRead', false);
			const mainIsRead = observableValue('mainIsRead', true);
			const main = { ...stubChat, isRead: mainIsRead };
			const session = stubSession({
				sessionId: 'explicit-main-chat-read',
				providerId: 'test',
				isRead: sessionIsRead,
				mainChat: constObservable(main),
				chats: constObservable([main]),
			});
			const chatReadChanges: boolean[] = [];
			const sessionReadChanges: boolean[] = [];
			const provider = new class extends TestSessionsProvider {
				override async setChatReadState(_sessionId: string, _chatResource: URI, isRead: boolean): Promise<void> {
					chatReadChanges.push(isRead);
					mainIsRead.set(isRead, undefined);
				}
				override async setSessionReadState(_sessionId: string, isRead: boolean): Promise<void> {
					sessionReadChanges.push(isRead);
					sessionIsRead.set(isRead, undefined);
				}
			}(session);
			const { service } = createSessionsManagementService(session, disposables, provider);

			await service.markUnread(session);
			const afterMarkUnread = { main: mainIsRead.get(), session: sessionIsRead.get() };
			await service.markRead(session);

			assert.deepStrictEqual(
				{
					afterMarkUnread,
					afterMarkRead: { main: mainIsRead.get(), session: sessionIsRead.get() },
					chatReadChanges,
					sessionReadChanges,
				},
				{
					afterMarkUnread: { main: false, session: false },
					afterMarkRead: { main: true, session: false },
					chatReadChanges: [false, true],
					sessionReadChanges: [],
				},
			);
		});
		test('a conversation hidden behind a custom view stays unread until revealed', async () => {
			const isRead = observableValue('isRead', false);
			const lastTurnEnd = observableValue('lastTurnEnd', new Date(1));
			const main = { ...stubChat, isRead, lastTurnEnd };
			const session = stubSession({ sessionId: 'hidden-cloud', providerId: 'test', isRead, mainChat: constObservable(main), chats: constObservable([main]) });
			const readChanges: boolean[] = [];
			const provider = new class extends TestSessionsProvider {
				override async setChatReadState(_sessionId: string, _resource: URI, read: boolean): Promise<void> {
					isRead.set(read, undefined);
					readChanges.push(read);
				}
			}(session);
			const { view, customViewService } = createSessionsManagementService(session, disposables, provider);
			await view.openSession(session.resource);
			showTestCustomView(customViewService, disposables);
			isRead.set(false, undefined);
			lastTurnEnd.set(new Date(2), undefined);
			const hiddenRead = isRead.get();
			customViewService.hideCustomView();
			assert.deepStrictEqual({ hiddenRead, revealedRead: isRead.get(), readChanges }, { hiddenRead: false, revealedRead: true, readChanges: [true, true] });
		});
	});

	test('archiving the active session keeps the custom view open', async () => {
		const isArchived = observableValue('isArchived', false);
		const session = stubSession({ sessionId: 'active', providerId: 'test', isArchived });
		const { customViewService, view } = createSessionsManagementService(session, disposables);

		await view.openSession(session.resource);
		showTestCustomView(customViewService, disposables);
		isArchived.set(true, undefined);
		await timeout(0);

		assert.deepStrictEqual({
			activeCustomView: customViewService.activeCustomView.get()?.id,
			activeSession: activeSessionOf(view)?.sessionId,
		}, {
			activeCustomView: 'test.customView',
			activeSession: undefined,
		});
	});

	test('automatic no-fallback removal keeps the custom view open', async () => {
		const session = stubSession({ sessionId: 'active', providerId: 'test' });
		const onDidChangeSessions = disposables.add(new Emitter<ISessionChangeEvent>());
		const provider = new class extends TestSessionsProvider {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
		}(session);
		const { customViewService, view } = createSessionsManagementService(session, disposables, provider);

		await view.openSession(session.resource);
		showTestCustomView(customViewService, disposables);
		onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
		await timeout(0);

		assert.deepStrictEqual({
			activeCustomView: customViewService.activeCustomView.get()?.id,
			activeSession: activeSessionOf(view)?.sessionId,
		}, {
			activeCustomView: 'test.customView',
			activeSession: undefined,
		});
	});

	test('automatic no-fallback removal stays inert during pending explicit navigation', async () => {
		const active = stubSession({ sessionId: 'active', providerId: 'test' });
		const target = stubSession({ sessionId: 'target', providerId: 'test' });
		const onDidChangeSessions = disposables.add(new Emitter<ISessionChangeEvent>());
		const resolutionStarted = new DeferredPromise<void>();
		const targetResolution = new DeferredPromise<URI | undefined>();
		const provider = new class extends TestSessionsProvider {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			override getSessions(): ISession[] { return [active, target]; }
			override resolveSessionResource(resource: URI): Promise<URI | undefined> {
				if (extUriBiasedIgnorePathCase.isEqual(resource, target.resource)) {
					resolutionStarted.complete();
					return targetResolution.p;
				}
				return Promise.resolve(undefined);
			}
		}(active);
		const { view } = createSessionsManagementService(active, disposables, provider);

		await view.openSession(active.resource);
		const openTarget = view.openSession(target.resource);
		await resolutionStarted.p;
		onDidChangeSessions.fire({ added: [], removed: [active], changed: [] });
		targetResolution.complete(undefined);
		await openTarget;

		assert.strictEqual(activeSessionOf(view)?.sessionId, 'target');
	});

	test('removing the active session with a fallback keeps the custom view open', async () => {
		const fallback = stubSession({ sessionId: 'fallback', providerId: 'test' });
		const active = stubSession({ sessionId: 'active', providerId: 'test' });
		const onDidChangeSessions = disposables.add(new Emitter<ISessionChangeEvent>());
		const provider = new class extends TestSessionsProvider {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			override getSessions(): ISession[] { return [fallback, active]; }
		}(active);
		const { customViewService, view } = createSessionsManagementService(active, disposables, provider);

		await view.openSession(fallback.resource);
		await view.openSessionToSide(active);
		showTestCustomView(customViewService, disposables);
		onDidChangeSessions.fire({ added: [], removed: [active], changed: [] });
		await timeout(0);

		assert.deepStrictEqual({
			activeCustomView: customViewService.activeCustomView.get()?.id,
			activeSession: activeSessionOf(view)?.sessionId,
		}, {
			activeCustomView: 'test.customView',
			activeSession: 'fallback',
		});
	});

	test('openNewSession with toSide places the new-session composer beside the active session', async () => {
		const session = stubSession({ sessionId: 'active', providerId: 'test' });
		const { view } = createSessionsManagementService(session, disposables);

		await view.openSession(session.resource);
		assert.deepStrictEqual(slotSessionsOf(view).map(s => s?.sessionId ?? null), ['active']);

		await view.openNewSession({ toSide: true });
		assert.deepStrictEqual(slotSessionsOf(view).map(s => s?.sessionId ?? null), ['active', null]);
		assert.strictEqual(activeSessionOf(view), undefined);
	});

	test('openNewSession with toSide places an empty composer beside the active quick-chat draft', async () => {
		const quickChat = stubSession({
			sessionId: 'quick-chat',
			providerId: 'test',
			isQuickChat: constObservable(true),
		});
		const provider = new class extends TestSessionsProvider {
			override readonly supportsQuickChats = true;
			override createQuickChat(): ISession { return quickChat; }
		}(quickChat);
		const { service, view } = createSessionsManagementService(quickChat, disposables, provider);

		view.openQuickChat();
		const result = await view.openNewSession({ toSide: true });

		assert.deepStrictEqual({
			visible: slotSessionsOf(view).map(session => session?.sessionId ?? null),
			active: activeSessionOf(view),
			preservedDraft: service.newSession.get()?.sessionId,
			result: result.session,
		}, {
			visible: ['quick-chat', null],
			active: undefined,
			preservedDraft: 'quick-chat',
			result: undefined,
		});
	});

	for (const { preserveNavigation, preserveFocus } of [
		{ preserveNavigation: false, preserveFocus: undefined },
		{ preserveNavigation: true, preserveFocus: undefined },
		{ preserveNavigation: true, preserveFocus: true },
	]) {
		test(`openQuickChat preserves navigation and focus independently (${preserveNavigation}, ${preserveFocus})`, () => {
			const quickChat = stubSession({
				sessionId: 'quick-chat',
				providerId: 'test',
				isQuickChat: constObservable(true),
			});
			const provider = new class extends TestSessionsProvider {
				override readonly supportsQuickChats = true;
				override createQuickChat(): ISession { return quickChat; }
			}(quickChat);
			const { view, sessionsPartService } = createSessionsManagementService(quickChat, disposables, provider);
			const navigation = view.navigationRequest.get();
			sessionsPartService.focusedSessions.length = 0;

			view.openQuickChat(undefined, preserveNavigation, preserveFocus);

			assert.deepStrictEqual({
				activeSession: activeSessionOf(view)?.sessionId,
				preservedNavigation: view.navigationRequest.get() === navigation,
				focused: sessionsPartService.focusedSessions,
			}, {
				activeSession: 'quick-chat',
				preservedNavigation: preserveNavigation,
				focused: preserveFocus ? [] : ['quick-chat'],
			});
		});
	}

	for (const quickChat of [false, true]) {
		test(`custom-view quick-chat preparation reconciles the normal draft without navigation (quick chat: ${quickChat})`, async () => {
			const folderUri = URI.file('/workspace');
			const workspace: ISessionWorkspace = {
				uri: folderUri, label: 'workspace', icon: Codicon.folder,
				folders: [{ root: folderUri, workingDirectory: folderUri, name: 'workspace', description: undefined }],
				requiresWorkspaceTrust: false, isVirtualWorkspace: false,
			};
			const draft = stubSession({
				sessionId: 'draft', providerId: 'test', status: constObservable(SessionStatus.Untitled),
				isQuickChat: constObservable(quickChat), workspace: constObservable(quickChat ? undefined : workspace),
			});
			const replacement = stubSession({
				sessionId: 'replacement', providerId: 'other', status: constObservable(SessionStatus.Untitled),
				isQuickChat: constObservable(true),
			});
			const deleted: string[] = [];
			const provider = new class extends TestSessionsProvider {
				override readonly supportsQuickChats = true;
				override resolveWorkspace(): ISessionWorkspace { return workspace; }
				override createQuickChat(): ISession { return draft; }
				override deleteNewSession(id: string): void { deleted.push(id); }
			}(draft);
			const other = new class extends TestSessionsProvider {
				override readonly id = 'other';
				override readonly supportsQuickChats = true;
				override createQuickChat(): ISession { return replacement; }
			}(replacement);
			const { view, service, customViewService, sessionsPartService } = createSessionsManagementService(draft, disposables, [provider, other]);
			if (quickChat) {
				view.openQuickChat({ providerId: provider.id });
			} else {
				await view.openNewSession({ folderUri, providerId: provider.id });
			}
			showTestCustomView(customViewService, disposables);
			const navigation = view.navigationRequest.get();
			sessionsPartService.focusedSessions.length = 0;
			const replacements: { from: string; to: string; currentDraft: string | undefined }[] = [];
			disposables.add(service.onDidReplaceNewDraftSession(({ from, to }) => {
				replacements.push({ from: from.sessionId, to: to.sessionId, currentDraft: service.newSession.get()?.sessionId });
			}));

			service.createQuickChat({ providerId: other.id });
			const customView = customViewService.activeCustomView.get()?.id;
			customViewService.hideCustomView();

			assert.deepStrictEqual({
				draft: service.newSession.get()?.sessionId,
				active: activeSessionOf(view)?.sessionId,
				visible: slotSessionsOf(view).map(session => session?.sessionId),
				deleted, replacements, customView,
				navigationPreserved: view.navigationRequest.get() === navigation,
				focused: sessionsPartService.focusedSessions,
			}, {
				draft: 'replacement', active: 'replacement', visible: ['replacement'], deleted: ['draft'],
				replacements: [{ from: 'draft', to: 'replacement', currentDraft: 'draft' }],
				customView: 'test.customView', navigationPreserved: true, focused: [],
			});
		});
	}

	for (const preserveCustomView of [false, true]) {
		test(`new-session draft preparation preserves the custom view only when requested (${preserveCustomView})`, async () => {
			const session = stubSession({ sessionId: 'active', providerId: 'test' });
			const { view, customViewService, sessionsPartService } = createSessionsManagementService(session, disposables);
			await view.openSession(session.resource);
			sessionsPartService.focusedSessions.length = 0;
			showTestCustomView(customViewService, disposables);
			await view.openNewSession({ preserveCustomView });
			const first = customViewService.activeCustomView.get()?.id;
			await view.openNewSession({ preserveCustomView });
			assert.deepStrictEqual({ first, repeated: customViewService.activeCustomView.get()?.id, active: activeSessionOf(view)?.sessionId, focused: sessionsPartService.focusedSessions }, {
				first: preserveCustomView ? 'test.customView' : undefined,
				repeated: preserveCustomView ? 'test.customView' : undefined,
				active: preserveCustomView ? 'active' : undefined,
				focused: preserveCustomView ? [] : [undefined],
			});
		});
	}

	for (const trusted of [false, true]) {
		test(`custom-view draft preparation preserves the grid and honors workspace trust (${trusted})`, async () => {
			const folderUri = URI.file('/workspace');
			const workspace: ISessionWorkspace = {
				uri: folderUri, label: 'workspace', icon: Codicon.folder,
				folders: [{ root: folderUri, workingDirectory: folderUri, name: 'workspace', description: undefined }],
				requiresWorkspaceTrust: true, isVirtualWorkspace: false,
			};
			const active = stubSession({ sessionId: 'active', providerId: 'test' });
			const draft = stubSession({ sessionId: 'draft', providerId: 'test', status: constObservable(SessionStatus.Untitled), workspace: constObservable(workspace) });
			let creates = 0;
			let trustRequests = 0;
			const provider = new class extends TestSessionsProvider {
				override resolveWorkspace(): ISessionWorkspace { return workspace; }
				override createNewSession(): ISession { creates++; return draft; }
			}(active);
			const trust = new class extends mock<IWorkspaceTrustRequestService>() {
				override async requestResourcesTrust(): Promise<boolean> { trustRequests++; return trusted; }
			};
			const { view, service, customViewService, sessionsPartService } = createSessionsManagementService(active, disposables, provider, undefined, trust);
			await view.openSession(active.resource);
			showTestCustomView(customViewService, disposables);
			const navigation = view.navigationRequest.get();
			sessionsPartService.focusedSessions.length = 0;
			const result = await view.openNewSession({ folderUri, preserveCustomView: true });
			assert.deepStrictEqual({
				trustRequests, creates, trustDeclined: result.trustDeclined, draft: service.newSession.get()?.sessionId,
				active: activeSessionOf(view)?.sessionId, visible: slotSessionsOf(view).map(session => session?.sessionId),
				navigationPreserved: view.navigationRequest.get() === navigation,
				customView: customViewService.activeCustomView.get()?.id, focused: sessionsPartService.focusedSessions,
			}, {
				trustRequests: 1, creates: trusted ? 1 : 0, trustDeclined: !trusted, draft: trusted ? 'draft' : undefined,
				active: 'active', visible: ['active'], navigationPreserved: true, customView: 'test.customView', focused: [],
			});
		});
	}

	test('openNewSession without toSide still replaces the active session', async () => {
		const session = stubSession({ sessionId: 'active', providerId: 'test' });
		const { view } = createSessionsManagementService(session, disposables);

		await view.openSession(session.resource);
		await view.openNewSession();

		assert.deepStrictEqual({
			visible: slotSessionsOf(view).map(s => s?.sessionId ?? null),
			active: activeSessionOf(view),
		}, { visible: [null], active: undefined });
	});

	test('openNewSession with toSide moves the existing composer beside the active session', async () => {
		const first = stubSession({ sessionId: 'first', providerId: 'test' });
		const middle = stubSession({ sessionId: 'middle', providerId: 'test' });
		const last = stubSession({ sessionId: 'last', providerId: 'test' });
		const provider = new class extends TestSessionsProvider {
			constructor() { super(first); }
			override getSessions(): ISession[] { return [first, middle, last]; }
		};
		const { view } = createSessionsManagementService(first, disposables, provider);

		await view.openSession(first.resource);
		view.insertAt(middle, first.sessionId, 'right', false);
		view.insertAt(last, middle.sessionId, 'right', false);
		await view.openNewSession({ toSide: true });
		const inserted = slotSessionsOf(view).map(s => s?.sessionId ?? null);
		await view.openNewSession({ toSide: true });
		const repeated = slotSessionsOf(view).map(s => s?.sessionId ?? null);
		await view.openSession(last.resource);
		await view.openNewSession({ toSide: true });
		const movedRight = slotSessionsOf(view).map(s => s?.sessionId ?? null);
		await view.openSession(first.resource);
		await view.openNewSession({ toSide: true });

		assert.deepStrictEqual({
			inserted,
			repeated,
			movedRight,
			movedLeft: slotSessionsOf(view).map(s => s?.sessionId ?? null),
			active: activeSessionOf(view),
		}, {
			inserted: ['first', null, 'middle', 'last'],
			repeated: ['first', null, 'middle', 'last'],
			movedRight: ['first', 'middle', 'last', null],
			movedLeft: ['first', null, 'middle', 'last'],
			active: undefined,
		});
	});

	test('openNewSession without toSide leaves an existing composer in place', async () => {
		const first = stubSession({ sessionId: 'first', providerId: 'test' });
		const last = stubSession({ sessionId: 'last', providerId: 'test' });
		const provider = new class extends TestSessionsProvider {
			constructor() { super(first); }
			override getSessions(): ISession[] { return [first, last]; }
		};
		const { view } = createSessionsManagementService(first, disposables, provider);

		await view.openSession(first.resource);
		view.insertAt(last, first.sessionId, 'right', false);
		await view.openNewSession({ toSide: true });
		await view.openSession(last.resource);
		await view.openNewSession();

		assert.deepStrictEqual({
			visible: slotSessionsOf(view).map(s => s?.sessionId ?? null),
			active: activeSessionOf(view),
		}, {
			visible: ['first', null, 'last'],
			active: undefined,
		});
	});

	test('repeated openNewSession with toSide keeps the single empty slot and re-activates it', async () => {
		const session = stubSession({ sessionId: 'active', providerId: 'test' });
		const { view } = createSessionsManagementService(session, disposables);

		await view.openSession(session.resource);
		await view.openNewSession({ toSide: true });
		await view.openNewSession({ toSide: true });
		// Go back to the session, then ask for a side composer again. The grid caps
		// at one empty slot, so the existing one is re-activated rather than duplicated.
		await view.openSession(session.resource);
		await view.openNewSession({ toSide: true });

		assert.deepStrictEqual({
			visible: slotSessionsOf(view).map(s => s?.sessionId ?? null),
			active: activeSessionOf(view)?.sessionId ?? null,
		}, {
			visible: ['active', null],
			active: null,
		});
	});

	test('openNewSession with toSide and folderUri places the new session beside the active session', async () => {
		const makeWorkspace = (uri: URI): ISessionWorkspace => ({
			uri,
			label: 'ws',
			icon: Codicon.vm,
			folders: [{ root: uri, workingDirectory: uri, name: 'ws', description: undefined }],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		});
		const session = stubSession({ sessionId: 'active', providerId: 'test' });
		const folderUri = URI.file('/test/workspace');
		const newDraftSession = stubSession({ sessionId: 'new-draft', providerId: 'test', workspace: constObservable(makeWorkspace(folderUri)) });
		const provider = new class extends TestSessionsProvider {
			constructor() { super(session); }
			override resolveWorkspace(folder?: URI): ISessionWorkspace { return makeWorkspace(folder!); }
			override createNewSession(): ISession { return newDraftSession; }
		};
		const { view } = createSessionsManagementService(session, disposables, provider);

		await view.openSession(session.resource);
		assert.deepStrictEqual(slotSessionsOf(view).map(s => s?.sessionId ?? null), ['active']);

		await view.openNewSession({ folderUri, toSide: true });
		assert.deepStrictEqual(slotSessionsOf(view).map(s => s?.sessionId ?? null), ['active', 'new-draft']);
		assert.strictEqual(activeSessionOf(view)?.sessionId, 'new-draft');
	});

	test('openNewSession requires Dev Container execution before activating the draft', async () => {
		const folderUri = URI.file('/test/workspace');
		const workspace: ISessionWorkspace = {
			uri: folderUri,
			label: 'workspace',
			icon: Codicon.folder,
			folders: [{ root: folderUri, workingDirectory: folderUri, name: 'workspace', description: undefined }],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		};
		const newDraftSession = stubSession({
			sessionId: 'new-draft',
			providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
			workspace: constObservable(workspace),
		});
		const events: string[] = [];
		const provider = new class extends TestSessionsProvider {
			override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
			override resolveWorkspace(): ISessionWorkspace { return workspace; }
			override createNewSession(): ISession { return newDraftSession; }
			preferDevContainer(sessionId: string, options?: { readonly required?: boolean }): void {
				events.push(`require:${sessionId}:${options?.required}`);
			}
		}(newDraftSession);
		const { view } = createSessionsManagementService(newDraftSession, disposables, provider);
		disposables.add(autorun(reader => {
			const session = activeSessionOf(view, reader);
			if (session) {
				events.push(`activate:${session.sessionId}`);
			}
		}));

		const result = await view.openNewSession({ folderUri, requireDevContainer: true });

		assert.deepStrictEqual({
			events,
			result: result.session?.sessionId,
			active: activeSessionOf(view)?.sessionId,
		}, {
			events: ['require:new-draft:true', 'activate:new-draft'],
			result: 'new-draft',
			active: 'new-draft',
		});
	});

	test('removing the active chat keeps the custom view open', async () => {
		const sideChat: IChat = {
			...stubChat,
			resource: URI.parse('test:///side-chat'),
			title: constObservable('Side Chat'),
			status: constObservable(SessionStatus.Completed),
		};
		const chats = observableValue<readonly IChat[]>('chats', [stubChat, sideChat]);
		const session = stubSession({
			sessionId: 'active',
			providerId: 'test',
			status: constObservable(SessionStatus.Completed),
			chats,
		});
		const { customViewService, view } = createSessionsManagementService(session, disposables);

		await view.openChat(session, sideChat.resource);
		showTestCustomView(customViewService, disposables);
		chats.set([stubChat], undefined);
		await timeout(0);

		assert.deepStrictEqual({
			activeCustomView: customViewService.activeCustomView.get()?.id,
			activeChat: activeChatOf(view)?.resource.toString(),
		}, {
			activeCustomView: 'test.customView',
			activeChat: stubChat.resource.toString(),
		});
	});

	test('explicit session navigation dismisses the custom view', async () => {
		const isArchived = observableValue('isArchived', false);
		const session = stubSession({ sessionId: 'active', providerId: 'test', isArchived });
		const { customViewService, view } = createSessionsManagementService(session, disposables);

		await view.openSession(session.resource);
		showTestCustomView(customViewService, disposables);
		await view.openNewSession();
		const afterOpenNewSession = customViewService.activeCustomView.get()?.id;

		await view.openSession(session.resource);
		customViewService.showCustomView('test.customView');
		isArchived.set(true, undefined);
		await timeout(0);
		await view.openNewSession();
		const afterOpenNewSessionWithoutActiveSession = customViewService.activeCustomView.get()?.id;

		customViewService.showCustomView('test.customView');
		await view.openSession(session.resource);
		const afterOpenSession = customViewService.activeCustomView.get()?.id;

		assert.deepStrictEqual({
			afterOpenNewSession,
			afterOpenNewSessionWithoutActiveSession,
			afterOpenSession,
		}, {
			afterOpenNewSession: undefined,
			afterOpenNewSessionWithoutActiveSession: undefined,
			afterOpenSession: undefined,
		});
	});

	suite('session navigation', () => {
		test('restores saved drafts through a disposable opener without promoting MRU', async () => {
			const first = stubSession({ sessionId: 'first', providerId: 'test', status: constObservable(SessionStatus.Completed) });
			const second = stubSession({ sessionId: 'second', providerId: 'test', status: constObservable(SessionStatus.Completed) });
			const provider = new class extends TestSessionsProvider {
				override getSessions(): ISession[] { return [first, second]; }
			}(first);
			const { view } = createSessionsManagementService(first, disposables, provider);
			const restored: string[] = [];
			const registration = disposables.add(view.registerSavedDraftOpener(async (id, token) => {
				restored.push(id);
				view.setCurrentDraftId(id);
				await view.openNewSession({ preserveNavigation: true }, token);
				return true;
			}));
			await view.openSession(first.resource);
			view.setCurrentDraftId('saved');
			await view.openNewSession();
			await view.openSession(second.resource);
			const recentBefore = view.getRecentlyOpenedSessions().recent.map(session => session.sessionId);
			await view.openPreviousSession();
			const draftActive = activeSessionOf(view) === undefined;
			await view.openPreviousSession();
			const previous = activeSessionOf(view)?.sessionId;
			await view.openNextSession();
			await view.openNextSession();
			const forward = activeSessionOf(view)?.sessionId;
			const recentAfter = view.getRecentlyOpenedSessions().recent.map(session => session.sessionId);
			registration.dispose();
			await view.openPreviousSession();
			assert.deepStrictEqual({
				restored, draftActive, previous, forward, recentBefore, recentAfter,
				afterDisposal: activeSessionOf(view)?.sessionId,
			}, {
				restored: ['saved', 'saved'], draftActive: true, previous: 'first', forward: 'second',
				recentBefore: ['second', 'first'], recentAfter: ['second', 'first'], afterDisposal: 'first',
			});
		});

		test('visits custom views and the composer without recording the covered session again', async () => {
			const first = stubSession({ sessionId: 'first', providerId: 'test', status: constObservable(SessionStatus.Completed) });
			const second = stubSession({ sessionId: 'second', providerId: 'test', status: constObservable(SessionStatus.Completed) });
			const provider = new class extends TestSessionsProvider {
				override getSessions(): ISession[] { return [first, second]; }
			}(first);
			const { customViewService, view, contextKeyService } = createSessionsManagementService(first, disposables, provider);
			const destination = () => customViewService.activeCustomView.get()?.id ?? activeSessionOf(view)?.sessionId ?? 'newSession';

			await view.openSession(first.resource);
			showTestCustomView(customViewService, disposables);
			await view.openSession(second.resource);
			const recentBeforeNavigation = view.getRecentlyOpenedSessions().recent.map(session => session.sessionId);
			const backward: string[] = [];
			for (let i = 0; i < 3; i++) {
				await view.openPreviousSession();
				backward.push(destination());
			}
			const canGoFurtherBack = contextKeyService.getContextKeyValue('sessionsCanGoBack');
			const forward: string[] = [];
			for (let i = 0; i < 3; i++) {
				await view.openNextSession();
				forward.push(destination());
			}

			assert.deepStrictEqual({
				backward, forward, canGoFurtherBack,
				canGoFurtherForward: contextKeyService.getContextKeyValue('sessionsCanGoForward'),
				recentBeforeNavigation,
				recentAfterNavigation: view.getRecentlyOpenedSessions().recent.map(session => session.sessionId),
			}, {
				backward: ['test.customView', 'first', 'newSession'],
				forward: ['first', 'test.customView', 'second'],
				canGoFurtherBack: false,
				canGoFurtherForward: false,
				recentBeforeNavigation: ['second', 'first'],
				recentAfterNavigation: ['second', 'first'],
			});
		});

		for (const newSession of [false, true]) {
			test(`explicitly reopening the visible ${newSession ? 'composer' : 'custom view'} after Back promotes its only entry`, async () => {
				const first = stubSession({ sessionId: 'first', providerId: 'test', status: constObservable(SessionStatus.Completed) });
				const second = stubSession({ sessionId: 'second', providerId: 'test', status: constObservable(SessionStatus.Completed) });
				const provider = new class extends TestSessionsProvider {
					override getSessions(): ISession[] { return [first, second]; }
				}(first);
				const { customViewService, view, contextKeyService } = createSessionsManagementService(first, disposables, provider);
				disposables.add(customViewService.registerCustomView({ id: 'test.customView', ctor: new SyncDescriptor(TestCustomView) }));
				const open = async () => newSession ? view.openNewSession() : customViewService.showCustomView('test.customView');
				const destination = () => customViewService.activeCustomView.get()?.id ?? activeSessionOf(view)?.sessionId ?? 'newSession';

				await view.openSession(first.resource);
				await open();
				await view.openSession(second.resource);
				await view.openPreviousSession();
				await open();
				const canGoForward = contextKeyService.getContextKeyValue('sessionsCanGoForward');
				const backward: string[] = [];
				for (let i = 0; i < (newSession ? 2 : 3); i++) {
					await view.openPreviousSession();
					backward.push(destination());
				}

				assert.deepStrictEqual({
					canGoForward,
					backward,
					canGoFurtherBack: contextKeyService.getContextKeyValue('sessionsCanGoBack'),
					recent: view.getRecentlyOpenedSessions().recent.map(session => session.sessionId),
				}, {
					canGoForward: false,
					backward: newSession ? ['second', 'first'] : ['second', 'first', 'newSession'],
					canGoFurtherBack: false,
					recent: ['second', 'first'],
				});
			});

			test(`reopening the visible ${newSession ? 'composer' : 'custom view'} cancels a pending Back`, async () => {
				const session = stubSession({ sessionId: 'session', providerId: 'test', status: constObservable(SessionStatus.Completed) });
				const resolutionStarted = new DeferredPromise<void>();
				const resolution = new DeferredPromise<URI | undefined>();
				let deferResolution = false;
				const provider = new class extends TestSessionsProvider {
					override resolveSessionResource(): Promise<URI | undefined> {
						if (deferResolution) {
							resolutionStarted.complete();
							return resolution.p;
						}
						return Promise.resolve(undefined);
					}
				}(session);
				const { customViewService, view, contextKeyService } = createSessionsManagementService(session, disposables, provider);
				disposables.add(customViewService.registerCustomView({ id: 'test.customView', ctor: new SyncDescriptor(TestCustomView) }));
				const open = async () => newSession ? view.openNewSession() : customViewService.showCustomView('test.customView');

				await view.openSession(session.resource);
				await open();
				deferResolution = true;
				const navigating = view.openPreviousSession();
				await resolutionStarted.p;
				await open();
				deferResolution = false;
				resolution.complete(undefined);
				await navigating;
				const afterResolution = customViewService.activeCustomView.get()?.id ?? activeSessionOf(view)?.sessionId ?? 'newSession';
				const canGoForward = contextKeyService.getContextKeyValue('sessionsCanGoForward');
				await view.openPreviousSession();

				assert.deepStrictEqual({
					afterResolution,
					canGoForward,
					previous: activeSessionOf(view)?.sessionId,
					customView: customViewService.activeCustomView.get()?.id,
				}, {
					afterResolution: newSession ? 'newSession' : 'test.customView',
					canGoForward: false,
					previous: 'session',
					customView: undefined,
				});
			});

			test(`reopening the ${newSession ? 'composer' : 'session'} covered by a custom view records a single visit`, async () => {
				const session = stubSession({ sessionId: 'session', providerId: 'test', status: constObservable(SessionStatus.Completed) });
				const { customViewService, view } = createSessionsManagementService(session, disposables);
				const open = () => newSession ? view.openNewSession() : view.openSession(session.resource);

				await open();
				showTestCustomView(customViewService, disposables);
				await open();
				await view.openPreviousSession();
				const previous = customViewService.activeCustomView.get()?.id;
				await view.openNextSession();

				assert.deepStrictEqual({
					previous,
					customView: customViewService.activeCustomView.get()?.id,
					session: activeSessionOf(view)?.sessionId,
				}, {
					previous: 'test.customView',
					customView: undefined,
					session: newSession ? undefined : 'session',
				});
			});

			test(`${newSession ? 'new-session' : 'custom-view'} navigation supersedes an in-flight history navigation`, async () => {
				const first = stubSession({ sessionId: 'first', providerId: 'test', status: constObservable(SessionStatus.Completed) });
				const second = stubSession({ sessionId: 'second', providerId: 'test', status: constObservable(SessionStatus.Completed) });
				const third = stubSession({ sessionId: 'third', providerId: 'test', status: constObservable(SessionStatus.Completed) });
				const resolutionStarted = new DeferredPromise<void>();
				const resolution = new DeferredPromise<URI | undefined>();
				let deferResolution = false;
				const provider = new class extends TestSessionsProvider {
					override getSessions(): ISession[] { return [first, second, third]; }
					override resolveSessionResource(resource: URI): Promise<URI | undefined> {
						if (deferResolution && extUriBiasedIgnorePathCase.isEqual(resource, first.resource)) {
							resolutionStarted.complete();
							return resolution.p;
						}
						return Promise.resolve(undefined);
					}
				}(first);
				const { customViewService, view } = createSessionsManagementService(first, disposables, provider);

				await view.openSession(first.resource);
				await view.openSession(second.resource);
				deferResolution = true;
				const navigating = view.openPreviousSession();
				await resolutionStarted.p;
				if (newSession) {
					await view.openNewSession();
				} else {
					showTestCustomView(customViewService, disposables);
				}
				const afterNavigation = customViewService.activeCustomView.get()?.id ?? activeSessionOf(view)?.sessionId ?? 'newSession';
				await view.openSession(third.resource);
				resolution.complete(undefined);
				await navigating;
				const afterResolution = activeSessionOf(view)?.sessionId;
				await view.openPreviousSession();
				const previousView = customViewService.activeCustomView.get()?.id ?? activeSessionOf(view)?.sessionId ?? 'newSession';
				await view.openPreviousSession();

				assert.deepStrictEqual({
					afterNavigation,
					afterResolution,
					previousView,
					previous: activeSessionOf(view)?.sessionId,
				}, {
					afterNavigation: newSession ? 'newSession' : 'test.customView',
					afterResolution: 'third',
					previousView: newSession ? 'newSession' : 'test.customView',
					previous: 'second',
				});
			});
		}

		for (const delayed of [false, true]) {
			test(`opening another chat from a custom view records only the requested destination (${delayed ? 'loading' : 'loaded'})`, async () => {
				const firstChat: IChat = { ...stubChat, resource: URI.parse('test:///first-chat'), status: constObservable(SessionStatus.Completed) };
				const secondChat: IChat = { ...stubChat, resource: URI.parse('test:///second-chat'), status: constObservable(SessionStatus.Completed) };
				const chats = observableValue<readonly IChat[]>('chats', [firstChat]);
				const loading = observableValue('loading', false);
				const session = stubSession({
					sessionId: 'session', providerId: 'test', status: constObservable(SessionStatus.Completed),
					chats, mainChat: constObservable(firstChat), loading, capabilities: constObservable({ supportsMultipleChats: true }),
				});
				const { customViewService, view, contextKeyService } = createSessionsManagementService(session, disposables);
				const destination = () => customViewService.activeCustomView.get()?.id ?? activeChatOf(view)?.resource.toString() ?? 'newSession';

				await view.openChat(session, firstChat.resource);
				showTestCustomView(customViewService, disposables);
				if (delayed) {
					loading.set(true, undefined);
				} else {
					chats.set([firstChat, secondChat], undefined);
				}
				const opening = view.openChat(session, secondChat.resource);
				if (delayed) {
					await timeout(0);
					chats.set([firstChat, secondChat], undefined);
					loading.set(false, undefined);
				}
				await opening;
				const opened = destination();
				const backward: string[] = [];
				for (let i = 0; i < 3; i++) {
					await view.openPreviousSession();
					backward.push(destination());
				}
				const canGoFurtherBack = contextKeyService.getContextKeyValue('sessionsCanGoBack');
				const forward: string[] = [];
				for (let i = 0; i < 3; i++) {
					await view.openNextSession();
					forward.push(destination());
				}

				assert.deepStrictEqual({ opened, backward, forward, canGoFurtherBack }, {
					opened: secondChat.resource.toString(),
					backward: ['test.customView', firstChat.resource.toString(), 'newSession'],
					forward: [firstChat.resource.toString(), 'test.customView', secondChat.resource.toString()],
					canGoFurtherBack: false,
				});
			});
		}

		for (const open of ['session', 'chat'] as const) {
			for (const delayed of [false, true]) {
				test(`opening a ${open} to the side records only the requested chat (${delayed ? 'loading' : 'loaded'})`, async () => {
					const firstChat: IChat = { ...stubChat, resource: URI.parse('test:///first/main'), status: constObservable(SessionStatus.Completed) };
					const targetMain: IChat = { ...firstChat, resource: URI.parse('test:///target/main') };
					const targetPeer: IChat = { ...firstChat, resource: URI.parse('test:///target/peer') };
					const first = stubSession({
						sessionId: 'first', providerId: 'test', status: constObservable(SessionStatus.Completed),
						chats: constObservable([firstChat]), mainChat: constObservable(firstChat),
					});
					const chats = observableValue<readonly IChat[]>('chats', delayed ? [targetMain] : [targetMain, targetPeer]);
					const loading = observableValue('loading', delayed);
					const target = stubSession({
						sessionId: 'target', providerId: 'test', status: constObservable(SessionStatus.Completed),
						chats, mainChat: constObservable(targetMain), loading, capabilities: constObservable({ supportsMultipleChats: true }),
					});
					const provider = new class extends TestSessionsProvider {
						override getSessions(): ISession[] { return [first, target]; }
					}(first);
					const { customViewService, view, sessionsPartService, contextKeyService } = createSessionsManagementService(first, disposables, provider);
					sessionsPartService.sessionViews.set(target.sessionId, upcastPartial<SessionView>({
						openChatToSide: resource => view.openChat(target, resource),
						reopenChat: async () => { },
					}));
					const destination = () => customViewService.activeCustomView.get()?.id ?? activeChatOf(view)?.resource.toString() ?? 'newSession';

					await view.openSession(first.resource);
					showTestCustomView(customViewService, disposables);
					const opening = open === 'session'
						? view.openSessionToSide(target, { chatResource: targetPeer.resource })
						: view.openChatToSide(target, targetPeer.resource);
					if (delayed) {
						await timeout(0);
						chats.set([targetMain, targetPeer], undefined);
						loading.set(false, undefined);
					}
					await opening;
					const opened = destination();
					const backward: string[] = [];
					for (let i = 0; i < 3; i++) {
						await view.openPreviousSession();
						backward.push(destination());
					}
					const canGoFurtherBack = contextKeyService.getContextKeyValue('sessionsCanGoBack');
					const forward: string[] = [];
					for (let i = 0; i < 3; i++) {
						await view.openNextSession();
						forward.push(destination());
					}

					assert.deepStrictEqual({ opened, backward, forward, canGoFurtherBack }, {
						opened: targetPeer.resource.toString(),
						backward: ['test.customView', firstChat.resource.toString(), 'newSession'],
						forward: [firstChat.resource.toString(), 'test.customView', targetPeer.resource.toString()],
						canGoFurtherBack: false,
					});
				});
			}
		}

		test('batch side-opening a visible main chat does not promote its previously active peer', async () => {
			const main: IChat = { ...stubChat, resource: URI.parse('test:///target/main'), status: constObservable(SessionStatus.Completed) };
			const peer: IChat = { ...main, resource: URI.parse('test:///target/peer') };
			const target = stubSession({
				sessionId: 'target', providerId: 'test', status: constObservable(SessionStatus.Completed),
				chats: constObservable([main, peer]), mainChat: constObservable(main), capabilities: constObservable({ supportsMultipleChats: true }),
			});
			const firstChat: IChat = { ...main, resource: URI.parse('test:///first/main') };
			const first = stubSession({
				sessionId: 'first', providerId: 'test', status: constObservable(SessionStatus.Completed),
				chats: constObservable([firstChat]), mainChat: constObservable(firstChat),
			});
			const provider = new class extends TestSessionsProvider {
				override getSessions(): ISession[] { return [first, target]; }
			}(first);
			const { customViewService, view, sessionsPartService, contextKeyService } = createSessionsManagementService(first, disposables, provider);
			sessionsPartService.sessionViews.set(target.sessionId, upcastPartial<SessionView>({
				openChatToSide: resource => view.openChat(target, resource),
				reopenChat: async () => { },
			}));
			const destination = () => customViewService.activeCustomView.get()?.id ?? activeChatOf(view)?.resource.toString() ?? 'newSession';

			await view.openChat(target, peer.resource);
			await view.openSessionToSide(first);
			showTestCustomView(customViewService, disposables);
			await view.openSessionsAt([target], first.sessionId, 'right', { forceMainChat: true });
			const opened = destination();
			const backward: string[] = [];
			for (let i = 0; i < 4; i++) {
				await view.openPreviousSession();
				backward.push(destination());
			}

			assert.deepStrictEqual({
				opened, backward, canGoFurtherBack: contextKeyService.getContextKeyValue('sessionsCanGoBack'),
			}, {
				opened: main.resource.toString(),
				backward: ['test.customView', firstChat.resource.toString(), peer.resource.toString(), 'newSession'],
				canGoFurtherBack: false,
			});
		});

		test('a superseded nested-chat creation does not dismiss or refocus a custom view', async () => {
			const mainChat: IChat = { ...stubChat, status: constObservable(SessionStatus.Completed) };
			const createdChat: IChat = { ...stubChat, resource: URI.parse('test:///created-chat'), status: constObservable(SessionStatus.Untitled) };
			const session = stubSession({
				sessionId: 'session', providerId: 'test', status: constObservable(SessionStatus.Completed),
				chats: constObservable([mainChat]), mainChat: constObservable(mainChat), capabilities: constObservable({ supportsMultipleChats: true }),
			});
			const creationStarted = new DeferredPromise<void>();
			const creation = new DeferredPromise<IChat>();
			const provider = new class extends TestSessionsProvider {
				override createNewChat(): Promise<IChat> {
					creationStarted.complete();
					return creation.p;
				}
			}(session);
			const { customViewService, view, sessionsPartService } = createSessionsManagementService(session, disposables, provider);

			await view.openSession(session.resource);
			const opening = view.openNewChatInSession(session, { forceNew: true });
			await creationStarted.p;
			showTestCustomView(customViewService, disposables);
			const focusCount = sessionsPartService.focusedSessions.length;
			creation.complete(createdChat);
			await opening;

			assert.deepStrictEqual({
				customView: customViewService.activeCustomView.get()?.id,
				chat: activeChatOf(view)?.resource.toString(),
				refocused: sessionsPartService.focusedSessions.length > focusCount,
			}, { customView: 'test.customView', chat: mainChat.resource.toString(), refocused: false });
		});

		test('session resource redirects preserve forward history', async () => {
			const legacy = stubSession({ sessionId: 'legacy', providerId: 'test', status: constObservable(SessionStatus.Completed) });
			const replacement = stubSession({ sessionId: 'replacement', providerId: 'test', status: constObservable(SessionStatus.Completed) });
			const next = stubSession({ sessionId: 'next', providerId: 'test', status: constObservable(SessionStatus.Completed) });
			const provider = new class extends TestSessionsProvider {
				override getSessions(): ISession[] { return [legacy, replacement, next]; }
				override resolveSessionResource(resource: URI): Promise<URI | undefined> {
					return Promise.resolve(extUriBiasedIgnorePathCase.isEqual(resource, legacy.resource) ? replacement.resource : undefined);
				}
			}(legacy);
			const { view } = createSessionsManagementService(legacy, disposables, provider);

			view.showSession(legacy.resource);
			await view.openSession(next.resource);
			await view.openPreviousSession();
			const previous = activeSessionOf(view)?.sessionId;
			await view.openNextSession();

			assert.deepStrictEqual({
				previous,
				next: activeSessionOf(view)?.sessionId,
				recent: view.getRecentlyOpenedSessions().recent.map(session => session.sessionId),
			}, { previous: 'replacement', next: 'next', recent: ['next', 'legacy'] });
		});

		test('opening the already-active composer cancels an unresolved session open', async () => {
			const session = stubSession({ sessionId: 'session', providerId: 'test', status: constObservable(SessionStatus.Completed) });
			const resolutionStarted = new DeferredPromise<void>();
			const resolution = new DeferredPromise<URI | undefined>();
			const provider = new class extends TestSessionsProvider {
				override resolveSessionResource(): Promise<URI | undefined> {
					resolutionStarted.complete();
					return resolution.p;
				}
			}(session);
			const { view } = createSessionsManagementService(session, disposables, provider);

			const opening = view.openSession(session.resource);
			await resolutionStarted.p;
			await view.openNewSession();
			resolution.complete(undefined);
			await opening;

			assert.deepStrictEqual({
				active: activeSessionOf(view)?.sessionId,
				recent: view.getRecentlyOpenedSessions().recent.map(session => session.sessionId),
			}, { active: undefined, recent: [] });
		});

		for (const source of ['inbox', 'sessionsList'] as const) {
			test(`${source} opens leave a retained canvas and Back/Forward restores the same conversation`, async () => {
				const main: IChat = { ...stubChat, resource: URI.parse('test:///main'), status: constObservable(SessionStatus.Completed) };
				const peer: IChat = { ...main, resource: URI.parse('test:///peer') };
				const session = stubSession({
					sessionId: 'session', providerId: 'test', status: constObservable(SessionStatus.Completed),
					chats: constObservable([main, peer]), mainChat: constObservable(main), capabilities: constObservable({ supportsMultipleChats: true }),
				});
				const { view, canvasService, sessionsPartService, contextKeyService } = createSessionsManagementService(session, disposables);
				disposables.add(canvasService.registerCanvas(upcastPartial<IWindowCanvasDescriptor>({ id: 'inbox' })));
				await view.openChat(session, peer.resource);
				await canvasService.openCanvas('inbox');
				sessionsPartService.focusedSessions.length = 0;
				await view.openSession(session.resource, { source });
				const opened = {
					canvas: canvasService.activeCanvasOpen.get(),
					focused: [...sessionsPartService.focusedSessions],
					visible: slotSessionsOf(view).map(session => session?.sessionId),
				};
				await view.openPreviousSession();
				const back = canvasService.activeCanvasOpen.get()?.id;
				await view.openNextSession();

				assert.deepStrictEqual({
					opened, back,
					canvas: canvasService.activeCanvasOpen.get(),
					chat: activeChatOf(view)?.resource.toString(),
					canGoForward: contextKeyService.getContextKeyValue('sessionsCanGoForward'),
					recent: view.getRecentlyOpenedSessions().recent.map(session => session.sessionId),
				}, {
					opened: { canvas: undefined, focused: ['session'], visible: ['session'] }, back: 'inbox',
					canvas: undefined, chat: peer.resource.toString(), canGoForward: false, recent: ['session'],
				});
			});
		}

		for (const target of ['session', 'chat'] as const) {
			for (const preserveFocus of [false, true]) {
				test(`sessions-list ${target} navigation reveals a canvas-covered transcript (preserveFocus: ${preserveFocus})`, async () => {
					const main: IChat = { ...stubChat, resource: URI.parse('test:///main'), status: constObservable(SessionStatus.Completed) };
					const peer: IChat = { ...main, resource: URI.parse('test:///peer') };
					const session = stubSession({
						sessionId: 'session', providerId: 'test', status: constObservable(SessionStatus.Completed),
						chats: constObservable([main, peer]), mainChat: constObservable(main), capabilities: constObservable({ supportsMultipleChats: true }),
					});
					const { view, canvasService, layoutService, sessionsPartService } = createSessionsManagementService(session, disposables);
					disposables.add(canvasService.registerCanvas(upcastPartial<IWindowCanvasDescriptor>({ id: 'inbox' })));
					await view.openSession(session.resource);
					await canvasService.openCanvas('inbox');
					layoutService.setPartHidden(true, Parts.SESSIONS_PART);
					sessionsPartService.focusedSessions.length = 0;
					if (target === 'session') {
						await view.openSession(session.resource, { source: 'sessionsList', preserveFocus, forceMainChat: true });
					} else {
						await view.openChat(session, peer.resource, { source: 'sessionsList', preserveFocus });
					}
					assert.deepStrictEqual({
						visible: layoutService.isVisible(Parts.SESSIONS_PART),
						canvas: canvasService.activeCanvasOpen.get(),
						chat: activeChatOf(view)?.resource.toString(),
						focused: sessionsPartService.focusedSessions,
					}, { visible: true, canvas: undefined, chat: (target === 'session' ? main : peer).resource.toString(), focused: preserveFocus ? [] : ['session'] });
				});
			}
		}

		for (const preserveCustomView of [false, true]) {
			test(`new-session navigation reveals a canvas-covered empty composer unless owned by the canvas (${preserveCustomView})`, async () => {
				const session = stubSession({ sessionId: 'session', providerId: 'test' });
				const { view, canvasService, layoutService, sessionsPartService } = createSessionsManagementService(session, disposables);
				disposables.add(canvasService.registerCanvas(upcastPartial<IWindowCanvasDescriptor>({ id: 'inbox' })));
				await canvasService.openCanvas('inbox');
				layoutService.setPartHidden(true, Parts.SESSIONS_PART);
				const navigation = view.navigationRequest.get();
				await view.openNewSession({ preserveCustomView });
				assert.deepStrictEqual({
					visible: layoutService.isVisible(Parts.SESSIONS_PART),
					canvas: canvasService.activeCanvasOpen.get()?.id,
					focused: sessionsPartService.focusedSessions,
					sameNavigation: view.navigationRequest.get() === navigation,
				}, {
					visible: !preserveCustomView, canvas: preserveCustomView ? 'inbox' : undefined,
					focused: preserveCustomView ? [] : [undefined], sameNavigation: preserveCustomView,
				});
			});
		}

		test('session metadata changes do not reveal a canvas-covered session', async () => {
			const title = observableValue('title', 'Before');
			const session = stubSession({ sessionId: 'session', providerId: 'test', title, status: constObservable(SessionStatus.Completed) });
			const { view, canvasService, layoutService, sessionsPartService } = createSessionsManagementService(session, disposables);
			disposables.add(canvasService.registerCanvas(upcastPartial<IWindowCanvasDescriptor>({ id: 'inbox' })));
			await view.openSession(session.resource);
			await canvasService.openCanvas('inbox');
			layoutService.setPartHidden(true, Parts.SESSIONS_PART);
			sessionsPartService.focusedSessions.length = 0;
			const navigation = view.navigationRequest.get();
			title.set('After', undefined);
			assert.deepStrictEqual({
				visible: layoutService.isVisible(Parts.SESSIONS_PART),
				canvas: canvasService.activeCanvasOpen.get()?.id,
				focused: sessionsPartService.focusedSessions,
				sameNavigation: view.navigationRequest.get() === navigation,
			}, { visible: false, canvas: 'inbox', focused: [], sameNavigation: true });
		});

		test('opening a canvas cancels unresolved session navigation without visiting the canceled session', async () => {
			const session = stubSession({ sessionId: 'session', providerId: 'test', status: constObservable(SessionStatus.Completed) });
			const resolutionStarted = new DeferredPromise<void>();
			const resolution = new DeferredPromise<URI | undefined>();
			const provider = new class extends TestSessionsProvider {
				override resolveSessionResource(): Promise<URI | undefined> {
					resolutionStarted.complete();
					return resolution.p;
				}
			}(session);
			const { view, canvasService } = createSessionsManagementService(session, disposables, provider);
			disposables.add(canvasService.registerCanvas(upcastPartial<IWindowCanvasDescriptor>({ id: 'inbox' })));
			const opening = view.openSession(session.resource);
			await resolutionStarted.p;
			await canvasService.openCanvas('inbox');
			resolution.complete(undefined);
			await opening;
			const opened = canvasService.activeCanvasOpen.get()?.id;
			await view.openPreviousSession();
			assert.deepStrictEqual({
				opened, active: activeSessionOf(view)?.sessionId,
				canvas: canvasService.activeCanvasOpen.get(),
				recent: view.getRecentlyOpenedSessions().recent.map(session => session.sessionId),
			}, { opened: 'inbox', active: undefined, canvas: undefined, recent: [] });
		});

		test('focusing an already-visible session leaves canvas navigation without replacing its pane', async () => {
			const session = stubSession({ sessionId: 'session', providerId: 'test', status: constObservable(SessionStatus.Completed) });
			const { view, canvasService, focusPane } = createSessionsManagementService(session, disposables);
			disposables.add(canvasService.registerCanvas(upcastPartial<IWindowCanvasDescriptor>({ id: 'inbox' })));
			await view.openSession(session.resource);
			const active = view.activePane.get();
			const activeSession = activeSessionOf(view);
			await canvasService.openCanvas('inbox');
			focusPane.fire(view.activePane.get()!.id);
			const unchanged = !!active && active === view.activePane.get() && activeSession === activeSessionOf(view);
			await view.openPreviousSession();
			assert.deepStrictEqual({ unchanged, canvas: canvasService.activeCanvasOpen.get()?.id }, { unchanged: true, canvas: 'inbox' });
		});

		for (const { pendingCanvas, savedGrid } of [
			{ pendingCanvas: false, savedGrid: false }, { pendingCanvas: true, savedGrid: false },
			{ pendingCanvas: false, savedGrid: true }, { pendingCanvas: true, savedGrid: true },
		]) {
			test(`startup restoration continues under ${pendingCanvas ? 'a pending' : 'an open'} canvas without taking focus (saved grid: ${savedGrid})`, async () => {
				const first = stubSession({ sessionId: 'first', providerId: 'test', status: constObservable(SessionStatus.Completed) });
				const second = stubSession({ sessionId: 'second', providerId: 'test', status: constObservable(SessionStatus.Completed) });
				const sessionsChanged = disposables.add(new Emitter<ISessionChangeEvent>());
				let sessions: ISession[] = [];
				const provider = new class extends TestSessionsProvider {
					override readonly onDidChangeSessions = sessionsChanged.event;
					override getSessions(): ISession[] { return sessions; }
				}(first);
				const storage = disposables.add(new InMemoryStorageService());
				storage.store('agentSessions.activeSessionStates', JSON.stringify([
					{ sessionResource: first.resource.toString(), visibleOrder: 0, isSticky: true, isActive: true },
					{ sessionResource: second.resource.toString(), visibleOrder: 1, isSticky: false, isActive: false },
				]), StorageScope.WORKSPACE, StorageTarget.MACHINE);
				if (savedGrid) {
					const state: ISessionGridState = {
						version: 1,
						grid: {
							orientation: Orientation.HORIZONTAL, width: 1000, height: 600,
							root: {
								type: 'branch', size: 600,
								data: [
									{ type: 'leaf', size: 400, data: { id: 'first-slot' } },
									{ type: 'leaf', size: 600, data: { id: 'second-slot' } },
								],
							},
						},
						sessions: [
							{ id: 'first-slot', resource: first.resource.toString(), sticky: true },
							{ id: 'second-slot', resource: second.resource.toString(), sticky: false },
						],
						active: 'first-slot',
					};
					storage.store('agentSessions.gridState', JSON.stringify(state), StorageScope.WORKSPACE, StorageTarget.MACHINE);
				}
				const { view, canvasService, layoutService, sessionsPartService } = createSessionsManagementService(first, disposables, provider, undefined, undefined, undefined, undefined, storage);
				disposables.add(canvasService.registerCanvas(upcastPartial<IWindowCanvasDescriptor>({ id: 'inbox' })));
				const restoring = view.restoreVisibleSessions();
				if (pendingCanvas) {
					canvasService.navigationRequest.set({ id: 'inbox', source: 'explicit' }, undefined);
				} else {
					await canvasService.openCanvas('inbox');
				}
				layoutService.setPartHidden(true, Parts.SESSIONS_PART);
				sessionsPartService.focusedSessions.length = 0;
				const navigation = view.navigationRequest.get();

				sessions = [first, second];
				sessionsChanged.fire({ added: sessions, removed: [], changed: [] });
				await restoring;
				const covered = {
					visible: layoutService.isVisible(Parts.SESSIONS_PART),
					sessions: view.slotPanes.get().map(pane => ({ id: pane.session.get()?.sessionId, sticky: pane.session.get() ? pane.sticky.get() : undefined })),
					active: activeSessionOf(view)?.sessionId,
					focused: [...sessionsPartService.focusedSessions],
					canvas: canvasService.navigationRequest.get()?.id,
					sameNavigation: view.navigationRequest.get() === navigation,
					restoreComplete: view.initialRestoreComplete.get(),
				};
				await view.openSession(first.resource, { source: 'sessionsList', preserveFocus: true });
				assert.deepStrictEqual({
					covered,
					returned: {
						visible: layoutService.isVisible(Parts.SESSIONS_PART),
						sessions: slotSessionsOf(view).map(session => session?.sessionId),
						focused: sessionsPartService.focusedSessions,
						canvas: canvasService.activeCanvasOpen.get(),
					},
				}, {
					covered: {
						visible: false, sessions: [{ id: 'first', sticky: true }, { id: 'second', sticky: false }],
						active: 'first', focused: [], canvas: 'inbox', sameNavigation: true, restoreComplete: true,
					},
					returned: { visible: true, sessions: ['first', 'second'], focused: [], canvas: undefined },
				});
			});
		}

		test('explicit side opening from a canvas preserves the session arrangement and preserve-focus option', async () => {
			const first = stubSession({ sessionId: 'first', providerId: 'test', status: constObservable(SessionStatus.Completed) });
			const second = stubSession({ sessionId: 'second', providerId: 'test', status: constObservable(SessionStatus.Completed) });
			const provider = new class extends TestSessionsProvider {
				override getSessions(): ISession[] { return [first, second]; }
			}(first);
			const { view, canvasService, sessionsPartService } = createSessionsManagementService(first, disposables, provider);
			disposables.add(canvasService.registerCanvas(upcastPartial<IWindowCanvasDescriptor>({ id: 'inbox' })));
			await view.openSession(first.resource);
			await canvasService.openCanvas('inbox');
			sessionsPartService.focusedSessions.length = 0;
			await view.openSessionToSide(second, { preserveFocus: true });
			const opened = {
				visible: slotSessionsOf(view).map(session => session?.sessionId),
				focused: [...sessionsPartService.focusedSessions],
			};
			await view.openPreviousSession();
			assert.deepStrictEqual({ opened, canvas: canvasService.activeCanvasOpen.get()?.id }, {
				opened: { visible: ['first', 'second'], focused: [] }, canvas: 'inbox',
			});
		});

		test('returning to new-session restores the existing draft', async () => {
			const folderUri = URI.file('/test/workspace');
			const workspace: ISessionWorkspace = {
				uri: folderUri, label: 'workspace', icon: Codicon.folder,
				folders: [{ root: folderUri, workingDirectory: folderUri, name: 'workspace', description: undefined }],
				requiresWorkspaceTrust: false, isVirtualWorkspace: false,
			};
			const session = stubSession({ sessionId: 'session', providerId: 'test', status: constObservable(SessionStatus.Completed) });
			const draft = stubSession({ sessionId: 'draft', providerId: 'test', status: constObservable(SessionStatus.Untitled), workspace: constObservable(workspace) });
			const provider = new class extends TestSessionsProvider {
				override resolveWorkspace(): ISessionWorkspace { return workspace; }
				override createNewSession(): ISession { return draft; }
			}(session);
			const { service, view, contextKeyService } = createSessionsManagementService(session, disposables, provider);

			await view.openNewSession({ folderUri });
			await view.openSession(session.resource);
			await view.openPreviousSession();

			assert.deepStrictEqual({
				active: activeSessionOf(view)?.sessionId,
				draftPreserved: service.newSession.get() === draft,
				canGoBack: contextKeyService.getContextKeyValue('sessionsCanGoBack'),
				canGoForward: contextKeyService.getContextKeyValue('sessionsCanGoForward'),
			}, { active: 'draft', draftPreserved: true, canGoBack: false, canGoForward: true });
		});
	});

	test('publishes navigation requests even when the empty composer is already active', async () => {
		const session = stubSession({ sessionId: 'session', providerId: 'test' });
		const { view } = createSessionsManagementService(session, disposables);
		const request = disposables.add(new CancellationTokenSource());
		const tokens: CancellationToken[] = [];
		disposables.add(autorun(reader => {
			const navigation = view.navigationRequest.read(reader);
			if (navigation) {
				tokens.push(navigation.token);
			}
		}));

		await view.openNewSession(undefined, request.token);
		await view.openNewSession();
		await view.openNewSession();

		assert.deepStrictEqual({ tokens, activeSession: activeSessionOf(view) }, {
			tokens: [request.token, CancellationToken.None, CancellationToken.None],
			activeSession: undefined,
		});
	});

	test('creating a composer draft preserves navigation while an explicit opening replaces it', async () => {
		const folderUri = URI.file('/test/workspace');
		const workspace: ISessionWorkspace = {
			uri: folderUri, label: 'workspace', icon: Codicon.vm,
			folders: [{ root: folderUri, workingDirectory: folderUri, name: 'workspace', description: undefined }],
			requiresWorkspaceTrust: false, isVirtualWorkspace: false,
		};
		const session = stubSession({
			sessionId: 'draft', providerId: 'test', workspace: constObservable(workspace), status: constObservable(SessionStatus.Untitled),
		});
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return workspace; }
		}(session);
		const { view } = createSessionsManagementService(session, disposables, provider);
		await view.openNewSession();
		const initialNavigation = view.navigationRequest.get();

		await view.openNewSession({ folderUri, preserveNavigation: true });
		const draftCreation = {
			sessionId: activeSessionOf(view)?.sessionId,
			preservedNavigation: view.navigationRequest.get() === initialNavigation,
		};
		await view.openNewSession();

		assert.deepStrictEqual({ draftCreation, explicitNavigation: view.navigationRequest.get() !== initialNavigation }, {
			draftCreation: { sessionId: 'draft', preservedNavigation: true },
			explicitNavigation: true,
		});
	});

	test('does not change active session when added session is not displayed in any widget', async () => {
		const originalSession = stubSession({ sessionId: 'original', providerId: 'test' });
		const onDidChangeSessions = disposables.add(new Emitter<ISessionChangeEvent>());
		const provider = new class extends TestSessionsProvider {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			constructor() { super(originalSession); }
		};

		const instantiationService = disposables.add(new TestInstantiationService());
		const chatWidgetService = new TestChatWidgetService();

		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
		instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
		instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
		instantiationService.stub(IChatWidgetService, chatWidgetService);
		instantiationService.stub(IProgressService, new TestProgressService());
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override readonly onDidSubmitRequest = Event.None;
		});

		const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
		const view = createView(instantiationService, service, disposables);

		// Open the original session so it becomes the active session
		await view.openSession(originalSession.resource);
		assert.strictEqual(activeSessionOf(view)?.sessionId, 'original');

		// A new session appears but is NOT displayed in any widget
		const otherSession = stubSession({ sessionId: 'other', providerId: 'test' });
		// Note: not calling chatWidgetService.setWidgetSessionResource()

		onDidChangeSessions.fire({ added: [otherSession], removed: [], changed: [] });

		// The active session should remain unchanged
		assert.strictEqual(activeSessionOf(view)?.sessionId, 'original');
	});

	test('getSessionForChatResource returns the session that owns the chat', () => {
		const chatA: IChat = { ...stubChat, resource: URI.parse('test:///chat-a') };
		const chatB: IChat = { ...stubChat, resource: URI.parse('test:///CHAT-B') };
		const sessionA = stubSession({
			sessionId: 'a',
			providerId: 'test',
			chats: constObservable([chatA]),
			mainChat: constObservable(chatA),
		});
		const sessionB = stubSession({
			sessionId: 'b',
			providerId: 'test',
			chats: constObservable([chatB]),
			mainChat: constObservable(chatB),
		});
		const provider = new class extends TestSessionsProvider {
			constructor() { super(sessionA); }
			override getSessions(): ISession[] { return [sessionA, sessionB]; }
		};
		const { service } = createSessionsManagementService(sessionA, disposables, provider);

		const ownedChat = service.getSessionForChatResource(URI.parse('test:///chat-b'));

		assert.deepStrictEqual({
			sessionId: ownedChat?.session.sessionId,
			chat: ownedChat?.chat,
			missing: service.getSessionForChatResource(URI.parse('test:///missing')),
		}, {
			sessionId: 'b',
			chat: chatB,
			missing: undefined,
		});
	});

	test('restoreVisibleSessions still waits for the session while a custom-view composer prepares', async () => {
		const targetSession = stubSession({ sessionId: 'target', providerId: 'test' });
		const onDidChangeSessions = disposables.add(new Emitter<ISessionChangeEvent>());

		let sessions: ISession[] = [];
		const provider = new class extends TestSessionsProvider {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			constructor() { super(targetSession); }
			override getSessions(): ISession[] { return sessions; }
		};

		const instantiationService = disposables.add(new TestInstantiationService());
		const chatWidgetService = new TestChatWidgetService();

		// Seed storage so the management service treats `targetSession` as the
		// last active session and tries to restore it on startup.
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(
			'agentSessions.activeSessionStates',
			JSON.stringify([{ sessionResource: targetSession.resource.toString(), visibleOrder: 0, isActive: true }]),
			1 /* StorageScope.WORKSPACE */,
			1 /* StorageTarget.MACHINE */,
		);

		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
		instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
		instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
		instantiationService.stub(IChatWidgetService, chatWidgetService);
		instantiationService.stub(IProgressService, new TestProgressService());
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override readonly onDidSubmitRequest = Event.None;
		});

		const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
		const view = createView(instantiationService, service, disposables);

		// At this point the provider does not yet know about the session
		// (mimicking an agent host provider whose cache has not loaded yet).
		const restorePromise = view.restoreVisibleSessions();
		await Promise.resolve();
		await view.openNewSession({ preserveCustomView: true });
		assert.deepStrictEqual({
			visible: slotSessionsOf(view).filter((s): s is NonNullable<typeof s> => !!s).map(s => s.sessionId),
			restoreComplete: view.initialRestoreComplete.get(),
		}, {
			visible: [],
			restoreComplete: false,
		});

		// Now the provider learns about the session and fires its change event.
		// `onDidChangeProviders` does NOT fire here — only the per-provider
		// session change event — so the fix must subscribe to it as well.
		sessions = [targetSession];
		onDidChangeSessions.fire({ added: [targetSession], removed: [], changed: [] });

		await restorePromise;
		assert.deepStrictEqual({
			visible: slotSessionsOf(view).map(s => s?.sessionId),
			restoreComplete: view.initialRestoreComplete.get(),
		}, {
			visible: [targetSession.sessionId],
			restoreComplete: true,
		});
	});

	test('ROUNDTRIP: opened session is retained across save + restore', async () => {
		const createdChat: IChat = { ...stubChat, resource: URI.parse('test:///chat-x'), status: constObservable(1) };
		const session = stubSession({
			sessionId: 'x',
			providerId: 'test',
			status: constObservable(1),
			chats: constObservable([createdChat]),
			mainChat: constObservable(createdChat),
		});

		const provider = new TestSessionsProvider(session);
		const storage = disposables.add(new InMemoryStorageService());

		const makeService = () => {
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stub(IStorageService, storage);
			instantiationService.stub(ILogService, new NullLogService());
			instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
			instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
			instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
			instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
			instantiationService.stub(IProgressService, new TestProgressService());
			instantiationService.stub(IChatService, new class extends mock<IChatService>() {
				override readonly onDidSubmitRequest = Event.None;
			});
			const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
			const view = createView(instantiationService, service, disposables);
			return { service, view };
		};

		// First window: open the session, then simulate shutdown (flush storage).
		const first = makeService();
		await first.view.openSession(session.resource);
		assert.strictEqual(activeSessionOf(first.view)?.sessionId, 'x');
		await storage.flush();

		// Second window: restore from persisted state.
		const second = makeService();
		await second.view.restoreVisibleSessions();

		assert.deepStrictEqual({
			visible: slotSessionsOf(second.view).map(s => s?.sessionId ?? null),
			active: activeSessionOf(second.view)?.sessionId ?? null,
		}, {
			visible: ['x'],
			active: 'x',
		});
	});

	test('RACE: a new session created during restore does not drop the restored session', async () => {
		const targetSession = stubSession({ sessionId: 'target', providerId: 'test' });
		const newSession = stubSession({ sessionId: 'fresh', providerId: 'test' });
		const onDidChangeSessions = disposables.add(new Emitter<ISessionChangeEvent>());

		let sessions: ISession[] = [];
		const provider = new class extends TestSessionsProvider {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			constructor() { super(targetSession); }
			override getSessions(): ISession[] { return sessions; }
			override createNewSession(): ISession { return newSession; }
			override resolveWorkspace(): ISessionWorkspace { return { folders: [], isVirtualWorkspace: false } as unknown as ISessionWorkspace; }
		};

		const storage = disposables.add(new InMemoryStorageService());
		storage.store(
			'agentSessions.activeSessionStates',
			JSON.stringify([{ sessionResource: targetSession.resource.toString(), visibleOrder: 0, isActive: true }]),
			1 /* StorageScope.WORKSPACE */,
			1 /* StorageTarget.MACHINE */,
		);

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
		instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
		instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
		instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
		instantiationService.stub(IProgressService, new TestProgressService());
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override readonly onDidSubmitRequest = Event.None;
		});
		const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
		const view = createView(instantiationService, service, disposables);

		// Restore starts but the provider has not yet surfaced the session.
		const restorePromise = view.restoreVisibleSessions();
		await Promise.resolve();

		// The new-chat widget eagerly creates a session for the restored
		// workspace folder while restore is still waiting for its session.
		service.createNewSession(URI.parse('file:///folder'));

		// The provider now surfaces the persisted session.
		sessions = [targetSession];
		onDidChangeSessions.fire({ added: [targetSession], removed: [], changed: [] });
		await restorePromise;

		assert.deepStrictEqual({
			hasTarget: slotSessionsOf(view).some(s => s?.sessionId === 'target'),
			active: activeSessionOf(view)?.sessionId ?? null,
		}, {
			hasTarget: true,
			active: 'target',
		});
	});

	test('RACE: an explicit new-session handoff cancels startup restoration', async () => {
		const targetSession = stubSession({ sessionId: 'target', providerId: 'test' });
		const newSession = stubSession({ sessionId: 'fresh', providerId: 'test' });
		const onDidChangeSessions = disposables.add(new Emitter<ISessionChangeEvent>());
		let sessions: ISession[] = [];
		const provider = new class extends TestSessionsProvider {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			constructor() { super(targetSession); }
			override getSessions(): ISession[] { return sessions; }
			override createNewSession(): ISession { return newSession; }
			override resolveWorkspace(): ISessionWorkspace {
				return { folders: [], requiresWorkspaceTrust: false, isVirtualWorkspace: false } as unknown as ISessionWorkspace;
			}
		};
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(
			'agentSessions.activeSessionStates',
			JSON.stringify([{ sessionResource: targetSession.resource.toString(), visibleOrder: 0, isActive: true }]),
			1 /* StorageScope.WORKSPACE */,
			1 /* StorageTarget.MACHINE */,
		);
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
		instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
		instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
		instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
		instantiationService.stub(IProgressService, new TestProgressService());
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override readonly onDidSubmitRequest = Event.None;
		});
		const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
		const view = createView(instantiationService, service, disposables);
		const restorePromise = view.restoreVisibleSessions();
		await Promise.resolve();

		await view.openNewSession({ folderUri: URI.file('/folder'), cancelRestore: true });
		sessions = [targetSession];
		onDidChangeSessions.fire({ added: [targetSession], removed: [], changed: [] });
		await restorePromise;

		assert.deepStrictEqual({
			hasTarget: slotSessionsOf(view).some(session => session?.sessionId === 'target'),
			active: activeSessionOf(view)?.sessionId,
		}, {
			hasTarget: false,
			active: 'fresh',
		});
	});

	test.skip('openNewSession inherits the active session workspace when requested', async () => {
		const makeWorkspace = (uri: URI): ISessionWorkspace => ({
			uri,
			label: 'ws',
			icon: Codicon.vm,
			folders: [{ root: uri, workingDirectory: uri, name: 'ws', description: undefined }],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		});

		const workspaceB = URI.parse('file:///workspaceB');
		const openSession = stubSession({ sessionId: 'open', providerId: 'test', workspace: constObservable(makeWorkspace(workspaceB)) });

		let createdFolderUri: URI | undefined;
		const provider = new class extends TestSessionsProvider {
			constructor() { super(openSession); }
			override getSessions(): ISession[] { return [openSession]; }
			override resolveWorkspace(folderUri?: URI): ISessionWorkspace { return makeWorkspace(folderUri!); }
			override createNewSession(folderUri?: URI): ISession {
				createdFolderUri = folderUri;
				return stubSession({ sessionId: 'inherited', providerId: 'test', workspace: constObservable(makeWorkspace(folderUri!)) });
			}
		};

		const { view } = createSessionsManagementService(openSession, disposables, provider);

		// Make the established session active.
		await view.openSession(openSession.resource);
		assert.strictEqual(activeSessionOf(view)?.sessionId, 'open');

		// Opening a new session view inherits the active session's workspace.
		view.openNewSession();

		assert.deepStrictEqual({
			createdFor: createdFolderUri?.toString() ?? null,
			activeSession: activeSessionOf(view)?.sessionId ?? null,
			activeWorkspace: activeSessionOf(view)?.workspace.get()?.folders[0]?.root.toString() ?? null,
		}, {
			createdFor: workspaceB.toString(),
			activeSession: 'inherited',
			activeWorkspace: workspaceB.toString(),
		});
	});

	test('openNewSession does not inherit the active session workspace by default', async () => {
		const workspaceB = URI.parse('file:///workspaceB');
		const openSession = stubSession({
			sessionId: 'open',
			providerId: 'test',
			workspace: constObservable({
				uri: workspaceB,
				label: 'ws',
				icon: Codicon.vm,
				folders: [{ root: workspaceB, workingDirectory: workspaceB, name: 'ws', description: undefined }],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: false,
			} satisfies ISessionWorkspace),
		});

		let createNewSessionCalled = false;
		const provider = new class extends TestSessionsProvider {
			constructor() { super(openSession); }
			override getSessions(): ISession[] { return [openSession]; }
			override createNewSession(): ISession {
				createNewSessionCalled = true;
				return openSession;
			}
		};

		const { view } = createSessionsManagementService(openSession, disposables, provider);

		await view.openSession(openSession.resource);
		assert.strictEqual(activeSessionOf(view)?.sessionId, 'open');

		// Without the inherit option, no new session is created from the active
		// session's workspace; the empty new-session view is shown instead.
		view.openNewSession();

		assert.deepStrictEqual({
			createNewSessionCalled,
			activeSession: activeSessionOf(view)?.sessionId ?? null,
		}, {
			createNewSessionCalled: false,
			activeSession: null,
		});
	});

	test('openNewSession restores a pending No workspace draft', async () => {
		const openSession = stubSession({ sessionId: 'open', providerId: 'test' });
		const quickChat = stubSession({
			sessionId: 'quick',
			providerId: 'test',
			isQuickChat: constObservable(true),
			workspace: constObservable(undefined),
		});
		const provider = new class extends TestSessionsProvider {
			override readonly supportsQuickChats = true;
			constructor() { super(openSession); }
			override createQuickChat(): ISession { return quickChat; }
		};
		const { service, view } = createSessionsManagementService(openSession, disposables, provider);

		service.createQuickChat();
		await view.openSession(openSession.resource);
		await view.openNewSession();

		assert.deepStrictEqual({
			pendingSession: service.newSession.get()?.sessionId,
			activeSession: activeSessionOf(view)?.sessionId,
			isQuickChat: activeSessionOf(view)?.isQuickChat?.get(),
		}, {
			pendingSession: 'quick',
			activeSession: 'quick',
			isQuickChat: true,
		});
	});

	test('canOpenSession grants a worktree trust from a trusted base repo before prompting', async () => {
		const repoRoot = URI.file('/repo');
		const worktree = URI.file('/repo.worktrees/feature');
		const session = stubSession({
			sessionId: 'wt-open',
			providerId: 'test',
			workspace: constObservable({
				uri: repoRoot,
				label: 'repo',
				icon: Codicon.vm,
				folders: [{
					root: repoRoot,
					workingDirectory: worktree,
					name: 'feature',
					description: undefined,
					gitRepository: { uri: repoRoot, workTreeUri: worktree, baseBranchName: undefined, gitHubInfo: constObservable(undefined) },
				}],
				requiresWorkspaceTrust: true,
				isVirtualWorkspace: false,
			} satisfies ISessionWorkspace),
		});

		// The user trusts the base repo but not the worktree itself.
		const trusted = new Set<string>([repoRoot.toString()]);
		const setUrisTrustCalls: string[][] = [];
		const trustManagement = new class extends TestWorkspaceTrustManagementService {
			override async getUriTrustInfo(uri: URI) { return { uri, trusted: trusted.has(uri.toString()) }; }
			override async setUrisTrust(uris: URI[], isTrusted: boolean) {
				setUrisTrustCalls.push(uris.map(uri => uri.toString()));
				if (isTrusted) { for (const uri of uris) { trusted.add(uri.toString()); } }
			}
		};
		const resourcesTrustUris: string[] = [];
		const trustRequest = new class extends mock<IWorkspaceTrustRequestService>() {
			override async requestResourcesTrust(options: ResourceTrustRequestOptions) { resourcesTrustUris.push(options.uri.toString()); return true; }
		};

		const { view } = createSessionsManagementService(session, disposables, new TestSessionsProvider(session), trustManagement, trustRequest);

		const canOpen = await view.canOpenSession(session);

		// Worktree trust is inherited (granted) from the trusted base repo before the
		// folder-trust check, so the open gate never prompts.
		assert.deepStrictEqual({
			canOpen,
			granted: setUrisTrustCalls,
			prompts: resourcesTrustUris,
		}, {
			canOpen: true,
			granted: [[worktree.toString()]],
			prompts: [],
		});
	});

	test('canOpenSession still prompts for a worktree when the base repo is untrusted', async () => {
		const repoRoot = URI.file('/repo-untrusted');
		const worktree = URI.file('/repo-untrusted.worktrees/feature');
		const session = stubSession({
			sessionId: 'wt-open-untrusted',
			providerId: 'test',
			workspace: constObservable({
				uri: repoRoot,
				label: 'repo',
				icon: Codicon.vm,
				folders: [{
					root: repoRoot,
					workingDirectory: worktree,
					name: 'feature',
					description: undefined,
					gitRepository: { uri: repoRoot, workTreeUri: worktree, baseBranchName: undefined, gitHubInfo: constObservable(undefined) },
				}],
				requiresWorkspaceTrust: true,
				isVirtualWorkspace: false,
			} satisfies ISessionWorkspace),
		});

		// Nothing is trusted: no inheritance, so the worktree must be prompted for
		// and the declined open is refused.
		const setUrisTrustCalls: string[][] = [];
		const trustManagement = new class extends TestWorkspaceTrustManagementService {
			override async getUriTrustInfo(uri: URI) { return { uri, trusted: false }; }
			override async setUrisTrust(uris: URI[]) { setUrisTrustCalls.push(uris.map(uri => uri.toString())); }
		};
		const resourcesTrustUris: string[] = [];
		const trustRequest = new class extends mock<IWorkspaceTrustRequestService>() {
			override async requestResourcesTrust(options: ResourceTrustRequestOptions) { resourcesTrustUris.push(options.uri.toString()); return false; }
		};

		const { view } = createSessionsManagementService(session, disposables, new TestSessionsProvider(session), trustManagement, trustRequest);

		const canOpen = await view.canOpenSession(session);

		assert.deepStrictEqual({
			canOpen,
			granted: setUrisTrustCalls,
			prompts: resourcesTrustUris,
		}, {
			canOpen: false,
			granted: [],
			prompts: [worktree.toString()],
		});
	});

	suite('remote agent environment trust prompt', () => {
		const folder = URI.file('/remote/project');
		const makeWorkspace = (group: string | undefined): ISessionWorkspace => ({
			uri: folder,
			label: 'project',
			group,
			icon: Codicon.remote,
			folders: [{ root: folder, workingDirectory: folder, name: 'project', description: undefined }],
			requiresWorkspaceTrust: true,
			isVirtualWorkspace: false,
		});

		async function requestOpenTrust(group: string | undefined, providerId: string, via: 'canOpenSession' | 'openNewSession'): Promise<(string | undefined)[]> {
			const workspace = makeWorkspace(group);
			const session = stubSession({ sessionId: 'remote-open', providerId, workspace: constObservable(workspace) });
			const provider = new class extends TestSessionsProvider {
				constructor() { super(session); }
				override resolveWorkspace(): ISessionWorkspace { return workspace; }
			};
			const trustManagement = new class extends TestWorkspaceTrustManagementService {
				override async getUriTrustInfo(uri: URI) { return { uri, trusted: false }; }
			};
			const requests: ResourceTrustRequestOptions[] = [];
			const trustRequest = new class extends mock<IWorkspaceTrustRequestService>() {
				override async requestResourcesTrust(options: ResourceTrustRequestOptions) { requests.push(options); return false; }
			};
			const { view } = createSessionsManagementService(session, disposables, provider, trustManagement, trustRequest);
			if (via === 'canOpenSession') {
				await view.canOpenSession(session);
			} else {
				await view.openNewSession({ folderUri: folder });
			}
			return requests.map(request => request.remoteHostLabel);
		}

		test('identifies the provider when opening a session', async () => {
			assert.deepStrictEqual(await requestOpenTrust(SESSION_WORKSPACE_GROUP_REMOTE, 'test', 'canOpenSession'), ['Test']);
		});

		test('identifies the provider when creating a new session', async () => {
			assert.deepStrictEqual(await requestOpenTrust(SESSION_WORKSPACE_GROUP_REMOTE, 'test', 'openNewSession'), ['Test']);
		});

		test('falls back to a generic label when the provider is unknown', async () => {
			assert.deepStrictEqual(await requestOpenTrust(SESSION_WORKSPACE_GROUP_REMOTE, 'missing', 'canOpenSession'), ['Remote Agent Environment']);
		});

		test('does not identify a remote environment for a local folder', async () => {
			assert.deepStrictEqual(await requestOpenTrust(undefined, 'test', 'canOpenSession'), [undefined]);
		});
	});

	test('cancelled openNewSession does not replace a newer draft after workspace trust resolves', async () => {
		const staleFolder = URI.file('/stale');
		const latestFolder = URI.file('/latest');
		const makeWorkspace = (uri: URI): ISessionWorkspace => ({
			uri,
			label: uri.path,
			icon: Codicon.folder,
			folders: [{ root: uri, workingDirectory: uri, name: uri.path, description: undefined }],
			requiresWorkspaceTrust: true,
			isVirtualWorkspace: false,
		});
		const staleSession = stubSession({ sessionId: 'stale', providerId: 'test', workspace: constObservable(makeWorkspace(staleFolder)) });
		const latestSession = stubSession({ sessionId: 'latest', providerId: 'test', workspace: constObservable(makeWorkspace(latestFolder)) });
		const createdFolders: string[] = [];
		const provider = new class extends TestSessionsProvider {
			constructor() { super(latestSession); }
			override resolveWorkspace(folderUri: URI): ISessionWorkspace { return makeWorkspace(folderUri); }
			override createNewSession(folderUri: URI): ISession {
				createdFolders.push(folderUri.toString());
				return folderUri.toString() === staleFolder.toString() ? staleSession : latestSession;
			}
		};
		const staleTrust = new DeferredPromise<boolean>();
		let trustRequestCount = 0;
		const trustRequestService = new class extends mock<IWorkspaceTrustRequestService>() {
			override requestResourcesTrust(): Promise<boolean> {
				trustRequestCount++;
				return trustRequestCount === 1 ? staleTrust.p : Promise.resolve(true);
			}
		};
		const { view } = createSessionsManagementService(
			latestSession,
			disposables,
			provider,
			new TestWorkspaceTrustManagementService(),
			trustRequestService,
		);
		const staleCts = disposables.add(new CancellationTokenSource());

		const staleOpen = view.openNewSession({ folderUri: staleFolder }, staleCts.token);
		await Promise.resolve();
		staleCts.cancel();
		const latestResult = await view.openNewSession({ folderUri: latestFolder });
		staleTrust.complete(true);
		const staleResult = await staleOpen;

		assert.deepStrictEqual({
			createdFolders,
			activeSessionId: activeSessionOf(view)?.sessionId,
			latestSessionId: latestResult.session?.sessionId,
			staleSessionId: staleResult.session?.sessionId,
		}, {
			createdFolders: [latestFolder.toString()],
			activeSessionId: 'latest',
			latestSessionId: 'latest',
			staleSessionId: undefined,
		});
	});

	test.skip('openNewSession recreates a draft for the active session workspace when inheriting', async () => {
		const makeWorkspace = (uri: URI): ISessionWorkspace => ({
			uri,
			label: 'ws',
			icon: Codicon.vm,
			folders: [{ root: uri, workingDirectory: uri, name: 'ws', description: undefined }],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		});

		const workspaceA = URI.parse('file:///workspaceA');
		const openSession = stubSession({ sessionId: 'open', providerId: 'test', workspace: constObservable(makeWorkspace(workspaceA)) });
		const pendingSession = stubSession({ sessionId: 'pending', providerId: 'test', workspace: constObservable(makeWorkspace(workspaceA)) });

		let createNewSessionCount = 0;
		const provider = new class extends TestSessionsProvider {
			constructor() { super(openSession); }
			override getSessions(): ISession[] { return [openSession]; }
			override resolveWorkspace(folderUri?: URI): ISessionWorkspace { return makeWorkspace(folderUri!); }
			override createNewSession(): ISession {
				createNewSessionCount++;
				return pendingSession;
			}
		};

		const { view } = createSessionsManagementService(openSession, disposables, provider);

		// Compose an in-progress new session (pending draft) for workspace A.
		view.openNewSession({ folderUri: workspaceA });
		assert.strictEqual(activeSessionOf(view)?.sessionId, 'pending');

		// Navigate to the established session, which shares workspace A.
		await view.openSession(openSession.resource);
		assert.strictEqual(activeSessionOf(view)?.sessionId, 'open');

		// Opening a new session view inherits workspace A and always creates a
		// fresh draft for it (no workspace de-duplication).
		view.openNewSession();

		assert.deepStrictEqual({
			createNewSessionCount,
			activeSession: activeSessionOf(view)?.sessionId ?? null,
		}, {
			createNewSessionCount: 2,
			activeSession: 'pending',
		});
	});

	test('restoreVisibleSessions restores the grid order, sticky and active state', async () => {
		const sessionA = stubSession({ sessionId: 'a', providerId: 'test' });
		const sessionB = stubSession({ sessionId: 'b', providerId: 'test' });
		const sessionC = stubSession({ sessionId: 'c', providerId: 'test' });
		const sessions = [sessionA, sessionB, sessionC];

		const provider = new class extends TestSessionsProvider {
			constructor() { super(sessionA); }
			override getSessions(): ISession[] { return sessions; }
		};

		const instantiationService = disposables.add(new TestInstantiationService());
		const storage = disposables.add(new InMemoryStorageService());
		// Persisted grid: [A (sticky), B (active), C]
		storage.store(
			'agentSessions.activeSessionStates',
			JSON.stringify([
				{ sessionResource: sessionA.resource.toString(), visibleOrder: 0, isSticky: true, isActive: false },
				{ sessionResource: sessionB.resource.toString(), visibleOrder: 1, isSticky: false, isActive: true },
				{ sessionResource: sessionC.resource.toString(), visibleOrder: 2, isSticky: false, isActive: false },
			]),
			1 /* StorageScope.WORKSPACE */,
			1 /* StorageTarget.MACHINE */,
		);

		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
		instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
		instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
		instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
		instantiationService.stub(IProgressService, new TestProgressService());
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override readonly onDidSubmitRequest = Event.None;
		});

		const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
		const view = createView(instantiationService, service, disposables);

		await view.restoreVisibleSessions();

		assert.deepStrictEqual({
			visible: slotSessionsOf(view).map(s => s?.sessionId ?? null),
			sticky: view.slotPanes.get().map(pane => pane.sticky.get()),
			active: activeSessionOf(view)?.sessionId,
		}, {
			visible: ['a', 'b', 'c'],
			sticky: [true, false, false],
			active: 'b',
		});
	});

	for (const { timing, preserveCustomView } of [
		{ timing: 'before', preserveCustomView: false },
		{ timing: 'during', preserveCustomView: false },
		{ timing: 'during', preserveCustomView: true },
	] as const) {
		test(`restoreVisibleSessions ${preserveCustomView ? 'does not surface the hidden' : 'retains the visible'} workspace draft created ${timing} startup restoration`, async () => {
			const folderUri = URI.file('/project');
			const workspace: ISessionWorkspace = {
				uri: folderUri,
				label: 'project',
				icon: Codicon.folder,
				folders: [{ root: folderUri, workingDirectory: folderUri, name: 'project', description: undefined }],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: false,
			};
			const draft = stubSession({
				sessionId: 'workspace-draft',
				providerId: 'test',
				status: constObservable(SessionStatus.Untitled),
				workspace: constObservable(workspace),
			});
			const requests: { sessionId: string; chatResource: URI; query: string }[] = [];
			const provider = new class extends TestSessionsProvider {
				override getSessions(): ISession[] { return []; }
				override resolveWorkspace(): ISessionWorkspace { return workspace; }
				override async sendRequest(sessionId: string, chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
					requests.push({ sessionId, chatResource, query: options.query });
					return draft;
				}
			}(draft);
			const { service, view } = createSessionsManagementService(draft, disposables, provider);
			let restoring: Promise<void> | undefined;
			if (timing === 'during') {
				restoring = view.restoreVisibleSessions();
			}
			await view.openNewSession({ folderUri, preserveNavigation: true, preserveCustomView });
			await (restoring ?? view.restoreVisibleSessions());

			const active = activeSessionOf(view);
			const restored = {
				visible: slotSessionsOf(view).map(session => session?.sessionId),
				active: active?.sessionId,
				workspace: active?.workspace.get(),
				pending: service.newSession.get()?.sessionId,
				restoreComplete: view.initialRestoreComplete.get(),
			};
			if (!preserveCustomView && active) {
				await service.sendNewChatRequest(active, { query: 'hello' });
			}

			assert.deepStrictEqual({ restored, requests }, {
				restored: {
					visible: [preserveCustomView ? undefined : draft.sessionId],
					active: preserveCustomView ? undefined : draft.sessionId,
					workspace: preserveCustomView ? undefined : workspace,
					pending: draft.sessionId,
					restoreComplete: true,
				},
				requests: preserveCustomView ? [] : [{ sessionId: draft.sessionId, chatResource: draft.mainChat.get().resource, query: 'hello' }],
			});
		});
	}

	test('restoreVisibleSessions prepares only the active session', async () => {
		const session = stubSession({
			sessionId: 'remote',
			providerId: 'test',
		});
		const preparations: { sessionId: string; reason: string }[] = [];
		const provider = new class extends TestSessionsProvider {
			override async prepareSessionForOpen(preparedSession: ISession, reason: 'open' | 'restore'): Promise<void> {
				preparations.push({ sessionId: preparedSession.sessionId, reason });
			}
		}(session);

		const instantiationService = disposables.add(new TestInstantiationService());
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(
			'agentSessions.activeSessionStates',
			JSON.stringify([{ sessionResource: session.resource.toString(), visibleOrder: 0, isSticky: false, isActive: true }]),
			1 /* StorageScope.WORKSPACE */,
			1 /* StorageTarget.MACHINE */,
		);

		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
		instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
		instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
		instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
		instantiationService.stub(IProgressService, new TestProgressService());
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override readonly onDidSubmitRequest = Event.None;
		});

		const managementService = disposables.add(instantiationService.createInstance(SessionsManagementService));
		const view = createView(instantiationService, managementService, disposables);
		await view.restoreVisibleSessions();

		assert.deepStrictEqual({
			active: activeSessionOf(view)?.sessionId,
			preparations,
		}, {
			active: 'remote',
			preparations: [{ sessionId: 'remote', reason: 'restore' }],
		});
	});

	for (const sideChat of [false, true]) {
		test(`explicitly reopening the active ${sideChat ? 'side chat' : 'session'} reaches its mounted chat view`, async () => {
			const main = { ...stubChat, resource: URI.parse('test:///session/main'), status: constObservable(SessionStatus.Completed) };
			const side = { ...stubChat, resource: URI.parse('test:///session/side'), status: constObservable(SessionStatus.Completed), origin: { kind: ChatOriginKind.SideChat, parentChat: main.resource } };
			const session = stubSession({
				sessionId: 'session', providerId: 'test', status: constObservable(SessionStatus.Completed),
				mainChat: constObservable(main), chats: constObservable([main, side]),
			});
			const { view, sessionsPartService } = createSessionsManagementService(session, disposables);
			await view.openSession(session.resource);
			if (sideChat) {
				await view.openChat(session, side.resource);
			}
			const activePane = view.activePane.get();
			const reopened: { resource: string; selected: string | undefined }[] = [];
			sessionsPartService.sessionViews.set(session.sessionId, upcastPartial<SessionView>({
				reopenChat: async resource => {
					reopened.push({ resource: resource.toString(), selected: activeChatOf(view)?.resource.toString() });
				},
			}));

			if (sideChat) {
				await view.openChat(session, side.resource);
			} else {
				await view.openSession(session.resource);
			}

			const resource = (sideChat ? side : main).resource.toString();
			assert.deepStrictEqual({ sameActivePane: view.activePane.get() === activePane, reopened }, {
				sameActivePane: true, reopened: [{ resource, selected: resource }],
			});
		});
	}

	test('openSession activates before awaiting provider preparation', async () => {
		const active = stubSession({ sessionId: 'active', providerId: 'test' });
		const target = stubSession({ sessionId: 'target', providerId: 'test' });
		const preparation = new DeferredPromise<void>();
		const provider = new class extends TestSessionsProvider {
			override getSessions(): ISession[] { return [active, target]; }
			override prepareSessionForOpen(session: ISession, reason: 'open' | 'restore'): Promise<void> {
				return session === target && reason === 'open' ? preparation.p : Promise.resolve();
			}
		}(active);
		const { view } = createSessionsManagementService(active, disposables, provider);

		await view.openSession(active.resource);
		const opening = view.openSession(target.resource);
		await timeout(0);
		const activeBeforePreparation = activeSessionOf(view)?.sessionId;
		preparation.complete();
		await opening;

		assert.deepStrictEqual({
			activeBeforePreparation,
			activeAfterPreparation: activeSessionOf(view)?.sessionId,
		}, {
			activeBeforePreparation: 'target',
			activeAfterPreparation: 'target',
		});
	});

	test('provider preparation cannot reclaim the active session after navigation', async () => {
		const target = stubSession({ sessionId: 'target', providerId: 'test' });
		const next = stubSession({ sessionId: 'next', providerId: 'test' });
		const preparation = new DeferredPromise<void>();
		const provider = new class extends TestSessionsProvider {
			override getSessions(): ISession[] { return [target, next]; }
			override prepareSessionForOpen(session: ISession): Promise<void> {
				return session === target ? preparation.p : Promise.resolve();
			}
		}(target);
		const { view } = createSessionsManagementService(target, disposables, provider);
		const opening = view.openSession(target.resource);
		await timeout(0);
		const duringPreparation = activeSessionOf(view)?.sessionId;
		await view.openSession(next.resource);
		preparation.complete();
		await opening;
		assert.deepStrictEqual({ duringPreparation, afterNavigation: activeSessionOf(view)?.sessionId }, {
			duringPreparation: 'target', afterNavigation: 'next',
		});
	});

	test('openSessionToSide prepares the provider when selecting the main chat', async () => {
		const active = stubSession({ sessionId: 'active', providerId: 'test' });
		const targetMain = { ...stubChat, resource: URI.parse('test:///target/main'), title: constObservable('Main') };
		const targetSide = { ...stubChat, resource: URI.parse('test:///target/side'), title: constObservable('Side'), origin: { kind: ChatOriginKind.SideChat, parentChat: targetMain.resource } };
		const target = stubSession({
			sessionId: 'target',
			providerId: 'test',
			chats: constObservable([targetMain, targetSide]),
			mainChat: constObservable(targetMain),
			capabilities: constObservable({ supportsMultipleChats: true }),
		});
		const preparations: { sessionId: string; reason: string }[] = [];
		const provider = new class extends TestSessionsProvider {
			override getSessions(): ISession[] { return [active, target]; }
			override async prepareSessionForOpen(session: ISession, reason: 'open' | 'restore'): Promise<void> {
				preparations.push({ sessionId: session.sessionId, reason });
			}
		}(active);
		const { view } = createSessionsManagementService(active, disposables, provider);

		await view.openSession(target.resource);
		await view.openChat(target, targetSide.resource);
		await view.openSession(active.resource);
		preparations.length = 0;
		await view.openSessionToSide(target, { forceMainChat: true });

		assert.deepStrictEqual({
			active: activeSessionOf(view)?.sessionId,
			activeChat: activeChatOf(view)?.resource.toString(),
			preparations,
		}, {
			active: 'target',
			activeChat: targetMain.resource.toString(),
			preparations: [{ sessionId: 'target', reason: 'open' }],
		});
	});

	test('opening the main chat to the side of its already visible session keeps the peer active until the split opens', async () => {
		const main = { ...stubChat, resource: URI.parse('test:///session/main') };
		const peer = { ...stubChat, resource: URI.parse('test:///session/peer') };
		const session = stubSession({
			sessionId: 'session',
			providerId: 'test',
			chats: constObservable([main, peer]),
			mainChat: constObservable(main),
		});
		const { view, sessionsPartService } = createSessionsManagementService(session, disposables);
		await view.openChat(session, peer.resource);
		const openedToSide: string[] = [];
		sessionsPartService.sessionViews.set(session.sessionId, upcastPartial<SessionView>({
			openChatToSide: async resource => { openedToSide.push(resource.toString()); },
		}));

		await view.openSessionToSide(session, { forceMainChat: true });

		assert.deepStrictEqual({
			visible: slotSessionsOf(view).map(candidate => candidate?.sessionId),
			activeChat: activeChatOf(view)?.resource.toString(),
			openedToSide,
		}, {
			visible: [session.sessionId],
			activeChat: peer.resource.toString(),
			openedToSide: [main.resource.toString()],
		});
	});

	test('batch side-opening keeps a visible primary session in place and splits its main chat beside the peer', async () => {
		const main = { ...stubChat, resource: URI.parse('test:///session/main') };
		const peer = { ...stubChat, resource: URI.parse('test:///session/peer') };
		const session = stubSession({ sessionId: 'session', providerId: 'test', mainChat: constObservable(main), chats: constObservable([main, peer]) });
		const neighbor = stubSession({ sessionId: 'neighbor', providerId: 'test' });
		const added = stubSession({ sessionId: 'added', providerId: 'test' });
		const provider = new class extends TestSessionsProvider {
			override getSessions() { return [session, neighbor, added]; }
		}(session);
		const { view, sessionsPartService } = createSessionsManagementService(session, disposables, provider);
		await view.openSessionsInGrid([session, neighbor]);
		await view.openChat(session, peer.resource);
		const openedToSide: string[] = [];
		sessionsPartService.sessionViews.set(session.sessionId, upcastPartial<SessionView>({
			openChatToSide: async resource => { openedToSide.push(resource.toString()); },
		}));

		await view.openSessionsAt([added, session], neighbor.sessionId, 'right', { activate: 'last', forceMainChat: true });

		assert.deepStrictEqual({
			visible: slotSessionsOf(view).map(candidate => candidate?.sessionId),
			active: activeSessionOf(view)?.sessionId,
			activeChat: activeChatOf(view)?.resource.toString(),
			openedToSide,
		}, {
			visible: [session.sessionId, neighbor.sessionId, added.sessionId],
			active: session.sessionId,
			activeChat: peer.resource.toString(),
			openedToSide: [main.resource.toString()],
		});
	});

	for (const side of [false, true]) {
		for (const alreadyActive of [false, true]) {
			test(`${side ? 'side' : 'direct'} chat opening records the initial resolution before activation (already active: ${alreadyActive})`, async () => {
				await runWithFakedTimers({ useFakeTimers: true, startTime: 1_000 }, async () => {
					const events: { name: string | undefined; data: unknown }[] = [];
					const telemetry = new class extends NullTelemetryServiceShape {
						override publicLog2(name?: string, data?: unknown): void { events.push({ name, data }); }
					};
					const openTelemetry = disposables.add(new SessionOpenTelemetryService(telemetry));
					const active = stubSession({ sessionId: 'active', providerId: 'test' });
					const peer = { ...stubChat, resource: URI.parse('test:///target/peer') };
					const target = stubSession({ sessionId: 'target', providerId: 'test', chats: constObservable([stubChat, peer]) });
					const provider = new class extends TestSessionsProvider {
						override getSessions() { return [active, target]; }
					}(active);
					const { view } = createSessionsManagementService(active, disposables, provider, undefined, undefined, undefined, undefined, undefined, openTelemetry);
					view.showSession(alreadyActive ? target.resource : active.resource);
					openTelemetry.modelBound(target.resource, peer.resource);

					if (side) {
						await view.openSessionToSide(target, { source: 'link', chatResource: peer.resource });
					} else {
						await view.openChat(target, peer.resource, { source: 'link' });
					}

					assert.deepStrictEqual(events, [{
						name: 'agents/sessionOpen',
						data: {
							outcome: 'success', source: 'link', provider: 'other', alreadyActive, sessionWasLoading: false,
							modelAlreadyBound: true, resourceResolvedDurationMs: 0, sessionLoadedDurationMs: 0,
							modelBoundDurationMs: 0, totalDurationMs: 0,
						},
					}]);
				});
			});
		}
	}

	test('restoreVisibleSessions lays out the grid atomically without intermediate single-session states', async () => {
		const sessionA = stubSession({ sessionId: 'a', providerId: 'test' });
		const sessionB = stubSession({ sessionId: 'b', providerId: 'test' });
		const sessions = [sessionA, sessionB];

		const provider = new class extends TestSessionsProvider {
			constructor() { super(sessionA); }
			override getSessions(): ISession[] { return sessions; }
		};

		const instantiationService = disposables.add(new TestInstantiationService());
		const storage = disposables.add(new InMemoryStorageService());
		// Persisted grid: [A, B (active)] — the active session is NOT the
		// left-most one, which used to surface B alone before A was inserted.
		storage.store(
			'agentSessions.activeSessionStates',
			JSON.stringify([
				{ sessionResource: sessionA.resource.toString(), visibleOrder: 0, isSticky: false, isActive: false },
				{ sessionResource: sessionB.resource.toString(), visibleOrder: 1, isSticky: false, isActive: true },
			]),
			1 /* StorageScope.WORKSPACE */,
			1 /* StorageTarget.MACHINE */,
		);

		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
		instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
		instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
		instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
		instantiationService.stub(IProgressService, new TestProgressService());
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override readonly onDidSubmitRequest = Event.None;
		});

		const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
		const view = createView(instantiationService, service, disposables);

		// Record every grid state published while restoring.
		const states: (string | null)[][] = [];
		disposables.add(autorun(reader => {
			states.push(slotSessionsOf(view, reader).map(s => s?.sessionId ?? null));
		}));

		await view.restoreVisibleSessions();

		// The grid must never go through a state showing only the active
		// session 'b' on its own — that intermediate layout is the flicker.
		const showedActiveAlone = states.some(s => s.length === 1 && s[0] === 'b');

		assert.deepStrictEqual({
			showedActiveAlone,
			final: slotSessionsOf(view).map(s => s?.sessionId ?? null),
			active: activeSessionOf(view)?.sessionId,
		}, {
			showedActiveAlone: false,
			final: ['a', 'b'],
			active: 'b',
		});
	});

	test('sendNewChatRequest keeps the started session active for a foreground send', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const { service, view } = createSessionsManagementService(session, disposables);

		// Open the session so it becomes the active session.
		await view.openSession(session.resource);
		assert.strictEqual(activeSessionOf(view)?.sessionId, 's1');

		// A foreground new-chat send keeps the started session active (the view
		// follows the send and never resets the active slot).
		await service.sendNewChatRequest(session, { query: 'hi' });
		assert.strictEqual(activeSessionOf(view)?.sessionId, 's1');
	});

	test('forwards prompts and session references unchanged without special troubleshoot augmentation', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 'session',
			providerId: 'test',
			resource: URI.from({ scheme: COPILOT_CLI_LOCAL_AH_SCHEME, path: '/session' }),
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const sent: ISendRequestOptions[] = [];
		const provider = new class extends TestSessionsProvider {
			override async sendRequest(_sessionId: string, _chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
				sent.push(options);
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);
		const attachment = { kind: 'sessionReference' as const, id: 'target', name: 'Target', value: URI.parse('agent-host-copilotcli:/target') };
		const requests: ISendRequestOptions[] = ['/troubleshoot', 'Compare #session:Target', '/troubleshoot-flaky-tests build'].map(query => ({ query, attachedContext: [attachment] }));
		for (const options of requests) {
			await service.sendRequest(session, chat, options);
		}
		assert.deepStrictEqual(sent, requests);
	});

	for (const newSession of [true, false]) {
		test(`${newSession ? 'new session' : 'peer chat'} forwards the exact response observer through management`, async () => {
			const session = stubSession({ sessionId: 'observer', providerId: 'test' });
			const onDidCreateResponse: NonNullable<ISendRequestOptions['onDidCreateResponse']> = () => { };
			const observers: ISendRequestOptions['onDidCreateResponse'][] = [];
			const provider = new class extends TestSessionsProvider {
				override async sendRequest(_sessionId: string, _chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
					observers.push(options.onDidCreateResponse);
					return session;
				}
			}(session);
			const { service } = createSessionsManagementService(session, disposables, provider);
			const options = { query: 'test', onDidCreateResponse };
			if (newSession) {
				await service.sendNewChatRequest(session, options);
			} else {
				await service.sendRequest(session, session.mainChat.get(), options);
			}
			assert.deepStrictEqual(observers, [onDidCreateResponse]);
		});
	}

	for (const isolation of ['worktree', 'folder'] as const) {
		for (const sendKind of ['foreground', 'background', 'headless'] as const) {
			test(`${sendKind} new session captures ${isolation} configuration before the draft is replaced`, async () => {
				const session = stubSession({ sessionId: 'draft', providerId: 'test', status: constObservable(SessionStatus.Untitled) });
				const committed = { ...session, sessionId: 'committed', status: constObservable(SessionStatus.InProgress) };
				const newSessionConfig = { isolation, providerConfig: { branch: 'main', providerOption: { enabled: true } } };
				const configuration = new DeferredPromise<void>();
				const capturing = new DeferredPromise<void>();
				const calls: string[] = [];
				const provider = new class extends TestSessionsProvider {
					override resolveWorkspace(folder: URI): ISessionWorkspace {
						return { uri: folder, label: 'repo', icon: Codicon.folder, folders: [], requiresWorkspaceTrust: false, isVirtualWorkspace: false };
					}
					override async getNewSessionConfig(sessionId: string) {
						calls.push(`capture:${sessionId}`);
						await capturing.complete();
						await configuration.p;
						return newSessionConfig;
					}
					override async prepareNewSession() {
						calls.push('prepare');
						return { session: { ...session, sessionId: 'prepared' } };
					}
					override async sendRequest(): Promise<ISession> {
						calls.push('send');
						return committed;
					}
				}(session);
				const { service } = createSessionsManagementService(session, disposables, provider);
				if (sendKind !== 'headless') {
					service.createNewSession(URI.file('/repo'), { providerId: provider.id });
				}
				const sent = Event.toPromise(service.onDidSendRequest);
				const options = { query: 'hi', background: sendKind === 'background' };
				const sending = sendKind === 'headless'
					? service.createAndSendNewChatRequest(URI.file('/repo'), options, { providerId: provider.id })
					: service.sendNewChatRequest(session, options);
				await capturing.p;
				const beforeConfiguration = [...calls];
				await configuration.complete();
				await sending;
				const event = await sent;

				assert.deepStrictEqual({
					beforeConfiguration, calls,
					session: event.session, newSessionConfig: event.newSessionConfig,
					isNewSession: event.isNewSession, sameOptions: event.options === options,
				}, {
					beforeConfiguration: ['capture:draft'],
					calls: sendKind === 'headless' ? ['capture:draft', 'send'] : ['capture:draft', 'prepare', 'send'],
					session: committed, newSessionConfig,
					isNewSession: true, sameOptions: true,
				});
			});
		}
	}

	test('sendNewChatRequest routes a prepared draft through its replacement provider', async () => {
		const folder = URI.file('/workspace');
		const workspace: ISessionWorkspace = {
			uri: folder,
			label: 'Workspace',
			icon: Codicon.vm,
			folders: [{ root: folder, workingDirectory: folder, name: 'Workspace', description: undefined }],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		};
		const originalStatus = observableValue('originalStatus', SessionStatus.Untitled);
		const originalRequestInProgress = observableValue('originalRequestInProgress', false);
		const originalChat: IChat = { ...stubChat, status: originalStatus };
		const original = stubSession({
			sessionId: 'local-draft',
			providerId: 'local',
			status: originalStatus,
			isNewSessionRequestInProgress: originalRequestInProgress,
			chats: constObservable([originalChat]),
			mainChat: constObservable(originalChat),
			workspace: constObservable(workspace),
		});
		const replacementStatus = observableValue('replacementStatus', SessionStatus.Untitled);
		const replacementRequestInProgress = observableValue('replacementRequestInProgress', false);
		const replacementChat: IChat = { ...stubChat, resource: URI.parse('dev:///chat'), status: replacementStatus };
		const replacement = stubSession({
			sessionId: 'dev-draft',
			providerId: 'dev',
			status: replacementStatus,
			isNewSessionRequestInProgress: replacementRequestInProgress,
			chats: constObservable([replacementChat]),
			mainChat: constObservable(replacementChat),
			workspace: constObservable(workspace),
		});
		const preparation = new DeferredPromise<void>();
		let preparedQuery: string | undefined;
		const deleted: string[] = [];
		const originalProvider = new class extends TestSessionsProvider {
			override readonly id = 'local';
			constructor() { super(original); }
			override resolveWorkspace(): ISessionWorkspace { return workspace; }
			override createNewSession(): ISession { return original; }
			override startNewSessionRequest() {
				originalRequestInProgress.set(true, undefined);
				return toDisposable(() => originalRequestInProgress.set(false, undefined));
			}
			override async prepareNewSession(_sessionId: string, _token: CancellationToken, query: string) {
				preparedQuery = query;
				await preparation.p;
				return { session: replacement };
			}
			override deleteNewSession(sessionId: string): void { deleted.push(sessionId); }
		}();
		const sent: string[] = [];
		const replacementProvider = new class extends TestSessionsProvider {
			override readonly id = 'dev';
			constructor() { super(replacement); }
			override startNewSessionRequest() {
				replacementRequestInProgress.set(true, undefined);
				return toDisposable(() => replacementRequestInProgress.set(false, undefined));
			}
			override async createNewChat(): Promise<IChat> {
				sent.push('createNewChat');
				return replacementChat;
			}
			override async sendRequest(sessionId: string): Promise<ISession> {
				sent.push(`sendRequest:${sessionId}`);
				return replacement;
			}
		}();
		const { service, view } = createSessionsManagementService(original, disposables, [originalProvider, replacementProvider]);
		service.createNewSession(folder, { providerId: originalProvider.id, sessionTypeId: 'test' });
		await view.openSession(original.resource);
		const replacements: string[] = [];
		disposables.add(service.onDidReplaceNewDraftSession(({ from, to }) => replacements.push(`${from.sessionId}->${to.sessionId}`)));

		const send = service.sendNewChatRequest(original, { query: 'hi' });
		assert.deepStrictEqual({
			statusDuringPreparation: original.status.get(),
			requestInProgressDuringPreparation: original.isNewSessionRequestInProgress?.get(),
			activeSessionDuringPreparation: activeSessionOf(view)?.sessionId,
			activeRequestInProgressDuringPreparation: activeSessionOf(view)?.isNewSessionRequestInProgress?.get(),
			activeSessionCreatedDuringPreparation: activeSessionOf(view) && activeSessionOf(view)!.status.get() !== SessionStatus.Untitled,
		}, {
			statusDuringPreparation: SessionStatus.Untitled,
			requestInProgressDuringPreparation: true,
			activeSessionDuringPreparation: 'local-draft',
			activeRequestInProgressDuringPreparation: true,
			activeSessionCreatedDuringPreparation: false,
		});
		preparation.complete();
		await send;

		assert.deepStrictEqual({
			deleted,
			preparedQuery,
			replacements,
			sent,
			visibleSessions: slotSessionsOf(view).map(session => session?.sessionId ?? null),
			activeSession: activeSessionOf(view)?.sessionId,
			replacementStatus: replacement.status.get(),
			replacementRequestInProgress: replacement.isNewSessionRequestInProgress?.get(),
		}, {
			deleted: ['local-draft'],
			preparedQuery: 'hi',
			replacements: ['local-draft->dev-draft'],
			sent: ['createNewChat', 'sendRequest:dev-draft'],
			visibleSessions: ['dev-draft'],
			activeSession: 'dev-draft',
			replacementStatus: SessionStatus.Untitled,
			replacementRequestInProgress: false,
		});
	});

	test('sendNewChatRequest restores an untitled draft when preparation fails', async () => {
		const status = observableValue('status', SessionStatus.Untitled);
		const chat: IChat = { ...stubChat, status };
		const session = stubSession({
			sessionId: 'draft',
			providerId: 'test',
			status,
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const preparation = new DeferredPromise<void>();
		const requestInProgress = observableValue('requestInProgress', false);
		const sessionWithRequestState = { ...session, isNewSessionRequestInProgress: requestInProgress };
		const provider = new class extends TestSessionsProvider {
			override startNewSessionRequest() {
				requestInProgress.set(true, undefined);
				return toDisposable(() => requestInProgress.set(false, undefined));
			}
			override async prepareNewSession(): Promise<never> {
				await preparation.p;
				throw new Error('prepare failed');
			}
		}(sessionWithRequestState);
		const { service, view } = createSessionsManagementService(sessionWithRequestState, disposables, provider);
		await view.openSession(sessionWithRequestState.resource);

		const send = service.sendNewChatRequest(sessionWithRequestState, { query: 'hi' });
		assert.deepStrictEqual({
			status: status.get(),
			requestInProgress: requestInProgress.get(),
		}, {
			status: SessionStatus.Untitled,
			requestInProgress: true,
		});
		preparation.complete();
		await assert.rejects(send, /prepare failed/);

		assert.deepStrictEqual({
			status: status.get(),
			requestInProgress: requestInProgress.get(),
			activeSession: activeSessionOf(view)?.sessionId,
		}, {
			status: SessionStatus.Untitled,
			requestInProgress: false,
			activeSession: 'draft',
		});
	});

	test('sendNewChatRequest tracks a foreground first request until it settles', async () => {
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			status: constObservable(SessionStatus.Untitled),
		});
		const createChatBarrier = new DeferredPromise<void>();
		const provider = new class extends TestSessionsProvider {
			override async createNewChat(): Promise<IChat> {
				await createChatBarrier.p;
				return session.mainChat.get();
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		const send = service.sendNewChatRequest(session, { query: 'hi' });
		await timeout(0);
		const duringCreate = service.getInFlightNewSessionRequests().map(session => session.sessionId);
		const inputDuringCreate = service.getInFlightNewSessionRequest(session.resource);
		createChatBarrier.complete();
		await send;

		assert.deepStrictEqual({
			duringCreate,
			inputDuringCreate,
			afterSend: service.getInFlightNewSessionRequests(),
			inputAfterSend: service.getInFlightNewSessionRequest(session.resource),
		}, {
			duringCreate: ['s1'],
			inputDuringCreate: { query: 'hi', attachedContext: undefined },
			afterSend: [],
			inputAfterSend: undefined,
		});
	});

	test('sendNewChatRequest keeps tracking until concurrent first requests settle', async () => {
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			status: constObservable(SessionStatus.Untitled),
		});
		const createBarriers = [new DeferredPromise<void>(), new DeferredPromise<void>()];
		const bothCreatesStarted = new DeferredPromise<void>();
		let createCount = 0;
		const provider = new class extends TestSessionsProvider {
			override async createNewChat(): Promise<IChat> {
				const index = createCount++;
				if (createCount === createBarriers.length) {
					bothCreatesStarted.complete();
				}
				await createBarriers[index].p;
				return session.mainChat.get();
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		const first = service.sendNewChatRequest(session, { query: 'first' });
		const second = service.sendNewChatRequest(session, { query: 'second' });
		await bothCreatesStarted.p;
		const whileBothPending = service.getInFlightNewSessionRequests().map(session => session.sessionId);
		createBarriers[0].complete();
		await first;
		const afterFirstSettles = service.getInFlightNewSessionRequests().map(session => session.sessionId);
		createBarriers[1].complete();
		await second;

		assert.deepStrictEqual({
			whileBothPending,
			afterFirstSettles,
			afterBothSettle: service.getInFlightNewSessionRequests(),
		}, {
			whileBothPending: ['s1'],
			afterFirstSettles: ['s1'],
			afterBothSettle: [],
		});
	});

	test('sendNewChatRequest does not track a request in an existing session', async () => {
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			status: constObservable(SessionStatus.Completed),
		});
		const createChatBarrier = new DeferredPromise<void>();
		const provider = new class extends TestSessionsProvider {
			override async createNewChat(): Promise<IChat> {
				await createChatBarrier.p;
				return session.mainChat.get();
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		const send = service.sendNewChatRequest(session, { query: 'hi' });
		await timeout(0);
		const duringCreate = service.getInFlightNewSessionRequests();
		createChatBarrier.complete();
		await send;

		assert.deepStrictEqual(duringCreate, []);
	});

	test('sendNewChatRequest clears first-request tracking when chat creation fails', async () => {
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			status: constObservable(SessionStatus.Untitled),
		});
		const provider = new class extends TestSessionsProvider {
			override async createNewChat(): Promise<IChat> {
				throw new Error('create failed');
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		await assert.rejects(service.sendNewChatRequest(session, { query: 'hi' }), /create failed/);

		assert.deepStrictEqual(service.getInFlightNewSessionRequests(), []);
	});

	for (const background of [false, true]) {
		for (const quickChat of [false, true]) {
			test(`rejects an unavailable ${quickChat ? 'quick-chat' : 'workspace'} type before consuming a ${background ? 'background' : 'foreground'} draft`, async () => {
				const session = stubSession({
					sessionId: 'draft', providerId: 'test',
					status: constObservable(SessionStatus.Untitled),
					isQuickChat: constObservable(quickChat),
				});
				const calls: string[] = [];
				const provider = new class extends TestSessionsProvider {
					override readonly sessionTypes: ISessionType[] = [{ id: 'test', label: 'Test', icon: Codicon.vm, authRequirement: SessionTypeAuthRequirement.GitHub }];
					override readonly supportsQuickChats = true;
					override createQuickChat() { return session; }
					override resolveWorkspace(folderUri: URI): ISessionWorkspace {
						return { uri: folderUri, label: 'Workspace', icon: Codicon.folder, folders: [], requiresWorkspaceTrust: false, isVirtualWorkspace: false };
					}
					override async prepareNewSession(): Promise<never> {
						calls.push('prepare');
						throw new Error('unavailable');
					}
					override deleteNewSession() { calls.push('delete'); }
					override async sendRequest() { calls.push('send'); return session; }
				}(session);
				const { service } = createSessionsManagementService(session, disposables, provider);
				const draft = quickChat ? service.createQuickChat() : service.createNewSession(URI.file('/workspace'));
				provider.sessionTypes.splice(0);
				const draftChanges: (string | undefined)[] = [];
				disposables.add(autorun(reader => draftChanges.push(service.newSession.read(reader)?.sessionId)));

				await assert.rejects(service.sendNewChatRequest(draft, { query: 'keep my prompt', background }), /Test is no longer available for new sessions/);

				assert.deepStrictEqual({
					calls, draftChanges,
					draft: service.newSession.get()?.sessionId,
					inFlight: service.getInFlightNewSessionRequests(),
				}, { calls: [], draftChanges: ['draft'], draft: 'draft', inFlight: [] });
			});
		}
	}

	test('sendNewChatRequest with background resolves before preparation and routes the replacement in the background', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
			status: constObservable(SessionStatus.Untitled),
		});
		const replacementChat: IChat = { ...stubChat, resource: URI.parse('replacement:///chat') };
		const replacement = stubSession({
			sessionId: 's2',
			providerId: 'replacement',
			chats: constObservable([replacementChat]),
			mainChat: constObservable(replacementChat),
		});
		let completeSendRequest: (() => void) | undefined;
		const preparation = new DeferredPromise<void>();
		const sendRequestStartedBarrier = new DeferredPromise<void>();
		const deleted: string[] = [];
		const replacements: string[] = [];
		let preparationStarted = false;
		let sendRequestStarted = false;
		const sendRequestFinished = new DeferredPromise<void>();
		let sentSessionId: string | undefined;
		const originalProvider = new class extends TestSessionsProvider {
			override async prepareNewSession() {
				preparationStarted = true;
				await preparation.p;
				return { session: replacement };
			}
			override deleteNewSession(sessionId: string): void {
				deleted.push(sessionId);
			}
		}(session);
		const replacementProvider = new class extends TestSessionsProvider {
			override readonly id = 'replacement';
			override async sendRequest(sessionId: string, _chatResource: URI, _options: ISendRequestOptions): Promise<ISession> {
				try {
					sentSessionId = sessionId;
					sendRequestStarted = true;
					await sendRequestStartedBarrier.complete();
					await new Promise<void>(resolve => {
						completeSendRequest = resolve;
					});
					return replacement;
				} finally {
					sendRequestFinished.complete();
				}
			}
		}(replacement);
		const { service } = createSessionsManagementService(session, disposables, [originalProvider, replacementProvider]);
		disposables.add(service.onDidReplaceNewDraftSession(({ from, to }) => replacements.push(`${from.sessionId}->${to.sessionId}`)));

		const sendPromise = service.sendNewChatRequest(session, { query: 'hi', background: true });
		await sendPromise;

		const whilePreparing = service.getInFlightNewSessionRequests().map(session => session.sessionId);
		assert.deepStrictEqual({
			preparationStarted,
			sendRequestStarted,
			deleted,
			whilePreparing,
		}, {
			preparationStarted: true,
			sendRequestStarted: false,
			deleted: [],
			whilePreparing: ['s1'],
		});
		await preparation.complete();
		await preparation.complete();
		await timeout(0);
		await sendRequestStartedBarrier.p;
		const whileSending = service.getInFlightNewSessionRequests().map(session => session.sessionId);
		assert.deepStrictEqual({
			deleted,
			replacements,
			sentSessionId,
		}, {
			deleted: ['s1'],
			replacements: ['s1->s2'],
			sentSessionId: 's2',
		});
		completeSendRequest?.();
		await sendRequestFinished.p;
		await timeout(0);

		assert.deepStrictEqual({
			sendRequestStarted,
			whileSending,
			afterSend: service.getInFlightNewSessionRequests(),
		}, {
			sendRequestStarted: true,
			whileSending: ['s1'],
			afterSend: [],
		});
	});

	const actionableStartupError = createErrorWithActions('Could not start the session', [
		toAction({ id: 'test.details', label: 'Show Details', run: () => { } }),
	]);
	for (const { error, expectedNotifications } of [
		{ error: new Error('Container setup failed'), expectedNotifications: ['Failed to start session: Container setup failed'] },
		{ error: actionableStartupError, expectedNotifications: [actionableStartupError] },
		{ error: new CancellationError(), expectedNotifications: [] },
		{ error: new WorkspaceNotTrustedError(), expectedNotifications: [] },
	]) {
		test(`background preparation reports only unexpected failures: ${error.name} ${error.message}`, async () => {
			const session = stubSession({ sessionId: 's1', providerId: 'test', status: constObservable(SessionStatus.Untitled) });
			const preparation = new DeferredPromise<never>();
			const deleted: string[] = [];
			const provider = new class extends TestSessionsProvider {
				override prepareNewSession(): Promise<never> {
					return preparation.p;
				}
				override deleteNewSession(sessionId: string): void {
					deleted.push(sessionId);
				}
			}(session);
			const { service, notifications } = createSessionsManagementService(session, disposables, provider);
			await service.sendNewChatRequest(session, { query: 'hi', background: true });
			await preparation.error(error);
			await timeout(0);
			assert.deepStrictEqual({
				notifications,
				deleted,
				inFlight: service.getInFlightNewSessionRequests(),
			}, {
				notifications: expectedNotifications,
				deleted: ['s1'],
				inFlight: [],
			});
		});
	}

	test('sendRequest with background is fire-and-forget and does not fire onWillSendRequest', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat'), status: constObservable(SessionStatus.Untitled) };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		let completeSendRequest: (() => void) | undefined;
		let sentChatResource: URI | undefined;
		const provider = new class extends TestSessionsProvider {
			override async sendRequest(_sessionId: string, chatResource: URI, _options: ISendRequestOptions): Promise<ISession> {
				sentChatResource = chatResource;
				await new Promise<void>(resolve => {
					completeSendRequest = resolve;
				});
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		let willSendCount = 0;
		disposables.add(service.onWillSendRequest(() => willSendCount++));

		// The background send is fire-and-forget (it resolves before the
		// provider commits) and never fires `onWillSendRequest`, so the view's
		// send-follow cannot navigate into the sent chat.
		await service.sendRequest(session, chat, { query: 'hi', background: true });

		assert.deepStrictEqual({
			sentChatResource: sentChatResource?.toString(),
			willSendCount,
		}, {
			sentChatResource: chat.resource.toString(),
			willSendCount: 0,
		});

		completeSendRequest?.();
	});

	for (const background of [false, true]) {
		test(`sendRequest ${background ? 'preserves' : 'discards'} a pending composer draft in the ${background ? 'background' : 'foreground'}`, async () => {
			const session = stubSession({ sessionId: 'sent-session', providerId: 'test' });
			const draft = stubSession({ sessionId: 'draft-session', providerId: 'test' });
			const provider = new class extends TestSessionsProvider {
				override resolveWorkspace(): ISessionWorkspace {
					return { uri: URI.parse('test:///folder'), label: 'Folder', icon: Codicon.folder, folders: [], requiresWorkspaceTrust: false, isVirtualWorkspace: false };
				}
				override createNewSession(): ISession { return draft; }
			}(session);
			const { service } = createSessionsManagementService(session, disposables, provider);
			const discarded: string[] = [];
			disposables.add(service.onDidDiscardNewSession(session => discarded.push(session.sessionId)));
			service.createNewSession(URI.parse('test:///folder'));
			const sent = Event.toPromise(service.onDidSendRequest);

			await service.sendRequest(session, session.mainChat.get(), { query: 'question', background });
			await sent;

			assert.deepStrictEqual({ draft: service.newSession.get()?.sessionId, discarded }, background
				? { draft: 'draft-session', discarded: [] }
				: { draft: undefined, discarded: ['draft-session'] });
		});
	}

	for (const fail of [false, true]) {
		test(`sendRequestInBackground awaits submission and ${fail ? 'propagates failure' : 'reports success'} without navigating or discarding drafts`, async () => {
			const session = stubSession({ sessionId: 'sent-session', providerId: 'test' });
			const draft = stubSession({ sessionId: 'draft-session', providerId: 'test' });
			const entered = new DeferredPromise<void>();
			const released = new DeferredPromise<void>();
			let background: boolean | undefined;
			const provider = new class extends TestSessionsProvider {
				override resolveWorkspace(): ISessionWorkspace {
					return { uri: URI.parse('test:///folder'), label: 'Folder', icon: Codicon.folder, folders: [], requiresWorkspaceTrust: false, isVirtualWorkspace: false };
				}
				override createNewSession(): ISession { return draft; }
				override async sendRequest(_sessionId: string, _chatResource: URI, options: ISendRequestSentEvent['options']): Promise<ISession> {
					background = options.background;
					entered.complete();
					await released.p;
					if (fail) {
						throw new Error('Send failed');
					}
					return session;
				}
			}(session);
			const { service, view } = createSessionsManagementService(session, disposables, provider);
			let willSend = 0;
			let sent = 0;
			let discarded = 0;
			disposables.add(service.onWillSendRequest(() => willSend++));
			disposables.add(service.onDidSendRequest(() => sent++));
			disposables.add(service.onDidDiscardNewSession(() => discarded++));
			service.createNewSession(URI.parse('test:///folder'));
			const navigationRequest = view.navigationRequest.get();
			let settled = false;
			const sending = service.sendRequestInBackground(session, session.mainChat.get(), { query: 'question' }).finally(() => { settled = true; });
			const completed = fail ? assert.rejects(sending, /Send failed/) : sending;
			await entered.p;
			const pending = !settled;
			released.complete();
			await completed;

			assert.deepStrictEqual({
				pending, settled, background, willSend, sent, discarded,
				draft: service.newSession.get()?.sessionId,
				navigated: view.navigationRequest.get() !== navigationRequest,
			}, {
				pending: true, settled: true, background: true, willSend: 0, sent: fail ? 0 : 1, discarded: 0,
				draft: 'draft-session',
				navigated: false,
			});
		});
	}

	test('mirrored follow-up requests preserve submitted attachments', () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const { service, chatService } = createSessionsManagementService(session, disposables);
		const attachedContext: IChatRequestVariableEntry[] = [{ kind: 'generic', id: 'context', name: 'Context', value: 'value' }];
		let sentEvent: ISendRequestSentEvent | undefined;
		disposables.add(service.onDidSendRequest(event => sentEvent = event));

		chatService.submitRequest({
			chatSessionResource: chat.resource,
			message: { text: 'follow up', parts: [] },
			attachedContext,
		});

		assert.deepStrictEqual(sentEvent && {
			query: sentEvent.options.query,
			attachedContext: sentEvent.options.attachedContext,
			isNewSession: sentEvent.isNewSession,
			isNewChat: sentEvent.isNewChat,
		}, {
			query: 'follow up',
			attachedContext,
			isNewSession: false,
			isNewChat: false,
		});
	});

	test('send-follow activates only visible chat tabs', async () => {
		const mainChat: IChat = { ...stubChat, resource: URI.parse('test:///chat/main'), title: constObservable('main') };
		const sideChat: IChat = { ...stubChat, resource: URI.parse('test:///chat/side'), title: constObservable('side'), origin: { kind: ChatOriginKind.SideChat } };
		const toolChat: IChat = { ...stubChat, resource: URI.parse('test:///chat/tool'), title: constObservable('tool'), origin: { kind: ChatOriginKind.Tool }, interactivity: constObservable(ChatInteractivity.ReadOnly) };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([mainChat, sideChat, toolChat]),
			mainChat: constObservable(mainChat),
			capabilities: constObservable({ supportsMultipleChats: true }),
		});
		const provider = new class extends TestSessionsProvider {
			override async sendRequest(_sessionId: string, _chatResource: URI, _options: ISendRequestOptions): Promise<ISession> {
				return session;
			}
		}(session);
		const { service, view } = createSessionsManagementService(session, disposables, provider);

		await view.openSession(session.resource);
		await view.openChat(session, sideChat.resource);
		await service.sendRequest(session, toolChat, { query: 'hidden tool' });
		await Promise.resolve();
		const afterHiddenSend = activeChatOf(view)?.resource.toString();

		await view.openChat(session, toolChat.resource);
		await service.sendRequest(session, toolChat, { query: 'visible tool' });
		await Promise.resolve();
		const afterVisibleSend = activeChatOf(view)?.resource.toString();

		assert.deepStrictEqual({
			visibleTabs: view.activePane.get()?.tabs.visibleChatTabs.get().map(chat => chat.title.get()),
			afterHiddenSend,
			afterVisibleSend,
		}, {
			visibleTabs: ['main', 'side', 'tool'],
			afterHiddenSend: sideChat.resource.toString(),
			afterVisibleSend: toolChat.resource.toString(),
		});
	});

	test('createAndSendNewChatRequest sends without changing the active view', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		let sendRequestStarted = false;
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override async sendRequest(_sessionId: string, _chatResource: URI, _options: ISendRequestOptions): Promise<ISession> {
				sendRequestStarted = true;
				return session;
			}
		}(session);
		const { service, view } = createSessionsManagementService(session, disposables, provider);

		// No active session and no pending composer before the headless send.
		assert.strictEqual(activeSessionOf(view), undefined);

		await service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' });

		// The request was sent, but the user's view was not navigated into the session.
		assert.strictEqual(sendRequestStarted, true);
		assert.strictEqual(activeSessionOf(view), undefined);
	});

	test('createAndSendNewChatRequest publishes the session while its first request is in flight', async () => {
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			status: constObservable(SessionStatus.Untitled),
		});
		const configurationStarted = new DeferredPromise<void>();
		const configurationBarrier = new DeferredPromise<void>();
		const provider = new class extends TestSessionsProvider {
			override getSessions(): ISession[] { return []; }
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override async getNewSessionConfig() {
				configurationStarted.complete();
				await configurationBarrier.p;
				return undefined;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);
		const changes: Array<{ added: string[]; removed: string[]; changed: string[] }> = [];
		disposables.add(service.onDidChangeSessions(event => changes.push({
			added: event.added.map(session => session.sessionId),
			removed: event.removed.map(session => session.sessionId),
			changed: event.changed.map(session => session.sessionId),
		})));

		const sending = service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' });
		await configurationStarted.p;
		const duringConfiguration = service.getSessions().map(session => session.sessionId);
		configurationBarrier.complete();
		await sending;

		assert.deepStrictEqual({
			duringConfiguration,
			afterSend: service.getSessions().map(session => session.sessionId),
			changes,
		}, {
			duringConfiguration: ['s1'],
			afterSend: [],
			changes: [
				{ added: ['s1'], removed: [], changed: [] },
				{ added: [], removed: [], changed: [] },
			],
		});
	});

	test('createAndSendNewChatRequest restores Automation configuration during draft creation', async () => {
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
		});
		let providerOptions: ISessionsProviderCreateSessionOptions | undefined;
		const provider = new class extends TestSessionsProvider {
			override readonly supportsAutomationSessionConfiguration = true;
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override createNewSession(_folderUri?: URI, _sessionTypeId?: string, options?: ISessionsProviderCreateSessionOptions): ISession {
				providerOptions = options;
				return session;
			}
			override async getAutomationSessionConfiguration() { return automationConfiguration; }
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);
		const sessionTemplate = {
			modelId: 'model',
			config: { mode: 'plan', autoApprove: 'assisted' },
		};
		const automationConfiguration = {
			sessionTemplate,
			modelId: 'model',
			mode: 'plan',
			permissionLevel: 'assisted',
		};

		await service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, {
			sessionTemplate,
			automationConfiguration,
		});

		assert.deepStrictEqual(providerOptions, {
			metadata: undefined,
			automationConfiguration: { sessionTemplate },
		});
	});

	test('createNewSession forwards model configuration only to supporting providers', () => {
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
		});
		let providerOptions: ISessionsProviderCreateSessionOptions | undefined;
		const provider = new class extends TestSessionsProvider {
			override readonly supportsModelConfigurationForCreation = true;
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override createNewSession(_folderUri?: URI, _sessionTypeId?: string, options?: ISessionsProviderCreateSessionOptions): ISession {
				providerOptions = options;
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		service.createNewSession(URI.parse('test:///folder'), {
			modelId: 'model',
			modelConfiguration: { thinkingLevel: 'high' },
		});

		assert.deepStrictEqual(providerOptions, {
			metadata: undefined,
			modelId: 'model',
			modelConfiguration: { thinkingLevel: 'high' },
		});
	});

	test('createNewSession rejects model configuration without provider support or a model', () => {
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
		});
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		assert.throws(() => service.createNewSession(URI.parse('test:///folder'), {
			modelConfiguration: { thinkingLevel: 'high' },
		}), /requires a model identifier/);
		assert.throws(() => service.createNewSession(URI.parse('test:///folder'), {
			modelId: 'model',
			modelConfiguration: { thinkingLevel: 'high' },
		}), /does not support model configuration/);
	});

	test('createNewSession forwards exact permission and mode choices for provider validation', () => {
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
		});
		const providerOptions: Array<ISessionsProviderCreateSessionOptions | undefined> = [];
		const provider = new class extends TestSessionsProvider {
			override readonly supportsPermissionsForCreation = true;
			override readonly sessionTypes: readonly ISessionType[] = [
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'supported', label: 'Supported', icon: Codicon.vm },
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'unsupported', label: 'Unsupported', icon: Codicon.vm },
			];
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override createNewSession(_folderUri?: URI, _sessionTypeId?: string, options?: ISessionsProviderCreateSessionOptions): ISession {
				if (_sessionTypeId === 'unsupported') {
					throw new Error(`Provider does not support permission '${options?.permissionId}'`);
				}
				providerOptions.push(options);
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		service.createNewSession(URI.parse('test:///folder'), {
			sessionTypeId: 'supported',
			permissionId: 'allowAll',
			modeId: 'autopilot',
		});
		assert.throws(() => service.createNewSession(URI.parse('test:///folder'), {
			sessionTypeId: 'unsupported',
			permissionId: 'allowAll',
		}), /does not support permission 'allowAll'/);

		assert.deepStrictEqual(providerOptions, [{
			metadata: undefined,
			permissionId: 'allowAll',
			modeId: 'autopilot',
		}]);
	});

	test('createNewSession rejects permissions when the provider cannot apply them', () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace {
				return { uri: URI.parse('test:///folder'), label: 'Test', icon: Codicon.folder, folders: [], requiresWorkspaceTrust: false, isVirtualWorkspace: false };
			}
			override createNewSession(): ISession { assert.fail('Must not create a session with ignored permissions'); }
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);
		assert.throws(() => service.createNewSession(URI.parse('test:///folder'), { permissionId: 'allowAll' }), /does not support permission 'allowAll'/);
	});

	test('createAndSendNewChatRequest rejects canonical Automation templates for providers without restoration support', async () => {
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
		});
		let createCount = 0;
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override createNewSession(): ISession {
				createCount++;
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);
		const sessionTemplate = { modelId: 'model', config: { mode: 'plan' } };

		await Promise.all([
			assert.rejects(
				service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, { sessionTemplate }),
				/does not support Automation session templates/,
			),
			assert.rejects(
				service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, { automationConfiguration: { sessionTemplate } }),
				/does not support Automation session templates/,
			),
		]);
		assert.strictEqual(createCount, 0);
	});

	test('ordinary draft configuration does not require Automation support', () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		const draftConfiguration = { sessionTemplate: { modelId: 'model', config: { providerChoice: true } } };
		let captured: ISessionsProviderCreateSessionOptions | undefined;
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace {
				return { uri: URI.parse('test:///folder'), label: 'Test', icon: Codicon.folder, folders: [], requiresWorkspaceTrust: false, isVirtualWorkspace: false };
			}
			override getDraftSessionConfiguration() { return draftConfiguration; }
			override createNewSession(_folder: URI, _type: string, options?: ISessionsProviderCreateSessionOptions): ISession {
				captured = options;
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);
		service.createNewSession(URI.parse('test:///folder'), { draftConfiguration });
		assert.deepStrictEqual(captured, { metadata: undefined, draftConfiguration });
	});

	test('createAndSendNewChatRequest prepares request options while configuring the provisional session', async () => {
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
		});
		const requestOptionsBarrier = new DeferredPromise<void>();
		const requestPreparationStarted = new DeferredPromise<void>();
		const configurationCompleted = new DeferredPromise<void>();
		const events: string[] = [];
		let createMetadata: Record<string, unknown> | undefined;
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace {
				return {
					uri: URI.parse('test:///folder'),
					label: 'Test',
					icon: Codicon.folder,
					folders: [],
					requiresWorkspaceTrust: false,
					isVirtualWorkspace: false,
				};
			}
			override createNewSession(_folderUri?: URI, _sessionTypeId?: string, options?: ISessionsProviderCreateSessionOptions): ISession {
				createMetadata = options?.metadata;
				events.push('create');
				return session;
			}
			override startNewSessionRequest(_sessionId: string, activity?: string) {
				events.push(`start:${activity}`);
				return { dispose: () => events.push('clear') };
			}
			override async setWorktreeConfiguration(): Promise<void> {
				events.push('configure');
				configurationCompleted.complete();
			}
			override async sendRequest(_sessionId: string, _chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
				events.push(`send:${options.query}`);
				return session;
			}
		}(session);
		const { service, view } = createSessionsManagementService(session, disposables, provider);

		const sendPromise = service.createAndSendNewChatRequest(URI.parse('test:///folder'), {
			kind: 'deferred',
			activity: 'Fetching pull request...',
			async resolve() {
				events.push('prepare');
				requestPreparationStarted.complete();
				await requestOptionsBarrier.p;
				return { query: 'prepared' };
			},
		}, {
			isolationMode: 'worktree',
			metadata: { github: { pullRequestUrl: 'https://github.com/owner/repo/pull/42' } },
			onSessionCreated: created => {
				view.showSession(created.resource);
				events.push(`show:${activeSessionOf(view)?.sessionId}`);
			},
		});
		await Promise.all([requestPreparationStarted.p, configurationCompleted.p]);
		const eventsWhilePreparingRequest = [...events];
		const inFlightWhilePreparing = service.getInFlightNewSessionRequests().map(session => session.sessionId);
		requestOptionsBarrier.complete();
		await sendPromise;

		assert.deepStrictEqual({
			eventsWhilePreparingRequest,
			inFlightWhilePreparing,
			inFlightAfterSend: service.getInFlightNewSessionRequests(),
			events,
			createMetadata,
		}, {
			eventsWhilePreparingRequest: ['create', 'start:Fetching pull request...', 'show:s1', 'prepare', 'configure'],
			inFlightWhilePreparing: ['s1'],
			inFlightAfterSend: [],
			events: ['create', 'start:Fetching pull request...', 'show:s1', 'prepare', 'configure', 'clear', 'send:prepared'],
			createMetadata: { github: { pullRequestUrl: 'https://github.com/owner/repo/pull/42' } },
		});
	});

	test('createAndSendNewChatRequest clears request activity when already cancelled', async () => {
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
		});
		let requestOptionsResolved = false;
		let activityCleared = 0;
		let deleted = 0;
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace {
				return {
					uri: URI.parse('test:///folder'),
					label: 'Test',
					icon: Codicon.folder,
					folders: [],
					requiresWorkspaceTrust: false,
					isVirtualWorkspace: false,
				};
			}
			override startNewSessionRequest() {
				return { dispose: () => activityCleared++ };
			}
			override deleteNewSession(): void {
				deleted++;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		await assert.rejects(service.createAndSendNewChatRequest(URI.parse('test:///folder'), {
			kind: 'deferred',
			activity: 'Fetching pull request...',
			async resolve() {
				requestOptionsResolved = true;
				return { query: 'prepared' };
			},
		}, undefined, CancellationToken.Cancelled), /Canceled/);

		assert.deepStrictEqual({
			requestOptionsResolved,
			activityCleared,
			deleted,
		}, {
			requestOptionsResolved: false,
			activityCleared: 1,
			deleted: 1,
		});
	});

	test('createAndSendNewChatRequest disposes the draft when request activity startup fails', async () => {
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
		});
		let deleted = 0;
		const provider = new class extends TestSessionsProvider {
			override getSessions(): ISession[] {
				return [];
			}
			override resolveWorkspace(): ISessionWorkspace {
				return {
					uri: URI.parse('test:///folder'),
					label: 'Test',
					icon: Codicon.folder,
					folders: [],
					requiresWorkspaceTrust: false,
					isVirtualWorkspace: false,
				};
			}
			override startNewSessionRequest(): never {
				throw new Error('start failed');
			}
			override deleteNewSession(): void {
				deleted++;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		await assert.rejects(service.createAndSendNewChatRequest(URI.parse('test:///folder'), {
			kind: 'deferred',
			activity: 'Fetching pull request...',
			async resolve() {
				return { query: 'prepared' };
			},
		}), /start failed/);

		assert.deepStrictEqual({
			deleted,
			session: service.getSession(session.resource),
		}, {
			deleted: 1,
			session: undefined,
		});
	});

	test('createAndSendNewChatRequest refuses an untrusted required workspace before creating a session', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const folderUri = URI.parse('test:///folder');
		let resolveCount = 0;
		let createCount = 0;
		let sendCount = 0;
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(uri: URI): ISessionWorkspace {
				resolveCount++;
				return {
					uri,
					label: 'Test',
					icon: Codicon.folder,
					folders: [],
					requiresWorkspaceTrust: true,
					isVirtualWorkspace: false,
				};
			}
			override createNewSession(): ISession {
				createCount++;
				return session;
			}
			override async sendRequest(_sessionId: string, _chatResource: URI, _options: ISendRequestOptions): Promise<ISession> {
				sendCount++;
				return session;
			}
		}(session);
		const workspaceTrustManagementService = new TestWorkspaceTrustManagementService();
		workspaceTrustManagementService.trusted = false;
		const { service } = createSessionsManagementService(session, disposables, provider, workspaceTrustManagementService);

		await assert.rejects(
			service.createAndSendNewChatRequest(folderUri, { query: 'hi' }),
			WorkspaceNotTrustedError,
		);
		workspaceTrustManagementService.trusted = true;
		await service.createAndSendNewChatRequest(folderUri, { query: 'hi' });

		assert.deepStrictEqual({
			requestedUris: workspaceTrustManagementService.requestedUris.map(uri => uri.toString()),
			resolveCount,
			createCount,
			sendCount,
		}, {
			requestedUris: [folderUri.toString(), folderUri.toString()],
			resolveCount: 2,
			createCount: 1,
			sendCount: 1,
		});
	});

	test('target availability requires the requested provider and session type to be advertised', () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		const availableFolder = URI.parse('test:///available');
		const provider = new class extends TestSessionsProvider {
			override readonly supportsQuickChats = true;
			override readonly sessionTypes: readonly ISessionType[] = [
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'workspace-agent', label: 'Workspace Agent', icon: Codicon.vm },
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'quick-agent', label: 'Quick Agent', icon: Codicon.vm },
			];
			override resolveWorkspace(folderUri: URI): ISessionWorkspace | undefined {
				return extUriBiasedIgnorePathCase.isEqual(folderUri, availableFolder) ? { folderUri } as unknown as ISessionWorkspace : undefined;
			}
			override getSessionTypes(folderUri: URI): ISessionType[] {
				return extUriBiasedIgnorePathCase.isEqual(folderUri, availableFolder) ? [this.sessionTypes[0]] : [];
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		assert.deepStrictEqual({
			defaultWorkspace: service.isNewSessionTargetAvailable(availableFolder),
			exactWorkspace: service.isNewSessionTargetAvailable(availableFolder, { providerId: 'test', sessionTypeId: 'workspace-agent' }),
			wrongWorkspaceType: service.isNewSessionTargetAvailable(availableFolder, { providerId: 'test', sessionTypeId: 'quick-agent' }),
			missingWorkspace: service.isNewSessionTargetAvailable(URI.parse('test:///missing')),
			exactQuickChat: service.isQuickChatTargetAvailable({ providerId: 'test', sessionTypeId: 'quick-agent' }),
			wrongQuickChatProvider: service.isQuickChatTargetAvailable({ providerId: 'other', sessionTypeId: 'quick-agent' }),
		}, {
			defaultWorkspace: true,
			exactWorkspace: true,
			wrongWorkspaceType: false,
			missingWorkspace: false,
			exactQuickChat: true,
			wrongQuickChatProvider: false,
		});
	});

	test('createNewSession rejects a pinned session type that is not advertised', () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(folderUri: URI): ISessionWorkspace {
				return { folderUri } as unknown as ISessionWorkspace;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		assert.throws(
			() => service.createNewSession(URI.parse('test:///folder'), { providerId: 'test', sessionTypeId: 'missing' }),
			/does not advertise session type 'missing'/,
		);
	});

	test('inheritableSessionTarget drops a harness the folder no longer offers', () => {
		const folderUri = URI.parse('test:///folder');
		// The provider still resolves the folder (its existing sessions stay
		// usable) but no longer advertises the type they were created with.
		const hiddenHarnessSession = stubSession({ sessionId: 's1', providerId: 'test', sessionType: 'copilotcli' });
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(_folderUri: URI): ISessionWorkspace {
				return { folderUri: _folderUri } as unknown as ISessionWorkspace;
			}
			override getSessionTypes(): ISessionType[] {
				return [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'test', label: 'Test', icon: Codicon.vm }];
			}
		}(hiddenHarnessSession);
		const { service } = createSessionsManagementService(hiddenHarnessSession, disposables, provider);

		const stillOfferedSession = stubSession({ sessionId: 's2', providerId: 'test', sessionType: 'test' });

		assert.deepStrictEqual({
			hiddenHarness: inheritableSessionTarget(service, hiddenHarnessSession, folderUri),
			offeredHarness: inheritableSessionTarget(service, stillOfferedSession, folderUri),
			noFolder: inheritableSessionTarget(service, stillOfferedSession, undefined),
			noSession: inheritableSessionTarget(service, undefined, folderUri),
		}, {
			hiddenHarness: {},
			offeredHarness: { providerId: 'test', sessionTypeId: 'test' },
			noFolder: {},
			noSession: {},
		});
	});

	test('an explicit source harness override does not query an unrelated session resource', () => {
		const folderUri = URI.parse('test:///source');
		const session = stubSession({ sessionId: 'container-session', providerId: 'test' });
		let sourceLookups = 0;
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return upcastPartial<ISessionWorkspace>({ uri: folderUri }); }
			override getNewSessionTarget() {
				sourceLookups++;
				return undefined;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);
		const target = inheritableSessionTarget(service, { providerId: 'test', sessionType: 'test' }, folderUri);
		assert.deepStrictEqual({ target, sourceLookups }, { target: { providerId: 'test', sessionTypeId: 'test' }, sourceLookups: 0 });
	});

	for (const available of [true, false]) {
		test(`inheritableSessionTarget uses an available provider creation workspace (${available})`, () => {
			const session = stubSession({ sessionId: 'backend-session', providerId: 'test', sessionType: 'backend' });
			const executionFolder = URI.parse('test:///execution');
			const sourceFolder = URI.parse('test:///repository');
			const creationTarget = { providerId: 'creator', sessionTypeId: 'test', folderUri: sourceFolder };
			const backend = new class extends TestSessionsProvider {
				override getNewSessionTarget(resource: URI) {
					return isEqual(resource, session.resource) ? creationTarget : undefined;
				}
				override getSessionTypes(): ISessionType[] { return []; }
			}(session);
			const creator = new class extends TestSessionsProvider {
				override readonly id = 'creator';
				override resolveWorkspace(folder: URI): ISessionWorkspace | undefined {
					return isEqual(folder, sourceFolder) ? upcastPartial<ISessionWorkspace>({ uri: sourceFolder }) : undefined;
				}
				override getSessionTypes(): ISessionType[] { return available ? [...this.sessionTypes] : []; }
			}(session);
			const { service } = createSessionsManagementService(session, disposables, [backend, creator]);
			assert.deepStrictEqual(inheritableSessionTarget(service, session, executionFolder), available ? creationTarget : {});
		});
	}

	test('a New Session gesture whose harness is hidden still creates on the fallback provider', async () => {
		// End-to-end shape of the Agents-window bug: an extension-host session is
		// open, its harness has since been hidden (`hideExtensionHost`), and the
		// user presses New. The gesture spreads `inheritableSessionTarget` into
		// the options, so this also covers the empty-target path at a call site.
		const folderUri = URI.parse('test:///folder');
		const extHostSession = stubSession({ sessionId: 'exthost-1', providerId: 'copilot', sessionType: 'copilotcli' });
		const created: { providerId: string; sessionTypeId: string }[] = [];

		// Still resolves the folder (its existing sessions stay usable) but
		// advertises nothing for it.
		const copilot = new class extends TestSessionsProvider {
			override readonly id = 'copilot';
			override readonly order = 0;
			override readonly sessionTypes: readonly ISessionType[] = [];
			override resolveWorkspace(_folderUri: URI): ISessionWorkspace { return { folderUri: _folderUri } as unknown as ISessionWorkspace; }
			override getSessionTypes(): ISessionType[] { return []; }
			override getSessions(): ISession[] { return [extHostSession]; }
		}(extHostSession);

		// The agent host sorts first.
		const agentHostSession = stubSession({ sessionId: 'ah-draft', providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionType: 'copilotcli' });
		const agentHost = new class extends TestSessionsProvider {
			override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
			override readonly order = -1;
			override readonly sessionTypes: readonly ISessionType[] = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'copilotcli', label: 'Copilot', icon: Codicon.vm }];
			override resolveWorkspace(_folderUri: URI): ISessionWorkspace { return { folderUri: _folderUri } as unknown as ISessionWorkspace; }
			override getSessionTypes(): ISessionType[] { return [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'copilotcli', label: 'Copilot', icon: Codicon.vm }]; }
			override getSessions(): ISession[] { return []; }
			override createNewSession(_folderUri: URI, sessionTypeId: string): ISession {
				created.push({ providerId: this.id, sessionTypeId });
				return agentHostSession;
			}
		}(agentHostSession);

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
		instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([copilot, agentHost]));
		instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
		instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
		instantiationService.stub(IProgressService, new TestProgressService());
		instantiationService.stub(IChatService, new TestChatService());
		instantiationService.stub(IWorkspaceTrustRequestService, new class extends mock<IWorkspaceTrustRequestService>() {
			override async requestResourcesTrust(): Promise<boolean> { return true; }
		});

		const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
		const view = createView(instantiationService, service, disposables);
		await view.openSession(extHostSession.resource);

		const active = activeSessionOf(view);
		const result = await view.openNewSession({
			folderUri,
			...inheritableSessionTarget(service, active, folderUri),
		});

		assert.deepStrictEqual({
			created,
			resultProviderId: result.session?.providerId,
			trustDeclined: result.trustDeclined,
		}, {
			created: [{ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 'copilotcli' }],
			resultProviderId: LOCAL_AGENT_HOST_PROVIDER_ID,
			trustDeclined: false,
		});
	});

	test('createAndSendQuickChatRequest uses the quick-chat contract without navigation or repository configuration', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///quick-chat') };
		const activeSession = stubSession({ sessionId: 'active', providerId: 'test' });
		const quickChat = stubSession({
			sessionId: 'quick-1',
			providerId: 'test',
			isQuickChat: constObservable(true),
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const calls: string[] = [];
		const provider = new class extends TestSessionsProvider {
			override readonly supportsQuickChats = true;
			override getSessions(): ISession[] { return [activeSession]; }
			override createQuickChat(sessionTypeId: string): ISession {
				calls.push(`createQuickChat:${sessionTypeId}`);
				return quickChat;
			}
			override setModel(_sessionId: string, _chatResource: URI, modelId: string): void { calls.push(`setModel:${modelId}`); }
			override setIsolationMode(): never { throw new Error('isolation should not be configured'); }
			override setBranch(): never { throw new Error('branch should not be configured'); }
			override async sendRequest(): Promise<ISession> {
				calls.push('send');
				return quickChat;
			}
		}(quickChat);
		const { service, view } = createSessionsManagementService(activeSession, disposables, provider);
		await view.openSession(activeSession.resource);

		const result = await service.createAndSendQuickChatRequest({ query: 'hi' }, {
			providerId: 'test',
			sessionTypeId: 'test',
			modelId: 'gpt-4o',
			isolationMode: 'worktree',
			branch: 'stale',
		});

		assert.deepStrictEqual({
			sessionId: result?.sessionId,
			activeSession: activeSessionOf(view)?.sessionId,
			newSession: service.newSession.get(),
			calls,
		}, {
			sessionId: 'quick-1',
			activeSession: 'active',
			newSession: undefined,
			calls: ['createQuickChat:test', 'setModel:gpt-4o', 'send'],
		});
	});

	for (const quickChat of [false, true]) {
		test(`background creation awaits preparation before sending (${quickChat ? 'quick chat' : 'workspace'})`, async () => {
			const session = stubSession({ sessionId: 'prepared', providerId: 'test' });
			const preparing = new DeferredPromise<void>();
			const prepared = new DeferredPromise<void>();
			const calls: string[] = [];
			const provider = new class extends TestSessionsProvider {
				override readonly supportsQuickChats = true;
				override createQuickChat(): ISession { return session; }
				override resolveWorkspace(uri: URI): ISessionWorkspace {
					return { uri, label: 'Workspace', icon: Codicon.folder, folders: [], requiresWorkspaceTrust: false, isVirtualWorkspace: false };
				}
				override async sendRequest(): Promise<ISession> { calls.push('send'); return session; }
			}(session);
			const { service } = createSessionsManagementService(session, disposables, provider);
			const options: ICreateNewSessionOptions = {
				providerId: 'test',
				onSessionCreated: async () => {
					calls.push('prepare');
					await preparing.complete();
					await prepared.p;
					calls.push('prepared');
				},
			};
			const operation = quickChat
				? service.createAndSendQuickChatRequest({ query: 'Test' }, options)
				: service.createAndSendNewChatRequest(URI.file('/workspace'), { query: 'Test' }, options);
			await preparing.p;
			await timeout(0);
			assert.deepStrictEqual(calls, ['prepare']);
			await prepared.complete();
			await operation;
			assert.deepStrictEqual(calls, ['prepare', 'prepared', 'send']);
		});
	}

	test('quick-chat preparation failures discard the draft before sending', async () => {
		const session = stubSession({ sessionId: 'failed-preparation', providerId: 'test' });
		const calls: string[] = [];
		const provider = new class extends TestSessionsProvider {
			override readonly supportsQuickChats = true;
			override createQuickChat(): ISession { return session; }
			override deleteNewSession(): void { calls.push('delete'); }
			override async sendRequest(): Promise<ISession> { calls.push('send'); return session; }
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);
		await assert.rejects(service.createAndSendQuickChatRequest({ query: 'Test' }, {
			providerId: 'test',
			onSessionCreated: async () => { throw new Error('Preparation failed'); },
		}), /Preparation failed/);
		assert.deepStrictEqual(calls, ['delete']);
	});

	test('createAndSendQuickChatRequest cancels commit detection and disposes the provisional draft', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///quick-chat') };
		const session = stubSession({
			sessionId: 'quick-1',
			providerId: 'test',
			isQuickChat: constObservable(true),
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const sendStarted = new DeferredPromise<void>();
		const sendDone = new DeferredPromise<void>();
		const sendReturned = new DeferredPromise<void>();
		let deleted = false;
		const provider = new class extends TestSessionsProvider {
			override readonly supportsQuickChats = true;
			override createQuickChat(): ISession { return session; }
			override deleteNewSession(): void { deleted = true; }
			override async sendRequest(): Promise<ISession> {
				await sendStarted.complete();
				await sendDone.p;
				await sendReturned.complete();
				return session;
			}
		}(session);
		const { service, chatService } = createSessionsManagementService(session, disposables, provider);
		const cts = disposables.add(new CancellationTokenSource());
		let started = 0;
		let sent = 0;
		disposables.add(service.onDidStartSession(() => started++));
		disposables.add(service.onDidSendRequest(() => sent++));

		const request = service.createAndSendQuickChatRequest({ query: 'hi' }, {
			providerId: 'test',
			sessionTypeId: 'test',
		}, cts.token);
		await sendStarted.p;
		cts.cancel();

		await assert.rejects(request, /Canceled/);
		assert.strictEqual(deleted, true);
		await sendDone.complete();
		await sendReturned.p;
		await Promise.resolve();
		await Promise.resolve();
		assert.deepStrictEqual({
			cancelledResources: chatService.cancelledResources.map(resource => resource.toString()),
			started,
			sent,
		}, {
			cancelledResources: [chat.resource.toString()],
			started: 0,
			sent: 0,
		});
	});

	test('createAndSendNewChatRequest invokes configuration setters from createOptions', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const calls: string[] = [];
		let sentOptions: ISendRequestOptions | undefined;
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override setModel(_sessionId: string, _chatResource: URI, _modelId: string): void { calls.push(`setModel:${_modelId}`); }
			override setMode(_sessionId: string, _modeId: string): void { calls.push(`setMode:${_modeId}`); }
			override setPermissionLevel(_sessionId: string, _level: string): void { calls.push(`setPermissionLevel:${_level}`); }
			override async setIsolationMode(_sessionId: string, _mode: string): Promise<void> { calls.push(`setIsolationMode:${_mode}`); }
			override async setBranch(_sessionId: string, _branch: string): Promise<void> { calls.push(`setBranch:${_branch}`); }
			override async sendRequest(_sessionId: string, _chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
				sentOptions = options;
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		const createOptions: ICreateNewSessionOptions = {
			modelId: 'gpt-4o',
			modeId: 'agent',
			permissionLevel: 'allowedTools',
			isolationMode: 'worktree',
			branch: 'main',
		};
		const result = await service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi', title: 'Pull Request', hideFromTranscript: true }, createOptions);

		assert.deepStrictEqual({
			sessionId: result?.sessionId,
			calls,
			sentOptions,
		}, {
			sessionId: 's1',
			calls: [
				'setModel:gpt-4o',
				'setMode:agent',
				'setPermissionLevel:allowedTools',
				'setIsolationMode:worktree',
				'setBranch:main',
			],
			sentOptions: { query: 'hi', title: 'Pull Request', hideFromTranscript: true },
		});
	});

	test('createAndSendNewChatRequest prefers atomic worktree configuration', async () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		const calls: string[] = [];
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override getSessions(): ISession[] { return []; }
			override async setWorktreeConfiguration(_sessionId: string, configuration: ISessionWorktreeConfiguration): Promise<void> {
				calls.push(`setWorktreeConfiguration:${JSON.stringify(configuration)}`);
			}
			override async setIsolationMode(): Promise<void> { calls.push('setIsolationMode'); }
			override async setBranch(): Promise<void> { calls.push('setBranch'); }
		}(session);
		const { service, view } = createSessionsManagementService(session, disposables, provider);

		await service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, {
			isolationMode: 'worktree',
			branch: 'feature',
			onSessionCreated: created => {
				calls.push(`created:${created.sessionId}:${service.getSession(created.resource)?.sessionId}`);
				void view.openSession(created.resource);
			},
		});

		assert.deepStrictEqual({
			calls,
			activeSession: activeSessionOf(view)?.sessionId,
		}, {
			calls: [
				'created:s1:s1',
				'setWorktreeConfiguration:{"isolationMode":"worktree","branch":"feature"}',
			],
			activeSession: 's1',
		});
	});

	test('createAndSendNewChatRequest creates the draft from a pull request', async () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		const providerOptions: (ISessionsProviderCreateSessionOptions | undefined)[] = [];
		const configurations: ISessionWorktreeConfiguration[] = [];
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override getSessions(): ISession[] { return []; }
			override createNewSession(_folderUri: URI, _sessionTypeId: string, options?: ISessionsProviderCreateSessionOptions): ISession {
				providerOptions.push(options);
				return session;
			}
			override async setWorktreeConfiguration(_sessionId: string, configuration: ISessionWorktreeConfiguration): Promise<void> {
				configurations.push(configuration);
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		await service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, {
			pullRequestUrl: 'https://github.com/microsoft/vscode/pull/42',
		});

		assert.deepStrictEqual({ pullRequestUrls: providerOptions.map(options => options?.pullRequestUrl), configurations }, {
			pullRequestUrls: ['https://github.com/microsoft/vscode/pull/42'],
			configurations: [],
		});
	});

	test('createAndSendNewChatRequest skips providers without worktree configuration support', async () => {
		const cloudSession = stubSession({ sessionId: 'cloud', providerId: 'cloud' });
		const localSession = stubSession({ sessionId: 'local', providerId: 'local' });
		const cloudProvider = new class extends TestSessionsProvider {
			override readonly id = 'cloud';
			override readonly order = 0;
			override readonly sessionTypes: readonly ISessionType[] = [{ id: 'cloud', label: 'Cloud', icon: Codicon.cloud, supportsWorktreeConfiguration: false, authRequirement: SessionTypeAuthRequirement.None }];
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
		}(cloudSession);
		let configuredBranch: string | undefined;
		const localProvider = new class extends TestSessionsProvider {
			override readonly id = 'local';
			override readonly order = 1;
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override async setWorktreeConfiguration(_sessionId: string, configuration: ISessionWorktreeConfiguration): Promise<void> {
				configuredBranch = configuration.branch;
			}
		}(localSession);
		const { service } = createSessionsManagementService(localSession, disposables, [cloudProvider, localProvider]);

		const result = await service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, {
			isolationMode: 'worktree',
			branch: 'feature',
		});

		assert.deepStrictEqual({
			providerId: result?.providerId,
			configuredBranch,
		}, {
			providerId: 'local',
			configuredBranch: 'feature',
		});
	});

	test('createAndSendNewChatRequest uses an immediately resolved model identifier', async () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		const resolvedModel: ILanguageModelChatMetadataAndIdentifier = {
			identifier: 'target:gpt-4o',
			metadata: {
				extension: nullExtensionDescription.identifier,
				name: 'GPT-4o',
				vendor: 'target',
				family: 'gpt-4o',
				version: '1',
				id: 'gpt-4o',
				maxInputTokens: 100,
				maxOutputTokens: 100,
				isDefaultForLocation: {},
			},
		};
		const calls: string[] = [];
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(folderUri: URI): ISessionWorkspace { return { folderUri } as unknown as ISessionWorkspace; }
			override getModelsSnapshot(): ISessionModelsSnapshot {
				return { models: [resolvedModel], desiredModelResolution: { kind: 'available', model: resolvedModel }, modelTarget: 'target' };
			}
			override setModel(_sessionId: string, _chatResource: URI, modelId: string): void { calls.push(`setModel:${modelId}`); }
			override async sendRequest(): Promise<ISession> {
				calls.push('send');
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		await service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, { modelId: 'legacy/gpt-4o' });

		assert.deepStrictEqual(calls, ['setModel:target:gpt-4o', 'send']);
	});

	test('createAndSendNewChatRequest waits for and uses the resolved model identifier', async () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		const onDidChangeModels = disposables.add(new Emitter<void>());
		let resolution: ISessionModelsSnapshot['desiredModelResolution'] = { kind: 'pending', identifier: 'target:gpt-4o' };
		const calls: string[] = [];
		const model: ILanguageModelChatMetadataAndIdentifier = {
			identifier: 'target:gpt-4o',
			metadata: {
				extension: nullExtensionDescription.identifier,
				name: 'GPT-4o',
				vendor: 'target',
				family: 'gpt-4o',
				version: '1',
				id: 'gpt-4o',
				maxInputTokens: 100,
				maxOutputTokens: 100,
				isDefaultForLocation: {},
			},
		};
		const provider = new class extends TestSessionsProvider {
			override readonly onDidChangeModels = onDidChangeModels.event;
			override resolveWorkspace(folderUri: URI): ISessionWorkspace { return { folderUri } as unknown as ISessionWorkspace; }
			override getModelsSnapshot(): ISessionModelsSnapshot { return { models: [], desiredModelResolution: resolution, modelTarget: undefined }; }
			override setModel(_sessionId: string, _chatResource: URI, modelId: string): void { calls.push(`setModel:${modelId}`); }
			override async sendRequest(): Promise<ISession> {
				calls.push('send');
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		const request = service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, { modelId: 'legacy/gpt-4o' });
		await Promise.resolve();
		assert.deepStrictEqual(calls, []);

		resolution = { kind: 'available', model };
		onDidChangeModels.fire();
		await request;

		assert.deepStrictEqual(calls, ['setModel:target:gpt-4o', 'send']);
	});

	test('createAndSendNewChatRequest rejects a pending model that becomes unavailable and disposes the draft', async () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		const onDidChangeModels = disposables.add(new Emitter<void>());
		let resolution: ISessionModelsSnapshot['desiredModelResolution'] = { kind: 'pending', identifier: 'removed-model' };
		let deleted = false;
		const provider = new class extends TestSessionsProvider {
			override readonly onDidChangeModels = onDidChangeModels.event;
			override resolveWorkspace(folderUri: URI): ISessionWorkspace { return { folderUri } as unknown as ISessionWorkspace; }
			override getModelsSnapshot(): ISessionModelsSnapshot {
				return { models: [], desiredModelResolution: resolution, modelTarget: undefined };
			}
			override setModel(): never { throw new Error('setModel should not be called'); }
			override deleteNewSession(): void { deleted = true; }
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		const request = service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, { modelId: 'removed-model' });
		await Promise.resolve();
		resolution = { kind: 'unavailable', identifier: 'removed-model' };
		onDidChangeModels.fire();

		await assert.rejects(request, /Model 'removed-model' is unavailable/);
		assert.strictEqual(deleted, true);
	});

	test('createAndSendNewChatRequest rejects when the workspace stops advertising the session type', async () => {
		const folderUri = URI.parse('test:///folder');
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		const onDidChangeSessionTypes = disposables.add(new Emitter<void>());
		let folderTypeAvailable = true;
		let deleted = false;
		const provider = new class extends TestSessionsProvider {
			override readonly onDidChangeSessionTypes = onDidChangeSessionTypes.event;
			override resolveWorkspace(): ISessionWorkspace { return { uri: folderUri } as ISessionWorkspace; }
			override getSessionTypes(candidate: URI): ISessionType[] {
				return folderTypeAvailable && extUriBiasedIgnorePathCase.isEqual(candidate, folderUri) ? [...this.sessionTypes] : [];
			}
			override getModelsSnapshot(): ISessionModelsSnapshot {
				return { models: [], desiredModelResolution: { kind: 'pending', identifier: 'gpt-4o' }, modelTarget: undefined };
			}
			override deleteNewSession(): void { deleted = true; }
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		const request = service.createAndSendNewChatRequest(folderUri, { query: 'hi' }, { modelId: 'gpt-4o' });
		await Promise.resolve();
		folderTypeAvailable = false;
		onDidChangeSessionTypes.fire();

		await assert.rejects(request, /Session type 'test' is no longer available/);
		assert.strictEqual(deleted, true);
	});

	test('createAndSendNewChatRequest cancels while waiting for model resolution and disposes the draft', async () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		const onDidChangeModels = disposables.add(new Emitter<void>());
		let deleted = false;
		const provider = new class extends TestSessionsProvider {
			override readonly onDidChangeModels = onDidChangeModels.event;
			override resolveWorkspace(folderUri: URI): ISessionWorkspace { return { folderUri } as unknown as ISessionWorkspace; }
			override getModelsSnapshot(): ISessionModelsSnapshot {
				return { models: [], desiredModelResolution: { kind: 'pending', identifier: 'gpt-4o' }, modelTarget: undefined };
			}
			override deleteNewSession(): void { deleted = true; }
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);
		const cts = disposables.add(new CancellationTokenSource());

		const request = service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, { modelId: 'gpt-4o' }, cts.token);
		await Promise.resolve();
		cts.cancel();

		await assert.rejects(request, /Canceled/);
		assert.strictEqual(deleted, true);
	});

	test('createAndSendNewChatRequest awaits asynchronous repository configuration setters', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const isolationDone = new DeferredPromise<void>();
		const branchStarted = new DeferredPromise<void>();
		const branchDone = new DeferredPromise<void>();
		const calls: string[] = [];
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override async setIsolationMode(): Promise<void> {
				calls.push('isolation:start');
				await isolationDone.p;
				calls.push('isolation:end');
			}
			override async setBranch(): Promise<void> {
				calls.push('branch:start');
				await branchStarted.complete();
				await branchDone.p;
				calls.push('branch:end');
			}
			override async sendRequest(): Promise<ISession> {
				calls.push('send');
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		const request = service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, {
			isolationMode: 'worktree',
			branch: 'main',
		});
		await Promise.resolve();
		assert.deepStrictEqual(calls, ['isolation:start']);

		await isolationDone.complete();
		await branchStarted.p;
		assert.deepStrictEqual(calls, ['isolation:start', 'isolation:end', 'branch:start']);

		await branchDone.complete();
		await request;
		assert.deepStrictEqual(calls, ['isolation:start', 'isolation:end', 'branch:start', 'branch:end', 'send']);
	});

	test('createAndSendNewChatRequest cancels pending repository configuration and disposes the draft', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const configurationDone = new DeferredPromise<void>();
		let deleted = false;
		let sent = false;
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override async setIsolationMode(): Promise<void> {
				await configurationDone.p;
			}
			override deleteNewSession(): void {
				deleted = true;
			}
			override async sendRequest(): Promise<ISession> {
				sent = true;
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);
		const cts = disposables.add(new CancellationTokenSource());

		const request = service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, {
			isolationMode: 'worktree',
			branch: 'main',
		}, cts.token);
		await Promise.resolve();
		cts.cancel();

		await assert.rejects(request, /Canceled/);
		assert.deepStrictEqual({ deleted, sent }, { deleted: true, sent: false });
		await configurationDone.complete();
	});

	test('createAndSendNewChatRequest cancels a pending send and disposes the draft', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const sendDone = new DeferredPromise<void>();
		let deleted = false;
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override deleteNewSession(): void {
				deleted = true;
			}
			override async sendRequest(): Promise<ISession> {
				await sendDone.p;
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);
		const cts = disposables.add(new CancellationTokenSource());

		const request = service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, undefined, cts.token);
		await Promise.resolve();
		cts.cancel();

		await assert.rejects(request, /Canceled/);
		assert.strictEqual(deleted, true);
		await sendDone.complete();
	});

	test('createAndSendNewChatRequest rejects worktree configuration for unsupported session types', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		let created = false;
		let sent = false;
		const provider = new class extends TestSessionsProvider {
			override readonly sessionTypes: readonly ISessionType[] = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'test', label: 'Test', icon: Codicon.vm }];
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override createNewSession(): ISession {
				created = true;
				return session;
			}
			override async sendRequest(): Promise<ISession> {
				sent = true;
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		await assert.rejects(
			() => service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, {
				isolationMode: 'worktree',
				branch: 'legacy-branch',
			}),
			/No sessions provider supports worktree configuration/,
		);

		assert.deepStrictEqual({ created, sent }, { created: false, sent: false });
	});

	test('createAndSendNewChatRequest permits folder isolation for unsupported worktree session types', async () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		let sent = false;
		const provider = new class extends TestSessionsProvider {
			override readonly sessionTypes: readonly ISessionType[] = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'test', label: 'Test', icon: Codicon.vm }];
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override async sendRequest(): Promise<ISession> {
				sent = true;
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		const result = await service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, {
			isolationMode: 'workspace',
		});

		assert.deepStrictEqual({ providerId: result?.providerId, sent }, { providerId: 'test', sent: true });
	});

	test('a pull request rejects providers without worktree configuration before creation', async () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		let created = false;
		let sent = false;
		const provider = new class extends TestSessionsProvider {
			override readonly sessionTypes: readonly ISessionType[] = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'test', label: 'Test', icon: Codicon.vm }];
			override resolveWorkspace(uri: URI): ISessionWorkspace {
				return { uri, label: 'Test', icon: Codicon.folder, folders: [], requiresWorkspaceTrust: false, isVirtualWorkspace: false };
			}
			override createNewSession(): ISession {
				created = true;
				return session;
			}
			override async sendRequest(): Promise<ISession> {
				sent = true;
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);
		await assert.rejects(service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, {
			providerId: provider.id,
			sessionTypeId: 'test',
			isolationMode: 'workspace',
			pullRequestUrl: 'https://github.com/microsoft/vscode/pull/1',
		}), /does not support worktree configuration/);
		assert.deepStrictEqual({ created, sent }, { created: false, sent: false });
	});

	test('createAndSendNewChatRequest disposes stranded draft when a setter throws', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		let deleted = false;
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override setModel(): void { throw new Error('model not found'); }
			override deleteNewSession(): void { deleted = true; }
			override async sendRequest(_sessionId: string, _chatResource: URI, _options: ISendRequestOptions): Promise<ISession> { return session; }
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		await assert.rejects(
			() => service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' }, { modelId: 'bad' }),
			/model not found/,
		);
		assert.strictEqual(deleted, true);
	});

	test('createAndSendNewChatRequest returns undefined when service is disposed mid-send', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const serviceRef: { current?: ISessionsManagementService } = {};
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override async sendRequest(_sessionId: string, _chatResource: URI, _options: ISendRequestOptions): Promise<ISession> {
				// Dispose the service while the send is in-flight.
				(serviceRef.current as unknown as { dispose(): void }).dispose();
				return session;
			}
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);
		serviceRef.current = service;

		const result = await service.createAndSendNewChatRequest(URI.parse('test:///folder'), { query: 'hi' });
		assert.strictEqual(result, undefined);
	});

	test('discardNewSession fires onDidDiscardNewSession with the discarded draft', () => {
		const session = stubSession({ sessionId: 's1', providerId: 'test' });
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		const discarded: string[] = [];
		disposables.add(service.onDidDiscardNewSession(s => discarded.push(s.sessionId)));

		// Establish a pending draft, then abandon it.
		service.createNewSession(URI.parse('test:///folder'));
		service.discardNewSession();

		assert.deepStrictEqual(discarded, ['s1']);
	});

	test('createNewSession fires replacement before publishing the new draft', () => {
		const drafts = [
			stubSession({ sessionId: 's1', providerId: 'test' }),
			stubSession({ sessionId: 's2', providerId: 'test' }),
		];
		const deleted: string[] = [];
		let createIndex = 0;
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override createNewSession(): ISession { return drafts[createIndex++]; }
			override deleteNewSession(sessionId: string): void { deleted.push(sessionId); }
		}(drafts[0]);
		const { service } = createSessionsManagementService(drafts[0], disposables, provider);

		const replacements: { from: string; to: string; currentDraft: string | undefined }[] = [];
		disposables.add(service.onDidReplaceNewDraftSession(({ from, to }) => {
			replacements.push({ from: from.sessionId, to: to.sessionId, currentDraft: service.newSession.get()?.sessionId });
		}));

		service.createNewSession(URI.parse('test:///folder'));
		service.createNewSession(URI.parse('test:///folder'));

		assert.deepStrictEqual({
			replacements,
			deleted,
			currentDraft: service.newSession.get()?.sessionId,
		}, {
			replacements: [{ from: 's1', to: 's2', currentDraft: 's1' }],
			deleted: ['s1'],
			currentDraft: 's2',
		});
	});

	test('createNewSession keeps the previous draft when replacement creation fails', () => {
		const draft = stubSession({ sessionId: 's1', providerId: 'test' });
		let createCount = 0;
		const deleted: string[] = [];
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
			override createNewSession(): ISession {
				if (createCount++ > 0) {
					throw new Error('create failed');
				}
				return draft;
			}
			override deleteNewSession(sessionId: string): void { deleted.push(sessionId); }
		}(draft);
		const { service } = createSessionsManagementService(draft, disposables, provider);
		const replacements: string[] = [];
		disposables.add(service.onDidReplaceNewDraftSession(({ from, to }) => replacements.push(`${from.sessionId}->${to.sessionId}`)));

		service.createNewSession(URI.parse('test:///folder'));
		assert.throws(() => service.createNewSession(URI.parse('test:///folder')), /create failed/);

		assert.deepStrictEqual({
			currentDraft: service.newSession.get()?.sessionId,
			replacements,
			deleted,
		}, {
			currentDraft: 's1',
			replacements: [],
			deleted: [],
		});
	});

	for (const focusInSession of [false, true]) {
		test(`background draft replacement ${focusInSession ? 'restores composer focus' : 'preserves focus outside the session'}`, async () => {
			const drafts = [
				stubSession({ sessionId: 'first-draft', providerId: 'test' }),
				stubSession({ sessionId: 'replacement-draft', providerId: 'test' }),
			];
			const other = stubSession({ sessionId: 'other', providerId: 'test' });
			const folderUri = URI.parse('test:///folder');
			let createIndex = 0;
			const provider = new class extends TestSessionsProvider {
				override getSessions(): ISession[] { return [other]; }
				override resolveWorkspace(): ISessionWorkspace { return { uri: folderUri, folders: [], label: 'Folder', icon: Codicon.folder, requiresWorkspaceTrust: false, isVirtualWorkspace: false }; }
				override createNewSession(): ISession { return drafts[createIndex++]; }
			}(drafts[0]);
			const { view, sessionsPartService } = createSessionsManagementService(drafts[0], disposables, provider);
			await view.openNewSession({ folderUri });
			const sessionView = new class extends mock<SessionView>() { }();
			sessionsPartService.sessionViews.set(drafts[0].sessionId, sessionView);
			sessionsPartService.focusedSessionView = focusInSession ? sessionView : undefined;
			sessionsPartService.focusedSessions.length = 0;

			await view.openNewSession({ folderUri, preserveNavigation: true });
			const afterReplacement = {
				active: activeSessionOf(view)?.sessionId,
				focused: [...sessionsPartService.focusedSessions],
			};
			await view.openSession(other.resource);

			assert.deepStrictEqual({
				afterReplacement,
				afterExplicitOpen: {
					active: activeSessionOf(view)?.sessionId,
					focused: sessionsPartService.focusedSessions,
				},
			}, {
				afterReplacement: {
					active: 'replacement-draft',
					focused: focusInSession ? ['replacement-draft'] : [],
				},
				afterExplicitOpen: {
					active: 'other',
					focused: focusInSession ? ['replacement-draft', 'other'] : ['other'],
				},
			});
		});
	}

	test('automation draft lifecycle and session template are isolated from the new-session draft', async () => {
		const drafts = [
			stubSession({ sessionId: 'automation-workspace', providerId: 'test' }),
			stubSession({ sessionId: 'new-session', providerId: 'test' }),
			stubSession({ sessionId: 'automation-quick-chat', providerId: 'test' }),
			stubSession({ sessionId: 'automation-replacement', providerId: 'test' }),
			stubSession({ sessionId: 'automation-quick-chat-fresh', providerId: 'test' }),
		];
		const deleted: string[] = [];
		const createOptions: Array<ISessionsProviderCreateSessionOptions | undefined> = [];
		const sessionTemplate: IAutomationSessionTemplate = {
			modelId: 'model',
			agent: { uri: 'file:///agent.md' },
			config: { mode: 'plan' },
		};
		let createIndex = 0;
		const provider = new class extends TestSessionsProvider {
			override readonly supportsQuickChats = true;
			override readonly supportsAutomationSessionConfiguration = true;
			override readonly automations = upcastPartial<NonNullable<ISessionsProvider['automations']>>({
				catalogueState: constObservable('ready'),
				canCreateAutomation: constObservable(false),
			});
			override resolveWorkspace(folderUri: URI): ISessionWorkspace {
				return {
					uri: folderUri,
					label: 'Workspace',
					icon: Codicon.folder,
					folders: [],
					requiresWorkspaceTrust: false,
					isVirtualWorkspace: false,
				};
			}
			override createNewSession(_folderUri: URI, _sessionTypeId: string, options?: ISessionsProviderCreateSessionOptions): ISession {
				createOptions.push(options);
				return drafts[createIndex++];
			}
			override createQuickChat(_sessionTypeId: string, options?: ISessionsProviderCreateSessionOptions): ISession {
				createOptions.push(options);
				return drafts[createIndex++];
			}
			override async getAutomationSessionConfiguration() { return { sessionTemplate }; }
			override deleteNewSession(sessionId: string): void { deleted.push(sessionId); }
		}(drafts[0]);
		const { service } = createSessionsManagementService(drafts[0], disposables, provider);
		const folderUri = URI.parse('test:///folder');

		const firstAutomationSession = service.createAutomationSession(folderUri, { sessionTemplate });
		const capturedConfiguration = await service.getAutomationSessionConfiguration(firstAutomationSession);
		service.createNewSession(folderUri, { sessionTemplate });
		service.createAutomationQuickChat({ sessionTemplate });
		service.discardAutomationSession(firstAutomationSession);
		service.createAutomationSession(folderUri);
		service.createAutomationQuickChat();
		service.discardAutomationSession();

		assert.deepStrictEqual({
			newSession: service.newSession.get()?.sessionId,
			automationSession: service.automationSession.get()?.sessionId,
			capturedConfiguration,
			createOptions,
			deleted,
		}, {
			newSession: 'new-session',
			automationSession: undefined,
			capturedConfiguration: { sessionTemplate },
			createOptions: [
				{ metadata: undefined, automationConfiguration: { sessionTemplate }, isAutomationDraft: true },
				{ metadata: undefined, automationConfiguration: { sessionTemplate } },
				{ metadata: undefined, automationConfiguration: { sessionTemplate }, isAutomationDraft: true },
				{ metadata: undefined, isAutomationDraft: true },
				{ metadata: undefined, isAutomationDraft: true },
			],
			deleted: ['automation-workspace', 'automation-quick-chat', 'automation-replacement', 'automation-quick-chat-fresh'],
		});
	});

	test('unavailable Automation authorities cannot create drafts but ordinary sessions still work', () => {
		const session = stubSession({ sessionId: 'draft', providerId: 'test' });
		let created = 0;
		const provider = new class extends TestSessionsProvider {
			override readonly supportsQuickChats = true;
			override resolveWorkspace(folderUri: URI): ISessionWorkspace {
				return { uri: folderUri, label: 'Workspace', icon: Codicon.folder, folders: [], requiresWorkspaceTrust: false, isVirtualWorkspace: false };
			}
			override createNewSession(): ISession { created++; return session; }
			override createQuickChat(): ISession { created++; return session; }
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);
		const folder = URI.parse('test:///folder');
		assert.throws(() => service.createAutomationSession(folder), /does not currently provide Automation configuration/);
		assert.throws(() => service.createAutomationQuickChat(), /does not currently provide Automation configuration/);
		service.createNewSession(folder);
		assert.deepStrictEqual({ created, automation: service.automationSession.get(), ordinary: service.newSession.get() }, { created: 1, automation: undefined, ordinary: session });
	});

	test('sendNewChatRequest clears the draft without firing onDidDiscardNewSession', async () => {
		const chat: IChat = { ...stubChat, resource: URI.parse('test:///chat') };
		const session = stubSession({
			sessionId: 's1',
			providerId: 'test',
			chats: constObservable([chat]),
			mainChat: constObservable(chat),
		});
		const provider = new class extends TestSessionsProvider {
			override resolveWorkspace(): ISessionWorkspace { return { folderUri: URI.parse('test:///folder') } as unknown as ISessionWorkspace; }
		}(session);
		const { service } = createSessionsManagementService(session, disposables, provider);

		let discardCount = 0;
		disposables.add(service.onDidDiscardNewSession(() => discardCount++));

		// Sending the composed draft graduates it into the list rather than
		// discarding it, so the discard event must not fire.
		const draft = service.createNewSession(URI.parse('test:///folder'));
		await service.sendNewChatRequest(draft, { query: 'hi' });

		assert.strictEqual(discardCount, 0);
	});

	test('getAllSessionTypes orders providers by their order property (lower first)', () => {
		const service = createOrderedTypesService(disposables, 0, 1);
		assert.deepStrictEqual(service.getAllSessionTypes().map(type => type.id), ['copilot', 'agent-host']);
	});

	test('getAllSessionTypes surfaces local agent host types first when it has lower order', () => {
		const service = createOrderedTypesService(disposables, 0, -1);
		assert.deepStrictEqual(service.getAllSessionTypes().map(type => type.id), ['agent-host', 'copilot']);
	});

	test('replacing the active session promotes the committed session to active', async () => {
		const draft = stubSession({ sessionId: 'draft', providerId: 'test' });
		const committed = stubSession({ sessionId: 'committed', providerId: 'test' });
		const onDidReplaceSession = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		const provider = new class extends TestSessionsProvider {
			override readonly onDidReplaceSession = onDidReplaceSession.event;
			constructor() { super(draft); }
			override getSessions(): ISession[] { return [draft, committed]; }
		};
		const { view } = createSessionsManagementService(draft, disposables, provider);

		// Open the draft so it becomes the active session.
		await view.openSession(draft.resource);
		assert.strictEqual(activeSessionOf(view)?.sessionId, 'draft');

		// The provider atomically replaces the draft with a committed session
		// (e.g. after the first turn). The complete flow must: swap the visible
		// grid slot, make the committed session active in the view, and update
		// the canonical active session in the management service.
		onDidReplaceSession.fire({ from: draft, to: committed });

		assert.deepStrictEqual({
			visible: slotSessionsOf(view).map(s => s?.sessionId ?? null),
			active: activeSessionOf(view)?.sessionId ?? null,
		}, {
			visible: ['committed'],
			active: 'committed',
		});
	});

	for (const focusInSession of [false, true]) {
		test(`same-ID session replacement ${focusInSession ? 'restores composer focus' : 'preserves external focus'}`, async () => {
			const before = stubSession({ sessionId: 'same', providerId: 'test', resource: URI.parse('test:///before') });
			const after = stubSession({ sessionId: 'same', providerId: 'test', resource: URI.parse('test:///after') });
			const other = stubSession({ sessionId: 'other', providerId: 'test' });
			const onDidReplaceSession = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
			const provider = new class extends TestSessionsProvider {
				override readonly onDidReplaceSession = onDidReplaceSession.event;
				constructor() { super(before); }
				override getSessions(): ISession[] { return [before, other]; }
			};
			const { view, sessionsPartService } = createSessionsManagementService(before, disposables, provider);

			await view.openSession(before.resource);
			const sessionView = new class extends mock<SessionView>() { }();
			sessionsPartService.sessionViews.set(before.sessionId, sessionView);
			sessionsPartService.focusedSessionView = focusInSession ? sessionView : undefined;
			sessionsPartService.focusedSessions.length = 0;

			onDidReplaceSession.fire({ from: before, to: after });
			view.insertAt(other, after.sessionId, 'right', false);

			assert.deepStrictEqual({
				activeResource: activeSessionOf(view)?.resource.toString(),
				focusedSessions: sessionsPartService.focusedSessions,
			}, {
				activeResource: after.resource.toString(),
				focusedSessions: focusInSession ? ['same'] : [],
			});
		});
	}

	test('replacing a non-active session leaves the active session unchanged', async () => {
		const active = stubSession({ sessionId: 'active', providerId: 'test' });
		const draft = stubSession({ sessionId: 'draft', providerId: 'test' });
		const committed = stubSession({ sessionId: 'committed', providerId: 'test' });
		const onDidReplaceSession = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		const provider = new class extends TestSessionsProvider {
			override readonly onDidReplaceSession = onDidReplaceSession.event;
			constructor() { super(active); }
			override getSessions(): ISession[] { return [active, draft, committed]; }
		};
		const { view } = createSessionsManagementService(active, disposables, provider);

		// Open `active` and add `draft` to the grid alongside it without
		// activating, so `draft` is visible but not the active session.
		await view.openSession(active.resource);
		view.insertAt(draft, 'active', 'right', false);
		assert.strictEqual(activeSessionOf(view)?.sessionId, 'active');

		// Replacing the non-active `draft` swaps its grid slot to `committed`
		// but must not hijack the active session.
		onDidReplaceSession.fire({ from: draft, to: committed });

		assert.deepStrictEqual({
			visible: slotSessionsOf(view).map(s => s?.sessionId ?? null),
			active: activeSessionOf(view)?.sessionId ?? null,
		}, {
			visible: ['active', 'committed'],
			active: 'active',
		});
	});

	test('opens a session and targeted chat to the side', async () => {
		const firstChat = { ...stubChat, resource: URI.parse('test:///first/main') };
		const targetMain = { ...stubChat, resource: URI.parse('test:///target/main') };
		const targetPeer = { ...stubChat, resource: URI.parse('test:///target/peer') };
		const first = stubSession({ sessionId: 'first', providerId: 'test', chats: constObservable([firstChat]), mainChat: constObservable(firstChat) });
		const target = stubSession({ sessionId: 'target', providerId: 'test', chats: constObservable([targetMain, targetPeer]), mainChat: constObservable(targetMain) });
		const provider = new class extends TestSessionsProvider {
			constructor() { super(first); }
			override getSessions(): ISession[] { return [first, target]; }
		};
		const { view } = createSessionsManagementService(first, disposables, provider);
		await view.openSession(first.resource);

		await view.openSessionToSide(target, { chatResource: targetPeer.resource });

		assert.deepStrictEqual({
			visible: slotSessionsOf(view).map(session => session?.sessionId),
			activeSession: activeSessionOf(view)?.sessionId,
			activeChat: activeChatOf(view)?.resource.toString(),
		}, {
			visible: ['first', 'target'],
			activeSession: 'target',
			activeChat: targetPeer.resource.toString(),
		});
	});

	for (const placement of ['source', 'closedSource', 'default'] as const) {
		test(`opens a fork to the side with ${placement} placement without replacing its neighbors`, async () => {
			const main = { ...stubChat, resource: URI.parse('test:///source/main') };
			const peer = { ...stubChat, resource: URI.parse('test:///source/peer') };
			const source = stubSession({ sessionId: 'source', providerId: 'test', chats: constObservable([main, peer]), mainChat: constObservable(main) });
			const neighbor = stubSession({ sessionId: 'neighbor', providerId: 'test' });
			const fork = stubSession({ sessionId: 'fork', providerId: 'test' });
			const provider = new class extends TestSessionsProvider {
				constructor() { super(source); }
				override getSessions(): ISession[] { return [source, neighbor, fork]; }
			};
			const { view } = createSessionsManagementService(source, disposables, provider);
			await view.openChat(source, peer.resource);
			await view.openSessionToSide(neighbor);
			if (placement === 'closedSource') {
				view.closeSession(source);
			}

			await view.openSessionToSide(fork, {
				source: 'fork',
				referenceSessionId: placement === 'default' ? undefined : source.sessionId,
			});

			assert.deepStrictEqual({
				visible: slotSessionsOf(view).map(session => session?.sessionId),
				sourceChat: slotPaneOf(view, source.sessionId)?.chat.get()?.resource.toString(),
				active: activeSessionOf(view)?.sessionId,
			}, {
				visible: placement === 'source' ? ['source', 'fork', 'neighbor'] : placement === 'closedSource' ? ['neighbor', 'fork'] : ['source', 'neighbor', 'fork'],
				sourceChat: placement === 'closedSource' ? undefined : peer.resource.toString(),
				active: 'fork',
			});
		});
	}

	test('replacing a session only swaps the active session when it matches `from`', async () => {
		const a = stubSession({ sessionId: 'a', providerId: 'test' });
		const b = stubSession({ sessionId: 'b', providerId: 'test' });
		const other = stubSession({ sessionId: 'other', providerId: 'test' });
		const onDidReplaceSession = disposables.add(new Emitter<{ from: ISession; to: ISession }>());
		const provider = new class extends TestSessionsProvider {
			override readonly onDidReplaceSession = onDidReplaceSession.event;
			constructor() { super(a); }
			override getSessions(): ISession[] { return [a, b, other]; }
		};
		const { view } = createSessionsManagementService(a, disposables, provider);

		await view.openSession(a.resource);
		assert.strictEqual(activeSessionOf(view)?.sessionId, 'a');

		// `from` does not match the active session: active stays put.
		onDidReplaceSession.fire({ from: other, to: b });
		assert.strictEqual(activeSessionOf(view)?.sessionId, 'a');

		// `from` matches the active session: active is replaced with `to`.
		onDidReplaceSession.fire({ from: a, to: b });
		assert.strictEqual(activeSessionOf(view)?.sessionId, 'b');
	});

	suite('deleteSessions', () => {

		class RecordingProvider extends TestSessionsProvider {
			readonly deleted: string[][] = [];
			constructor(public override readonly id: string, private readonly _fail: boolean, session: ISession) {
				super(session);
			}
			override async deleteSessions(sessionIds: readonly string[]): Promise<void> {
				this.deleted.push([...sessionIds]);
				if (this._fail) {
					throw new Error(`${this.id} failed`);
				}
			}
		}

		function createService(providers: ISessionsProvider[]): ISessionsManagementService {
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
			instantiationService.stub(ILogService, new NullLogService());
			instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
			instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService(providers));
			instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
			instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
			instantiationService.stub(IProgressService, new TestProgressService());
			instantiationService.stub(IChatService, new class extends mock<IChatService>() {
				override readonly onDidSubmitRequest = Event.None;
			});
			instantiationService.stub(IChatWidgetHistoryService, new class extends mock<IChatWidgetHistoryService>() {
				override moveHistory(): void { }
			});
			return disposables.add(instantiationService.createInstance(SessionsManagementService));
		}

		test('groups sessions by provider and continues when one provider fails (best-effort)', async () => {
			const s1 = stubSession({ sessionId: 's1', providerId: 'p1' });
			const s2 = stubSession({ sessionId: 's2', providerId: 'p2' });
			const failing = new RecordingProvider('p1', true, s1);
			const succeeding = new RecordingProvider('p2', false, s2);
			const service = createService([failing, succeeding]);

			const deleted: string[] = [];
			disposables.add(service.onDidDeleteSession(session => deleted.push(session.sessionId)));

			await assert.rejects(service.deleteSessions([s1, s2]), /p1 failed/);

			assert.deepStrictEqual({
				failingDeleted: failing.deleted,
				succeedingDeleted: succeeding.deleted,
				eventsFired: deleted,
			}, {
				failingDeleted: [['s1']],
				succeedingDeleted: [['s2']],
				eventsFired: ['s2'],
			});
		});
	});

	suite('chat owner replacement', () => {
		test('provider-confirmed same-resource graduation maps the main owner and retains sibling identity', () => {
			const fromMain = { ...stubChat, resource: URI.parse('draft-chat:/main') };
			const toMain = { ...stubChat, resource: URI.parse('created-chat:/main') };
			const peer = { ...stubChat, resource: URI.parse('peer-chat:/opaque') };
			const from = stubSession({ sessionId: 'same', providerId: 'test', mainChat: constObservable(fromMain) });
			const to = { ...from, mainChat: constObservable(toMain) };
			const replacement = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
			const provider = new class extends TestSessionsProvider {
				override readonly onDidReplaceSession = replacement.event;
			}(from);
			const { service } = createSessionsManagementService(from, disposables, provider);
			const owners = [
				{ sessionResource: from.resource, chatResource: fromMain.resource },
				{ sessionResource: from.resource, chatResource: peer.resource },
			];
			const transferred: typeof owners = [];
			disposables.add(service.onDidReplaceSession(event => {
				transferred.push(...owners.map(owner => getChatLayoutOwnerAfterReplacement(owner, event)));
			}));
			replacement.fire({ from, to });
			assert.deepStrictEqual(transferred, [
				{ sessionResource: to.resource, chatResource: toMain.resource },
				{ sessionResource: to.resource, chatResource: peer.resource },
			]);
		});
	});

	suite('deleteChat', () => {
		test('captures the requested owner before delayed confirmation and does not emit on provider failure', async () => {
			const main = { ...stubChat, resource: URI.parse('test:///main') };
			const peer = { ...stubChat, resource: URI.parse('test:///peer') };
			const chats = observableValue<readonly IChat[]>('chats', [main, peer]);
			const session = stubSession({ sessionId: 'session', providerId: 'test', chats, mainChat: constObservable(main) });
			const confirmation = new DeferredPromise<boolean>();
			let fail = false;
			const provider = new class extends TestSessionsProvider {
				override async deleteChat(): Promise<boolean> {
					if (fail) {
						throw new Error('provider failure');
					}
					return confirmation.p;
				}
			}(session);
			const { service } = createSessionsManagementService(session, disposables, provider);
			const events: IChatDeletedEvent[] = [];
			disposables.add(service.onDidDeleteChat(event => events.push(event)));
			const pending = service.deleteChat(session, peer.resource);
			const beforeConfirmation = events.length;
			chats.set([], undefined);
			await confirmation.complete(true);
			const deleted = await pending;
			fail = true;
			await assert.rejects(service.deleteChat(session, main.resource), /provider failure/);
			assert.deepStrictEqual({ beforeConfirmation, deleted, events }, {
				beforeConfirmation: 0, deleted: true,
				events: [{ session, sessionResource: session.resource, chatResource: peer.resource }],
			});
		});

		for (const deleted of [true, false]) {
			test(`returns ${deleted} and fires the delete event only after deletion`, async () => {
				const session = stubSession({ sessionId: 'session', providerId: 'test' });
				const provider = new class extends TestSessionsProvider {
					override async deleteChat(): Promise<boolean> {
						return deleted;
					}
				}(session);
				const { service } = createSessionsManagementService(session, disposables, provider);
				const events: IChatDeletedEvent[] = [];
				disposables.add(service.onDidDeleteChat(event => events.push(event)));

				const chatResource = URI.parse('test:///chat');
				const result = await service.deleteChat(session, chatResource);

				assert.deepStrictEqual({ result, events }, {
					result: deleted,
					events: deleted ? [{ session, sessionResource: session.resource, chatResource }] : [],
				});
			});
		}

		test('deletes without confirmation only an untitled chat without requests', async () => {
			const untitled: IChat = { ...stubChat, resource: URI.parse('test:///untitled'), status: constObservable(SessionStatus.Untitled) };
			const sentUntitled: IChat = { ...stubChat, resource: URI.parse('test:///sent-untitled'), status: constObservable(SessionStatus.Untitled) };
			const committed: IChat = { ...stubChat, resource: URI.parse('test:///committed'), status: constObservable(SessionStatus.Completed) };
			const session = stubSession({ sessionId: 'session', providerId: 'test', chats: constObservable([untitled, sentUntitled, committed]) });
			const providerDeletes: string[] = [];
			const provider = new class extends TestSessionsProvider {
				override async deleteChat(_sessionId: string, chatUri: URI): Promise<boolean> {
					providerDeletes.push(chatUri.toString());
					return true;
				}
			}(session);
			const { service, chatService } = createSessionsManagementService(session, disposables, provider);
			chatService.resourcesWithRequests.push(sentUntitled.resource);

			const results = {
				untitled: await service.deleteChat(session, untitled.resource, { skipConfirmation: true }),
				sentUntitled: await service.deleteChat(session, sentUntitled.resource, { skipConfirmation: true }),
				committed: await service.deleteChat(session, committed.resource, { skipConfirmation: true }),
				committedConfirmed: await service.deleteChat(session, committed.resource),
			};

			assert.deepStrictEqual({ results, providerDeletes }, {
				results: { untitled: true, sentUntitled: false, committed: false, committedConfirmed: true },
				providerDeletes: [untitled.resource.toString(), committed.resource.toString()],
			});
		});
	});

	suite('createNewChatInSession', () => {

		test('reuses an existing untitled chat instead of creating a new one', async () => {
			const untitledChat: IChat = { ...stubChat, resource: URI.parse('test:///untitled'), status: constObservable(SessionStatus.Untitled) };
			const session = stubSession({ sessionId: 'reuse', providerId: 'test', chats: constObservable([untitledChat]) });
			let createNewChatCalls = 0;
			const provider = new class extends TestSessionsProvider {
				constructor() { super(session); }
				override async createNewChat(): Promise<IChat> {
					createNewChatCalls++;
					return stubChat;
				}
			};
			const { service } = createSessionsManagementService(session, disposables, provider);

			const result = await service.createNewChatInSession(session);

			assert.deepStrictEqual({
				reused: result === untitledChat,
				createNewChatCalls,
			}, {
				reused: true,
				createNewChatCalls: 0,
			});
		});

		test('without a harness, reuses only a draft of the main harness and creates a chat of the main harness', async () => {
			const otherDraft: IChat = { ...stubChat, resource: URI.parse('test:///other-draft'), harness: 'other', status: constObservable(SessionStatus.Untitled) };
			const createdChat: IChat = { ...stubChat, resource: URI.parse('test:///created') };
			const session = stubSession({ sessionId: 'main-harness-reuse', providerId: 'test', harness: 'main', chats: constObservable([otherDraft]) });
			const requests: (ICreateNewChatOptions | undefined)[] = [];
			const provider = new class extends TestSessionsProvider {
				constructor() { super(session); }
				override async createNewChat(_sessionId?: string, _prompt?: string, options?: ICreateNewChatOptions): Promise<IChat> {
					requests.push(options);
					return createdChat;
				}
			};
			const { service } = createSessionsManagementService(session, disposables, provider);

			// The New Chat action passes no options; the composer resets with `forceNew` after a background send.
			const fromAction = await service.createNewChatInSession(session);
			const afterSend = await service.createNewChatInSession(session, { forceNew: true });

			assert.deepStrictEqual({
				fromAction: fromAction?.resource.toString(),
				afterSend: afterSend?.resource.toString(),
				requestedHarnesses: requests.map(options => options?.harness),
			}, {
				fromAction: createdChat.resource.toString(),
				afterSend: createdChat.resource.toString(),
				requestedHarnesses: [undefined, undefined],
			});
		});

		test('reuses an untitled chat only when it uses the requested harness', async () => {
			const untitledChat: IChat = { ...stubChat, resource: URI.parse('test:///untitled'), status: constObservable(SessionStatus.Untitled) };
			const createdChat: IChat = { ...stubChat, resource: URI.parse('test:///created'), harness: 'other' };
			const session = stubSession({ sessionId: 'harness-reuse', providerId: 'test', harness: 'main', chats: constObservable([untitledChat]) });
			const requests: (string | undefined)[] = [];
			const provider = new class extends TestSessionsProvider {
				constructor() { super(session); }
				override async createNewChat(_sessionId?: string, _prompt?: string, options?: ICreateNewChatOptions): Promise<IChat> {
					requests.push(options?.harness);
					return createdChat;
				}
			};
			const { service } = createSessionsManagementService(session, disposables, provider);

			const sameHarness = await service.createNewChatInSession(session, { harness: 'main' });
			const otherHarness = await service.createNewChatInSession(session, { harness: 'other' });

			assert.deepStrictEqual({
				sameHarnessReused: sameHarness === untitledChat,
				otherHarness: otherHarness?.resource.toString(),
				requests,
			}, {
				sameHarnessReused: true,
				otherHarness: createdChat.resource.toString(),
				requests: ['other'],
			});
		});

		test('asks the provider to create a chat when none are untitled', async () => {
			const activeChat: IChat = { ...stubChat, resource: URI.parse('test:///active'), status: constObservable(SessionStatus.InProgress) };
			const createdChat: IChat = { ...stubChat, resource: URI.parse('test:///created') };
			const session = stubSession({ sessionId: 'create', providerId: 'test', chats: constObservable([activeChat]) });
			let createNewChatCalls = 0;
			const provider = new class extends TestSessionsProvider {
				constructor() { super(session); }
				override async createNewChat(): Promise<IChat> {
					createNewChatCalls++;
					return createdChat;
				}
			};
			const { service } = createSessionsManagementService(session, disposables, provider);

			const result = await service.createNewChatInSession(session);

			assert.deepStrictEqual({
				result: result?.resource.toString(),
				createNewChatCalls,
			}, {
				result: createdChat.resource.toString(),
				createNewChatCalls: 1,
			});
		});

		test('forceNew creates a fresh chat even when an untitled one exists', async () => {
			const untitledChat: IChat = { ...stubChat, resource: URI.parse('test:///untitled'), status: constObservable(SessionStatus.Untitled) };
			const createdChat: IChat = { ...stubChat, resource: URI.parse('test:///created') };
			const session = stubSession({ sessionId: 'force-new', providerId: 'test', chats: constObservable([untitledChat]) });
			let createNewChatCalls = 0;
			const provider = new class extends TestSessionsProvider {
				constructor() { super(session); }
				override async createNewChat(): Promise<IChat> {
					createNewChatCalls++;
					return createdChat;
				}
			};
			const { service } = createSessionsManagementService(session, disposables, provider);

			const result = await service.createNewChatInSession(session, { forceNew: true });

			assert.deepStrictEqual({
				result: result?.resource.toString(),
				createNewChatCalls,
			}, {
				result: createdChat.resource.toString(),
				createNewChatCalls: 1,
			});
		});

		test('returns undefined when the provider is not found', async () => {
			const session = stubSession({ sessionId: 'orphan', providerId: 'missing-provider' });
			const provider = new TestSessionsProvider(stubSession({ sessionId: 'other', providerId: 'test' }));
			const { service } = createSessionsManagementService(session, disposables, provider);

			const result = await service.createNewChatInSession(session);

			assert.strictEqual(result, undefined);
		});
	});

	suite('applyNestedChatWorkspace', () => {

		test('delegates to the provider and propagates its refusal', async () => {
			const chat: IChat = { ...stubChat, resource: URI.parse('test:///untitled'), status: constObservable(SessionStatus.Untitled) };
			const session = stubSession({ sessionId: 'workspace', providerId: 'test', chats: constObservable([chat]) });
			const calls: string[] = [];
			let refuse = false;
			const provider = new class extends TestSessionsProvider {
				constructor() { super(session); }
				override async applyNestedChatWorkspace(sessionId: string, chatResource: URI, workspace: INestedChatWorkspace, prompt: string): Promise<void> {
					calls.push(`${sessionId} ${chatResource.toString()} ${workspace.kind} ${prompt}`);
					if (refuse) {
						throw new NestedChatWorkspaceError('refused', 'refused by host');
					}
				}
			};
			const { service } = createSessionsManagementService(session, disposables, provider);

			await service.applyNestedChatWorkspace(session, chat, { kind: 'scratch' }, 'Fix the bug');
			refuse = true;
			const error = await service.applyNestedChatWorkspace(session, chat, { kind: 'folder', folder: URI.file('/repo'), isolation: 'folder' }, '').then(() => undefined, e => e);

			assert.deepStrictEqual({
				calls,
				error: error instanceof NestedChatWorkspaceError ? error.kind : undefined,
			}, {
				calls: [`workspace ${chat.resource.toString()} scratch Fix the bug`, `workspace ${chat.resource.toString()} folder `],
				error: 'refused',
			});
		});

		test('is not supported when the provider is not found', async () => {
			const session = stubSession({ sessionId: 'orphan', providerId: 'missing-provider' });
			const provider = new TestSessionsProvider(stubSession({ sessionId: 'other', providerId: 'test' }));
			const { service } = createSessionsManagementService(session, disposables, provider);

			const error = await service.applyNestedChatWorkspace(session, stubChat, { kind: 'scratch' }, '').then(() => undefined, e => e);

			assert.strictEqual(error instanceof NestedChatWorkspaceError ? error.kind : undefined, 'notSupported');
		});
	});

	suite('forkChatInSession', () => {

		test('asks the provider to fork the chat with options when the session supports multiple chats', async () => {
			const sourceChat = URI.parse('test:///source');
			const forkedChat: IChat = { ...stubChat, resource: URI.parse('test:///forked') };
			const session = stubSession({ sessionId: 'fork', providerId: 'test', capabilities: constObservable({ supportsMultipleChats: true }) });
			let forkChatArgs: readonly [string, URI, string, IForkChatOptions | undefined] | undefined;
			const provider = new class extends TestSessionsProvider {
				constructor() { super(session); }
				override async forkChat(sessionId: string, sourceChat: URI, turnId: string, options?: IForkChatOptions): Promise<IChat> {
					forkChatArgs = [sessionId, sourceChat, turnId, options];
					return forkedChat;
				}
			};
			const { service } = createSessionsManagementService(session, disposables, provider);

			const result = await service.forkChatInSession(session, sourceChat, 'turn-1', { title: 'Named fork' });

			assert.deepStrictEqual({
				result: result.resource.toString(),
				args: forkChatArgs && [
					forkChatArgs[0],
					forkChatArgs[1].toString(),
					forkChatArgs[2],
					forkChatArgs[3],
				],
			}, {
				result: forkedChat.resource.toString(),
				args: ['fork', sourceChat.toString(), 'turn-1', { title: 'Named fork' }],
			});
		});

		test('throws when the provider is not found', async () => {
			const session = stubSession({ sessionId: 'orphan', providerId: 'missing-provider', capabilities: constObservable({ supportsMultipleChats: true }) });
			const provider = new TestSessionsProvider(stubSession({ sessionId: 'other', providerId: 'test' }));
			const { service } = createSessionsManagementService(session, disposables, provider);

			await assert.rejects(() => service.forkChatInSession(session, URI.parse('test:///source'), 'turn-1'), /Provider 'missing-provider' not found/);
		});

		test('throws when the session does not support multiple chats', async () => {
			const session = stubSession({ sessionId: 'single-chat', providerId: 'test', capabilities: constObservable({ supportsMultipleChats: false }) });
			const { service } = createSessionsManagementService(session, disposables);

			await assert.rejects(() => service.forkChatInSession(session, URI.parse('test:///source'), 'turn-1'), /does not support forking into a chat/);
		});

	});

	suite('createSideChatInSession', () => {

		test('asks the provider to create side chats with the requested source context', async () => {
			const sourceChat = URI.parse('test:///source');
			const sideChat: IChat = { ...stubChat, resource: URI.parse('test:///side') };
			const session = stubSession({ sessionId: 'side', providerId: 'test', capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: true }) });
			const selection = { text: '  selected text  ' };
			const createSideChatArgs: [string, URI, string, ISideChatSelection | undefined, boolean | undefined][] = [];
			const provider = new class extends TestSessionsProvider {
				constructor() { super(session); }
				override async createSideChat(sessionId: string, sourceChat: URI, turnId: string, selection?: ISideChatSelection, includeSourceContext?: boolean): Promise<IChat> {
					createSideChatArgs.push([sessionId, sourceChat, turnId, selection, includeSourceContext]);
					return sideChat;
				}
			};
			const { service } = createSessionsManagementService(session, disposables, provider);

			const result = await service.createSideChatInSession(session, sourceChat, 'turn-1', selection);
			await service.createSideChatInSession(session, sourceChat, 'turn-1', undefined, false);

			assert.deepStrictEqual({
				result: result.resource.toString(),
				args: createSideChatArgs.map(args => args.map(arg => URI.isUri(arg) ? arg.toString() : arg)),
			}, {
				result: sideChat.resource.toString(),
				args: [
					['side', sourceChat.toString(), 'turn-1', selection, undefined],
					['side', sourceChat.toString(), 'turn-1', undefined, false],
				],
			});
		});

		test('throws when the provider is not found', async () => {
			const session = stubSession({ sessionId: 'orphan', providerId: 'missing-provider', capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: true }) });
			const provider = new TestSessionsProvider(stubSession({ sessionId: 'other', providerId: 'test' }));
			const { service } = createSessionsManagementService(session, disposables, provider);

			await assert.rejects(() => service.createSideChatInSession(session, URI.parse('test:///source'), 'turn-1'), /Provider 'missing-provider' not found/);
		});

		test('throws when the session does not support side chats', async () => {
			const session = stubSession({ sessionId: 'no-side-chat', providerId: 'test', capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: false }) });
			const { service } = createSessionsManagementService(session, disposables);

			await assert.rejects(() => service.createSideChatInSession(session, URI.parse('test:///source'), 'turn-1'), /does not support side chats/);
		});
	});

	suite('chat persistence', () => {

		function chat(id: string, status: SessionStatus = SessionStatus.Completed, origin?: ChatOriginKind): IChat {
			return {
				...stubChat,
				resource: URI.parse(`test:///chat/${id}`),
				title: constObservable(id),
				status: constObservable(status),
				origin: origin ? { kind: origin } : undefined,
			};
		}

		function multiChatSession(id: string, chats: IChat[]): ISession {
			return stubSession({
				sessionId: id,
				providerId: 'test',
				chats: constObservable(chats),
				mainChat: constObservable(chats[0]),
				capabilities: constObservable({ supportsMultipleChats: true }),
			});
		}

		function setup(sessions: ISession[]) {
			const provider = new class extends TestSessionsProvider {
				constructor() { super(sessions[0]); }
				override getSessions(): ISession[] { return sessions; }
			};
			return createSessionsManagementService(sessions[0], disposables, provider);
		}

		const closedTitles = (view: SessionsService) =>
			(view.activePane.get()?.tabs.closedChats.get() ?? []).map(c => c.title.get());

		test('the active side chat is restored after switching sessions', async () => {
			const sessionA = multiChatSession('A', [chat('mainA'), chat('sideA', SessionStatus.Completed, ChatOriginKind.SideChat)]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const { view } = setup([sessionA, sessionB]);

			await view.openSession(sessionA.resource);
			await view.openChat(sessionA, sessionA.chats.get()[1].resource);
			await view.openSession(sessionB.resource);
			await view.openSession(sessionA.resource, { restoreOnlySideOrToolChat: true });

			assert.strictEqual(activeChatOf(view)?.title.get(), 'sideA');
		});

		test('the active subagent chat is restored after switching sessions', async () => {
			const sessionA = multiChatSession('A', [chat('mainA'), chat('subagentA', SessionStatus.Completed, ChatOriginKind.Tool)]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const { view } = setup([sessionA, sessionB]);

			await view.openSession(sessionA.resource);
			await view.openChat(sessionA, sessionA.chats.get()[1].resource);
			await view.openSession(sessionB.resource);
			await view.openSession(sessionA.resource, { restoreOnlySideOrToolChat: true });

			assert.deepStrictEqual({
				activeChat: activeChatOf(view)?.title.get(),
				visibleTabs: view.activePane.get()?.tabs.visibleChatTabs.get().map(chat => chat.title.get()),
			}, {
				activeChat: 'subagentA',
				visibleTabs: ['mainA', 'subagentA'],
			});
		});

		test('chats that move into the main window from a chat window show as tabs of their sessions, also a closed one and a subagent the main window never showed; only the session of the first one becomes active, and they stay so as their session shows again', async () => {
			const sessionA = multiChatSession('A', [chat('mainA')]);
			const sessionB = multiChatSession('B', [chat('mainB'), chat('peerB', SessionStatus.Completed, ChatOriginKind.SideChat), chat('subagentB', SessionStatus.Completed, ChatOriginKind.Tool)]);
			const [mainB, peerB, subagentB] = sessionB.chats.get();
			const { view } = setup([sessionA, sessionB]);
			// The peer of B was closed in the main window before; its subagent opened beside it in a chat window only.
			await view.openSession(sessionB.resource);
			await view.openChat(sessionB, peerB.resource);
			await view.closeChat(activeSessionOf(view)!, peerB);
			await view.openSession(sessionA.resource);
			const tabsOf = (sessionId: string) => slotPaneOf(view, sessionId)?.tabs.visibleChatTabs.get().map(chat => chat.title.get());

			await view.openMovedChats([{ session: sessionA, chatResource: sessionA.mainChat.get().resource }, { session: sessionB, chatResource: peerB.resource }, { session: sessionB, chatResource: subagentB.resource }]);
			const moved = { active: activeSessionOf(view)?.sessionId, tabsOfB: tabsOf('B'), activeChatOfB: slotPaneOf(view, 'B')?.chat.get()?.title.get() };
			// Its session shows again, as after a reload: from what was remembered of it.
			view.closeSession(slotSessionsOf(view).find(session => session?.sessionId === 'B'));
			await view.openSession(sessionB.resource);

			assert.deepStrictEqual({ moved, again: tabsOf('B'), mainB: mainB.title.get() }, {
				moved: { active: 'A', tabsOfB: ['mainB', 'peerB', 'subagentB'], activeChatOfB: 'peerB' },
				again: ['mainB', 'peerB', 'subagentB'],
				mainB: 'mainB',
			});
		});

		test('a session whose only visible chat moves into a chat window leaves the grid, though it has a subagent chat it does not show; that subagent chat still opens in the grid afterwards', async () => {
			const sessionA = multiChatSession('A', [chat('mainA'), chat('subagentA', SessionStatus.Completed, ChatOriginKind.Tool)]);
			const [mainA, subagentA] = sessionA.chats.get();
			const { view } = setup([sessionA]);
			await view.openSession(sessionA.resource);
			disposables.add(chatHostOpeners.get(view)!.register({
				showsChat: shown => shown.toString() === mainA.resource.toString(),
				reveal: async () => { },
				openBeside: async () => { },
				close: async () => ({ restore: async () => { } }),
			}));
			const grid = () => {
				const active = view.activePane.get();
				return { visible: slotSessionsOf(view).map(session => session?.sessionId), active: activeSessionOf(view)?.sessionId, tabs: active?.session.get() ? active.tabs.visibleChatTabs.get().map(chat => chat.title.get()) : undefined };
			};

			disposables.add(view.hideChatFromGrid(sessionA, mainA.resource));
			const moved = grid();
			await view.openChat(sessionA, subagentA.resource);

			assert.deepStrictEqual({ moved, opened: grid() }, {
				moved: { visible: [undefined], active: undefined, tabs: undefined },
				opened: { visible: ['A'], active: 'A', tabs: ['subagentA'] },
			});
		});

		test('closing a chat that a chat editor shows closes its editor, and leaves the grid alone, which shows the same session', async () => {
			const sessionB = multiChatSession('B', [chat('mainB'), chat('peerB', SessionStatus.Completed, ChatOriginKind.SideChat)]);
			const [, peerB] = sessionB.chats.get();
			const { view } = setup([sessionB]);
			await view.openSession(sessionB.resource);
			await view.openChat(sessionB, peerB.resource);
			const closes: string[] = [];
			disposables.add(chatHostOpeners.get(view)!.register({
				showsChat: shown => shown.toString() === peerB.resource.toString(),
				reveal: async () => { },
				openBeside: async () => { },
				close: async closed => {
					closes.push(closed.path);
					return { restore: async () => { } };
				},
			}));
			const grid = () => ({ visible: slotSessionsOf(view).map(session => session?.sessionId), active: activeSessionOf(view)?.sessionId, activeChat: activeChatOf(view)?.title.get(), closed: closedTitles(view) });
			const before = grid();

			await view.closeChat(sessionB, peerB);
			await timeout(0);

			assert.deepStrictEqual({ closes, grid: grid() }, { closes: ['/chat/peerB'], grid: before });
		});

		for (const vetoed of [false, true]) {
			test(`a chat that a chat window shows, dropped into the grid, leaves its window first and shows in the grid as that chat, not revealed in its window; while its close is vetoed, it stays in its window, out of the grid (vetoed: ${vetoed})`, async () => {
				const sessionA = multiChatSession('A', [chat('mainA')]);
				const sessionB = multiChatSession('B', [chat('mainB'), chat('peerB', SessionStatus.Completed, ChatOriginKind.SideChat)]);
				const [, peerB] = sessionB.chats.get();
				const { view } = setup([sessionA, sessionB]);
				await view.openSession(sessionA.resource);
				let inWindow = true;
				const calls: string[] = [];
				disposables.add(chatHostOpeners.get(view)!.register({
					showsChat: shown => inWindow && shown.toString() === peerB.resource.toString(),
					reveal: async shown => { calls.push(`reveal ${shown.path}`); },
					openBeside: async () => { },
					close: async closed => {
						calls.push(`close ${closed.path}`);
						inWindow = vetoed;
						return vetoed ? undefined : { restore: async () => { } };
					},
				}));
				const visibility = Reflect.get(view, '_visibility') as VisibleSessions;

				await view.moveChatToGrid('B', peerB.resource, visibility.getGridSlots()[0].id, 'right');
				await timeout(0);

				// The panes of the grid that show a chat of their own, as a chat dropped into it shows
				const chatPanes = view.panes.get().filter(pane => pane.kind === SessionGridPaneKind.Detached).map(pane => `${pane.session.get()?.sessionId} ${pane.chat.get()?.resource.path}`);
				assert.deepStrictEqual({ calls, chatPanes }, { calls: ['close /chat/peerB'], chatPanes: vetoed ? [] : ['B /chat/peerB'] });
			});
		}

		test('a chat that a chat window shows, dropped onto a pane that is gone, stays in its window: nothing closes', async () => {
			const sessionA = multiChatSession('A', [chat('mainA')]);
			const sessionB = multiChatSession('B', [chat('mainB'), chat('peerB', SessionStatus.Completed, ChatOriginKind.SideChat)]);
			const [, peerB] = sessionB.chats.get();
			const { view } = setup([sessionA, sessionB]);
			await view.openSession(sessionA.resource);
			const calls: string[] = [];
			disposables.add(chatHostOpeners.get(view)!.register({
				showsChat: shown => shown.toString() === peerB.resource.toString(),
				reveal: async shown => { calls.push(`reveal ${shown.path}`); },
				openBeside: async () => { },
				close: async closed => {
					calls.push(`close ${closed.path}`);
					return { restore: async () => { } };
				},
			}));

			await view.moveChatToGrid('B', peerB.resource, 'gone', 'right');

			assert.deepStrictEqual(calls, []);
		});

		test('a chat that a chat window shows, dropped onto a pane that goes away as the chat leaves its window, goes back there rather than being lost', async () => {
			const sessionA = multiChatSession('A', [chat('mainA')]);
			const sessionB = multiChatSession('B', [chat('mainB'), chat('peerB', SessionStatus.Completed, ChatOriginKind.SideChat)]);
			const sessionC = multiChatSession('C', [chat('mainC')]);
			const [, peerB] = sessionB.chats.get();
			const { view } = setup([sessionA, sessionB, sessionC]);
			await view.openSessionsInGrid([sessionA, sessionC]);
			const visibility = Reflect.get(view, '_visibility') as VisibleSessions;
			const target = visibility.getGridSlots()[visibility.getSlot('C')!.index];
			let inWindow = true;
			const calls: string[] = [];
			disposables.add(chatHostOpeners.get(view)!.register({
				showsChat: shown => inWindow && shown.toString() === peerB.resource.toString(),
				reveal: async shown => { calls.push(`reveal ${shown.path}`); },
				openBeside: async () => { },
				close: async closed => {
					calls.push(`close ${closed.path}`);
					inWindow = false;
					// The pane it is dropped onto goes away meanwhile
					view.closeSession(slotSessionsOf(view).find(session => session?.sessionId === 'C'));
					return {
						restore: async () => {
							calls.push(`restore ${closed.path}`);
							inWindow = true;
						},
					};
				},
			}));

			await view.moveChatToGrid('B', peerB.resource, target.id, 'right');
			await timeout(0);

			const chatPanes = view.panes.get().filter(pane => pane.kind === SessionGridPaneKind.Detached).map(pane => `${pane.session.get()?.sessionId} ${pane.chat.get()?.resource.path}`);
			assert.deepStrictEqual({ calls, inWindow, chatPanes }, { calls: ['close /chat/peerB', 'restore /chat/peerB'], inWindow: true, chatPanes: [] });
		});

		test('the main chat of a session that a chat window shows, dropped onto a pane that goes away as the grid opens the session, goes back to its window rather than being lost', async () => {
			const sessionA = multiChatSession('A', [chat('mainA')]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const sessionC = multiChatSession('C', [chat('mainC')]);
			const [mainB] = sessionB.chats.get();
			const { view } = setup([sessionA, sessionB, sessionC]);
			await view.openSessionsInGrid([sessionA, sessionC]);
			const visibility = Reflect.get(view, '_visibility') as VisibleSessions;
			const target = visibility.getGridSlots()[visibility.getSlot('C')!.index];
			let inWindow = true;
			const calls: string[] = [];
			disposables.add(chatHostOpeners.get(view)!.register({
				showsChat: shown => inWindow && shown.toString() === mainB.resource.toString(),
				reveal: async () => { },
				openBeside: async () => { },
				close: async closed => {
					calls.push(`close ${closed.path}`);
					inWindow = false;
					return {
						restore: async () => {
							calls.push(`restore ${closed.path}`);
							inWindow = true;
						},
					};
				},
			}));
			// The pane it is dropped onto goes away as the grid opens the session there, once the chat left its window
			type Prepare = (sessions: readonly ISession[], token: CancellationToken) => Promise<ISession[] | undefined>;
			const prepare = (Reflect.get(view, 'prepareGridSessions') as Prepare).bind(view);
			let prepares = 0;
			Reflect.set(view, 'prepareGridSessions', async (sessions: readonly ISession[], token: CancellationToken) => {
				const prepared = await prepare(sessions, token);
				if (++prepares === 2) {
					view.closeSession(slotSessionsOf(view).find(session => session?.sessionId === 'C'));
				}
				return prepared;
			});

			await view.moveChatToGrid('B', mainB.resource, target.id, 'right');
			await timeout(0);

			assert.deepStrictEqual({ calls, inWindow, inGrid: view.panes.get().some(pane => pane.session.get()?.sessionId === 'B') }, { calls: ['close /chat/mainB', 'restore /chat/mainB'], inWindow: true, inGrid: false });
		});

		test('opening a session whose chat another surface shows, such as a chat window, reveals it there, and leaves the grid and its selection as they are', async () => {
			const sessionA = multiChatSession('A', [chat('mainA')]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const { view } = setup([sessionA, sessionB]);
			await view.openSession(sessionA.resource);
			const revealed: string[] = [];
			disposables.add(chatHostOpeners.get(view)!.register({
				showsChat: shown => shown.toString() === sessionB.mainChat.get().resource.toString(),
				reveal: async (shown, options) => { revealed.push(`${shown.path}${options?.preserveFocus ? ' preserving focus' : ''}`); },
				openBeside: async () => { },
				close: async () => ({ restore: async () => { } }),
			}));
			const grid = () => ({ visible: slotSessionsOf(view).map(session => session?.sessionId), active: activeSessionOf(view)?.sessionId });
			const before = grid();

			await view.openSession(sessionB.resource);
			await view.openSession(sessionB.resource, { forceMainChat: true, preserveFocus: true });
			view.showSession(sessionB.resource);
			await timeout(0);

			assert.deepStrictEqual({ revealed, grid: grid() }, { revealed: ['/chat/mainB', '/chat/mainB preserving focus', '/chat/mainB'], grid: before });
		});

		test('opening a session whose main chat a chat window shows, while the grid shows another of its chats, reveals the window for its main chat, and shows the session in the grid otherwise', async () => {
			const sessionA = multiChatSession('A', [chat('mainA')]);
			const sessionB = multiChatSession('B', [chat('mainB'), chat('peerB', SessionStatus.Completed, ChatOriginKind.SideChat)]);
			const [, peerB] = sessionB.chats.get();
			const { view } = setup([sessionA, sessionB]);
			await view.openSession(sessionB.resource);
			await view.openChat(sessionB, peerB.resource);
			// B stays in the grid, with its peer, as A opens beside it.
			view.toggleSessionStickiness(activeSessionOf(view)!);
			await view.openSession(sessionA.resource);
			const grid = { visible: slotSessionsOf(view).map(session => session?.sessionId).sort(), active: activeSessionOf(view)?.sessionId, chatOfB: slotPaneOf(view, 'B')?.chat.get()?.title.get() };
			const revealed: string[] = [];
			disposables.add(chatHostOpeners.get(view)!.register({
				showsChat: shown => shown.toString() === sessionB.mainChat.get().resource.toString(),
				reveal: async shown => { revealed.push(shown.path); },
				openBeside: async () => { },
				close: async () => ({ restore: async () => { } }),
			}));

			await view.openSession(sessionB.resource, { forceMainChat: true });
			const forMainChat = { revealed: [...revealed], active: activeSessionOf(view)?.sessionId };
			await view.openSession(sessionB.resource);

			assert.deepStrictEqual({ grid, forMainChat, otherwise: { revealed, active: activeSessionOf(view)?.sessionId, activeChat: activeChatOf(view)?.title.get() } }, {
				grid: { visible: ['A', 'B'], active: 'A', chatOfB: 'peerB' },
				forMainChat: { revealed: ['/chat/mainB'], active: 'A' },
				otherwise: { revealed: ['/chat/mainB'], active: 'B', activeChat: 'peerB' },
			});
		});

		for (const origin of [ChatOriginKind.SideChat, ChatOriginKind.Fork, ChatOriginKind.Tool]) {
			for (const toSide of [false, true]) {
				test(`a ${origin} chat opened ${toSide ? 'to the side ' : ''}with a reference chat that a chat window shows opens beside it in that window, not in the grid`, async () => {
					const sessionB = multiChatSession('B', [chat('mainB'), chat('newB', SessionStatus.Completed, origin)]);
					const [mainB, newB] = sessionB.chats.get();
					const { view } = setup([sessionB]);
					await view.openSession(sessionB.resource);
					const beside: string[] = [];
					disposables.add(chatHostOpeners.get(view)!.register({
						showsChat: shown => shown.toString() === mainB.resource.toString(),
						reveal: async () => { },
						openBeside: async (opened, reference) => { beside.push(`${opened.path} beside ${reference.path}`); },
						close: async () => ({ restore: async () => { } }),
					}));
					const gridBefore = { active: activeChatOf(view)?.title.get(), closed: closedTitles(view) };

					if (toSide) {
						await view.openChatToSide(sessionB, newB.resource, { referenceChatResource: mainB.resource });
					} else {
						await view.openChat(sessionB, newB.resource, { referenceChatResource: mainB.resource });
					}

					assert.deepStrictEqual({ beside, grid: { active: activeChatOf(view)?.title.get(), closed: closedTitles(view) } }, {
						beside: ['/chat/newB beside /chat/mainB'],
						grid: gridBefore,
					});
				});
			}
		}

		test('a chat opened with a reference chat that no opener shows any more opens in the grid, whatever other openers show', async () => {
			const sessionB = multiChatSession('B', [chat('mainB'), chat('newB', SessionStatus.Completed, ChatOriginKind.SideChat)]);
			const [mainB, newB] = sessionB.chats.get();
			const { view } = setup([sessionB]);
			await view.openSession(sessionB.resource);
			const beside: string[] = [];
			let windowShowsReference = true;
			disposables.add(chatHostOpeners.get(view)!.register({
				showsChat: shown => windowShowsReference && shown.toString() === mainB.resource.toString(),
				reveal: async () => { },
				openBeside: async opened => { beside.push(`closing window ${opened.path}`); },
				close: async () => ({ restore: async () => { } }),
			}));
			disposables.add(chatHostOpeners.get(view)!.register({
				showsChat: shown => shown.toString() === 'test:///other',
				reveal: async () => { },
				openBeside: async opened => { beside.push(`other window ${opened.path}`); },
				close: async () => ({ restore: async () => { } }),
			}));
			windowShowsReference = false;

			await view.openChat(sessionB, newB.resource, { referenceChatResource: mainB.resource });

			assert.deepStrictEqual({ beside, active: activeChatOf(view)?.title.get() }, { beside: [], active: 'newB' });
		});

		test('a session-list open selects the main chat instead of the previously active chat', async () => {
			const sessionA = multiChatSession('A', [chat('mainA'), chat('sideA', SessionStatus.Completed, ChatOriginKind.SideChat)]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const { view } = setup([sessionA, sessionB]);

			await view.openSession(sessionA.resource);
			await view.openChat(sessionA, sessionA.chats.get()[1].resource);
			await view.openSession(sessionB.resource);
			await view.openSession(sessionA.resource, { forceMainChat: true });

			assert.strictEqual(activeChatOf(view)?.title.get(), 'mainA');
		});

		test('a chat closed in one session stays closed after switching away and back', async () => {
			const sessionA = multiChatSession('A', [chat('mainA'), chat('b')]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const { view } = setup([sessionA, sessionB]);

			await view.openSession(sessionA.resource);
			const activeA = activeSessionOf(view)!;
			const chatB = sessionA.chats.get().find(c => c.title.get() === 'b')!;
			await view.closeChat(activeA, chatB);
			assert.deepStrictEqual(closedTitles(view), ['b']);

			// Switching away disposes session A's wrapper (and its in-memory closed
			// set); switching back must restore the closed chat from persisted state.
			await view.openSession(sessionB.resource);
			await view.openSession(sessionA.resource);

			assert.deepStrictEqual(closedTitles(view), ['b']);
		});

		test('closing the middle of three chats persists across a switch', async () => {
			const sessionA = multiChatSession('A', [chat('c1'), chat('c2'), chat('c3')]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const { view } = setup([sessionA, sessionB]);

			await view.openSession(sessionA.resource);
			const activeA = activeSessionOf(view)!;
			const middle = sessionA.chats.get().find(c => c.title.get() === 'c2')!;
			await view.closeChat(activeA, middle);

			await view.openSession(sessionB.resource);
			await view.openSession(sessionA.resource);

			const reActiveA = view.activePane.get()!;
			assert.deepStrictEqual({
				open: reActiveA.tabs.openChats.get().map(c => c.title.get()),
				closed: reActiveA.tabs.closedChats.get().map(c => c.title.get()),
			}, {
				open: ['c1', 'c3'],
				closed: ['c2'],
			});
		});

		test('closing the active chat persists across a switch', async () => {
			const sessionA = multiChatSession('A', [chat('mainA'), chat('b')]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const { view } = setup([sessionA, sessionB]);

			await view.openSession(sessionA.resource);
			const chatB = sessionA.chats.get().find(c => c.title.get() === 'b')!;
			await view.openChat(sessionA, chatB.resource);
			await view.closeChat(activeSessionOf(view)!, chatB);

			await view.openSession(sessionB.resource);
			await view.openSession(sessionA.resource);

			assert.deepStrictEqual(closedTitles(view), ['b']);
		});

		test('reopening a closed chat is also persisted across a switch', async () => {
			const sessionA = multiChatSession('A', [chat('mainA'), chat('b')]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const { view } = setup([sessionA, sessionB]);

			await view.openSession(sessionA.resource);
			const activeA = activeSessionOf(view)!;
			const chatB = sessionA.chats.get().find(c => c.title.get() === 'b')!;
			await view.closeChat(activeA, chatB);
			await view.openChat(sessionA, chatB.resource); // reopen

			await view.openSession(sessionB.resource);
			await view.openSession(sessionA.resource);

			assert.deepStrictEqual(closedTitles(view), []);
		});

		test('a closed side chat stays closed after switching away and back', async () => {
			const sessionA = multiChatSession('A', [chat('mainA'), chat('side', SessionStatus.Completed, ChatOriginKind.SideChat)]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const { view } = setup([sessionA, sessionB]);

			await view.openSession(sessionA.resource);
			const activeA = activeSessionOf(view)!;
			const sideChat = sessionA.chats.get().find(c => c.title.get() === 'side')!;
			await view.closeChat(activeA, sideChat);
			assert.deepStrictEqual(closedTitles(view), ['side']);

			await view.openSession(sessionB.resource);
			await view.openSession(sessionA.resource);

			assert.deepStrictEqual(closedTitles(view), ['side']);
		});

		test('a closed chat stays closed across a restart', async () => {
			const mainA = chat('mainA');
			const chatB = chat('b');
			const sessionA = stubSession({
				sessionId: 'A', providerId: 'test',
				status: constObservable(SessionStatus.Completed),
				chats: constObservable([mainA, chatB]),
				mainChat: constObservable(mainA),
				capabilities: constObservable({ supportsMultipleChats: true }),
			});
			const storage = disposables.add(new InMemoryStorageService());
			const provider = new class extends TestSessionsProvider {
				constructor() { super(sessionA); }
				override getSessions(): ISession[] { return [sessionA]; }
			};
			const makeView = () => {
				const instantiationService = disposables.add(new TestInstantiationService());
				instantiationService.stub(IStorageService, storage);
				instantiationService.stub(ILogService, new NullLogService());
				instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
				instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
				instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
				instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
				instantiationService.stub(IProgressService, new TestProgressService());
				instantiationService.stub(IChatService, new class extends mock<IChatService>() {
					override readonly onDidSubmitRequest = Event.None;
				});
				const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
				return createView(instantiationService, service, disposables);
			};

			// First window: close chat B, then simulate shutdown (flush storage).
			const first = makeView();
			await first.openSession(sessionA.resource);
			await first.closeChat(activeSessionOf(first)!, chatB);
			await storage.flush();

			// Second window: restore and confirm B is still closed.
			const second = makeView();
			await second.restoreVisibleSessions();
			assert.deepStrictEqual((second.activePane.get()?.tabs.closedChats.get() ?? []).map(c => c.title.get()), ['b']);
		});

		test('a chat closed in a non-active session stays closed across a restart', async () => {
			const mainA = chat('mainA');
			const chatA2 = chat('a2');
			const sessionA = stubSession({
				sessionId: 'A', providerId: 'test',
				status: constObservable(SessionStatus.Completed),
				chats: constObservable([mainA, chatA2]),
				mainChat: constObservable(mainA),
				capabilities: constObservable({ supportsMultipleChats: true }),
			});
			const mainB = chat('mainB');
			const chatB2 = chat('b2');
			const sessionB = stubSession({
				sessionId: 'B', providerId: 'test',
				status: constObservable(SessionStatus.Completed),
				chats: constObservable([mainB, chatB2]),
				mainChat: constObservable(mainB),
				capabilities: constObservable({ supportsMultipleChats: true }),
			});
			const storage = disposables.add(new InMemoryStorageService());
			const provider = new class extends TestSessionsProvider {
				constructor() { super(sessionA); }
				override getSessions(): ISession[] { return [sessionA, sessionB]; }
			};
			const makeView = () => {
				const instantiationService = disposables.add(new TestInstantiationService());
				instantiationService.stub(IStorageService, storage);
				instantiationService.stub(ILogService, new NullLogService());
				instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
				instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
				instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
				instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
				instantiationService.stub(IProgressService, new TestProgressService());
				instantiationService.stub(IChatService, new class extends mock<IChatService>() {
					override readonly onDidSubmitRequest = Event.None;
				});
				const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
				return createView(instantiationService, service, disposables);
			};

			// First window: close a chat in each session, end on session A so B is
			// no longer visible, then simulate shutdown (flush storage).
			const first = makeView();
			await first.openSession(sessionB.resource);
			await first.closeChat(activeSessionOf(first)!, chatB2);
			await first.openSession(sessionA.resource);
			await first.closeChat(activeSessionOf(first)!, chatA2);
			await storage.flush();

			// Second window: restore, then switch to B and confirm its chat is still closed.
			const second = makeView();
			await second.restoreVisibleSessions();
			await second.openSession(sessionB.resource);
			assert.deepStrictEqual((second.activePane.get()?.tabs.closedChats.get() ?? []).map(c => c.title.get()), ['b2']);
		});

		test('restores an active subagent tab when it appears after the session', async () => {
			const main = chat('main');
			const subagent = chat('subagent', SessionStatus.Completed, ChatOriginKind.Tool);
			const storage = disposables.add(new InMemoryStorageService());
			const makeView = (session: ISession) => {
				const instantiationService = disposables.add(new TestInstantiationService());
				instantiationService.stub(IStorageService, storage);
				instantiationService.stub(ILogService, new NullLogService());
				instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
				instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([new TestSessionsProvider(session)]));
				instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
				instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
				instantiationService.stub(IProgressService, new TestProgressService());
				instantiationService.stub(IChatService, new class extends mock<IChatService>() {
					override readonly onDidSubmitRequest = Event.None;
				});
				const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
				return createView(instantiationService, service, disposables);
			};

			const firstSession = stubSession({
				sessionId: 'subagent-restart',
				providerId: 'test',
				status: constObservable(SessionStatus.Completed),
				chats: constObservable([main, subagent]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			});
			const first = makeView(firstSession);
			await first.openSession(firstSession.resource);
			await first.openChat(firstSession, subagent.resource);
			await storage.flush();
			first.dispose();

			const chats = observableValue<readonly IChat[]>('delayedSubagentChats', [main]);
			const restoredSession = stubSession({
				...firstSession,
				chats,
				mainChat: constObservable(main),
			});
			const second = makeView(restoredSession);
			await second.restoreVisibleSessions();
			const beforeDiscovery = second.activePane.get()?.tabs.visibleChatTabs.get().map(c => c.title.get());

			chats.set([main, subagent], undefined);

			assert.deepStrictEqual({
				beforeDiscovery,
				afterDiscovery: second.activePane.get()?.tabs.visibleChatTabs.get().map(c => c.title.get()),
				activeChat: activeChatOf(second)?.title.get(),
			}, {
				beforeDiscovery: ['main'],
				afterDiscovery: ['main', 'subagent'],
				activeChat: 'subagent',
			});
		});

		test('restores an inactive subagent without changing ordinary side chat behavior', async () => {
			const main = chat('main');
			const side = chat('side', SessionStatus.Completed, ChatOriginKind.SideChat);
			const subagent = chat('subagent', SessionStatus.Completed, ChatOriginKind.Tool);
			const session = stubSession({
				sessionId: 'inactive-subagent-restart',
				providerId: 'test',
				status: constObservable(SessionStatus.Completed),
				chats: constObservable([main, side, subagent]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			});
			const storage = disposables.add(new InMemoryStorageService());
			const provider = new TestSessionsProvider(session);
			const makeView = () => {
				const instantiationService = disposables.add(new TestInstantiationService());
				instantiationService.stub(IStorageService, storage);
				instantiationService.stub(ILogService, new NullLogService());
				instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
				instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
				instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
				instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
				instantiationService.stub(IProgressService, new TestProgressService());
				instantiationService.stub(IChatService, new class extends mock<IChatService>() {
					override readonly onDidSubmitRequest = Event.None;
				});
				const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
				return createView(instantiationService, service, disposables);
			};

			const first = makeView();
			await first.openSession(session.resource);
			await first.openChat(session, subagent.resource);
			await first.openChat(session, main.resource);
			await storage.flush();
			first.dispose();

			const second = makeView();
			await second.restoreVisibleSessions();

			assert.deepStrictEqual({
				tabs: second.activePane.get()?.tabs.visibleChatTabs.get().map(c => c.title.get()),
				activeChat: activeChatOf(second)?.title.get(),
			}, {
				tabs: ['main', 'side', 'subagent'],
				activeChat: 'main',
			});
		});

		test('restores the active chat when it appears after the session', async () => {
			const main = chat('main');
			const side = chat('side', SessionStatus.Completed, ChatOriginKind.SideChat);
			const storage = disposables.add(new InMemoryStorageService());
			const makeView = (session: ISession) => {
				const instantiationService = disposables.add(new TestInstantiationService());
				instantiationService.stub(IStorageService, storage);
				instantiationService.stub(ILogService, new NullLogService());
				instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
				instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([new TestSessionsProvider(session)]));
				instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
				instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
				instantiationService.stub(IProgressService, new TestProgressService());
				instantiationService.stub(IChatService, new class extends mock<IChatService>() {
					override readonly onDidSubmitRequest = Event.None;
				});
				const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
				return createView(instantiationService, service, disposables);
			};

			const firstSession = stubSession({
				sessionId: 'delayed-active-chat',
				providerId: 'test',
				status: constObservable(SessionStatus.Completed),
				chats: constObservable([main, side]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			});
			const first = makeView(firstSession);
			await first.openSession(firstSession.resource);
			await first.openChat(firstSession, side.resource);
			await storage.flush();
			first.dispose();

			const chats = observableValue<readonly IChat[]>('delayedChats', [main]);
			const restoredSession = stubSession({
				sessionId: 'delayed-active-chat',
				providerId: 'test',
				status: constObservable(SessionStatus.Completed),
				chats,
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			});
			const second = makeView(restoredSession);
			await second.restoreVisibleSessions();
			const beforeSave = activeChatOf(second)?.resource.toString();
			await storage.flush();
			second.dispose();

			const chatsAfterRestart = observableValue<readonly IChat[]>('delayedChatsAfterRestart', [main]);
			const restartedSession = stubSession({
				sessionId: 'delayed-active-chat',
				providerId: 'test',
				status: constObservable(SessionStatus.Completed),
				chats: chatsAfterRestart,
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			});
			const third = makeView(restartedSession);
			await third.restoreVisibleSessions();
			const afterSaveBeforeCatalog = activeChatOf(third)?.resource.toString();

			chatsAfterRestart.set([main, side], undefined);

			assert.deepStrictEqual({
				beforeSave,
				afterSaveBeforeCatalog,
				afterCatalog: activeChatOf(third)?.resource.toString(),
			}, {
				beforeSave: main.resource.toString(),
				afterSaveBeforeCatalog: main.resource.toString(),
				afterCatalog: side.resource.toString(),
			});
		});
	});

	suite('chat moves', () => {

		function chat(session: string, id: string): IChat {
			return { ...stubChat, resource: URI.parse(`test:///${session}#${id}`), title: constObservable(id), status: constObservable(SessionStatus.Completed) };
		}

		test('an untitled chat that has not sent a message cannot be moved even when its provider allows it', () => {
			const main = chat('A', 'main');
			const unsent: IChat = { ...chat('A', 'unsent'), status: constObservable(SessionStatus.Untitled) };
			const sent = chat('A', 'sent');
			const sessionA = stubSession({ sessionId: 'A', providerId: 'test', chats: constObservable([main, unsent, sent]), mainChat: constObservable(main) });
			const provider = new class extends TestSessionsProvider {
				override canMoveChat(): boolean { return true; }
			}(sessionA);
			const { service } = createSessionsManagementService(sessionA, disposables, provider);

			assert.deepStrictEqual([main, unsent, sent].map(candidate => service.canMoveChat(sessionA, candidate)), [true, false, true]);
		});

		test('routes chat and session moves to the owning provider with the provider\'s session ids and chat resources', async () => {
			const main = chat('A', 'main'), peer = chat('A', 'peer'), mainB = chat('B', 'main');
			const sessionA = stubSession({ sessionId: 'A', providerId: 'test', chats: constObservable([main, peer]), mainChat: constObservable(main) });
			const sessionB = stubSession({ sessionId: 'B', providerId: 'test', chats: constObservable([mainB]), mainChat: constObservable(mainB) });
			const otherProvider = stubSession({ sessionId: 'C', providerId: 'other' });
			const calls: unknown[] = [];
			const provider = new class extends TestSessionsProvider {
				override canMoveChat(sessionId: string, chatUri: URI): boolean { return chatUri.fragment === 'peer'; }
				override async moveChat(sessionId: string, chatUri: URI, destination: ISessionChatMoveDestination): Promise<void> {
					calls.push(['moveChat', sessionId, chatUri.toString(), destination.kind === 'session' ? [destination.sessionId, destination.after?.toString()] : destination.kind]);
				}
				override canMoveSessionUnder(sessionId: string): boolean { return sessionId === 'B'; }
				override async moveSessionUnder(sessionId: string, destinationSessionId: string, after: URI | undefined): Promise<void> {
					calls.push(['moveSessionUnder', sessionId, destinationSessionId, after?.toString()]);
				}
			}(sessionA);
			const { service } = createSessionsManagementService(sessionA, disposables, provider);

			const can = { chats: [main, peer].map(candidate => service.canMoveChat(sessionA, candidate)), sessions: [sessionA, sessionB].map(candidate => service.canMoveSessionUnder(candidate)) };
			await service.moveChat(sessionA, peer, { kind: 'session', session: sessionB, after: mainB });
			await service.moveChat(sessionA, peer, { kind: 'session', session: sessionA, after: undefined });
			await service.moveChat(sessionA, peer, { kind: 'newSession' });
			await service.moveSessionUnder(sessionB, sessionA, peer);
			await assert.rejects(service.moveChat(sessionA, peer, { kind: 'session', session: otherProvider, after: undefined }), /can't be moved there/);

			assert.deepStrictEqual({ can, calls }, {
				can: { chats: [false, true], sessions: [false, true] },
				calls: [
					['moveChat', 'A', 'test:/A#peer', ['B', 'test:/B#main']],
					['moveChat', 'A', 'test:/A#peer', ['A', undefined]],
					['moveChat', 'A', 'test:/A#peer', 'newSession'],
					['moveSessionUnder', 'B', 'A', 'test:/A#peer'],
				],
			});
		});

		function setup() {
			const mainA = chat('A', 'main'), moved = chat('A', 'moved'), mainB = chat('B', 'main'), arrived = chat('B', 'moved');
			const chatsA = observableValue<readonly IChat[]>('chatsA', [mainA, moved]);
			const chatsB = observableValue<readonly IChat[]>('chatsB', [mainB]);
			const sessionA = stubSession({ sessionId: 'A', providerId: 'test', title: constObservable('Session A'), chats: chatsA, mainChat: constObservable(mainA), capabilities: constObservable({ supportsMultipleChats: true }) });
			const sessionB = stubSession({ sessionId: 'B', providerId: 'test', title: constObservable('Session B'), chats: chatsB, mainChat: constObservable(mainB), capabilities: constObservable({ supportsMultipleChats: true }) });
			const onDidMoveChat = disposables.add(new Emitter<IChatMovedEvent>());
			const sessionsChanged = disposables.add(new Emitter<ISessionChangeEvent>());
			const sessions = [sessionA, sessionB];
			const provider = new class extends TestSessionsProvider {
				constructor() { super(sessionA); }
				override readonly onDidMoveChat = onDidMoveChat.event;
				override readonly onDidChangeSessions = sessionsChanged.event;
				override getSessions(): ISession[] { return sessions; }
			};
			const { view } = createSessionsManagementService(sessionA, disposables, provider);
			const move = (from: IChat, to: IChat) => {
				chatsA.set(chatsA.get().filter(candidate => candidate !== from), undefined);
				chatsB.set([...chatsB.get(), to], undefined);
				onDidMoveChat.fire({ from: { session: sessionA, chat: from.resource }, to: { session: sessionB, chat: to.resource } });
			};
			// Session A ends by moving its only chat under B; its removal arrives before the move is paired.
			const moveSession = () => {
				const arrivedMain = chat('B', 'main-of-A');
				sessions.splice(sessions.indexOf(sessionA), 1);
				sessionsChanged.fire({ added: [], removed: [sessionA], changed: [] });
				chatsB.set([...chatsB.get(), arrivedMain], undefined);
				onDidMoveChat.fire({ from: { session: sessionA, chat: mainA.resource }, to: { session: sessionB, chat: arrivedMain.resource } });
				return arrivedMain;
			};
			// Like moveSession, but the move is paired only after the view reacted to the removal.
			const moveSessionPairedLater = async () => {
				const arrivedMain = chat('B', 'main-of-A');
				sessions.splice(sessions.indexOf(sessionA), 1);
				sessionsChanged.fire({ added: [], removed: [sessionA], changed: [] });
				await timeout(0);
				chatsB.set([...chatsB.get(), arrivedMain], undefined);
				onDidMoveChat.fire({ from: { session: sessionA, chat: mainA.resource }, to: { session: sessionB, chat: arrivedMain.resource } });
				return arrivedMain;
			};
			const fireMove = (from: IChat, to: IChat) => onDidMoveChat.fire({ from: { session: sessionA, chat: from.resource }, to: { session: sessionB, chat: to.resource } });
			return { view, sessions, sessionA, sessionB, mainA, moved, arrived, move, moveSession, moveSessionPairedLater, chatsA, chatsB, fireMove };
		}

		const shown = (view: SessionsService) => ({
			session: activeSessionOf(view)?.sessionId,
			chat: activeChatOf(view)?.resource.toString(),
			visible: slotSessionsOf(view).map(session => session?.sessionId),
		});

		test('the slot showing a chat that moved shows its new session with the chat active, also after falling back', async () => {
			const { view, sessionA, moved, arrived, move } = setup();
			await view.openSession(sessionA.resource);
			await view.openChat(sessionA, moved.resource);

			move(moved, arrived);
			await timeout(0);

			assert.deepStrictEqual(shown(view), { session: 'B', chat: arrived.resource.toString(), visible: ['B'] });
		});

		test('following a chat that moved announces nothing: the move itself is announced once, by whoever made it', async () => {
			const { view, sessionA, moved, arrived, move, moveSession } = setup();
			await view.openSession(sessionA.resource);
			await view.openChat(sessionA, moved.resource);
			const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
			setARIAContainer(container);
			const announcements: string[] = [];
			const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.length && announcements.push(record.target.textContent ?? '')));
			container.querySelectorAll('.monaco-status, .monaco-alert').forEach(region => observer.observe(region, { childList: true }));
			try {
				move(moved, arrived);
				await timeout(0);
				moveSession();
				await timeout(0);
			} finally {
				observer.disconnect();
				container.remove();
			}

			assert.deepStrictEqual({ announcements, shown: shown(view).session }, { announcements: [], shown: 'B' });
		});

		test('a session that ended by moving its shown chat under another session leaves its slot to that session, though its removal came first', async () => {
			const { view, sessionA, mainA, moveSession } = setup();
			await view.openSession(sessionA.resource);
			await view.openChat(sessionA, mainA.resource);

			const arrivedMain = moveSession();
			await timeout(0);

			assert.deepStrictEqual(shown(view), { session: 'B', chat: arrivedMain.resource.toString(), visible: ['B'] });
		});

		test('a session that ended by moving its shown chat under another session gives that session the slot its fallback took, not another slot', async () => {
			const { view, sessionA, mainA, moveSessionPairedLater } = setup();
			await view.openSession(sessionA.resource);
			await view.openChat(sessionA, mainA.resource);

			const arrivedMain = await moveSessionPairedLater();
			await timeout(0);

			assert.deepStrictEqual(shown(view), { session: 'B', chat: arrivedMain.resource.toString(), visible: ['B'] });
		});

		test('a session that ended by moving its shown chat under another session doesn\'t take over a new-session composer opened in another slot', async () => {
			const { view, sessions, sessionA, mainA, moveSessionPairedLater } = setup();
			const mainC = chat('C', 'main');
			const sessionC = stubSession({ sessionId: 'C', providerId: 'test', chats: constObservable([mainC]), mainChat: constObservable(mainC) });
			sessions.push(sessionC);
			await view.openSessionsInGrid([sessionC, sessionA]);
			await view.openChat(sessionA, mainA.resource);
			const before = shown(view).visible;

			const arrivedMain = moveSessionPairedLater();
			// While the move is pending, the user opens a composer in a new slot beside C.
			view.insertAt(undefined, 'C', 'left');
			await arrivedMain;
			await timeout(0);

			// The composer stays; B takes the departed slot's index instead.
			assert.deepStrictEqual({ before, visible: shown(view).visible }, { before: ['C', 'A'], visible: [undefined, 'B', 'C'] });
		});

		test('a chat chosen after the view fell back from a chat stays shown when that chat\'s move is known later', async () => {
			const { view, sessionA, mainA, moved, arrived, chatsA, chatsB, fireMove } = setup();
			const side = chat('A', 'side');
			chatsA.set([mainA, side, moved], undefined);
			await view.openSession(sessionA.resource);
			await view.openChat(sessionA, moved.resource);

			// The source drops the chat first: the view falls back; then the user picks another chat, and the fallback again.
			chatsA.set([mainA, side], undefined);
			const fallback = activeChatOf(view)!;
			await view.openChat(sessionA, (fallback.resource.toString() === side.resource.toString() ? mainA : side).resource);
			await view.openChat(sessionA, fallback.resource);
			chatsB.set([...chatsB.get(), arrived], undefined);
			fireMove(moved, arrived);
			await timeout(0);

			assert.deepStrictEqual(shown(view), { session: 'A', chat: fallback.resource.toString(), visible: ['A'] });
		});

		test('a chat that moved while another chat was shown changes nothing', async () => {
			const { view, sessionA, mainA, moved, arrived, move } = setup();
			await view.openSession(sessionA.resource);
			await view.openChat(sessionA, mainA.resource);

			move(moved, arrived);
			await timeout(0);

			assert.deepStrictEqual(shown(view), { session: 'A', chat: mainA.resource.toString(), visible: ['A'] });
		});
	});

	suite('reopenLastClosedItem', () => {

		function chat(title: string): IChat {
			return {
				...stubChat,
				resource: URI.parse(`test:///chat/${title}`),
				title: constObservable(title),
				status: constObservable(SessionStatus.Completed),
			};
		}

		function multiChatSession(id: string, chats: IChat[]): ISession {
			return stubSession({
				sessionId: id,
				providerId: 'test',
				status: constObservable(SessionStatus.Completed),
				chats: constObservable(chats),
				mainChat: constObservable(chats[0]),
				capabilities: constObservable({ supportsMultipleChats: true }),
			});
		}

		function setup(sessions: ISession[]) {
			const provider = new class extends TestSessionsProvider {
				constructor() { super(sessions[0]); }
				override getSessions(): ISession[] { return sessions; }
			};
			const { part, content } = createSessionsPartTestHarness(disposables);
			const partService = new TestSessionsPartService(content.onDidFocusPane, content);
			const { view, contextKeyService } = createSessionsManagementService(sessions[0], disposables, provider, undefined, undefined, undefined, partService);
			part.layout(1202, 802, 0, 0);
			// The context key drives the command's palette visibility, and is the
			// only external signal of whether an entry is remembered.
			return { view, canReopen: () => contextKeyService.getContextKeyValue(SessionsHasClosedItemContext.key) === true };
		}

		const grid = (view: SessionsService) => ({
			visible: slotSessionsOf(view).map(s => s?.sessionId ?? null),
			sticky: view.slotPanes.get().map(pane => pane.sticky.get()),
			active: activeSessionOf(view)?.sessionId ?? null,
		});

		test('reopens a closed chat, consuming the entry', async () => {
			const sessionA = multiChatSession('A', [chat('mainA'), chat('b')]);
			const { view, canReopen } = setup([sessionA]);

			await view.openSession(sessionA.resource);
			const chatB = sessionA.chats.get().find(c => c.title.get() === 'b')!;
			await view.closeChat(activeSessionOf(view)!, chatB);
			const afterClose = canReopen();

			await view.reopenLastClosedItem();

			assert.deepStrictEqual({
				afterClose,
				closed: view.activePane.get()!.tabs.closedChats.get().map(c => c.title.get()),
				open: view.activePane.get()!.tabs.openChats.get().map(c => c.title.get()),
				canReopenAgain: canReopen(),
			}, {
				afterClose: true,
				closed: [],
				open: ['mainA', 'b'],
				canReopenAgain: false,
			});
		});

		test('an explicitly closed session returns to its grid index', async () => {
			const sessionA = multiChatSession('A', [chat('mainA')]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const { view } = setup([sessionA, sessionB]);

			// Pin A so opening B adds a second slot instead of replacing it.
			await view.openSession(sessionA.resource);
			view.toggleSessionStickiness(sessionA);
			await view.openSession(sessionB.resource);

			view.closeSession(sessionA);
			const afterClose = grid(view);

			await view.reopenLastClosedItem();

			assert.deepStrictEqual({ afterClose, afterReopen: grid(view) }, {
				afterClose: { visible: ['B'], sticky: [false], active: 'B' },
				afterReopen: { visible: ['A', 'B'], sticky: [true, false], active: 'A' },
			});
		});

		test('a session pushed out of the grid takes its slot back', async () => {
			const sessionA = multiChatSession('A', [chat('mainA')]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const { view } = setup([sessionA, sessionB]);

			await view.openSession(sessionA.resource);
			await view.openSession(sessionB.resource);
			const afterReplace = grid(view);

			await view.reopenLastClosedItem();

			assert.deepStrictEqual({ afterReplace, afterReopen: grid(view) }, {
				afterReplace: { visible: ['B'], sticky: [false], active: 'B' },
				afterReopen: { visible: ['A'], sticky: [false], active: 'A' },
			});
		});

		test('remembers only the most recently closed item', async () => {
			const sessionA = multiChatSession('A', [chat('mainA'), chat('b')]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const { view } = setup([sessionA, sessionB]);

			await view.openSession(sessionA.resource);
			const chatB = sessionA.chats.get().find(c => c.title.get() === 'b')!;
			await view.closeChat(activeSessionOf(view)!, chatB);
			// Opening B pushes A out of the grid, superseding the closed-chat entry.
			await view.openSession(sessionB.resource);

			await view.reopenLastClosedItem();
			// The entry is consumed, so pressing again must not walk back to the
			// superseded closed chat.
			await view.reopenLastClosedItem();

			assert.deepStrictEqual({
				...grid(view),
				closedChats: view.activePane.get()!.tabs.closedChats.get().map(c => c.title.get()),
			}, {
				visible: ['A'],
				sticky: [false],
				active: 'A',
				closedChats: ['b'],
			});
		});

		test('a batch close is not offered for reopening', async () => {
			const sessionA = multiChatSession('A', [chat('mainA'), chat('b'), chat('c')]);
			const { view, canReopen } = setup([sessionA]);

			await view.openSession(sessionA.resource);
			const active = activeSessionOf(view)!;
			// Mirrors "Close All Chats", which closes every non-main chat.
			for (const target of ['b', 'c']) {
				await view.closeChat(active, sessionA.chats.get().find(c => c.title.get() === target)!, { skipHistory: true });
			}

			await view.reopenLastClosedItem();

			assert.deepStrictEqual({
				canReopen: canReopen(),
				closed: view.activePane.get()!.tabs.closedChats.get().map(c => c.title.get()),
			}, {
				canReopen: false,
				closed: ['b', 'c'],
			});
		});

		test('a stale entry is dropped when its session vanished without a delete event', async () => {
			const sessionA = multiChatSession('A', [chat('mainA'), chat('b')]);
			const sessionB = multiChatSession('B', [chat('mainB')]);
			const sessions = [sessionA, sessionB];
			const provider = new class extends TestSessionsProvider {
				constructor() { super(sessionA); }
				override getSessions(): ISession[] { return sessions; }
			};
			const { view, contextKeyService } = createSessionsManagementService(sessionA, disposables, provider);
			const canReopen = () => contextKeyService.getContextKeyValue(SessionsHasClosedItemContext.key) === true;

			await view.openSession(sessionA.resource);
			await view.closeChat(activeSessionOf(view)!, sessionA.chats.get().find(c => c.title.get() === 'b')!);

			// The provider drops the session from its catalog without firing
			// onDidDeleteSession, so the recorded entry can never be reopened.
			sessions.splice(0, 1);
			await view.reopenLastClosedItem();

			assert.deepStrictEqual({ canReopen: canReopen() }, { canReopen: false });
		});
	});

	suite('createQuickChat', () => {

		/**
		 * Provider that supports quick chats and mints a fresh draft session on
		 * each `createQuickChat`, recording the requested type and call count.
		 */
		class QuickChatProvider extends TestSessionsProvider {
			lastQuickChatType: string | undefined;
			createQuickChatCalls = 0;
			override readonly supportsQuickChats = true;

			constructor(
				seed: ISession,
				override readonly id: string = 'quick-provider',
				override readonly order: number = 0,
				override readonly sessionTypes: readonly ISessionType[] = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'quick', label: 'Quick', icon: Codicon.vm }],
			) {
				super(seed);
			}

			override createQuickChat(sessionTypeId: string): ISession {
				this.createQuickChatCalls++;
				this.lastQuickChatType = sessionTypeId;
				return stubSession({ sessionId: `q${this.createQuickChatCalls}`, providerId: this.id });
			}
		}

		function setupQuickChat(providers: readonly ISessionsProvider[]): ISessionsManagementService {
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
			instantiationService.stub(ILogService, new NullLogService());
			instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
			instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService(providers));
			instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
			instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
			instantiationService.stub(IProgressService, new TestProgressService());
			instantiationService.stub(IChatService, new class extends mock<IChatService>() {
				override readonly onDidSubmitRequest = Event.None;
			});
			return disposables.add(instantiationService.createInstance(SessionsManagementService));
		}

		test('creates a session via the first capable provider (by order) and defaults the type', () => {
			const plain = new class extends TestSessionsProvider {
				override readonly id = 'plain';
				override readonly order = 0;
			}(stubSession({ sessionId: 'p1', providerId: 'plain' }));
			const quick = new QuickChatProvider(stubSession({ sessionId: 'seed', providerId: 'quick-provider' }), 'quick-provider', 1);

			const service = setupQuickChat([plain, quick]);
			const session = service.createQuickChat();

			assert.deepStrictEqual({
				createdSessionId: session.sessionId,
				requestedType: quick.lastQuickChatType,
				draft: service.newSession.get()?.sessionId,
			}, {
				createdSessionId: 'q1',
				requestedType: 'quick',
				draft: 'q1',
			});
		});

		test('mints a new quick-chat session on each call', () => {
			const quick = new QuickChatProvider(stubSession({ sessionId: 'seed', providerId: 'quick-provider' }));

			const service = setupQuickChat([quick]);
			const first = service.createQuickChat();
			const second = service.createQuickChat();

			assert.deepStrictEqual({
				first: first.sessionId,
				second: second.sessionId,
				createQuickChatCalls: quick.createQuickChatCalls,
				draft: service.newSession.get()?.sessionId,
			}, {
				first: 'q1',
				second: 'q2',
				createQuickChatCalls: 2,
				draft: 'q2',
			});
		});

		test('throws when no provider supports quick chats', () => {
			const plain = new TestSessionsProvider(stubSession({ sessionId: 'p1', providerId: 'test' }));
			const service = setupQuickChat([plain]);
			assert.throws(() => service.createQuickChat(), /No sessions provider supports quick chats/);
		});

		test('keeps the previous draft and its grid binding when quick-chat creation fails', () => {
			const draft = stubSession({ sessionId: 'draft', providerId: 'test', status: constObservable(SessionStatus.Untitled), isQuickChat: constObservable(true) });
			const deleted: string[] = [];
			const provider = new class extends TestSessionsProvider {
				override readonly supportsQuickChats = true;
				private creates = 0;
				override createQuickChat(): ISession {
					if (this.creates++ > 0) {
						throw new Error('create failed');
					}
					return draft;
				}
				override deleteNewSession(id: string): void { deleted.push(id); }
			}(draft);
			const { service, view } = createSessionsManagementService(draft, disposables, provider);
			const replacements: string[] = [];
			disposables.add(service.onDidReplaceNewDraftSession(({ to }) => replacements.push(to.sessionId)));
			view.openQuickChat();
			assert.throws(() => service.createQuickChat(), /create failed/);
			assert.deepStrictEqual({
				draft: service.newSession.get()?.sessionId, active: activeSessionOf(view)?.sessionId, deleted, replacements,
			}, { draft: 'draft', active: 'draft', deleted: [], replacements: [] });
		});

		test('honours options.providerId and the requested session type', () => {
			const quick = new QuickChatProvider(stubSession({ sessionId: 'seed', providerId: 'quick-provider' }), 'quick-provider', 0, [
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'quick', label: 'Quick', icon: Codicon.vm },
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'other', label: 'Other', icon: Codicon.vm },
			]);

			const service = setupQuickChat([quick]);
			service.createQuickChat({ providerId: 'quick-provider', sessionTypeId: 'other' });

			assert.strictEqual(quick.lastQuickChatType, 'other');
		});

		test('honours an explicit sessionTypeId without a providerId', () => {
			const quick = new QuickChatProvider(stubSession({ sessionId: 'seed', providerId: 'quick-provider' }), 'quick-provider', 0, [
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'quick', label: 'Quick', icon: Codicon.vm },
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'other', label: 'Other', icon: Codicon.vm },
			]);

			const service = setupQuickChat([quick]);
			service.createQuickChat({ sessionTypeId: 'other' });

			assert.strictEqual(quick.lastQuickChatType, 'other');
		});

		test('defaults to the last-used session type on the next call', () => {
			const quick = new QuickChatProvider(stubSession({ sessionId: 'seed', providerId: 'quick-provider' }), 'quick-provider', 0, [
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'quick', label: 'Quick', icon: Codicon.vm },
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'other', label: 'Other', icon: Codicon.vm },
			]);

			const service = setupQuickChat([quick]);
			service.createQuickChat({ sessionTypeId: 'other' });
			service.createQuickChat();

			assert.strictEqual(quick.lastQuickChatType, 'other');
		});

		test('throws when the requested provider does not advertise the session type', () => {
			const quick = new QuickChatProvider(stubSession({ sessionId: 'seed', providerId: 'quick-provider' }));
			const service = setupQuickChat([quick]);
			assert.throws(() => service.createQuickChat({ providerId: 'quick-provider', sessionTypeId: 'missing' }), /does not advertise session type/);
		});

		test('throws when the requested provider does not support quick chats', () => {
			const plain = new class extends TestSessionsProvider {
				override readonly id = 'plain';
			}(stubSession({ sessionId: 'p1', providerId: 'plain' }));
			const service = setupQuickChat([plain]);
			assert.throws(() => service.createQuickChat({ providerId: 'plain' }), /does not support quick chats/);
		});

		test('getQuickChatSessionTypes returns every advertised type from quick-chat-capable providers only', () => {
			const plain = new class extends TestSessionsProvider {
				override readonly id = 'plain';
				override readonly order = 0;
			}(stubSession({ sessionId: 'p1', providerId: 'plain' }));
			const quick = new QuickChatProvider(stubSession({ sessionId: 'seed', providerId: 'quick-provider' }), 'quick-provider', 1, [
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'quick', label: 'Quick', icon: Codicon.vm },
				{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'other', label: 'Other', icon: Codicon.vm },
			]);

			const service = setupQuickChat([plain, quick]);

			assert.deepStrictEqual(
				service.getQuickChatSessionTypes().map(t => ({ providerId: t.providerId, sessionTypeId: t.sessionType.id })),
				[
					{ providerId: 'quick-provider', sessionTypeId: 'quick' },
					{ providerId: 'quick-provider', sessionTypeId: 'other' },
				],
			);
		});
	});

	suite('new-session draft slots', () => {

		const folder = URI.parse('test:///folder');
		const listed = stubSession({ sessionId: 'listed', providerId: 'test' });

		function draft(sessionId: string): ISession {
			return stubSession({ sessionId, providerId: 'test', status: constObservable(SessionStatus.Untitled) });
		}

		/** Creates the given drafts in order, and records deleted drafts. */
		class DraftsProvider extends TestSessionsProvider {
			readonly deleted: string[] = [];
			readonly created: ISession[] = [];
			readonly changes = new Emitter<ISessionChangeEvent>();
			override readonly onDidChangeSessions = this.changes.event;
			/** Runs while a request is being sent; throwing fails the send. */
			onSend: (sessionId: string) => void = () => { };
			private readonly _drafts: ISession[];

			constructor(drafts: readonly ISession[]) {
				super(listed);
				this._drafts = [...drafts];
			}

			override resolveWorkspace(): ISessionWorkspace {
				return { uri: folder, label: 'Folder', icon: Codicon.folder, folders: [], requiresWorkspaceTrust: false, isVirtualWorkspace: false };
			}

			override readonly supportsQuickChats = true;

			override createNewSession(): ISession {
				return this._next();
			}

			override createQuickChat(): ISession {
				return this._next();
			}

			private _next(): ISession {
				const next = this._drafts.shift();
				if (!next) {
					throw new Error('No more drafts');
				}
				this.created.push(next);
				return next;
			}

			override deleteNewSession(sessionId: string): void {
				this.deleted.push(sessionId);
			}

			override async sendRequest(sessionId: string): Promise<ISession> {
				this.onSend(sessionId);
				return this.created.find(session => session.sessionId === sessionId)!;
			}

			dispose(): void {
				this.changes.dispose();
			}
		}

		/** A provider whose preparation replaces each draft with `<id>-prepared`, once `preparation` completes. */
		class PreparingProvider extends DraftsProvider {
			preparation: Promise<void> = Promise.resolve();
			override async prepareNewSession(sessionId: string) {
				await this.preparation;
				const prepared = draft(`${sessionId}-prepared`);
				this.created.push(prepared);
				return { session: prepared };
			}
		}

		/** Names the slots in the event log: `main` for the default slot, `none` for no owner. */
		function recordEvents(service: ISessionsManagementService, names: Map<INewSessionDraftSlot, string>): { log: string[]; ownerOf: (sessionId: string) => string } {
			const nameOf = (slot: INewSessionDraftSlot | undefined) => !slot ? 'none' : slot === service.defaultNewSessionSlot ? 'main' : names.get(slot) ?? 'unknown';
			const ownerOf = (sessionId: string) => nameOf(service.getNewSessionOwner(sessionId));
			const log: string[] = [];
			disposables.add(service.onDidAcceptNewSessionRequest(e => log.push(`accept ${e.session.sessionId} ${nameOf(e.owner)} ${e.background ? 'background' : 'foreground'}, its draft still ${e.owner.newSession.get()?.sessionId}`)));
			disposables.add(service.onWillSendRequest(session => log.push(`willSend ${session.sessionId} ${ownerOf(session.sessionId)}`)));
			disposables.add(service.onDidEndNewSessionRequest(e => log.push(`end ${e.session.sessionId} ${nameOf(e.owner)} started=${e.started} readopted=${e.readopted}${e.error ? ` error=${e.error instanceof Error ? e.error.message : String(e.error)}` : ''}`)));
			disposables.add(service.onDidDiscardNewSession(session => log.push(`discard ${session.sessionId} ${ownerOf(session.sessionId)}`)));
			disposables.add(service.onDidReplaceNewDraftSession(({ from, to }) => log.push(`replace ${from.sessionId}->${to.sessionId} ${ownerOf(to.sessionId)}`)));
			return { log, ownerOf };
		}

		test('a slot holds its own draft: creating, replacing, discarding and disposing it leave the main composer\'s draft alone', () => {
			const provider = disposables.add(new DraftsProvider([draft('main'), draft('a1'), draft('a2'), draft('a3')]));
			const { service } = createSessionsManagementService(listed, disposables, provider);
			const names = new Map<INewSessionDraftSlot, string>();
			const { log, ownerOf } = recordEvents(service, names);
			service.createNewSession(folder);
			const slot = service.createNewSessionSlot();
			names.set(slot, 'A');

			slot.createNewSession(folder);
			slot.createNewSession(folder);
			const owners = ['main', 'a1', 'a2'].map(ownerOf);
			slot.discardNewSession();
			slot.createNewSession(folder);
			slot.dispose();

			assert.deepStrictEqual({
				main: service.newSession.get()?.sessionId,
				slot: slot.newSession.get()?.sessionId,
				owners,
				ownersAfter: ['main', 'a2', 'a3'].map(ownerOf),
				deleted: provider.deleted,
				log,
			}, {
				main: 'main',
				slot: undefined,
				owners: ['main', 'none', 'A'],
				ownersAfter: ['main', 'none', 'none'],
				deleted: ['a1', 'a2', 'a3'],
				log: ['replace a1->a2 A', 'discard a2 A', 'discard a3 A'],
			});
		});

		test('a background send from a slot is accepted before the slot lets go of its draft, follows its preparation and ends once', async () => {
			const provider = disposables.add(new PreparingProvider([draft('main'), draft('a1'), draft('a2')]));
			const preparation = new DeferredPromise<void>();
			provider.preparation = preparation.p;
			const { service, notifications } = createSessionsManagementService(listed, disposables, provider);
			const names = new Map<INewSessionDraftSlot, string>();
			const { log, ownerOf } = recordEvents(service, names);
			service.createNewSession(folder);
			const slot = disposables.add(service.createNewSessionSlot());
			names.set(slot, 'A');
			slot.createNewSession(folder);

			await service.sendNewChatRequest(slot.newSession.get()!, { query: 'hi', background: true });
			const whilePreparing = { slot: slot.newSession.get()?.sessionId, owner: ownerOf('a1') };
			slot.createNewSession(folder);
			const ended = Event.toPromise(service.onDidEndNewSessionRequest);
			preparation.complete();
			await ended;

			assert.deepStrictEqual({
				whilePreparing,
				main: service.newSession.get()?.sessionId,
				slot: slot.newSession.get()?.sessionId,
				owners: ['a1', 'a1-prepared'].map(ownerOf),
				deleted: provider.deleted,
				notifications,
				log,
			}, {
				whilePreparing: { slot: undefined, owner: 'A' },
				main: 'main',
				slot: 'a2',
				owners: ['none', 'none'],
				deleted: ['a1'],
				notifications: [],
				log: [
					'accept a1 A background, its draft still a1',
					'replace a1->a1-prepared A',
					'willSend a1-prepared A',
					'end a1-prepared A started=true readopted=false',
				],
			});
		});

		test('a foreground send from a slot is accepted after its preparation, with the prepared session', async () => {
			const provider = disposables.add(new PreparingProvider([draft('main'), draft('a1')]));
			const { service } = createSessionsManagementService(listed, disposables, provider);
			const names = new Map<INewSessionDraftSlot, string>();
			const { log } = recordEvents(service, names);
			service.createNewSession(folder);
			const slot = disposables.add(service.createNewSessionSlot());
			names.set(slot, 'A');
			slot.createNewSession(folder);

			await service.sendNewChatRequest(slot.newSession.get()!, { query: 'hi' });

			assert.deepStrictEqual({
				main: service.newSession.get()?.sessionId,
				slot: slot.newSession.get()?.sessionId,
				log,
			}, {
				main: 'main',
				slot: undefined,
				log: [
					'replace a1->a1-prepared A',
					'accept a1-prepared A foreground, its draft still a1',
					'willSend a1-prepared A',
					'end a1-prepared A started=true readopted=false',
				],
			});
		});

		const failureCases: { readonly name: string; readonly readopt: boolean; readonly duringSend?: (slot: INewSessionDraftSlot & IDisposable, provider: DraftsProvider) => void; readonly expected: { readonly slot: string | undefined; readonly owner: string; readonly deleted: readonly string[]; readonly readopted: boolean; readonly asked: readonly string[] } }[] = [
			{ name: 'a live slot that accepts it gets the session back as its draft', readopt: true, expected: { slot: 'a1', owner: 'A', deleted: [], readopted: true, asked: ['a1'] } },
			{ name: 'a slot that declines it deletes it', readopt: false, expected: { slot: undefined, owner: 'none', deleted: ['a1'], readopted: false, asked: ['a1'] } },
			{ name: 'a slot holding another draft deletes it', readopt: true, duringSend: slot => slot.createNewSession(folder), expected: { slot: 'a2', owner: 'none', deleted: ['a1'], readopted: false, asked: [] } },
			{ name: 'a closed slot deletes it', readopt: true, duringSend: slot => slot.dispose(), expected: { slot: undefined, owner: 'none', deleted: ['a1'], readopted: false, asked: [] } },
			{ name: 'a session its provider removed is neither re-adopted nor deleted', readopt: true, duringSend: (_slot, provider) => provider.changes.fire({ added: [], removed: [provider.created[1]], changed: [] }), expected: { slot: undefined, owner: 'none', deleted: [], readopted: false, asked: [] } },
		];
		for (const { name, readopt, duringSend, expected } of failureCases) {
			test(`a failed foreground send of a slot: ${name}`, async () => {
				const provider = disposables.add(new DraftsProvider([draft('main'), draft('a1'), draft('a2')]));
				const { service, notifications } = createSessionsManagementService(listed, disposables, provider);
				const names = new Map<INewSessionDraftSlot, string>();
				const { log, ownerOf } = recordEvents(service, names);
				service.createNewSession(folder);
				const asked: string[] = [];
				const slot = disposables.add(service.createNewSessionSlot({ readoptOnFailure: session => { asked.push(session.sessionId); return readopt; } }));
				names.set(slot, 'A');
				slot.createNewSession(folder);
				provider.onSend = () => {
					duringSend?.(slot, provider);
					throw new Error('send failed');
				};

				await assert.rejects(service.sendNewChatRequest(slot.newSession.get()!, { query: 'hi' }), /send failed/);

				assert.deepStrictEqual({
					main: service.newSession.get()?.sessionId,
					slot: slot.newSession.get()?.sessionId,
					owner: ownerOf('a1'),
					deleted: provider.deleted,
					asked,
					notifications,
					end: log.filter(entry => entry.startsWith('end ')),
				}, {
					main: 'main',
					slot: expected.slot,
					owner: expected.owner,
					deleted: expected.deleted,
					asked: expected.asked,
					notifications: [],
					end: [`end a1 A started=false readopted=${expected.readopted} error=send failed`],
				});
			});
		}

		test('a failed foreground send of the main composer keeps its behavior: neither re-adopted nor deleted', async () => {
			const provider = disposables.add(new DraftsProvider([draft('main')]));
			const { service } = createSessionsManagementService(listed, disposables, provider);
			const { log, ownerOf } = recordEvents(service, new Map());
			service.createNewSession(folder);
			provider.onSend = () => { throw new Error('send failed'); };

			await assert.rejects(service.sendNewChatRequest(service.newSession.get()!, { query: 'hi' }), /send failed/);

			assert.deepStrictEqual({
				main: service.newSession.get()?.sessionId,
				owner: ownerOf('main'),
				deleted: provider.deleted,
				log,
			}, {
				main: undefined,
				owner: 'none',
				deleted: [],
				log: [
					'accept main main foreground, its draft still main',
					'willSend main main',
					'end main main started=false readopted=false error=send failed',
				],
			});
		});

		test('a failed background send of a slot is reported on its end event, not as a notification', async () => {
			const provider = disposables.add(new class extends DraftsProvider {
				override async prepareNewSession(): Promise<never> {
					throw new Error('setup failed');
				}
			}([draft('a1'), draft('a2')]));
			const { service, notifications } = createSessionsManagementService(listed, disposables, provider);
			const names = new Map<INewSessionDraftSlot, string>();
			const { log } = recordEvents(service, names);
			const slot = disposables.add(service.createNewSessionSlot());
			names.set(slot, 'A');
			slot.createNewSession(folder);
			const ended = Event.toPromise(service.onDidEndNewSessionRequest);

			await service.sendNewChatRequest(slot.newSession.get()!, { query: 'hi', background: true });
			slot.createNewSession(folder);
			await ended;

			assert.deepStrictEqual({
				slot: slot.newSession.get()?.sessionId,
				deleted: provider.deleted,
				notifications,
				log,
			}, {
				slot: 'a2',
				deleted: ['a1'],
				notifications: [],
				log: [
					'accept a1 A background, its draft still a1',
					'end a1 A started=false readopted=false error=setup failed',
				],
			});
		});

		test('closing a slot while its draft is being prepared cancels the send and discards the draft', async () => {
			const provider = disposables.add(new class extends DraftsProvider {
				override prepareNewSession(_sessionId: string, token: CancellationToken): Promise<never> {
					return new Promise((_resolve, reject) => {
						const listener = token.onCancellationRequested(() => {
							listener.dispose();
							reject(new CancellationError());
						});
					});
				}
			}([draft('a1')]));
			const { service } = createSessionsManagementService(listed, disposables, provider);
			const names = new Map<INewSessionDraftSlot, string>();
			const { log } = recordEvents(service, names);
			const slot = service.createNewSessionSlot();
			names.set(slot, 'A');
			slot.createNewSession(folder);

			const sending = service.sendNewChatRequest(slot.newSession.get()!, { query: 'hi' });
			await timeout(0);
			slot.dispose();
			await assert.rejects(sending, (error: Error) => isCancellationError(error));

			assert.deepStrictEqual({ deleted: provider.deleted, log }, { deleted: ['a1'], log: ['discard a1 A'] });
		});

		test('a disposed slot creates no drafts, with either creation API', () => {
			const provider = disposables.add(new DraftsProvider([draft('a1'), draft('a2')]));
			const { service } = createSessionsManagementService(listed, disposables, provider);
			const slot = service.createNewSessionSlot();
			slot.dispose();

			assert.deepStrictEqual({
				newSession: (() => { try { slot.createNewSession(folder); return 'created'; } catch { return 'rejected'; } })(),
				quickChat: (() => { try { slot.createQuickChat(); return 'created'; } catch { return 'rejected'; } })(),
				created: provider.created.map(session => session.sessionId),
				slot: slot.newSession.get()?.sessionId,
			}, {
				newSession: 'rejected',
				quickChat: 'rejected',
				created: [],
				slot: undefined,
			});
		});

		test('openNewSession creates no draft for a slot disposed while the folder\'s trust is requested', async () => {
			const provider = disposables.add(new class extends DraftsProvider {
				override resolveWorkspace(): ISessionWorkspace {
					return { ...super.resolveWorkspace(), requiresWorkspaceTrust: true };
				}
			}([draft('a1')]));
			const trust = new DeferredPromise<boolean>();
			let trustRequested = false;
			const trustRequestService = upcastPartial<IWorkspaceTrustRequestService>({
				requestResourcesTrust: () => { trustRequested = true; return trust.p; },
			});
			const { service, view } = createSessionsManagementService(listed, disposables, provider, undefined, trustRequestService);
			const slot = service.createNewSessionSlot();

			const opening = view.openNewSession({ folderUri: folder, draftSlot: slot });
			await timeout(0);
			slot.dispose();
			trust.complete(true);
			const result = await opening;

			assert.deepStrictEqual({ trustRequested, result: result.session?.sessionId, created: provider.created.map(session => session.sessionId) }, { trustRequested: true, result: undefined, created: [] });
		});

		test('a send of another session lets the main composer go of its draft without deleting it or reporting it as its own', async () => {
			const provider = disposables.add(new DraftsProvider([draft('main'), draft('other')]));
			const { service } = createSessionsManagementService(listed, disposables, provider);
			const { log, ownerOf } = recordEvents(service, new Map());
			service.createNewSession(folder);
			const other = draft('other');
			provider.created.push(other);

			await service.sendNewChatRequest(other, { query: 'hi' });

			assert.deepStrictEqual({
				main: service.newSession.get()?.sessionId,
				owner: ownerOf('main'),
				deleted: provider.deleted,
				log,
			}, {
				main: undefined,
				owner: 'none',
				deleted: [],
				log: ['willSend other none'],
			});
		});

		test('a send of a slot neither starts nor ends the grid\'s follow of an overlapping send of the main window', async () => {
			const mainChat: IChat = { ...stubChat, resource: URI.parse('test:///chat/main'), title: constObservable('main') };
			const nextChat: IChat = { ...stubChat, resource: URI.parse('test:///chat/next'), title: constObservable('next') };
			const chats = observableValue<readonly IChat[]>('chats', [mainChat]);
			const shown = stubSession({ sessionId: 'shown', providerId: 'test', chats, mainChat: constObservable(mainChat), capabilities: constObservable({ supportsMultipleChats: true }) });
			const mainSend = new DeferredPromise<void>();
			const provider = disposables.add(new class extends DraftsProvider {
				override getSessions(): ISession[] { return [shown]; }
				override async sendRequest(sessionId: string): Promise<ISession> {
					if (sessionId === shown.sessionId) {
						await mainSend.p;
						return shown;
					}
					return super.sendRequest(sessionId);
				}
			}([draft('a1')]));
			const { service, view } = createSessionsManagementService(listed, disposables, provider);
			await view.openSession(shown.resource);
			const slot = disposables.add(service.createNewSessionSlot());
			slot.createNewSession(folder);

			const sendingInMain = service.sendRequest(shown, mainChat, { query: 'main' });
			const slotSent = Event.toPromise(Event.filter(service.onDidSendRequest, event => event.session.sessionId === 'a1'));
			await service.sendNewChatRequest(slot.newSession.get()!, { query: 'slot', background: true });
			await slotSent;
			chats.set([mainChat, nextChat], undefined);
			const activeChat = activeChatOf(view)?.resource.toString();
			mainSend.complete();
			await sendingInMain;

			assert.strictEqual(activeChat, nextChat.resource.toString());
		});

		test('trackNewSessionRequestEnd follows a background request of a slot through its replacement to its end, also after the slot is gone', async () => {
			const provider = disposables.add(new PreparingProvider([draft('a1'), draft('b1')]));
			provider.onSend = sessionId => { throw new Error(`${sessionId} failed`); };
			const { service, notifications } = createSessionsManagementService(listed, disposables, provider);
			const slot = service.createNewSessionSlot();
			const other = disposables.add(service.createNewSessionSlot());
			const sent = slot.createNewSession(folder);
			other.createNewSession(folder);
			const ends: string[] = [];
			const tracking = disposables.add(trackNewSessionRequestEnd(service, slot, sent, event => ends.push(`${event.session.sessionId} started=${event.started} error=${event.error instanceof Error ? event.error.message : undefined}`)));

			const otherEnded = Event.toPromise(Event.filter(service.onDidEndNewSessionRequest, event => event.owner === other));
			await service.sendNewChatRequest(other.newSession.get()!, { query: 'other', background: true });
			await otherEnded;
			const ended = Event.toPromise(Event.filter(service.onDidEndNewSessionRequest, event => event.owner === slot));
			await service.sendNewChatRequest(sent, { query: 'hi', background: true });
			slot.dispose();
			await ended;
			tracking.dispose();

			assert.deepStrictEqual({ ends, notifications }, { ends: ['a1-prepared started=false error=a1-prepared failed'], notifications: [] });
		});

		test('openNewSession creates the draft of the given slot without navigating or changing the main composer\'s draft', async () => {
			const provider = disposables.add(new DraftsProvider([draft('main'), draft('a1')]));
			const { service, view } = createSessionsManagementService(listed, disposables, provider);
			service.createNewSession(folder);
			const slot = disposables.add(service.createNewSessionSlot());
			const navigationRequest = view.navigationRequest.get();

			const result = await view.openNewSession({ folderUri: folder, draftSlot: slot });

			assert.deepStrictEqual({
				result: result.session?.sessionId,
				slot: slot.newSession.get()?.sessionId,
				main: service.newSession.get()?.sessionId,
				navigated: view.navigationRequest.get() !== navigationRequest,
			}, {
				result: 'a1',
				slot: 'a1',
				main: 'main',
				navigated: false,
			});
		});
	});

	suite('legacy Copilot CLI migration', () => {

		const RAW_ID = 'sess-abc';

		function legacyCliSession(): ISession {
			return stubSession({
				sessionId: `legacy-${RAW_ID}`,
				providerId: 'default-copilot',
				sessionType: COPILOT_CLI_EH_SCHEME,
				resource: URI.from({ scheme: COPILOT_CLI_EH_SCHEME, path: `/${RAW_ID}` }),
			});
		}

		function migratedCliSession(): ISession {
			return stubSession({
				sessionId: `migrated-${RAW_ID}`,
				providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
				sessionType: COPILOT_CLI_EH_SCHEME,
				resource: URI.from({ scheme: COPILOT_CLI_LOCAL_AH_SCHEME, path: `/${RAW_ID}` }),
			});
		}

		suite('resolveSessionResource', () => {

			const legacyResource = URI.from({ scheme: COPILOT_CLI_EH_SCHEME, path: `/${RAW_ID}` });
			const twinResource = URI.from({ scheme: COPILOT_CLI_LOCAL_AH_SCHEME, path: `/${RAW_ID}` });

			function serviceWithResolver(resolve: (resource: URI) => Promise<URI | undefined>): ISessionsManagementService {
				const session = legacyCliSession();
				const provider = new class extends TestSessionsProvider {
					constructor() { super(session); }
					override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
					override getSessions(): ISession[] { return [session]; }
					override resolveSessionResource(resource: URI): Promise<URI | undefined> { return resolve(resource); }
				};
				return createSessionsManagementService(session, disposables, provider).service;
			}

			test('redirects a legacy resource to the twin a provider claims', async () => {
				const service = serviceWithResolver(async () => twinResource);

				assert.strictEqual((await service.resolveSessionResource(legacyResource)).toString(), twinResource.toString());
			});

			test('keeps the original resource when no provider claims it', async () => {
				const service = serviceWithResolver(async () => undefined);

				assert.strictEqual((await service.resolveSessionResource(legacyResource)).toString(), legacyResource.toString());
			});

			test('keeps the original resource when a provider throws', async () => {
				const service = serviceWithResolver(async () => { throw new Error('host unavailable'); });

				// Failure must degrade to today's behaviour, never block the open.
				assert.strictEqual((await service.resolveSessionResource(legacyResource)).toString(), legacyResource.toString());
			});

			test('does not consult providers for a resource they decline', async () => {
				const seen: string[] = [];
				const service = serviceWithResolver(async resource => { seen.push(resource.toString()); return undefined; });
				const native = URI.from({ scheme: COPILOT_CLI_LOCAL_AH_SCHEME, path: '/native' });

				const resolved = await service.resolveSessionResource(native);
				assert.deepStrictEqual({ resolved: resolved.toString(), seen }, { resolved: native.toString(), seen: [native.toString()] });
			});

			test('a provider that declines does not stop a later provider from claiming', async () => {
				const session = legacyCliSession();
				const declining = new class extends TestSessionsProvider {
					constructor() { super(session); }
					override readonly id = 'declining';
					override getSessions(): ISession[] { return [session]; }
					override resolveSessionResource(): Promise<URI | undefined> { return Promise.resolve(undefined); }
				};
				const claiming = new class extends TestSessionsProvider {
					constructor() { super(session); }
					override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
					override readonly order = 1;
					override getSessions(): ISession[] { return [session]; }
					override resolveSessionResource(): Promise<URI | undefined> { return Promise.resolve(twinResource); }
				};
				const service = createSessionsManagementService(session, disposables, [declining, claiming]).service;

				assert.strictEqual((await service.resolveSessionResource(legacyResource)).toString(), twinResource.toString());
			});
		});

		function serviceWithSessions(sessions: readonly ISession[]): ISessionsManagementService {
			const provider = new class extends TestSessionsProvider {
				constructor() { super(sessions[0]); }
				override getSessions(): ISession[] { return [...sessions]; }
			};
			return createSessionsManagementService(sessions[0], disposables, provider).service;
		}

		test('getSessions hides the legacy entry once its migrated agent-host entry exists', () => {
			const legacy = legacyCliSession();
			const migrated = migratedCliSession();
			const service = serviceWithSessions([legacy, migrated]);

			assert.deepStrictEqual(
				service.getSessions().map(s => s.sessionId),
				[migrated.sessionId],
			);
		});

		test('getSessions keeps the legacy entry visible when no migrated entry exists', () => {
			const legacy = legacyCliSession();
			const service = serviceWithSessions([legacy]);

			assert.deepStrictEqual(
				service.getSessions().map(s => s.sessionId),
				[legacy.sessionId],
			);
		});

		test('getSession still resolves the hidden legacy entry so it can be migrated on open', () => {
			const legacy = legacyCliSession();
			const migrated = migratedCliSession();
			const service = serviceWithSessions([legacy, migrated]);

			// Hidden from the displayed list, yet still resolvable by resource so
			// an explicit open can trigger migration.
			assert.deepStrictEqual(
				{
					listed: service.getSessions().some(s => s.sessionId === legacy.sessionId),
					resolved: service.getSession(legacy.resource)?.sessionId ?? null,
				},
				{ listed: false, resolved: legacy.sessionId },
			);
		});
	});
});

/**
 * Builds a management service with a Copilot-style provider and a
 * local-agent-host provider, each with an explicit {@link ISessionsProvider.order}.
 * Used to assert that the management service surfaces session types ordered by
 * provider order (lower first).
 */
function createOrderedTypesService(disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>, copilotOrder: number, agentHostOrder: number): ISessionsManagementService {
	const copilotProvider = new class extends TestSessionsProvider {
		override readonly id = 'default-copilot';
		override readonly order = copilotOrder;
		override readonly sessionTypes: readonly ISessionType[] = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'copilot', label: 'Copilot', icon: Codicon.vm }];
	}(stubSession({ sessionId: 'c1', providerId: 'default-copilot' }));
	const agentHostProvider = new class extends TestSessionsProvider {
		override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
		override readonly order = agentHostOrder;
		override readonly sessionTypes: readonly ISessionType[] = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: 'agent-host', label: 'Agent Host', icon: Codicon.vm }];
	}(stubSession({ sessionId: 'a1', providerId: LOCAL_AGENT_HOST_PROVIDER_ID }));

	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
	instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([copilotProvider, agentHostProvider]));
	instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
	instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
	instantiationService.stub(IProgressService, new TestProgressService());
	instantiationService.stub(IChatService, new class extends mock<IChatService>() {
		override readonly onDidSubmitRequest = Event.None;
	});

	return disposables.add(instantiationService.createInstance(SessionsManagementService));
}
