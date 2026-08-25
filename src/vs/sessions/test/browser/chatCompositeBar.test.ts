/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { addDisposableListener, EventType } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Event } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../base/common/observable.js';
import { isLinux } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { ChatCompositeBar, IChatCompositeBarDelegate } from '../../browser/parts/chatCompositeBar.js';
import { getSessionChatDragData, isSessionChatDrag } from '../../browser/dnd.js';
import { CLOSE_CHAT_COMMAND_ID } from '../../common/sessionCommands.js';
import { ISessionsProvidersService } from '../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsPartService } from '../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, IChat, ISession, ISessionCapabilities, SessionStatus } from '../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../services/sessions/common/sessionsManagement.js';

class TestCommandService extends mock<ICommandService>() {
	readonly calls: { readonly commandId: string; readonly args: readonly unknown[] }[] = [];

	override async executeCommand<T = unknown>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
		this.calls.push({ commandId, args });
		return undefined;
	}
}

class TestSessionsService extends mock<ISessionsService>() {
	readonly openedChats: URI[] = [];

	override async openChat(_session: ISession, chatUri: URI): Promise<void> {
		this.openedChats.push(chatUri);
	}
}

function createChat(id: string, title: string, status: SessionStatus = SessionStatus.Completed): IChat {
	const resource = URI.parse(`test-chat://${id}`);
	return new class extends mock<IChat>() {
		override readonly resource = resource;
		override readonly title: IObservable<string> = constObservable(title);
		override readonly status: IObservable<SessionStatus> = constObservable(status);
		override readonly isRead: IObservable<boolean> = constObservable(true);
		override readonly interactivity: IObservable<ChatInteractivity> = constObservable(ChatInteractivity.Full);
	}();
}

function createSession(chats: readonly IChat[], activeChat: IChat, isQuickChat = false): IActiveSession {
	const resource = URI.parse('test-session://session');
	return new class extends mock<IActiveSession>() {
		override readonly sessionId = 'session';
		override readonly resource = resource;
		override readonly providerId = 'test';
		override readonly chats: IObservable<readonly IChat[]> = constObservable(chats);
		override readonly openChats: IObservable<readonly IChat[]> = constObservable(chats);
		override readonly closedChats: IObservable<readonly IChat[]> = constObservable([]);
		override readonly visibleChatTabs: IObservable<readonly IChat[]> = constObservable(chats);
		override readonly shouldShowChatTabs: IObservable<boolean> = constObservable(true);
		override readonly mainChat: IObservable<IChat> = constObservable(chats[0]);
		override readonly activeChat: IObservable<IChat> = constObservable(activeChat);
		override readonly capabilities: IObservable<ISessionCapabilities> = constObservable({ supportsMultipleChats: true });
		override readonly isCreated: IObservable<boolean> = constObservable(true);
		override readonly isArchived: IObservable<boolean> = constObservable(false);
		override readonly isQuickChat: IObservable<boolean> = constObservable(isQuickChat);
	}();
}

interface IChatCompositeBarHarness {
	readonly store: DisposableStore;
	readonly instantiationService: TestInstantiationService;
	readonly commandService: TestCommandService;
	readonly sessionsService: TestSessionsService;
	readonly bar: ChatCompositeBar;
	readonly session: IActiveSession;
	readonly tabs: readonly HTMLElement[];
}

function createHarness(disposables: Pick<DisposableStore, 'add'>, options?: { readonly isQuickChat?: boolean }): IChatCompositeBarHarness {
	const store = disposables.add(new DisposableStore());
	const instantiationService = workbenchInstantiationService(undefined, store);
	const commandService = new TestCommandService();
	const sessionsService = new TestSessionsService();
	const mainChat = createChat('main', 'Main Chat');
	const secondaryChat = createChat('secondary', 'Secondary Chat');
	const session = createSession([mainChat, secondaryChat], mainChat, options?.isQuickChat);

	instantiationService.stub(ICommandService, commandService);
	instantiationService.stub(ISessionsService, sessionsService);
	instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
		override readonly onDidChangeSessions = Event.None;
	}());
	instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { });
	instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
		override readonly onDidChangeProviders = Event.None;
		override getProvider() { return undefined; }
	}());

	const bar = store.add(instantiationService.createInstance(ChatCompositeBar));
	const delegate: IChatCompositeBarDelegate = {
		session,
		chats: session.visibleChatTabs,
		activeChatResource: constObservable(session.activeChat.get().resource.toString()),
		mainChatResource: constObservable(session.mainChat.get().resource.toString()),
		visible: session.shouldShowChatTabs,
		showSessionActions: session.shouldShowChatTabs,
		openChat: resource => { sessionsService.openChat(session, resource); },
		newChat: () => { },
	};
	bar.setGroup(delegate);
	const container = mainWindow.document.createElement('div');
	container.appendChild(bar.element);
	const tabs = Array.from(bar.element.querySelectorAll<HTMLElement>('.chat-composite-bar-tab'));

	return { store, instantiationService, commandService, sessionsService, bar, session, tabs };
}

suite('Sessions - ChatCompositeBar', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('creates scoped chat tab presentation elements', () => {
		const { tabs } = createHarness(disposables);

		assert.deepStrictEqual({
			tabs: tabs.map(tab => ({
				hasSharedPresentation: tab.classList.contains('modern-ui-editor-tab'),
				hasFill: tab.querySelector(':scope > .chat-composite-bar-tab-fill.modern-ui-editor-tab-fill') !== null,
				hasLabel: tab.querySelector(':scope > .chat-composite-bar-tab-label.modern-ui-editor-tab-label') !== null,
				hasActions: tab.querySelector(':scope > .chat-composite-bar-tab-actions') !== null,
				ariaLabel: tab.getAttribute('aria-label'),
			})),
			hasMetadataRow: tabs[0].closest('.session-chat-tabs-bar')?.querySelector('.chat-composite-bar-meta-row') !== null,
		}, {
			tabs: [
				{ hasSharedPresentation: true, hasFill: true, hasLabel: true, hasActions: false, ariaLabel: 'Main Chat, State: Completed' },
				{ hasSharedPresentation: true, hasFill: true, hasLabel: true, hasActions: true, ariaLabel: 'Secondary Chat, State: Completed' },
			],
			hasMetadataRow: false,
		});
	});

	test('hides New Chat for workspace-less sessions', () => {
		const { bar } = createHarness(disposables, { isQuickChat: true });

		assert.strictEqual(bar.element.querySelector('.chat-composite-bar-new-chat')?.classList.contains('hidden'), true);
	});

	test('middle-click closes the targeted inactive non-main chat', () => {
		const { store, commandService, sessionsService, bar, session, tabs } = createHarness(disposables);
		let bubbled = 0;
		store.add(addDisposableListener(bar.element, EventType.AUXCLICK, () => bubbled++));
		const event = new MouseEvent(EventType.AUXCLICK, { bubbles: true, button: 1, cancelable: true });

		const dispatchResult = tabs[1].dispatchEvent(event);

		assert.deepStrictEqual({
			commandCalls: commandService.calls,
			openedChats: sessionsService.openedChats,
			defaultPrevented: event.defaultPrevented,
			dispatchResult,
			bubbled,
		}, {
			commandCalls: [{
				commandId: CLOSE_CHAT_COMMAND_ID,
				args: [{ session, chat: session.visibleChatTabs.get()[1] }],
			}],
			openedChats: [],
			defaultPrevented: true,
			dispatchResult: false,
			bubbled: 0,
		});
	});

	test('middle-click does not close the main chat and other auxiliary clicks are ignored', () => {
		const { store, commandService, bar, tabs } = createHarness(disposables);
		let bubbled = 0;
		store.add(addDisposableListener(bar.element, EventType.AUXCLICK, () => bubbled++));
		const mainMiddleClick = new MouseEvent(EventType.AUXCLICK, { bubbles: true, button: 1, cancelable: true });
		const secondaryRightClick = new MouseEvent(EventType.AUXCLICK, { bubbles: true, button: 2, cancelable: true });

		tabs[0].dispatchEvent(mainMiddleClick);
		tabs[1].dispatchEvent(secondaryRightClick);

		assert.deepStrictEqual({
			commandCalls: commandService.calls,
			mainDefaultPrevented: mainMiddleClick.defaultPrevented,
			secondaryDefaultPrevented: secondaryRightClick.defaultPrevented,
			bubbled,
		}, {
			commandCalls: [],
			mainDefaultPrevented: true,
			secondaryDefaultPrevented: false,
			bubbled: 1,
		});
	});

	test('prevents native middle-button behavior on the scrollable tab container', () => {
		const { bar } = createHarness(disposables);
		const tabsContainer = bar.element.querySelector<HTMLElement>('.chat-composite-bar-tabs')!;
		const middleMouseDown = new MouseEvent(EventType.MOUSE_DOWN, { bubbles: true, button: 1, cancelable: true });
		const leftMouseDown = new MouseEvent(EventType.MOUSE_DOWN, { bubbles: true, button: 0, cancelable: true });
		const middleMouseUp = new MouseEvent(EventType.MOUSE_UP, { bubbles: true, button: 1, cancelable: true });

		tabsContainer.dispatchEvent(middleMouseDown);
		tabsContainer.dispatchEvent(leftMouseDown);
		tabsContainer.dispatchEvent(middleMouseUp);

		assert.deepStrictEqual({
			middleMouseDown: middleMouseDown.defaultPrevented,
			leftMouseDown: leftMouseDown.defaultPrevented,
			middleMouseUp: middleMouseUp.defaultPrevented,
		}, {
			middleMouseDown: true,
			leftMouseDown: false,
			middleMouseUp: isLinux,
		});
	});

	test('middle-click in the rename input does not close the chat', () => {
		const { commandService, tabs } = createHarness(disposables);
		tabs[1].dispatchEvent(new MouseEvent(EventType.DBLCLICK, { bubbles: true, button: 0, cancelable: true }));
		const input = tabs[1].querySelector<HTMLInputElement>('.chat-composite-bar-tab-input input')!;
		const mouseDownEvent = new MouseEvent(EventType.MOUSE_DOWN, { bubbles: true, button: 1, cancelable: true });
		const mouseUpEvent = new MouseEvent(EventType.MOUSE_UP, { bubbles: true, button: 1, cancelable: true });
		const auxClickEvent = new MouseEvent(EventType.AUXCLICK, { bubbles: true, button: 1, cancelable: true });

		input.dispatchEvent(mouseDownEvent);
		input.dispatchEvent(mouseUpEvent);
		input.dispatchEvent(auxClickEvent);

		assert.deepStrictEqual({
			commandCalls: commandService.calls,
			mouseDownDefaultPrevented: mouseDownEvent.defaultPrevented,
			mouseUpDefaultPrevented: mouseUpEvent.defaultPrevented,
			auxClickDefaultPrevented: auxClickEvent.defaultPrevented,
		}, {
			commandCalls: [],
			mouseDownDefaultPrevented: false,
			mouseUpDefaultPrevented: false,
			auxClickDefaultPrevented: false,
		});
	});

	// Regression: a chat-tab drag must carry its group-move payload on the
	// `dataTransfer` (readable by the chat-groups drop target), not on the shared
	// LocalSelectionTransfer singleton. The singleton is also used by the
	// chat-reference drag, and — being single-slot — the reference payload would
	// otherwise clobber the group-move payload, so dragging a tab to split chats
	// side by side silently did nothing. See the chat-groups DnD in
	// chatGroupDropTarget.ts / chatGroupsView.ts.
	test('dragging a chat tab carries the group-move payload on the dataTransfer', () => {
		const { tabs, session } = createHarness(disposables);
		const dataTransfer = new DataTransfer();
		const dragStart = new DragEvent(EventType.DRAG_START, { bubbles: true, cancelable: true, dataTransfer });

		tabs[1].dispatchEvent(dragStart);

		const secondaryChat = session.visibleChatTabs.get()[1];
		assert.deepStrictEqual({
			isChatDrag: isSessionChatDrag(dragStart),
			isSameSessionDrag: isSessionChatDrag(dragStart, session.sessionId),
			isOtherSessionDrag: isSessionChatDrag(dragStart, 'other-session'),
			payload: getSessionChatDragData(dragStart),
		}, {
			isChatDrag: true,
			isSameSessionDrag: true,
			isOtherSessionDrag: false,
			payload: { sessionId: session.sessionId, resource: secondaryChat.resource.toString() },
		});
	});
});
