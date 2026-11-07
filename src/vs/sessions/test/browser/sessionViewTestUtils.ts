/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../base/common/assert.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../base/common/observable.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { URI } from '../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../base/test/common/mock.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { DEFAULT_EDITOR_PART_OPTIONS } from '../../../workbench/browser/parts/editor/editor.js';
import { IEditorGroupsService } from '../../../workbench/services/editor/common/editorGroupsService.js';
import { workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { AbstractChatView, ChatViewKind, IChatViewOptions } from '../../../workbench/contrib/sessions/browser/parts/chatView.js';
import { SessionsPart } from '../../../workbench/browser/parts/sessions/sessionsPart.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { SessionsGridContent } from '../../../workbench/contrib/sessions/browser/parts/sessionsGridContent.js';
import '../../browser/parts/sessionsPartContent.registration.js';
import { IAgentWorkbenchLayoutService } from '../../browser/workbench.js';
import { ISessionsHostLayoutService } from '../../../workbench/services/sessions/browser/sessionsHostLayoutService.js';
import { SessionBranchPickerVisibleContext, SessionEnvironmentPickerVisibleContext, SessionHarnessPickerVisibleContext, SessionIsolationPickerVisibleContext, SessionSyncActionVisibleContext, SessionWorkspacePickerVisibleContext, SessionWorktreePickerVisibleContext } from '../../../workbench/contrib/sessions/common/contextkeys.js';
import { SESSIONS_CHAT_TABS_SETTING, SessionsChatTabsMode } from '../../../workbench/contrib/sessions/common/sessionConfig.js';
import { ISessionsChatBackground, ISessionsChatBackgroundService } from '../../../workbench/contrib/sessions/browser/chatBackgroundService.js';
import { IChatViewFactory } from '../../../workbench/contrib/sessions/browser/chatViewFactory.js';
import { ISessionsListModelService } from '../../../workbench/contrib/sessions/browser/sessionsListModelService.js';
import { ISessionGridSlot, ISessionsPartService, SessionGridRequest } from '../../../workbench/services/sessions/browser/sessionsPartService.js';
import { ISessionsProvidersService } from '../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ChatInteractivity, IChat, ISession, ISessionCapabilities, ISessionPreparationProgress, SessionStatus } from '../../../workbench/services/sessions/common/session.js';
import { ITestSessionWithChat, LegacyFakePaneState, stubSessionHosts } from '../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
import { ChatHostOpenerService, IChatHostOpenerService } from '../../../workbench/services/sessions/browser/chatHostOpener.js';
import { ISessionChangesStatsCache } from '../../../workbench/services/sessions/common/sessionChangesStatsCache.js';
import { SessionInputPickerVisibility } from '../../../workbench/contrib/sessions/common/sessionPickerVisibility.js';
import { ISessionsManagementService } from '../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISessionGridPane, SessionGridPaneKind } from '../../../workbench/services/sessions/browser/sessionGridPane.js';
import { Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { MobileSessionsPart } from '../../browser/parts/mobile/mobileSessionsPart.js';
import { stubSessionsHostLayout } from './sessionsHostLayoutTestUtils.js';
import { ISessionPaneTabs } from '../../../workbench/services/sessions/common/sessionPane.js';

export class TestChatView extends AbstractChatView {
	readonly inputPickerVisibility = this._register(new SessionInputPickerVisibility());
	override readonly pickerVisibility = this.inputPickerVisibility.visibility;
	disposed = false;
	disposeCount = 0;
	visible = true;
	chat: IChat | undefined;
	readonly input = document.createElement('textarea');
	readonly layouts: { width: number; height: number }[] = [];
	onLayout: (() => void) | undefined;
	/** Whether it loads its chat, as a chat view shows while it binds to its chat's model. */
	override readonly isLoadingTranscript = observableValue(this, false);

	constructor(
		readonly kind: ChatViewKind,
		@IContextKeyService public readonly contextKeyService: IContextKeyService,
	) {
		super();
		this.element.appendChild(this.input);
	}

	private readonly _inputOnly = observableValue(this, false);
	override readonly inputOnly: IObservable<boolean> = this._inputOnly;
	private _inputOnlyEnabled = false;
	override enableInputOnly(options: { readonly inputOnly?: boolean }): void {
		this._inputOnlyEnabled = true;
		this._inputOnly.set(options.inputOnly ?? true, undefined);
	}
	override setInputOnly(inputOnly: boolean): void {
		if (this._inputOnlyEnabled) {
			this._inputOnly.set(inputOnly, undefined);
		}
	}
	override disableInputOnly(): void {
		this._inputOnlyEnabled = false;
		this._inputOnly.set(false, undefined);
	}

	override setChat(chat: IChat): void { this.chat = chat; }
	override setVisible(visible: boolean): void { this.visible = visible; }
	protected override doLayout(width: number, height: number): void {
		assert(!this.disposed, 'A disposed chat view must not receive layout');
		this.layouts.push({ width, height });
		this.onLayout?.();
	}
	override toJSON(): object { return {}; }
	override focus(): void { this.input.focus(); }
	override dispose(): void {
		this.disposed = true;
		this.disposeCount++;
		super.dispose();
	}
}

export function createSessionViewTestServices(store: Pick<DisposableStore, 'add'>, instantiationService = workbenchInstantiationService(undefined, store)) {
	const configurationService = new TestConfigurationService({ [SESSIONS_CHAT_TABS_SETTING]: SessionsChatTabsMode.Multiple });
	const contextKeyService = store.add(new ContextKeyService(configurationService));
	const chatViews: TestChatView[] = [];
	instantiationService.stub(IConfigurationService, configurationService);
	instantiationService.stub(IContextKeyService, contextKeyService);
	instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
		override readonly onDidChangeEditorPartOptions = Event.None;
		override readonly partOptions = DEFAULT_EDITOR_PART_OPTIONS;
	}());
	const createChatView = (kind: ChatViewKind, scopedInstantiationService?: IInstantiationService) => {
		assert(scopedInstantiationService !== undefined);
		const view = scopedInstantiationService.createInstance(TestChatView, kind);
		chatViews.push(view);
		return view;
	};
	instantiationService.stub(IChatViewFactory, new class extends mock<IChatViewFactory>() {
		override createNewChatView(isNewChatInSession: boolean, _options: IChatViewOptions, scopedInstantiationService?: IInstantiationService): AbstractChatView {
			return createChatView(isNewChatInSession ? 'newChatInSession' : 'newSession', scopedInstantiationService);
		}
		override createChatView(scopedInstantiationService?: IInstantiationService): AbstractChatView {
			return createChatView('chat', scopedInstantiationService);
		}
	}());
	instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
		readonly activeSession = observableValue<ITestSessionWithChat | undefined>(this, undefined);
		override async openChat(): Promise<void> { }
	}());
	instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
		override readonly onDidChangeSessions = Event.None;
		override readonly onDidChangeSessionTypes = Event.None;
	}());
	instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
	instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
		override readonly onDidChangeProviders = Event.None;
		override getProvider() { return undefined; }
	}());
	instantiationService.stub(ISessionsListModelService, new class extends mock<ISessionsListModelService>() {
		override readonly onDidChange = Event.None;
		override isSessionPinned(): boolean { return false; }
		override getStatusIcon(): ThemeIcon { return ThemeIcon.fromId('circle'); }
	}());
	instantiationService.stub(ISessionChangesStatsCache, new class extends mock<ISessionChangesStatsCache>() {
		override get() { return undefined; }
		override set(): void { }
	}());
	const { sessionHostService } = stubSessionHosts(instantiationService, store);
	// No surface outside of the grid shows a chat, such as a chat window
	instantiationService.stub(IChatHostOpenerService, new ChatHostOpenerService());
	stubSessionsHostLayout(instantiationService);
	return { instantiationService, configurationService, contextKeyService, chatViews, sessionHostService };
}

export function createSessionsPartTestHarness(store: Pick<DisposableStore, 'add'>, mobile = false, options?: { container?: HTMLElement; instantiationService?: TestInstantiationService; layoutService?: IAgentWorkbenchLayoutService; compactLayout?: () => boolean; chatBackground?: ISessionsChatBackground }) {
	const services = createSessionViewTestServices(store, options?.instantiationService);
	const container = options?.container ?? document.createElement('div');
	container.classList.toggle('phone-layout', mobile);
	const agentLayoutService = options?.layoutService ?? new class extends mock<IAgentWorkbenchLayoutService>() {
		override registerPart() { return Disposable.None; }
		override readonly mainContainer = container;
		override readonly mainContainerDimension = { width: 1200, height: 800 };
		override isVisible(part: Parts) { return part === Parts.SESSIONS_PART || part === Parts.SIDEBAR_PART; }
		override isEditorPaneVisible() { return false; }
		override isModernUICompact() { return options?.compactLayout?.() ?? false; }
	}();
	services.instantiationService.stub(IAgentWorkbenchLayoutService, agentLayoutService);
	services.instantiationService.stub(ISessionsHostLayoutService, agentLayoutService);
	services.instantiationService.stub(ISessionsChatBackgroundService, new class extends mock<ISessionsChatBackgroundService>() {
		override readonly onDidChangeBackground = Event.None;
		override getBackground() { return options?.chatBackground; }
	}());
	if (!options?.container) {
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
	}
	const part = store.add(services.instantiationService.createInstance(mobile ? MobileSessionsPart : SessionsPart, SessionsGridContent.ID));
	part.create(container);
	return { ...services, part, content: assertReturnsDefined(part.getContent(SessionsGridContent)), container };
}

export function createTestActiveSession(sessionId: string, isCreated = true, lifecycle?: {
	readonly isNewSessionRequestInProgress?: IObservable<boolean>;
	readonly preparationProgress?: IObservable<ISessionPreparationProgress | undefined>;
	readonly chatCount?: number;
}) {
	const chats = Array.from({ length: Math.max(1, lifecycle?.chatCount ?? 1) }, (_, index) => new class extends mock<IChat>() {
		override readonly resource = URI.parse(index === 0 ? `test-chat://${sessionId}` : `test-chat://${sessionId}/${index}`);
		override readonly workspace = constObservable(undefined);
		override readonly title = constObservable(index === 0 ? 'Main Chat' : `Chat ${index + 1}`);
		override readonly status = constObservable(SessionStatus.Completed);
		override readonly isRead = constObservable(true);
		override readonly interactivity = constObservable(ChatInteractivity.Full);
		override readonly capabilities = constObservable({ canRename: true, canArchive: false, canDelete: false });
		override readonly changes = constObservable([]);
		override readonly changesets = constObservable([]);
	}());
	const mainChat = chats[0];
	// A session fake that carries the pane state the grid gave a session: its pin, its tab strip and the chat it shows.
	return new class extends mock<ISession>() {
		override readonly sessionId = sessionId;
		override readonly resource = URI.parse(`test-session://${sessionId}`);
		override readonly providerId = 'test';
		override readonly sessionType = 'test';
		override readonly title = constObservable('Session');
		readonly isCreated = observableValue(this, isCreated);
		// Created is what the status says: flipping `isCreated` flips it.
		override readonly status = this.isCreated.map(created => created ? SessionStatus.Completed : SessionStatus.Untitled);
		override readonly isRead = constObservable(true);
		override readonly isArchived = constObservable(false);
		readonly sticky = constObservable(false);
		override readonly workspace = constObservable(undefined);
		override readonly capabilities: IObservable<ISessionCapabilities> = constObservable({ supportsMultipleChats: true });
		override readonly chats: IObservable<readonly IChat[]> = constObservable(chats);
		readonly openChats: IObservable<readonly IChat[]> = constObservable(chats);
		readonly closedChats: IObservable<readonly IChat[]> = constObservable([]);
		readonly lastClosedChat: IChat | undefined = undefined;
		readonly visibleChatTabs: IObservable<readonly IChat[]> = constObservable(chats);
		readonly activeChat: IObservable<IChat> = constObservable(mainChat);
		override readonly mainChat: IObservable<IChat> = constObservable(mainChat);
		readonly shouldShowChatTabs = constObservable(true);
		override readonly isNewSessionRequestInProgress = lifecycle?.isNewSessionRequestInProgress ?? constObservable(false);
		override readonly preparationProgress = lifecycle?.preparationProgress;
		override readonly loading = constObservable(false);
	}();
}

export function getSessionPickerVisibility(contextKeyService: IContextKeyService, element?: HTMLElement) {
	const value = (key: string) => element
		? contextKeyService.getContext(element).getValue<boolean>(key)
		: contextKeyService.getContextKeyValue<boolean>(key);
	return {
		workspace: value(SessionWorkspacePickerVisibleContext.key),
		harness: value(SessionHarnessPickerVisibleContext.key),
		isolation: value(SessionIsolationPickerVisibleContext.key),
		environment: value(SessionEnvironmentPickerVisibleContext.key),
		branch: value(SessionBranchPickerVisibleContext.key),
		worktree: value(SessionWorktreePickerVisibleContext.key),
		sync: value(SessionSyncActionVisibleContext.key),
	};
}

const noTabs: ISessionPaneTabs = { openChats: constObservable([]), closedChats: constObservable([]), lastClosedChat: undefined, visibleChatTabs: constObservable([]), shouldShowChatTabs: constObservable(false) };

/**
 * A pane of the grid with `id` that shows `session`, a session fake, with the pane state it carries: its chat, which it
 * follows, its pin and its tab strip; detached when the fake is of a detached pane. The new-session slot without a session.
 */
function createTestPane(session: LegacyFakePaneState | undefined, id: string): ISessionGridPane {
	return {
		id,
		kind: session?.detachedChat ? SessionGridPaneKind.Detached : SessionGridPaneKind.Slot,
		session: constObservable(session),
		chat: session?.activeChat ?? constObservable(undefined),
		sticky: session?.sticky ?? constObservable(false),
		tabs: session ? upcastPartial<ISessionPaneTabs>(session) : noTabs,
	};
}

const panesOfFakes = new WeakMap<LegacyFakePaneState, ISessionGridPane>();

/** The pane that shows `session`, a session fake, for a test of one view: the same pane for the same fake. */
export function testPaneOf(session: LegacyFakePaneState | undefined): ISessionGridPane | undefined {
	if (!session) {
		return undefined;
	}
	let pane = panesOfFakes.get(session);
	if (!pane) {
		pane = createTestPane(session, `pane:${session.sessionId}`);
		panesOfFakes.set(session, pane);
	}
	return pane;
}

const testPanes = new WeakMap<object, Map<string, { readonly session: LegacyFakePaneState | undefined; readonly pane: ISessionGridPane }>>();

/**
 * Renders `visible`, session fakes with the pane state they carry, in `part` as the panes of its grid, with `active` active: each a pane whose
 * id is its slot's (`slots`), else its session's id, else `'initial'`. Rendering the same session in the same slot again gives
 * the same pane, as the grid keeps its panes.
 */
export function renderTestPanes(part: { updatePanes(panes: readonly ISessionGridPane[], activePane: ISessionGridPane | undefined, slots?: readonly ISessionGridSlot[], request?: SessionGridRequest): void }, visible: readonly (LegacyFakePaneState | undefined)[], active: LegacyFakePaneState | undefined, slots?: readonly ISessionGridSlot[], request?: SessionGridRequest): readonly ISessionGridPane[] {
	let known = testPanes.get(part);
	if (!known) {
		known = new Map();
		testPanes.set(part, known);
	}
	const sessions = visible.length ? visible : [undefined];
	const panes = sessions.map((session, index) => {
		const id = slots?.[index]?.id ?? session?.sessionId ?? 'initial';
		const existing = known!.get(id);
		if (existing && existing.session === session) {
			return existing.pane;
		}
		const pane = createTestPane(session, id);
		known!.set(id, { session, pane });
		return pane;
	});
	const activeIndex = sessions.indexOf(active);
	part.updatePanes(panes, activeIndex >= 0 ? panes[activeIndex] : (active ? panes.find(pane => pane.session.get()?.sessionId === active.sessionId) : undefined), slots, request);
	return panes;
}
