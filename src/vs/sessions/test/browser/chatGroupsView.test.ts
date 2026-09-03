/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../base/common/async.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, ISettableObservable, observableValue, transaction } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../base/test/common/timeTravelScheduler.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { DEFAULT_EDITOR_PART_OPTIONS } from '../../../workbench/browser/parts/editor/editor.js';
import { IEditorGroupsService } from '../../../workbench/services/editor/common/editorGroupsService.js';
import { workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { AbstractChatView, ChatViewKind } from '../../browser/parts/chatView.js';
import { ChatGroupsView } from '../../browser/parts/chatGroupsView.js';
import { type IAgentHostAutoConnect, type IAgentHostConnectProgress, IAgentHostSessionsProvider } from '../../common/agentHostSessionsProvider.js';
import { IChatViewFactory } from '../../services/chatView/browser/chatViewFactory.js';
import { ISessionsProvidersService } from '../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsPartService } from '../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, ChatOriginKind, IChat, ISession, ISessionCapabilities, SessionRemoteConnectionFailureReason, SessionRemoteConnectionStatus, SessionStatus } from '../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../services/sessions/common/sessionsProvider.js';

class TestChatView extends AbstractChatView {
	private readonly _focusTarget = mainWindow.document.createElement('button');
	override readonly hasVisibleTranscriptContent = observableValue(this, false);
	layoutCount = 0;
	primary = false;

	constructor(readonly kind: ChatViewKind) {
		super();
		this.element.dataset.kind = kind;
		this.element.appendChild(this._focusTarget);
	}

	toJSON(): object {
		return {};
	}

	protected doLayout(): void {
		this.layoutCount++;
	}

	focus(): void {
		this._focusTarget.focus();
	}

	override setPrimary(primary: boolean): void {
		this.primary = primary;
	}
}

class TestChatViewFactory extends mock<IChatViewFactory>() {
	readonly views: TestChatView[] = [];

	override createNewChatView(isNewChatInSession: boolean): AbstractChatView {
		return this._createView(isNewChatInSession ? 'newChatInSession' : 'newSession');
	}

	override createChatView(): AbstractChatView {
		return this._createView('chat');
	}

	private _createView(kind: ChatViewKind): TestChatView {
		const view = new TestChatView(kind);
		this.views.push(view);
		return view;
	}
}

class TestChat extends mock<IChat>() {
	override readonly resource: URI;
	override readonly origin: IChat['origin'];
	override readonly title: IObservable<string>;
	override readonly status: ISettableObservable<SessionStatus>;
	override readonly isRead: IObservable<boolean> = constObservable(true);
	override readonly interactivity: ISettableObservable<ChatInteractivity>;

	constructor(id: string, status = SessionStatus.Completed, parentChat?: URI) {
		super();
		this.resource = URI.parse(`test-chat://${id}`);
		this.origin = parentChat ? { kind: ChatOriginKind.Tool, parentChat } : undefined;
		this.title = constObservable(id);
		this.status = observableValue(this, status);
		this.interactivity = observableValue(this, ChatInteractivity.Full);
	}
}

function createChat(id: string, status: SessionStatus = SessionStatus.Completed, parentChat?: URI): TestChat {
	return new TestChat(id, status, parentChat);
}

class TestActiveSession extends mock<IActiveSession>() {
	override readonly sessionId = 'session';
	override readonly resource = URI.parse('test-session://session');
	override readonly providerId: string;
	override readonly remoteConnectionStatus: ISettableObservable<SessionRemoteConnectionStatus> | undefined;
	readonly allChats: ISettableObservable<readonly IChat[]>;
	override readonly visibleChatTabs: ISettableObservable<readonly IChat[]>;
	override readonly activeChat: ISettableObservable<IChat>;
	override readonly chats: IObservable<readonly IChat[]>;
	override readonly openChats: IObservable<readonly IChat[]>;
	override readonly closedChats: IObservable<readonly IChat[]>;
	override readonly shouldShowChatTabs: IObservable<boolean>;
	override readonly mainChat: IObservable<IChat>;
	override readonly capabilities: IObservable<ISessionCapabilities> = constObservable({ supportsMultipleChats: true });
	override readonly isCreated: IObservable<boolean>;
	override readonly isNewSessionRequestInProgress = observableValue(this, false);
	override readonly isArchived = observableValue(this, false);
	override readonly loading: IObservable<boolean> = constObservable(false);

	constructor(chats: readonly IChat[], visibleChats: readonly IChat[] = chats, isCreated = true, providerId = 'test', remoteConnectionStatus?: SessionRemoteConnectionStatus) {
		super();
		this.providerId = providerId;
		this.remoteConnectionStatus = remoteConnectionStatus && observableValue(this, remoteConnectionStatus);
		const mainChat = chats[0];
		if (!mainChat) {
			throw new Error('A test session requires a main chat');
		}
		this.allChats = observableValue(this, chats);
		this.visibleChatTabs = observableValue(this, visibleChats);
		this.activeChat = observableValue(this, visibleChats[0] ?? mainChat);
		this.chats = this.allChats;
		this.openChats = this.visibleChatTabs;
		this.closedChats = derived(reader => {
			const visible = new Set(this.visibleChatTabs.read(reader).map(chat => chat.resource.toString()));
			return this.allChats.read(reader).filter(chat => !visible.has(chat.resource.toString()));
		});
		this.shouldShowChatTabs = derived(reader => this.visibleChatTabs.read(reader).length > 1);
		this.mainChat = constObservable(mainChat);
		this.isCreated = constObservable(isCreated);
	}
}

class TestSessionsService extends mock<ISessionsService>() {
	override readonly activeSession = observableValue<IActiveSession | undefined>(this, undefined);
	openChatGate: Promise<void> | undefined;
	openChatError: Error | undefined;

	override async openChat(session: ISession, chatUri: URI): Promise<void> {
		await this.openChatGate;
		if (this.openChatError) {
			throw this.openChatError;
		}
		if (!(session instanceof TestActiveSession)) {
			return;
		}
		const chat = session.allChats.get().find(candidate => candidate.resource.toString() === chatUri.toString());
		if (!chat) {
			return;
		}
		if (!session.visibleChatTabs.get().includes(chat)) {
			session.visibleChatTabs.set([...session.visibleChatTabs.get(), chat], undefined);
		}
		session.activeChat.set(chat, undefined);
		this.activeSession.set(session, undefined);
	}

}

class TestSessionsProvidersService extends mock<ISessionsProvidersService>() {
	override readonly onDidChangeProviders = Event.None;
	provider: ISessionsProvider | undefined;

	override getProvider<T extends ISessionsProvider>(_providerId: string): T | undefined {
		return this.provider as T | undefined;
	}
}

class TestAgentHostProvider extends mock<IAgentHostSessionsProvider>() {
	override readonly id = 'agenthost-test';
	override readonly label = 'WSL: Ubuntu';
	override readonly remoteAddress = 'wsl:Ubuntu';
	private readonly _autoConnectEnabled = observableValue(this, false);
	override readonly autoConnect: IAgentHostAutoConnect = {
		label: 'Automatically Start WSL: Ubuntu',
		enabled: this._autoConnectEnabled,
		setEnabled: enabled => this._autoConnectEnabled.set(enabled, undefined),
	};
	private readonly _onDidReportConnectProgress = new Emitter<IAgentHostConnectProgress>();
	override readonly onDidReportConnectProgress = this._onDidReportConnectProgress.event;
	connectCalls = 0;
	reconnectNowCalls = 0;
	connectGate: Promise<void> | undefined;

	override async connect(): Promise<void> {
		this.connectCalls++;
		await this.connectGate;
	}

	override reconnectNow(): void {
		this.reconnectNowCalls++;
	}

	reportConnectProgress(connectionKey: string, message: string): void {
		this._onDidReportConnectProgress.fire({ connectionKey, message });
	}

	get hasProgressListener(): boolean {
		return this._onDidReportConnectProgress.hasListeners();
	}
}

interface IChatGroupsHarness {
	readonly instantiationService: TestInstantiationService;
	readonly sessionsService: TestSessionsService;
	readonly sessionsProvidersService: TestSessionsProvidersService;
	readonly chatViewFactory: TestChatViewFactory;
	readonly view: ChatGroupsView;
}

function createHarness(disposables: Pick<DisposableStore, 'add'>, tabsReplaceHeader = true): IChatGroupsHarness {
	const store = disposables.add(new DisposableStore());
	const instantiationService = workbenchInstantiationService(undefined, store);
	const sessionsService = new TestSessionsService();
	const chatViewFactory = new TestChatViewFactory();
	const sessionsProvidersService = new TestSessionsProvidersService();
	instantiationService.stub(IChatViewFactory, chatViewFactory);
	instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
		override readonly onDidChangeEditorPartOptions = Event.None;
		override readonly partOptions = DEFAULT_EDITOR_PART_OPTIONS;
	}());
	instantiationService.stub(ISessionsService, sessionsService);
	instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
		override readonly onDidChangeSessions = Event.None;
	}());
	instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { });
	instantiationService.stub(ISessionsProvidersService, sessionsProvidersService);

	const view = store.add(instantiationService.createInstance(ChatGroupsView));
	view.setSingleGroupTabsReplaceHeader(tabsReplaceHeader);
	mainWindow.document.body.appendChild(view.element);
	store.add(toDisposable(() => view.element.remove()));
	return { instantiationService, sessionsService, sessionsProvidersService, chatViewFactory, view };
}

function readBanner(view: ChatGroupsView): { readonly visible: boolean; readonly message: string | undefined; readonly action: string | undefined } {
	const banner = view.element.querySelector<HTMLElement>('.session-readonly-banner');
	return {
		visible: !banner?.classList.contains('hidden'),
		message: banner?.querySelector('.session-readonly-banner-text')?.textContent ?? undefined,
		action: banner?.querySelector('.session-readonly-banner-action-link')?.textContent ?? undefined,
	};
}

function readRemoteHostUnavailableState(view: ChatGroupsView): { readonly visible: boolean; readonly title: string | undefined; readonly description: string | undefined; readonly progress: string | undefined; readonly action: string | undefined; readonly actionHidden: boolean; readonly autoConnect: string | undefined; readonly autoConnectChecked: boolean; readonly autoConnectHidden: boolean } {
	const state = view.element.querySelector<HTMLElement>('.remote-host-unavailable-empty-state');
	// The action container is always present and hidden when there is no action,
	// so report the label only while it is actually offered.
	const action = state?.querySelector<HTMLElement>('.remote-host-unavailable-empty-state-action');
	const autoConnect = state?.querySelector<HTMLElement>('.remote-host-unavailable-empty-state-auto-connect');
	return {
		visible: !state?.classList.contains('hidden'),
		title: state?.querySelector('.remote-host-unavailable-empty-state-title')?.textContent ?? undefined,
		description: state?.querySelector('.remote-host-unavailable-empty-state-description')?.textContent ?? undefined,
		progress: state?.querySelector('.remote-host-unavailable-empty-state-progress:not(.hidden)')?.textContent ?? undefined,
		action: action && !action.classList.contains('hidden') ? action.textContent ?? undefined : undefined,
		actionHidden: action?.classList.contains('hidden') ?? true,
		autoConnect: autoConnect && !autoConnect.classList.contains('hidden') ? autoConnect.querySelector('.remote-host-unavailable-empty-state-auto-connect-label')?.textContent ?? undefined : undefined,
		autoConnectChecked: autoConnect?.querySelector('.monaco-checkbox')?.getAttribute('aria-checked') === 'true',
		autoConnectHidden: autoConnect?.classList.contains('hidden') ?? true,
	};
}

suite('Sessions - ChatGroupsView', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const options = {};

	test('opens a session with an active child chat after initial layout', () => {
		const { view, chatViewFactory } = createHarness(disposables);
		const main = createChat('main');
		const child = createChat('child', SessionStatus.Completed, main.resource);
		const session = new TestActiveSession([main, child]);
		session.activeChat.set(child, undefined);
		view.layout(800, 600, 0, 0);

		view.setSession(session, options);
		view.focus();

		const renderedView = view.element.querySelector<HTMLElement>('.chat-view');
		const renderedChatView = chatViewFactory.views.find(createdView => createdView.kind === 'chat');
		const transientComposerView = chatViewFactory.views.find(createdView => createdView.kind === 'newChatInSession');
		assert.deepStrictEqual({
			renderedKind: renderedView?.dataset.kind,
			renderedWidth: renderedView?.style.width,
			renderedLayoutCount: renderedChatView?.layoutCount,
			transientLayoutCount: transientComposerView?.layoutCount ?? 0,
			focusedKind: view.element.ownerDocument.activeElement?.closest<HTMLElement>('.chat-view')?.dataset.kind,
			activeTab: view.element.querySelector<HTMLElement>('.chat-composite-bar-tab.active')?.dataset.chatResource,
			tabs: Array.from(view.element.querySelectorAll<HTMLElement>('.chat-composite-bar-tab')).map(tab => tab.dataset.chatResource),
		}, {
			renderedKind: 'chat',
			renderedWidth: '800px',
			renderedLayoutCount: 1,
			transientLayoutCount: 0,
			focusedKind: 'chat',
			activeTab: child.resource.toString(),
			tabs: [main.resource.toString(), child.resource.toString()],
		});
	});

	test('does not lay out chat views while the session is hidden', () => {
		const { view, chatViewFactory } = createHarness(disposables);
		view.setSession(new TestActiveSession([createChat('main')]), options);
		const chatView = chatViewFactory.views.find(candidate => candidate.kind === 'chat')!;

		view.layout(800, 600, 0, 0);
		const initialLayoutCount = chatView.layoutCount;
		view.setSessionVisible(false);
		view.layout(640, 480, 0, 0);
		const hiddenLayoutCount = chatView.layoutCount;
		view.setSessionVisible(true);
		view.layout(640, 480, 0, 0);

		assert.deepStrictEqual({
			initialLayoutCount,
			hiddenLayoutCount,
			shownLayoutCount: chatView.layoutCount,
		}, {
			initialLayoutCount: 1,
			hiddenLayoutCount: 1,
			shownLayoutCount: 2,
		});
	});

	test('focusing another group updates the session active chat', () => {
		const { sessionsService, view } = createHarness(disposables);
		const main = createChat('main');
		const secondary = createChat('secondary');
		const session = new TestActiveSession([main, secondary]);
		sessionsService.activeSession.set(session, undefined);
		view.setSession(session, options);
		view.splitChatToSide(secondary.resource);

		view.focusAdjacentGroup('previous');

		assert.deepStrictEqual({
			activeChat: session.activeChat.get().resource.toString(),
			focusedGroup: mainWindow.document.activeElement?.closest('.chat-group-view')?.querySelector('.chat-composite-bar-tab')?.getAttribute('data-chat-resource'),
		}, {
			activeChat: main.resource.toString(),
			focusedGroup: main.resource.toString(),
		});
	});

	test('restoration settles when an already-loaded catalog no longer contains a saved chat', () => {
		const { view } = createHarness(disposables);
		const main = createChat('main');
		const secondary = createChat('secondary');
		const session = new TestActiveSession([main, secondary]);
		view.setSession(session, options);
		view.splitChatToSide(secondary.resource);
		view.setSession(undefined, options);

		const restoredSession = new TestActiveSession([main]);
		view.setSession(restoredSession, options);

		assert.deepStrictEqual({
			groupCount: view.groupCount.get(),
			groups: view.element.querySelectorAll('.chat-group-view').length,
		}, {
			groupCount: 1,
			groups: 1,
		});
	});

	test('new session drafts do not restore a persisted chat grid', () => {
		const { view } = createHarness(disposables);
		const main = createChat('main');
		const secondary = createChat('secondary');
		const session = new TestActiveSession([main, secondary]);
		view.setSession(session, options);
		view.splitChatToSide(secondary.resource);
		view.setSession(undefined, options);

		const draft = new TestActiveSession([createChat('draft', SessionStatus.Untitled)], undefined, false);
		view.setSession(draft, options);

		assert.deepStrictEqual({
			groupCount: view.groupCount.get(),
			viewKind: view.element.querySelector<HTMLElement>('.chat-view')?.dataset.kind,
		}, {
			groupCount: 1,
			viewKind: 'newSession',
		});
	});

	test('new session request activity switches the draft to the chat view', () => {
		const { view } = createHarness(disposables);
		const draft = new TestActiveSession([createChat('draft', SessionStatus.Untitled)], undefined, false);
		view.setSession(draft, options);
		const viewKinds = () => Array.from(view.element.querySelectorAll<HTMLElement>('.chat-view')).map(element => element.dataset.kind);

		const before = viewKinds();
		draft.isNewSessionRequestInProgress.set(true, undefined);
		const during = viewKinds();
		draft.isNewSessionRequestInProgress.set(false, undefined);
		const after = viewKinds();

		assert.deepStrictEqual({ before, during, after }, {
			before: ['newSession'],
			during: ['chat'],
			after: ['newSession'],
		});
	});

	test('opening a hidden chat to the side removes its temporary active-group assignment', async () => {
		const { view } = createHarness(disposables);
		const main = createChat('main');
		const hidden = createChat('hidden');
		const session = new TestActiveSession([main, hidden], [main]);
		view.setSession(session, options);

		await view.openChatInNewGroup(hidden.resource);

		const groups = Array.from(view.element.querySelectorAll('.chat-group-view'));
		assert.deepStrictEqual({
			groupCount: view.groupCount.get(),
			groupTabs: groups.map(group => Array.from(group.querySelectorAll<HTMLElement>('.chat-composite-bar-tab')).map(tab => tab.dataset.chatResource)),
			groupLabels: groups.map(group => group.getAttribute('aria-label')),
		}, {
			groupCount: 2,
			groupTabs: [[main.resource.toString()], [hidden.resource.toString()]],
			groupLabels: ['Chat Group 1 of 2', 'Chat Group 2 of 2'],
		});
	});

	test('opening an existing main-group tab to the side moves it into its own group', async () => {
		const { sessionsService, view } = createHarness(disposables);
		const main = createChat('main');
		const secondary = createChat('secondary');
		const session = new TestActiveSession([main, secondary]);
		view.setSession(session, options);

		const gate = new DeferredPromise<void>();
		sessionsService.openChatGate = gate.p;
		let settled = false;
		const openPromise = view.openChatInNewGroup(secondary.resource).finally(() => settled = true);
		await Promise.resolve();
		const settledBeforeOpen = settled;
		gate.complete();
		await openPromise;
		const afterSplit = Array.from(view.element.querySelectorAll('.chat-group-view'))
			.map(group => Array.from(group.querySelectorAll<HTMLElement>('.chat-composite-bar-tab')).map(tab => tab.dataset.chatResource));
		await view.openChatInNewGroup(secondary.resource);

		assert.deepStrictEqual({
			settledBeforeOpen,
			afterSplit,
			groupCountAfterRepeatedOpen: view.groupCount.get(),
			activeChat: session.activeChat.get().resource.toString(),
		}, {
			settledBeforeOpen: false,
			afterSplit: [[main.resource.toString()], [secondary.resource.toString()]],
			groupCountAfterRepeatedOpen: 2,
			activeChat: secondary.resource.toString(),
		});
	});

	test('opening an existing tab to the side propagates open failures', async () => {
		const { sessionsService, view } = createHarness(disposables);
		const main = createChat('main');
		const secondary = createChat('secondary');
		view.setSession(new TestActiveSession([main, secondary]), options);
		sessionsService.openChatError = new Error('open failed');

		await assert.rejects(view.openChatInNewGroup(secondary.resource), /open failed/);
	});

	test('dropping a hidden subagent on an edge opens it in a new group', async () => {
		const { view } = createHarness(disposables);
		const main = createChat('main');
		const subagent = createChat('subagent', SessionStatus.Completed, main.resource);
		const session = new TestActiveSession([main, subagent], [main]);
		view.setSession(session, options);

		await view['_onChatDrop'](view['_groups'][0].id, 'right', { sessionId: session.sessionId, resource: subagent.resource.toString() });

		const groups = Array.from(view.element.querySelectorAll('.chat-group-view'));
		assert.deepStrictEqual({
			groupCount: view.groupCount.get(),
			groupTabs: groups.map(group => Array.from(group.querySelectorAll<HTMLElement>('.chat-composite-bar-tab')).map(tab => tab.dataset.chatResource)),
			activeChat: session.activeChat.get().resource.toString(),
		}, {
			groupCount: 2,
			groupTabs: [[main.resource.toString()], [subagent.resource.toString()]],
			activeChat: subagent.resource.toString(),
		});
	});

	test('opening a subagent through the sessions service uses the group adjacent to its parent', async () => {
		const { sessionsService, view } = createHarness(disposables);
		const main = createChat('main');
		const secondary = createChat('secondary');
		const subagent = createChat('subagent', SessionStatus.Completed, main.resource);
		const session = new TestActiveSession([main, secondary, subagent], [main, secondary]);
		view.setSession(session, options);
		view.splitChatToSide(secondary.resource);

		await sessionsService.openChat(session, subagent.resource);

		const groups = Array.from(view.element.querySelectorAll('.chat-group-view'));
		assert.deepStrictEqual({
			groupCount: view.groupCount.get(),
			groupTabs: groups.map(group => Array.from(group.querySelectorAll<HTMLElement>('.chat-composite-bar-tab')).map(tab => tab.dataset.chatResource)),
			activeChat: session.activeChat.get().resource.toString(),
		}, {
			groupCount: 2,
			groupTabs: [[main.resource.toString()], [secondary.resource.toString(), subagent.resource.toString()]],
			activeChat: subagent.resource.toString(),
		});
	});

	test('reopening a manually moved subagent preserves its group', async () => {
		const { sessionsService, view } = createHarness(disposables);
		const main = createChat('main');
		const secondary = createChat('secondary');
		const subagent = createChat('subagent', SessionStatus.Completed, main.resource);
		const session = new TestActiveSession([main, secondary, subagent], [main, secondary]);
		view.setSession(session, options);
		view.splitChatToSide(secondary.resource);
		await sessionsService.openChat(session, subagent.resource);
		view.moveActiveChatToAdjacentGroup('previous');

		await sessionsService.openChat(session, secondary.resource);
		await sessionsService.openChat(session, subagent.resource);

		const groups = Array.from(view.element.querySelectorAll('.chat-group-view'));
		assert.deepStrictEqual(groups.map(group => Array.from(group.querySelectorAll<HTMLElement>('.chat-composite-bar-tab')).map(tab => tab.dataset.chatResource)), [
			[main.resource.toString(), subagent.resource.toString()],
			[secondary.resource.toString()],
		]);
	});

	test('left split updates logical and accessible group order', async () => {
		const { view, chatViewFactory } = createHarness(disposables);
		const main = createChat('main');
		const secondary = createChat('secondary');
		const session = new TestActiveSession([main, secondary]);
		view.setSession(session, options);

		await view['_onChatDrop'](view['_groups'][0].id, 'left', { sessionId: session.sessionId, resource: secondary.resource.toString() });

		const groups = Array.from(view.element.querySelectorAll<HTMLElement>('.chat-group-view'));
		const labelByChat = Object.fromEntries(groups.map(group => [
			group.querySelector<HTMLElement>('.chat-composite-bar-tab')?.dataset.chatResource,
			{
				label: group.getAttribute('aria-label'),
				primary: chatViewFactory.views.find(candidate => candidate.element.parentElement === group.querySelector('.chat-group-view-content'))?.primary,
			},
		]));
		assert.deepStrictEqual(labelByChat, {
			[secondary.resource.toString()]: { label: 'Chat Group 1 of 2', primary: true },
			[main.resource.toString()]: { label: 'Chat Group 2 of 2', primary: false },
		});
	});

	test('removing the focused group transfers focus to the remaining group', () => {
		const { view } = createHarness(disposables);
		const main = createChat('main');
		const secondary = createChat('secondary');
		const session = new TestActiveSession([main, secondary]);
		view.setSession(session, options);
		view.splitChatToSide(secondary.resource);
		view.focusAdjacentGroup('next');

		session.visibleChatTabs.set([main], undefined);

		const remainingGroup = view.element.querySelector<HTMLElement>('.chat-group-view');
		assert.deepStrictEqual({
			groupCount: view.groupCount.get(),
			focusInRemainingGroup: remainingGroup?.contains(mainWindow.document.activeElement),
			activeChat: session.activeChat.get().resource.toString(),
		}, {
			groupCount: 1,
			focusInRemainingGroup: true,
			activeChat: main.resource.toString(),
		});
	});

	test('removing an empty split group does not create a transient new chat view', () => {
		const { chatViewFactory, view } = createHarness(disposables);
		const main = createChat('main');
		const secondary = createChat('secondary');
		const session = new TestActiveSession([main, secondary]);
		view.setSession(session, options);
		view.splitChatToSide(secondary.resource);
		const viewCountBeforeClose = chatViewFactory.views.length;

		session.visibleChatTabs.set([main], undefined);

		assert.deepStrictEqual({
			groupCount: view.groupCount.get(),
			newViews: chatViewFactory.views.slice(viewCountBeforeClose).map(createdView => createdView.kind),
		}, {
			groupCount: 1,
			newViews: [],
		});
	});

	test('atomically replacing the active split chat preserves its group', () => {
		const { view } = createHarness(disposables);
		const main = createChat('main');
		const secondary = createChat('secondary');
		const tertiary = createChat('tertiary');
		const session = new TestActiveSession([main, secondary, tertiary], [main, secondary]);
		view.setSession(session, options);
		view.splitChatToSide(secondary.resource);

		transaction(tx => {
			session.visibleChatTabs.set([main, tertiary], tx);
			session.activeChat.set(tertiary, tx);
		});

		const groups = Array.from(view.element.querySelectorAll<HTMLElement>('.chat-group-view'));
		assert.deepStrictEqual({
			groupCount: view.groupCount.get(),
			groupTabs: groups.map(group => Array.from(group.querySelectorAll<HTMLElement>('.chat-composite-bar-tab')).map(tab => tab.dataset.chatResource)),
			activeChat: session.activeChat.get().resource.toString(),
		}, {
			groupCount: 2,
			groupTabs: [[main.resource.toString()], [tertiary.resource.toString()]],
			activeChat: tertiary.resource.toString(),
		});
	});

	test('shows session actions in a single tab row and hides them for split groups', () => {
		const { view } = createHarness(disposables);
		const main = createChat('main');
		const secondary = createChat('secondary');
		const session = new TestActiveSession([main, secondary]);
		view.setSession(session, options);

		const singleGroupActions = view.element.querySelector<HTMLElement>('.session-chat-tabs-actions');
		const singleGroupHidden = singleGroupActions?.classList.contains('hidden');
		view.splitChatToSide(secondary.resource);
		const splitGroupActions = Array.from(view.element.querySelectorAll<HTMLElement>('.session-chat-tabs-actions'));

		assert.deepStrictEqual({
			singleGroupHidden,
			splitGroupsHidden: splitGroupActions.map(actions => actions.classList.contains('hidden')),
		}, {
			singleGroupHidden: false,
			splitGroupsHidden: [true, true],
		});
	});

	test('hides session actions when tabs do not replace the header', () => {
		const { view } = createHarness(disposables, false);
		const main = createChat('main');
		const secondary = createChat('secondary');
		view.setSession(new TestActiveSession([main, secondary]), options);

		assert.strictEqual(view.element.querySelector<HTMLElement>('.session-chat-tabs-actions')?.classList.contains('hidden'), true);
	});

	test('hides the remote host banner when connected or when no remote host backs the session', () => {
		const { view } = createHarness(disposables);
		view.setSession(new TestActiveSession([createChat('main')]), options);
		const withoutRemoteHost = readBanner(view);

		view.setSession(new TestActiveSession([createChat('connected')], undefined, true, 'agenthost-test', { kind: 'connected' }), options);

		assert.deepStrictEqual({ withoutRemoteHost, connected: readBanner(view) }, {
			withoutRemoteHost: { visible: false, message: 'This chat is read-only', action: undefined },
			connected: { visible: false, message: 'This chat is read-only', action: undefined },
		});
	});

	test('presents host-not-running and unknown remote host disconnections distinctly', () => {
		const { chatViewFactory, sessionsProvidersService, view } = createHarness(disposables);
		const provider = new TestAgentHostProvider();
		sessionsProvidersService.provider = provider;
		const session = new TestActiveSession([createChat('main')], undefined, true, provider.id, { kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.HostNotRunning });
		const remoteConnectionStatus = session.remoteConnectionStatus;
		assert.ok(remoteConnectionStatus);
		view.setSession(session, options);
		chatViewFactory.views[chatViewFactory.views.length - 1].hasVisibleTranscriptContent.set(true, undefined);
		const hostNotRunning = readBanner(view);

		view.element.querySelector<HTMLElement>('.session-readonly-banner-action-link')?.click();
		remoteConnectionStatus.set({ kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.Unknown }, undefined);

		assert.deepStrictEqual({
			hostNotRunning,
			unknownDisconnected: readBanner(view),
			connectCalls: provider.connectCalls,
		}, {
			hostNotRunning: { visible: true, message: 'WSL: Ubuntu is not running.', action: 'Start WSL: Ubuntu' },
			unknownDisconnected: { visible: true, message: 'Cannot reach WSL: Ubuntu.', action: 'Retry' },
			connectCalls: 1,
		});
	});

	test('uses a centered recovery state for an unloaded remote session and a banner for a chat transcript', () => {
		const { chatViewFactory, sessionsProvidersService, view } = createHarness(disposables);
		const provider = new TestAgentHostProvider();
		sessionsProvidersService.provider = provider;
		// Cached metadata produces an existing chat tab, but no chat model or
		// rendered transcript until the remote host can be reached.
		const unloaded = new TestActiveSession([createChat('cached')], undefined, true, provider.id, { kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.HostNotRunning });
		const status = unloaded.remoteConnectionStatus;
		assert.ok(status);
		view.setSession(unloaded, options);
		const hostNotRunning = {
			state: readRemoteHostUnavailableState(view),
			banner: readBanner(view).visible,
		};

		view.element.querySelector<HTMLElement>('.remote-host-unavailable-empty-state-action .monaco-button')?.click();
		status.set({ kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.Unknown }, undefined);
		const unknownDisconnected = {
			state: readRemoteHostUnavailableState(view),
			banner: readBanner(view).visible,
		};

		const existing = new TestActiveSession([createChat('existing')], undefined, true, provider.id, { kind: 'connected' });
		const existingStatus = existing.remoteConnectionStatus;
		assert.ok(existingStatus);
		view.setSession(existing, options);
		// Model a transcript already rendered before the transport drops. The
		// second session creates its own view, so target the current one rather
		// than the view left over from the unloaded session above.
		chatViewFactory.views[chatViewFactory.views.length - 1].hasVisibleTranscriptContent.set(true, undefined);
		existingStatus.set({ kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.HostNotRunning }, undefined);
		const chatWithContent = {
			state: readRemoteHostUnavailableState(view).visible,
			banner: readBanner(view),
		};

		assert.deepStrictEqual({
			hostNotRunning,
			unknownDisconnected,
			chatWithContent,
			connectCalls: provider.connectCalls,
		}, {
			hostNotRunning: {
				state: {
					visible: true,
					title: 'Unable to Connect to WSL: Ubuntu',
					description: 'WSL: Ubuntu is not running.',
					progress: undefined,
					action: 'Start WSL: Ubuntu',
					actionHidden: false,
					autoConnect: 'Automatically Start WSL: Ubuntu',
					autoConnectChecked: false,
					autoConnectHidden: false,
				},
				banner: false,
			},
			unknownDisconnected: {
				state: {
					visible: true,
					title: 'Cannot Connect to WSL: Ubuntu',
					description: 'Cannot reach WSL: Ubuntu.',
					progress: undefined,
					action: 'Retry',
					actionHidden: false,
					autoConnect: undefined,
					autoConnectChecked: false,
					autoConnectHidden: true,
				},
				banner: false,
			},
			chatWithContent: {
				state: false,
				banner: {
					visible: true,
					message: 'WSL: Ubuntu is not running.',
					action: 'Start WSL: Ubuntu',
				},
			},
			connectCalls: 1,
		});
	});

	test('automatically starts the host again when it drops after an earlier automatic start', async () => {
		const { chatViewFactory, sessionsProvidersService, view } = createHarness(disposables);
		const provider = new TestAgentHostProvider();
		provider.autoConnect.setEnabled(true);
		sessionsProvidersService.provider = provider;
		const session = new TestActiveSession([createChat('main')], undefined, true, provider.id, { kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.HostNotRunning });
		const status = session.remoteConnectionStatus;
		assert.ok(status);
		view.setSession(session, options);
		await Promise.resolve();
		await Promise.resolve();

		// The host comes up and the transcript renders, so a later outage is shown
		// as a banner rather than the centered state. Each outage gets its own
		// automatic attempt: latching for the whole session would leave a dropped
		// host sitting behind a manual button.
		status.set({ kind: 'connected' }, undefined);
		chatViewFactory.views[chatViewFactory.views.length - 1].hasVisibleTranscriptContent.set(true, undefined);
		const connectsWhileConnected = provider.connectCalls;

		provider.connectGate = new DeferredPromise<void>().p;
		status.set({ kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.HostNotRunning }, undefined);

		assert.deepStrictEqual({
			connectsWhileConnected,
			connectCalls: provider.connectCalls,
			banner: readBanner(view),
		}, {
			connectsWhileConnected: 1,
			connectCalls: 2,
			banner: { visible: true, message: 'Waiting for agent host connection...', action: undefined },
		});
	});

	test('automatically starts a stopped host without exposing the recovery action', () => {
		const { sessionsProvidersService, view } = createHarness(disposables);
		const provider = new TestAgentHostProvider();
		const connect = new DeferredPromise<void>();
		provider.connectGate = connect.p;
		provider.autoConnect.setEnabled(true);
		sessionsProvidersService.provider = provider;
		view.setSession(new TestActiveSession([createChat('main')], undefined, true, provider.id, { kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.HostNotRunning }), options);

		assert.deepStrictEqual({
			connectCalls: provider.connectCalls,
			state: readRemoteHostUnavailableState(view),
		}, {
			connectCalls: 1,
			state: {
				visible: true,
				title: 'Connecting to WSL: Ubuntu',
				description: 'Starting WSL: Ubuntu.',
				progress: 'Waiting for agent host connection...',
				action: undefined,
				actionHidden: true,
				autoConnect: 'Automatically Start WSL: Ubuntu',
				autoConnectChecked: true,
				autoConnectHidden: false,
			},
		});
	});

	test('shows the recovery action without starting a stopped host when auto-connect is disabled', () => {
		const { sessionsProvidersService, view } = createHarness(disposables);
		const provider = new TestAgentHostProvider();
		sessionsProvidersService.provider = provider;
		view.setSession(new TestActiveSession([createChat('main')], undefined, true, provider.id, { kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.HostNotRunning }), options);

		assert.deepStrictEqual({
			connectCalls: provider.connectCalls,
			state: readRemoteHostUnavailableState(view),
		}, {
			connectCalls: 0,
			state: {
				visible: true,
				title: 'Unable to Connect to WSL: Ubuntu',
				description: 'WSL: Ubuntu is not running.',
				progress: undefined,
				action: 'Start WSL: Ubuntu',
				actionHidden: false,
				autoConnect: 'Automatically Start WSL: Ubuntu',
				autoConnectChecked: false,
				autoConnectHidden: false,
			},
		});
	});

	test('toggles auto-connect exactly once when its checkbox is clicked', () => {
		const { sessionsProvidersService, view } = createHarness(disposables);
		const provider = new TestAgentHostProvider();
		const connect = new DeferredPromise<void>();
		provider.connectGate = connect.p;
		sessionsProvidersService.provider = provider;
		view.setSession(new TestActiveSession([createChat('main')], undefined, true, provider.id, { kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.HostNotRunning }), options);

		const checkbox = view.element.querySelector<HTMLElement>('.remote-host-unavailable-empty-state-auto-connect .monaco-checkbox');
		assert.ok(checkbox);
		checkbox.click();

		assert.deepStrictEqual({
			autoConnectEnabled: provider.autoConnect.enabled.get(),
			connectCalls: provider.connectCalls,
			state: readRemoteHostUnavailableState(view),
		}, {
			autoConnectEnabled: true,
			connectCalls: 1,
			state: {
				visible: true,
				title: 'Connecting to WSL: Ubuntu',
				description: 'Starting WSL: Ubuntu.',
				progress: 'Waiting for agent host connection...',
				action: undefined,
				actionHidden: true,
				autoConnect: 'Automatically Start WSL: Ubuntu',
				autoConnectChecked: true,
				autoConnectHidden: false,
			},
		});
	});

	test('does not retrigger an automatic start when the connect resolves without reaching the host', async () => {
		const { sessionsProvidersService, view } = createHarness(disposables);
		const provider = new TestAgentHostProvider();
		provider.autoConnect.setEnabled(true);
		sessionsProvidersService.provider = provider;
		// The provider resolves without the host coming up, so the status stays
		// stopped. The automatic start is latched per session rather than on the
		// attempt, which a resolved attempt clears — otherwise this would spin.
		view.setSession(new TestActiveSession([createChat('main')], undefined, true, provider.id, { kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.HostNotRunning }), options);
		await Promise.resolve();
		await Promise.resolve();

		assert.deepStrictEqual({
			connectCalls: provider.connectCalls,
			state: readRemoteHostUnavailableState(view),
		}, {
			connectCalls: 1,
			state: {
				visible: true,
				title: 'Unable to Connect to WSL: Ubuntu',
				description: 'WSL: Ubuntu is not running.',
				progress: undefined,
				action: 'Start WSL: Ubuntu',
				actionHidden: false,
				autoConnect: 'Automatically Start WSL: Ubuntu',
				autoConnectChecked: true,
				autoConnectHidden: false,
			},
		});
	});

	test('offers the recovery action after an automatic connection attempt fails', async () => {
		const { sessionsProvidersService, view } = createHarness(disposables);
		const provider = new TestAgentHostProvider();
		const connect = new DeferredPromise<void>();
		provider.connectGate = connect.p;
		provider.autoConnect.setEnabled(true);
		sessionsProvidersService.provider = provider;
		view.setSession(new TestActiveSession([createChat('main')], undefined, true, provider.id, { kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.HostNotRunning }), options);

		const originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(() => { });
		try {
			connect.error(new Error('Expected automatic connect failure'));
			await Promise.resolve();
			await Promise.resolve();
		} finally {
			setUnexpectedErrorHandler(originalErrorHandler);
		}

		assert.deepStrictEqual({
			connectCalls: provider.connectCalls,
			state: readRemoteHostUnavailableState(view),
		}, {
			connectCalls: 1,
			state: {
				visible: true,
				title: 'Unable to Connect to WSL: Ubuntu',
				description: 'WSL: Ubuntu is not running.',
				progress: undefined,
				action: 'Start WSL: Ubuntu',
				actionHidden: false,
				autoConnect: 'Automatically Start WSL: Ubuntu',
				autoConnectChecked: true,
				autoConnectHidden: false,
			},
		});
	});

	test('shows only its host connection progress and disposes listeners with its session and view', async () => {
		const { sessionsProvidersService, view } = createHarness(disposables);
		const provider = new TestAgentHostProvider();
		const firstConnect = new DeferredPromise<void>();
		provider.connectGate = firstConnect.p;
		sessionsProvidersService.provider = provider;
		const firstSession = new TestActiveSession([createChat('first')], undefined, true, provider.id, { kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.HostNotRunning });
		view.setSession(firstSession, options);

		view.element.querySelector<HTMLElement>('.remote-host-unavailable-empty-state-action .monaco-button')?.click();
		provider.reportConnectProgress('wsl:Debian', 'Downloading server (24%)');
		const otherHostProgress = readRemoteHostUnavailableState(view);
		provider.reportConnectProgress('wsl:Ubuntu', 'Downloading server (80%)');
		const ownHostProgress = readRemoteHostUnavailableState(view);
		firstConnect.complete();
		await Promise.resolve();
		await Promise.resolve();
		const completedAttempt = readRemoteHostUnavailableState(view);
		const listenerAfterAttempt = provider.hasProgressListener;

		const secondConnect = new DeferredPromise<void>();
		provider.connectGate = secondConnect.p;
		view.element.querySelector<HTMLElement>('.remote-host-unavailable-empty-state-action .monaco-button')?.click();
		const secondSession = new TestActiveSession([createChat('second')], undefined, true, provider.id, { kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.HostNotRunning });
		view.setSession(secondSession, options);
		const listenerAfterSessionChange = provider.hasProgressListener;
		view.element.querySelector<HTMLElement>('.remote-host-unavailable-empty-state-action .monaco-button')?.click();
		const listenerBeforeDispose = provider.hasProgressListener;
		view.dispose();
		const listenerAfterDispose = provider.hasProgressListener;
		secondConnect.complete();
		await Promise.resolve();

		assert.deepStrictEqual({
			otherHostProgress,
			ownHostProgress,
			completedAttempt,
			listenerAfterAttempt,
			listenerAfterSessionChange,
			listenerBeforeDispose,
			listenerAfterDispose,
		}, {
			// Another host's progress is ignored, so the attempt still shows only
			// its own placeholder. It stays on the connecting presentation rather
			// than falling back to the action: an in-flight attempt must not flash
			// the recovery button while the host has yet to report `connecting`.
			otherHostProgress: {
				visible: true,
				title: 'Connecting to WSL: Ubuntu',
				description: 'Starting WSL: Ubuntu.',
				progress: 'Waiting for agent host connection...',
				action: undefined,
				actionHidden: true,
				autoConnect: 'Automatically Start WSL: Ubuntu',
				autoConnectChecked: false,
				autoConnectHidden: false,
			},
			ownHostProgress: {
				visible: true,
				title: 'Connecting to WSL: Ubuntu',
				description: 'Starting WSL: Ubuntu.',
				progress: 'Downloading server (80%)',
				action: undefined,
				actionHidden: true,
				autoConnect: 'Automatically Start WSL: Ubuntu',
				autoConnectChecked: false,
				autoConnectHidden: false,
			},
			completedAttempt: {
				visible: true,
				title: 'Unable to Connect to WSL: Ubuntu',
				description: 'WSL: Ubuntu is not running.',
				progress: undefined,
				action: 'Start WSL: Ubuntu',
				actionHidden: false,
				autoConnect: 'Automatically Start WSL: Ubuntu',
				autoConnectChecked: false,
				autoConnectHidden: false,
			},
			listenerAfterAttempt: false,
			listenerAfterSessionChange: false,
			listenerBeforeDispose: true,
			listenerAfterDispose: false,
		});
	});

	test('preserves the archived-session banner when its remote host is unavailable', () => {
		const { sessionsProvidersService, view } = createHarness(disposables);
		const provider = new TestAgentHostProvider();
		sessionsProvidersService.provider = provider;
		const chat = createChat('main');
		chat.interactivity.set(ChatInteractivity.ReadOnly, undefined);
		const session = new TestActiveSession([chat], undefined, true, provider.id, { kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.HostNotRunning });
		session.isArchived.set(true, undefined);

		view.setSession(session, options);

		assert.deepStrictEqual(readBanner(view), {
			visible: true,
			message: 'Archived sessions are read-only.',
			action: 'Unarchive',
		});
	});

	test('does not show a reconnecting banner when the connection settles before its delay', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionsProvidersService, view } = createHarness(disposables);
			const provider = new TestAgentHostProvider();
			sessionsProvidersService.provider = provider;
			const session = new TestActiveSession([createChat('main')], undefined, true, provider.id, { kind: 'connected' });
			const remoteConnectionStatus = session.remoteConnectionStatus;
			assert.ok(remoteConnectionStatus);
			view.setSession(session, options);

			remoteConnectionStatus.set({ kind: 'reconnecting' }, undefined);
			remoteConnectionStatus.set({ kind: 'connected' }, undefined);
			await timeout(1_000);

			assert.deepStrictEqual(readBanner(view), { visible: false, message: 'This chat is read-only', action: undefined });
		});
	});

	test('shows the reconnecting banner after its delay despite unrelated observable updates', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionsProvidersService, view } = createHarness(disposables);
			const provider = new TestAgentHostProvider();
			sessionsProvidersService.provider = provider;
			const chat = createChat('main');
			const session = new TestActiveSession([chat], undefined, true, provider.id, { kind: 'reconnecting' });
			view.setSession(session, options);

			await timeout(500);
			chat.status.set(SessionStatus.Error, undefined);
			await timeout(500);

			assert.deepStrictEqual(readBanner(view), {
				visible: true,
				message: 'Reconnecting to WSL: Ubuntu...',
				action: undefined,
			});
		});
	});

	test('shows a reconnect countdown and retries immediately on demand', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { chatViewFactory, sessionsProvidersService, view } = createHarness(disposables);
			const provider = new TestAgentHostProvider();
			sessionsProvidersService.provider = provider;
			const session = new TestActiveSession([createChat('main')], undefined, true, provider.id, { kind: 'reconnecting', nextAttemptAt: Date.now() + 6_000 });
			view.setSession(session, options);
			chatViewFactory.views[chatViewFactory.views.length - 1].hasVisibleTranscriptContent.set(true, undefined);

			await timeout(1_000);
			const banner = readBanner(view);
			view.element.querySelector<HTMLElement>('.session-readonly-banner-action-link')?.click();

			assert.deepStrictEqual({ banner, reconnectNowCalls: provider.reconnectNowCalls }, {
				banner: { visible: true, message: 'Reconnecting to WSL: Ubuntu in 5s', action: 'Try Now' },
				reconnectNowCalls: 1,
			});
		});
	});

	test('updates the reconnect countdown every second', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { chatViewFactory, sessionsProvidersService, view } = createHarness(disposables);
			const provider = new TestAgentHostProvider();
			sessionsProvidersService.provider = provider;
			const session = new TestActiveSession([createChat('main')], undefined, true, provider.id, { kind: 'reconnecting', nextAttemptAt: Date.now() + 7_000 });
			view.setSession(session, options);
			chatViewFactory.views[chatViewFactory.views.length - 1].hasVisibleTranscriptContent.set(true, undefined);

			await timeout(1_000);
			const beforeTick = readBanner(view);
			await timeout(1_000);

			assert.deepStrictEqual({ beforeTick, afterTick: readBanner(view) }, {
				beforeTick: { visible: true, message: 'Reconnecting to WSL: Ubuntu in 6s', action: 'Try Now' },
				afterTick: { visible: true, message: 'Reconnecting to WSL: Ubuntu in 5s', action: 'Try Now' },
			});
		});
	});

	test('shows a plain reconnecting banner while a reconnect attempt is in flight', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { chatViewFactory, sessionsProvidersService, view } = createHarness(disposables);
			const provider = new TestAgentHostProvider();
			sessionsProvidersService.provider = provider;
			const session = new TestActiveSession([createChat('main')], undefined, true, provider.id, { kind: 'reconnecting' });
			view.setSession(session, options);
			chatViewFactory.views[chatViewFactory.views.length - 1].hasVisibleTranscriptContent.set(true, undefined);

			await timeout(1_000);

			assert.deepStrictEqual(readBanner(view), {
				visible: true,
				message: 'Reconnecting to WSL: Ubuntu...',
				action: undefined,
			});
		});
	});

	test('shows the reconnecting banner after a failed connect attempt', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { sessionsProvidersService, view } = createHarness(disposables);
			const provider = new TestAgentHostProvider();
			const failedConnect = new DeferredPromise<void>();
			provider.connectGate = failedConnect.p;
			sessionsProvidersService.provider = provider;
			const session = new TestActiveSession([createChat('main')], undefined, true, provider.id, { kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.HostNotRunning });
			const remoteConnectionStatus = session.remoteConnectionStatus!;
			view.setSession(session, options);

			const originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
			setUnexpectedErrorHandler(() => { });
			try {
				view.element.querySelector<HTMLElement>('.remote-host-unavailable-empty-state-action .monaco-button')?.click();
				failedConnect.error(new Error('Expected connect failure'));
				await Promise.resolve();
				await Promise.resolve();
			} finally {
				setUnexpectedErrorHandler(originalErrorHandler);
			}

			remoteConnectionStatus.set({ kind: 'reconnecting' }, undefined);
			await timeout(1_000);

			assert.deepStrictEqual({ connectCalls: provider.connectCalls, banner: readBanner(view) }, {
				connectCalls: 1,
				banner: { visible: true, message: 'Reconnecting to WSL: Ubuntu...', action: undefined },
			});
		});
	});

});
