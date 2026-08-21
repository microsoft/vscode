/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../base/browser/window.js';
import { DeferredPromise } from '../../../base/common/async.js';
import { Event } from '../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, ISettableObservable, observableValue } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { AbstractChatView, ChatViewKind } from '../../browser/parts/chatView.js';
import { ChatGroupsView } from '../../browser/parts/chatGroupsView.js';
import { IChatViewFactory } from '../../services/chatView/browser/chatViewFactory.js';
import { ISessionsProvidersService } from '../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsPartService } from '../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, ChatOriginKind, IChat, ISession, ISessionCapabilities, SessionStatus } from '../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../services/sessions/common/sessionsManagement.js';

class TestChatView extends AbstractChatView {
	private readonly _focusTarget = mainWindow.document.createElement('button');
	layoutCount = 0;

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

function createChat(id: string, status: SessionStatus = SessionStatus.Completed, parentChat?: URI): IChat {
	const resource = URI.parse(`test-chat://${id}`);
	return new class extends mock<IChat>() {
		override readonly resource = resource;
		override readonly origin = parentChat ? { kind: ChatOriginKind.Tool, parentChat } : undefined;
		override readonly title: IObservable<string> = constObservable(id);
		override readonly status: IObservable<SessionStatus> = constObservable(status);
		override readonly isRead: IObservable<boolean> = constObservable(true);
		override readonly interactivity: IObservable<ChatInteractivity> = constObservable(ChatInteractivity.Full);
	}();
}

class TestActiveSession extends mock<IActiveSession>() {
	override readonly sessionId = 'session';
	override readonly resource = URI.parse('test-session://session');
	override readonly providerId = 'test';
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
	override readonly isArchived: IObservable<boolean> = constObservable(false);
	override readonly loading: IObservable<boolean> = constObservable(false);

	constructor(chats: readonly IChat[], visibleChats: readonly IChat[] = chats, isCreated = true) {
		super();
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
	newChatGate: Promise<void> | undefined;

	override async openChat(session: ISession, chatUri: URI): Promise<void> {
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

	override async openNewChatInSession(session: ISession): Promise<void> {
		if (!(session instanceof TestActiveSession)) {
			return;
		}
		await this.newChatGate;
		const chat = createChat(`new-${session.allChats.get().length}`, SessionStatus.Untitled);
		session.allChats.set([...session.allChats.get(), chat], undefined);
		session.visibleChatTabs.set([...session.visibleChatTabs.get(), chat], undefined);
		session.activeChat.set(chat, undefined);
	}
}

interface IChatGroupsHarness {
	readonly instantiationService: TestInstantiationService;
	readonly sessionsService: TestSessionsService;
	readonly chatViewFactory: TestChatViewFactory;
	readonly view: ChatGroupsView;
}

function createHarness(disposables: Pick<DisposableStore, 'add'>, tabsReplaceHeader = true): IChatGroupsHarness {
	const store = disposables.add(new DisposableStore());
	const instantiationService = workbenchInstantiationService(undefined, store);
	const sessionsService = new TestSessionsService();
	const chatViewFactory = new TestChatViewFactory();
	instantiationService.stub(IChatViewFactory, chatViewFactory);
	instantiationService.stub(ISessionsService, sessionsService);
	instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
		override readonly onDidChangeSessions = Event.None;
	}());
	instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { });
	instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
		override readonly onDidChangeProviders = Event.None;
		override getProvider() { return undefined; }
	}());

	const view = store.add(instantiationService.createInstance(ChatGroupsView));
	view.setSingleGroupTabsReplaceHeader(tabsReplaceHeader);
	mainWindow.document.body.appendChild(view.element);
	store.add(toDisposable(() => view.element.remove()));
	return { instantiationService, sessionsService, chatViewFactory, view };
}

suite('Sessions - ChatGroupsView', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const options = { renderSessionTypePickerInControls: constObservable(false) };

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
		const { view } = createHarness(disposables);
		const main = createChat('main');
		const secondary = createChat('secondary');
		const session = new TestActiveSession([main, secondary]);
		view.setSession(session, options);

		await view['_onChatDrop'](view['_groups'][0].id, 'left', { sessionId: session.sessionId, resource: secondary.resource.toString() });

		const groups = Array.from(view.element.querySelectorAll<HTMLElement>('.chat-group-view'));
		const labelByChat = Object.fromEntries(groups.map(group => [
			group.querySelector<HTMLElement>('.chat-composite-bar-tab')?.dataset.chatResource,
			group.getAttribute('aria-label'),
		]));
		assert.deepStrictEqual(labelByChat, {
			[secondary.resource.toString()]: 'Chat Group 1 of 2',
			[main.resource.toString()]: 'Chat Group 2 of 2',
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

	test('new chat remains assigned to the group where creation started', async () => {
		const { sessionsService, view } = createHarness(disposables);
		const main = createChat('main');
		const secondary = createChat('secondary');
		const session = new TestActiveSession([main, secondary]);
		view.setSession(session, options);
		view.splitChatToSide(secondary.resource);
		view.focusAdjacentGroup('previous');
		const groups = Array.from(view.element.querySelectorAll<HTMLElement>('.chat-group-view'));
		const mainGroup = groups.find(group => group.querySelector<HTMLElement>('.chat-composite-bar-tab')?.dataset.chatResource === main.resource.toString())!;
		const gate = new DeferredPromise<void>();
		sessionsService.newChatGate = gate.p;

		mainGroup.querySelector<HTMLElement>('.chat-composite-bar-new-chat .action-label')!.click();
		view.focusAdjacentGroup('next');
		gate.complete();
		await gate.p;
		await Promise.resolve();
		await Promise.resolve();

		const newChat = session.activeChat.get();
		assert.deepStrictEqual({
			mainGroupTabs: Array.from(mainGroup.querySelectorAll<HTMLElement>('.chat-composite-bar-tab')).map(tab => tab.dataset.chatResource),
			secondaryGroupTabs: Array.from(groups.find(group => group !== mainGroup)!.querySelectorAll<HTMLElement>('.chat-composite-bar-tab')).map(tab => tab.dataset.chatResource),
			focusInMainGroup: mainGroup.contains(mainWindow.document.activeElement),
		}, {
			mainGroupTabs: [main.resource.toString(), newChat.resource.toString()],
			secondaryGroupTabs: [secondary.resource.toString()],
			focusInMainGroup: true,
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

});
