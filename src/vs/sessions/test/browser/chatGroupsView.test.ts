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

	constructor(readonly kind: ChatViewKind) {
		super();
		this.element.dataset.kind = kind;
		this.element.appendChild(this._focusTarget);
	}

	toJSON(): object {
		return {};
	}

	protected doLayout(): void { }

	focus(): void {
		this._focusTarget.focus();
	}
}

class TestChatViewFactory extends mock<IChatViewFactory>() {
	override createNewChatView(isNewChatInSession: boolean): AbstractChatView {
		return new TestChatView(isNewChatInSession ? 'newChatInSession' : 'newSession');
	}

	override createChatView(): AbstractChatView {
		return new TestChatView('chat');
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
	readonly view: ChatGroupsView;
}

function createHarness(disposables: Pick<DisposableStore, 'add'>): IChatGroupsHarness {
	const store = disposables.add(new DisposableStore());
	const instantiationService = workbenchInstantiationService(undefined, store);
	const sessionsService = new TestSessionsService();
	instantiationService.stub(IChatViewFactory, new TestChatViewFactory());
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
	mainWindow.document.body.appendChild(view.element);
	store.add(toDisposable(() => view.element.remove()));
	return { instantiationService, sessionsService, view };
}

suite('Sessions - ChatGroupsView', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const options = { renderSessionTypePickerInControls: constObservable(false) };

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

	test('left split updates logical and accessible group order', () => {
		const { view } = createHarness(disposables);
		const main = createChat('main');
		const secondary = createChat('secondary');
		const session = new TestActiveSession([main, secondary]);
		view.setSession(session, options);

		view['_onChatDrop'](view['_groups'][0].id, 'left', { sessionId: session.sessionId, resource: secondary.resource.toString() });

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

	test('new chat action focuses its group composer', async () => {
		const { view } = createHarness(disposables);
		const main = createChat('main');
		const session = new TestActiveSession([main]);
		view.setSession(session, options);
		const group = view.element.querySelector<HTMLElement>('.chat-group-view')!;

		group.querySelector<HTMLElement>('.chat-composite-bar-new-chat .action-label')!.click();
		await Promise.resolve();
		await Promise.resolve();

		assert.strictEqual(group.contains(mainWindow.document.activeElement), true);
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
});
