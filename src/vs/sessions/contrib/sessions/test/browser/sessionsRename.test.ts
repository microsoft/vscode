/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IInputOptions, IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ARCHIVE_SESSION_COMMAND_ID, RENAME_CHAT_COMMAND_ID, RENAME_SESSION_COMMAND_ID } from '../../../../common/sessionCommands.js';
import { SessionView } from '../../../../browser/parts/sessionView.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ChatInteractivity, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { SessionsChatAccessibilityHelp } from '../../../chat/browser/sessionsChatAccessibilityHelp.js';
import { SessionsFlatList, SessionsGrouping, SessionsList, SessionsSorting } from '../../browser/views/sessionsList.js';
import { createListHarness, createTestSession, TestCommandService, TestSessionsManagementService } from './sessionsListTestUtils.js';
import '../../browser/sessionsActions.js';
import '../../browser/views/sessionsViewActions.js';

class TestQuickInputService extends mock<IQuickInputService>() {
	result: string | undefined;
	options: IInputOptions | undefined;
	calls = 0;
	inputHandler: ((options?: IInputOptions) => Promise<string | undefined>) | undefined;

	override async input(options?: IInputOptions): Promise<string | undefined> {
		this.calls++;
		this.options = options;
		if (this.inputHandler) {
			return this.inputHandler(options);
		}
		return this.result;
	}
}

function dispatchDoubleClick(target: HTMLElement, options: MouseEventInit = {}): MouseEvent {
	target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail: 1, ...options }));
	target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail: 2, ...options }));
	const doubleClick = new MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0, detail: 2, ...options });
	target.dispatchEvent(doubleClick);
	return doubleClick;
}

suite('Sessions rename', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	suite('list interaction', () => {
		test('title double-click opens once and renames inline', () => {
			const { session } = createTestSession('First');
			const harness = createListHarness(disposables, [session]);
			const openCalls: URI[] = [];
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				compact: () => true,
				onSessionOpen: resource => {
					openCalls.push(resource);
				},
			}));
			list.layout(300, 400);
			const title = container.querySelector<HTMLElement>('.session-item .monaco-highlighted-label');
			assert.ok(title);
			const row = title.closest<HTMLElement>('.monaco-list-row');
			const icon = row?.querySelector<HTMLElement>('.session-icon');
			const titleRow = row?.querySelector<HTMLElement>('.session-title-row');
			assert.ok(row);
			assert.ok(icon);
			assert.ok(titleRow);
			const rowRect = row.getBoundingClientRect();
			const centerInRow = (element: HTMLElement) => {
				const rect = element.getBoundingClientRect();
				return (rect.top + rect.bottom) / 2 - rowRect.top;
			};
			const iconCenter = centerInRow(icon);

			let bubbled = 0;
			container.addEventListener('dblclick', () => bubbled++);
			const doubleClick = dispatchDoubleClick(titleRow);
			const input = container.querySelector<HTMLInputElement>('.session-title-input input');
			assert.ok(input);
			const inputBox = input.closest<HTMLElement>('.monaco-inputbox');
			assert.ok(inputBox);
			const inputValue = input.value;
			const inputFocused = mainWindow.document.activeElement === input;
			const inputStyle = mainWindow.getComputedStyle(input);
			const inputBoxStyle = mainWindow.getComputedStyle(inputBox);
			const inputGeometry = {
				paddingLeft: inputStyle.paddingLeft,
				inputHeight: inputStyle.height,
				inputBoxHeight: inputBoxStyle.height,
			};
			const compactDescription = row.querySelector<HTMLElement>('.session-compact-hover-description');
			assert.ok(compactDescription);
			assert.deepStrictEqual({
				titleRowHeight: mainWindow.getComputedStyle(titleRow).height,
				inputAlignedWithIcon: centerInRow(inputBox) === iconCenter,
				compactDescriptionDisplay: mainWindow.getComputedStyle(compactDescription).display,
			}, {
				titleRowHeight: '16px',
				inputAlignedWithIcon: true,
				compactDescriptionDisplay: 'none',
			});
			input.value = ' Renamed ';
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));

			assert.deepStrictEqual({
				openCalls: openCalls.map(resource => resource.toString()),
				inputValue,
				inputFocused,
				inputGeometry,
				renamed: harness.managementService.renamed,
				inputClosed: container.querySelector('.session-title-input input') === null,
				defaultPrevented: doubleClick.defaultPrevented,
				bubbled,
			}, {
				openCalls: [session.resource.toString()],
				inputValue: 'First',
				inputFocused: true,
				inputGeometry: {
					paddingLeft: '0px',
					inputHeight: '20px',
					inputBoxHeight: '22px',
				},
				renamed: [{ session, title: 'Renamed' }],
				inputClosed: true,
				defaultPrevented: true,
				bubbled: 0,
			});
		});

		test('reveals offscreen session and chat rename targets', () => {
			const sessions = Array.from({ length: 20 }, (_, index) => {
				const session = createTestSession(`Session ${index}`).session;
				const timestamp = new Date(index * 1_000);
				return { ...session, createdAt: timestamp, updatedAt: constObservable(timestamp) };
			});
			const chatSessionBase = createTestSession('Session with chat').session;
			const mainChat = chatSessionBase.mainChat.get();
			const peerChat = new class extends mock<IChat>() {
				override readonly resource = URI.parse('test-chat:///offscreen-peer');
				override readonly title = constObservable('Offscreen peer');
				override readonly updatedAt = constObservable(new Date());
				override readonly status = constObservable(SessionStatus.Completed);
				override readonly interactivity = constObservable(ChatInteractivity.Full);
				override readonly capabilities = constObservable({ canRename: true, canDelete: true });
			}();
			const chatSession: ISession = {
				...chatSessionBase,
				createdAt: new Date(100_000),
				updatedAt: constObservable(new Date(100_000)),
				chats: constObservable([mainChat, peerChat]),
				mainChat: constObservable(mainChat),
			};
			sessions.push(chatSession);
			const harness = createListHarness(disposables, sessions);
			const container = harness.createContainer(300, 80);
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
				onChatOpen: () => { },
			}));
			list.layout(300, 80);

			list.reveal(chatSession.resource);
			assert.ok(![...container.querySelectorAll('.monaco-highlighted-label')].some(label => label.textContent === 'Session 0'));
			assert.strictEqual(list.beginRenameSession(sessions[0]), true);
			const sessionInput = container.querySelector<HTMLInputElement>('.session-title-input input');
			assert.ok(sessionInput);
			sessionInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));

			list.reveal(sessions[0].resource);
			assert.strictEqual(container.querySelector('.session-chat-item'), null);
			assert.strictEqual(list.beginRenameChat({ session: chatSession, chat: peerChat }), true);

			assert.deepStrictEqual({
				sessionInputValue: sessionInput.value,
				chatInputValue: container.querySelector<HTMLInputElement>('.session-chat-title-input input')?.value,
			}, {
				sessionInputValue: 'Session 0',
				chatInputValue: 'Offscreen peer',
			});
			container.querySelector<HTMLInputElement>('.session-chat-title-input input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
		});

		test('double-click open completes while inline rename keeps focus', async () => {
			const { session } = createTestSession('First');
			const pendingOpen = new DeferredPromise<void>();
			let openCompleted = false;
			let openInvocation = 0;
			const preserveFocusValues: boolean[] = [];
			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const focusTarget = container.appendChild(container.ownerDocument.createElement('button'));
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: async (_resource, preserveFocus) => {
					preserveFocusValues.push(preserveFocus);
					const invocation = ++openInvocation;
					await pendingOpen.p;
					if (invocation !== openInvocation) {
						return;
					}
					openCompleted = true;
					if (!preserveFocus) {
						focusTarget.focus();
					}
				},
			}));
			list.layout(300, 400);
			const titleRow = container.querySelector<HTMLElement>('.session-title-row');
			assert.ok(titleRow);

			dispatchDoubleClick(titleRow);
			const input = container.querySelector<HTMLInputElement>('.session-title-input input');
			assert.ok(input);
			input.value = 'Unfinished draft';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			pendingOpen.complete();
			await pendingOpen.p;

			assert.deepStrictEqual({
				openCompleted,
				preserveFocusValues,
				inputStillOpen: container.querySelector('.session-title-input input') === input,
				inputFocused: mainWindow.document.activeElement === input,
				renamed: harness.managementService.renamed,
			}, {
				openCompleted: true,
				preserveFocusValues: [false, true],
				inputStillOpen: true,
				inputFocused: true,
				renamed: [],
			});
		});

		test('rename is scoped to the unmodified title row, capability-gated, and rebound safely', () => {
			const first = createTestSession('First', { resourceId: 'shared' });
			const harness = createListHarness(disposables, [first.session]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);

			for (const selector of ['.session-icon', '.session-details-row', '.session-title-toolbar']) {
				const target = container.querySelector<HTMLElement>(`.session-item ${selector}`);
				assert.ok(target);
				dispatchDoubleClick(target);
			}
			const titleRow = container.querySelector<HTMLElement>('.session-item .session-title-row');
			assert.ok(titleRow);
			dispatchDoubleClick(titleRow, { altKey: true });
			assert.strictEqual(container.querySelector('.session-title-input input'), null);

			first.capabilities.set({ supportsMultipleChats: false, supportsRename: false }, undefined);
			const unsupported = dispatchDoubleClick(titleRow);
			assert.strictEqual(unsupported.defaultPrevented, false);
			assert.strictEqual(container.querySelector('.session-title-input input'), null);

			const replacement = createTestSession('Replacement', { resourceId: 'shared' });
			harness.managementService.sessions = [replacement.session];
			list.refresh();
			list.layout(300, 400);
			const replacementTitle = container.querySelector<HTMLElement>('.session-item .monaco-highlighted-label');
			const replacementTitleRow = container.querySelector<HTMLElement>('.session-item .session-title-row');
			assert.ok(replacementTitle);
			assert.ok(replacementTitleRow);
			assert.strictEqual(replacementTitle.textContent, 'Replacement');
			dispatchDoubleClick(replacementTitleRow);

			assert.strictEqual(container.querySelector<HTMLInputElement>('.session-title-input input')?.value, 'Replacement');
		});

		test('inline rename validates blank titles and Escape cancels', () => {
			const { session } = createTestSession('First');
			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);

			assert.strictEqual(list.beginRenameSession(session), true);
			const input = container.querySelector<HTMLInputElement>('.session-title-input input');
			assert.ok(input);
			input.value = '   ';
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
			const blankState = {
				inputStillOpen: container.querySelector('.session-title-input input') === input,
				ariaInvalid: input.getAttribute('aria-invalid'),
				validationMessage: mainWindow.document.querySelector('.monaco-inputbox-message')?.textContent,
				renamed: [...harness.managementService.renamed],
			};

			input.value = 'Cancelled';
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));

			assert.deepStrictEqual({
				blankState,
				inputClosed: container.querySelector('.session-title-input input') === null,
				listOwnsFocus: container.contains(mainWindow.document.activeElement),
				renamed: harness.managementService.renamed,
			}, {
				blankState: {
					inputStillOpen: true,
					ariaInvalid: 'true',
					validationMessage: 'Title cannot be empty',
					renamed: [],
				},
				inputClosed: true,
				listOwnsFocus: true,
				renamed: [],
			});
		});

		test('preserves rename drafts across rerenders and clears removed targets', () => {
			const sessionData = createTestSession('Session');
			const sessionHarness = createListHarness(disposables, [sessionData.session]);
			const sessionContainer = sessionHarness.createContainer();
			const sessionList = sessionHarness.store.add(sessionHarness.instantiationService.createInstance(SessionsList, sessionContainer, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			sessionList.layout(300, 400);
			assert.strictEqual(sessionList.beginRenameSession(sessionData.session), true);
			const sessionInput = sessionContainer.querySelector<HTMLInputElement>('.session-title-input input');
			assert.ok(sessionInput);
			sessionInput.value = 'Session draft';
			sessionInput.dispatchEvent(new Event('input', { bubbles: true }));
			sessionList.refresh();
			sessionList.layout(300, 400);
			const rerenderedSessionInput = sessionContainer.querySelector<HTMLInputElement>('.session-title-input input');

			sessionHarness.managementService.sessions = [];
			sessionList.refresh();
			sessionHarness.managementService.sessions = [sessionData.session];
			sessionList.refresh();

			const baseSession = createTestSession('Session with chat').session;
			const mainChat = baseSession.mainChat.get();
			const peerChat = new class extends mock<IChat>() {
				override readonly resource = URI.parse('test-chat:///peer-draft');
				override readonly title = constObservable('Peer chat');
				override readonly updatedAt = constObservable(new Date());
				override readonly status = constObservable(SessionStatus.Completed);
				override readonly interactivity = constObservable(ChatInteractivity.Full);
				override readonly capabilities = constObservable({ canRename: true, canDelete: true });
			}();
			const chats = observableValue<readonly IChat[]>('renameDraftChats', [mainChat, peerChat]);
			const chatSession: ISession = { ...baseSession, chats, mainChat: constObservable(mainChat) };
			const chatHarness = createListHarness(disposables, [chatSession]);
			const chatContainer = chatHarness.createContainer();
			const chatList = chatHarness.store.add(chatHarness.instantiationService.createInstance(SessionsList, chatContainer, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
				onChatOpen: () => { },
			}));
			chatList.layout(300, 400);
			const chatTitle = chatContainer.querySelector<HTMLElement>('.session-chat-title');
			assert.ok(chatTitle);
			dispatchDoubleClick(chatTitle);
			const chatInput = chatContainer.querySelector<HTMLInputElement>('.session-chat-title-input input');
			assert.ok(chatInput);
			chatInput.value = 'Chat draft';
			chatInput.dispatchEvent(new Event('input', { bubbles: true }));
			chatList.refresh();
			chatList.layout(300, 400);
			const rerenderedChatInput = chatContainer.querySelector<HTMLInputElement>('.session-chat-title-input input');

			chats.set([mainChat], undefined);
			chatList.refresh();
			chats.set([mainChat, peerChat], undefined);
			chatList.refresh();

			assert.deepStrictEqual({
				sessionDraft: rerenderedSessionInput?.value,
				sessionInputRecreated: rerenderedSessionInput !== sessionInput,
				sessionRenameClearedAfterRemoval: sessionContainer.querySelector('.session-title-input input') === null,
				chatDraft: rerenderedChatInput?.value,
				chatInputRecreated: rerenderedChatInput !== chatInput,
				chatRenameClearedAfterRemoval: chatContainer.querySelector('.session-chat-title-input input') === null,
			}, {
				sessionDraft: 'Session draft',
				sessionInputRecreated: true,
				sessionRenameClearedAfterRemoval: true,
				chatDraft: 'Chat draft',
				chatInputRecreated: true,
				chatRenameClearedAfterRemoval: true,
			});
		});

		test('chat title double-click renames inline with aligned input text', () => {
			const baseSession = createTestSession('Session').session;
			const mainChat = baseSession.mainChat.get();
			const peerChat = new class extends mock<IChat>() {
				override readonly resource = URI.parse('test-chat:///peer');
				override readonly title = constObservable('Peer chat');
				override readonly updatedAt = constObservable(new Date());
				override readonly status = constObservable(SessionStatus.Completed);
				override readonly interactivity = constObservable(ChatInteractivity.Full);
				override readonly capabilities = constObservable({ canRename: true, canDelete: true });
			}();
			const session: ISession = {
				...baseSession,
				chats: constObservable([mainChat, peerChat]),
				mainChat: constObservable(mainChat),
			};
			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
				onChatOpen: () => { },
			}));
			list.layout(300, 400);
			const titleContainer = container.querySelector<HTMLElement>('.session-chat-title');
			assert.ok(titleContainer);

			dispatchDoubleClick(titleContainer);
			const input = container.querySelector<HTMLInputElement>('.session-chat-title-input input');
			assert.ok(input);
			const inputBox = input.closest<HTMLElement>('.monaco-inputbox');
			assert.ok(inputBox);
			const inputStyle = mainWindow.getComputedStyle(input);
			const inputBoxStyle = mainWindow.getComputedStyle(inputBox);
			const inputGeometry = {
				paddingLeft: inputStyle.paddingLeft,
				inputHeight: inputStyle.height,
				inputBoxHeight: inputBoxStyle.height,
			};
			input.value = ' Renamed peer ';
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));

			assert.deepStrictEqual({
				inputGeometry,
				renamedChats: harness.managementService.renamedChats,
				inputClosed: container.querySelector('.session-chat-title-input input') === null,
			}, {
				inputGeometry: {
					paddingLeft: '0px',
					inputHeight: '20px',
					inputBoxHeight: '22px',
				},
				renamedChats: [{ session, chatResource: peerChat.resource, title: 'Renamed peer' }],
				inputClosed: true,
			});
		});

		test('flat session lists do not request rename', () => {
			const { session } = createTestSession('Flat');
			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsFlatList, container, {
				showSessionHover: false,
				onSessionOpen: () => { },
			}));
			list.setSessions([session]);
			list.layout(100, 400);
			const title = container.querySelector<HTMLElement>('.session-item .monaco-highlighted-label');
			assert.ok(title);

			dispatchDoubleClick(title);

			assert.strictEqual(container.querySelector('.session-title-input input'), null);
		});

		test('reports the focused session only while the Sessions list owns focus', () => {
			const { session } = createTestSession('Focused');
			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			list.reveal(session.resource);

			const beforeFocus = list.getFocusedSessions();
			list.focus();
			const whileFocused = list.getFocusedSessions()?.map(session => session.sessionId);
			const outside = mainWindow.document.createElement('button');
			mainWindow.document.body.appendChild(outside);
			harness.store.add({ dispose: () => outside.remove() });
			outside.focus();

			assert.deepStrictEqual({
				beforeFocus,
				whileFocused,
				afterBlur: list.getFocusedSessions(),
			}, {
				beforeFocus: undefined,
				whileFocused: [session.sessionId],
				afterBlur: undefined,
			});
		});
	});

	suite('action', () => {
		function createActionHarness(title = 'Existing', supportsRename = true) {
			const instantiationService = disposables.add(new TestInstantiationService());
			const quickInputService = new TestQuickInputService();
			const managementService = new TestSessionsManagementService([]);
			const sessionData = createTestSession(title);
			sessionData.capabilities.set({ supportsMultipleChats: false, supportsRename }, undefined);
			instantiationService.stub(IQuickInputService, quickInputService);
			instantiationService.stub(ISessionsManagementService, managementService);
			const handler = CommandsRegistry.getCommand(RENAME_SESSION_COMMAND_ID)?.handler;
			assert.ok(handler);
			return { handler, instantiationService, quickInputService, managementService, session: sessionData.session };
		}

		test('direct invocation is capability-gated', async () => {
			const harness = createActionHarness('Existing', false);

			await harness.handler(harness.instantiationService, harness.session);

			assert.deepStrictEqual({ inputCalls: harness.quickInputService.calls, renamed: harness.managementService.renamed }, { inputCalls: 0, renamed: [] });
		});

		test('validates input and ignores cancellation, whitespace, and unchanged titles', async () => {
			const cancelled = createActionHarness();
			cancelled.quickInputService.result = undefined;
			await cancelled.handler(cancelled.instantiationService, cancelled.session);

			const whitespace = createActionHarness();
			whitespace.quickInputService.result = '   ';
			await whitespace.handler(whitespace.instantiationService, whitespace.session);
			const validationMessage = await whitespace.quickInputService.options?.validateInput?.('   ');

			const unchanged = createActionHarness();
			unchanged.quickInputService.result = ' Existing ';
			await unchanged.handler(unchanged.instantiationService, unchanged.session);

			assert.deepStrictEqual({
				cancelled: cancelled.managementService.renamed,
				whitespace: whitespace.managementService.renamed,
				validationMessage,
				unchanged: unchanged.managementService.renamed,
			}, {
				cancelled: [],
				whitespace: [],
				validationMessage: 'Title cannot be empty',
				unchanged: [],
			});
		});

		test('trims changed titles and propagates provider errors', async () => {
			const success = createActionHarness();
			success.quickInputService.result = ' New title ';
			await success.handler(success.instantiationService, success.session);

			const failure = createActionHarness();
			failure.quickInputService.result = 'Fails';
			failure.managementService.renameError = new Error('rename failed');

			await assert.rejects(async () => {
				await failure.handler(failure.instantiationService, failure.session);
			}, failure.managementService.renameError);
			assert.deepStrictEqual({
				success: success.managementService.renamed,
				failure: failure.managementService.renamed,
			}, {
				success: [{ session: success.session, title: 'New title' }],
				failure: [{ session: failure.session, title: 'Fails' }],
			});
		});
	});

	suite('chat action', () => {
		function createChatHarness(options: { readonly status?: SessionStatus; readonly canRename?: boolean } = {}) {
			const instantiationService = disposables.add(new TestInstantiationService());
			const quickInputService = new TestQuickInputService();
			const managementService = new TestSessionsManagementService([]);
			const baseSession = createTestSession('Explore Jitter Issue').session;
			const mainChat = baseSession.mainChat.get();
			const peerChat = new class extends mock<IChat>() {
				override readonly resource = URI.parse('test-chat:///grill-and-plan');
				override readonly title = constObservable('Grill and Plan');
				override readonly status = constObservable(options.status ?? SessionStatus.Completed);
				override readonly interactivity = constObservable(ChatInteractivity.Full);
				override readonly capabilities = constObservable({ canRename: options.canRename ?? true, canDelete: true });
			}();
			const otherPeerChat = new class extends mock<IChat>() {
				override readonly resource = URI.parse('test-chat:///other-peer');
				override readonly title = constObservable('Other Peer');
				override readonly status = constObservable(SessionStatus.Completed);
				override readonly interactivity = constObservable(ChatInteractivity.Full);
				override readonly capabilities = constObservable({ canRename: true, canDelete: true });
			}();
			const chats = observableValue<readonly IChat[]>('renameChats', [mainChat, peerChat, otherPeerChat]);
			const session: ISession = {
				...baseSession,
				chats,
				mainChat: constObservable(mainChat),
			};
			const activeChat = observableValue<IChat>('renameActiveChat', peerChat);
			const focusedChat = observableValue<IChat | undefined>('renameFocusedChat', peerChat);
			const activeSession = upcastPartial<IActiveSession>({
				...session,
				activeChat,
			});
			instantiationService.stub(IQuickInputService, quickInputService);
			instantiationService.stub(ISessionsManagementService, managementService);
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly activeSession = constObservable<IActiveSession | undefined>(activeSession);
			}());
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() {
				override getFocusedSessionView(): SessionView {
					return upcastPartial<SessionView>({ getSession: () => activeSession, getFocusedChat: () => focusedChat.get() });
				}
			}());
			instantiationService.stub(IViewsService, new class extends mock<IViewsService>() {
				override getViewWithId() { return null; }
			}());
			instantiationService.stub(IUriIdentityService, new class extends mock<IUriIdentityService>() {
				override readonly extUri = extUri;
			}());
			const handler = CommandsRegistry.getCommand(RENAME_CHAT_COMMAND_ID)?.handler;
			assert.ok(handler);
			return { handler, instantiationService, quickInputService, managementService, session, activeSession, mainChat, peerChat, otherPeerChat, activeChat, focusedChat, chats };
		}

		test('renames the exact peer chat with the peer title as the prompt value', async () => {
			const harness = createChatHarness();
			harness.quickInputService.result = ' Renamed Peer ';

			await harness.handler(harness.instantiationService, { session: harness.session, chat: harness.peerChat });

			assert.deepStrictEqual({
				inputValue: harness.quickInputService.options?.value,
				inputPrompt: harness.quickInputService.options?.prompt,
				renamedSessions: harness.managementService.renamed,
				renamedChats: harness.managementService.renamedChats,
			}, {
				inputValue: 'Grill and Plan',
				inputPrompt: 'New chat title',
				renamedSessions: [],
				renamedChats: [{ session: harness.session, chatResource: harness.peerChat.resource, title: 'Renamed Peer' }],
			});
		});

		test('rejects main, unsupported, untitled, cancelled, blank, and unchanged chat renames', async () => {
			const main = createChatHarness();
			await main.handler(main.instantiationService, { session: main.session, chat: main.mainChat });

			const unsupported = createChatHarness({ canRename: false });
			await unsupported.handler(unsupported.instantiationService, { session: unsupported.session, chat: unsupported.peerChat });

			const untitled = createChatHarness({ status: SessionStatus.Untitled });
			await untitled.handler(untitled.instantiationService, { session: untitled.session, chat: untitled.peerChat });

			const cancelled = createChatHarness();
			cancelled.quickInputService.result = undefined;
			await cancelled.handler(cancelled.instantiationService, { session: cancelled.session, chat: cancelled.peerChat });

			const blank = createChatHarness();
			blank.quickInputService.result = '   ';
			await blank.handler(blank.instantiationService, { session: blank.session, chat: blank.peerChat });

			const unchanged = createChatHarness();
			unchanged.quickInputService.result = ' Grill and Plan ';
			await unchanged.handler(unchanged.instantiationService, { session: unchanged.session, chat: unchanged.peerChat });

			assert.deepStrictEqual({
				inputCalls: {
					main: main.quickInputService.calls,
					unsupported: unsupported.quickInputService.calls,
					untitled: untitled.quickInputService.calls,
					cancelled: cancelled.quickInputService.calls,
					blank: blank.quickInputService.calls,
					unchanged: unchanged.quickInputService.calls,
				},
				renamedChatCounts: [
					main,
					unsupported,
					untitled,
					cancelled,
					blank,
					unchanged,
				].map(harness => harness.managementService.renamedChats.length),
			}, {
				inputCalls: {
					main: 0,
					unsupported: 0,
					untitled: 0,
					cancelled: 1,
					blank: 1,
					unchanged: 1,
				},
				renamedChatCounts: [0, 0, 0, 0, 0, 0],
			});
		});

		test('captures the peer target and fails closed if it disappears while Quick Input is open', async () => {
			const harness = createChatHarness();
			const input = new DeferredPromise<string | undefined>();
			harness.quickInputService.inputHandler = async () => input.p;

			const rename = harness.handler(harness.instantiationService, { session: harness.session, chat: harness.peerChat });
			harness.chats.set([harness.mainChat], undefined);
			input.complete('Renamed Peer');
			await rename;

			assert.deepStrictEqual(harness.managementService.renamedChats, []);
		});

		test('uses and captures the focused group chat while the session active chat is stale', async () => {
			const harness = createChatHarness();
			const input = new DeferredPromise<string | undefined>();
			harness.quickInputService.inputHandler = async () => input.p;
			harness.activeChat.set(harness.mainChat, undefined);

			const rename = harness.handler(harness.instantiationService);
			harness.focusedChat.set(harness.otherPeerChat, undefined);
			input.complete('Renamed Peer');
			await rename;

			assert.deepStrictEqual(harness.managementService.renamedChats, [{
				session: harness.activeSession,
				chatResource: harness.peerChat.resource,
				title: 'Renamed Peer',
			}]);
		});

		test('propagates provider errors', async () => {
			const harness = createChatHarness();
			harness.quickInputService.result = 'Renamed Peer';
			harness.managementService.renameChatError = new Error('rename chat failed');

			await assert.rejects(
				async () => {
					await harness.handler(harness.instantiationService, { session: harness.session, chat: harness.peerChat });
				},
				harness.managementService.renameChatError,
			);
		});
	});

	suite('session header action', () => {
		function createHeaderHarness(inlineRename: boolean | undefined) {
			const instantiationService = disposables.add(new TestInstantiationService());
			const commandService = new TestCommandService();
			const sessionData = createTestSession('Existing');
			let inlineRenameCalls = 0;
			instantiationService.stub(ICommandService, commandService);
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() {
				override getSessionView() {
					if (inlineRename === undefined) {
						return undefined;
					}
					return new class extends mock<SessionView>() {
						override startTitleEditing(): boolean {
							inlineRenameCalls++;
							return inlineRename;
						}
					};
				}
			});
			const handler = CommandsRegistry.getCommand('sessions.sessionHeader.rename')?.handler;
			assert.ok(handler);
			return { handler, instantiationService, commandService, session: sessionData.session, inlineRenameCalls: () => inlineRenameCalls };
		}

		test('renames inline in the header and only prompts when that is not possible', async () => {
			const inline = createHeaderHarness(true);
			await inline.handler(inline.instantiationService, inline.session);

			// The header cannot show the title (e.g. the chat tabs row replaced it).
			const headerUnavailable = createHeaderHarness(false);
			await headerUnavailable.handler(headerUnavailable.instantiationService, headerUnavailable.session);

			// The session is not shown in the sessions part at all.
			const noView = createHeaderHarness(undefined);
			await noView.handler(noView.instantiationService, noView.session);

			const withoutSession = createHeaderHarness(true);
			await withoutSession.handler(withoutSession.instantiationService, undefined);

			assert.deepStrictEqual({
				inline: { calls: inline.inlineRenameCalls(), prompts: inline.commandService.calls },
				headerUnavailable: { calls: headerUnavailable.inlineRenameCalls(), prompts: headerUnavailable.commandService.calls },
				noView: { calls: noView.inlineRenameCalls(), prompts: noView.commandService.calls },
				withoutSession: { calls: withoutSession.inlineRenameCalls(), prompts: withoutSession.commandService.calls },
			}, {
				inline: { calls: 1, prompts: [] },
				headerUnavailable: { calls: 1, prompts: [{ commandId: RENAME_SESSION_COMMAND_ID, args: [headerUnavailable.session] }] },
				noView: { calls: 0, prompts: [{ commandId: RENAME_SESSION_COMMAND_ID, args: [noView.session] }] },
				withoutSession: { calls: 0, prompts: [] },
			});
		});
	});

	suite('accessibility help', () => {
		function createHelpProvider(origin: HTMLElement, removeOrigin = false, phoneLayout = false) {
			const instantiationService = disposables.add(new TestInstantiationService());
			let fallbackFocusCount = 0;
			const fallbackView = new class extends mock<SessionView>() {
				override focus(): void { fallbackFocusCount++; }
			};
			const activeSession = new class extends mock<IActiveSession>() {
				override readonly sessionId = 'active';
			};
			instantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() {
				override getSessionView() { return fallbackView; }
			});
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly activeSession = constObservable<IActiveSession | undefined>(activeSession);
			});
			const configurationService = new TestConfigurationService();
			instantiationService.stub(IConfigurationService, configurationService);
			instantiationService.stub(IContextKeyService, disposables.add(new ContextKeyService(configurationService)));
			const mainContainer = mainWindow.document.createElement('div');
			mainContainer.classList.toggle('phone-layout', phoneLayout);
			instantiationService.stub(IWorkbenchLayoutService, { mainContainer });

			mainWindow.document.body.appendChild(origin);
			disposables.add({ dispose: () => origin.remove() });
			origin.focus();
			const provider = disposables.add(new SessionsChatAccessibilityHelp().getProvider(instantiationService));
			if (removeOrigin) {
				origin.remove();
			}
			return { provider, fallbackFocusCount: () => fallbackFocusCount };
		}

		test('documents session management shortcuts and restores originating focus', () => {
			const origin = mainWindow.document.createElement('button');
			const { provider, fallbackFocusCount } = createHelpProvider(origin);

			const content = provider.provideContent();
			provider.onClose();

			assert.deepStrictEqual({
				hasDoubleClick: content.includes('double-click its title'),
				hasContextMenu: content.includes('open its context menu'),
				hasMainChatFocus: content.includes('main chat transcript or input'),
				hasPeerChatFocus: content.includes('non-main chat') && content.includes('nested row'),
				scopesChatRenameToAvailability: content.includes('When Rename is available for a non-main chat'),
				hasInlineChatRenameInstructions: content.includes('focus its nested row') && content.includes('double-click its title to rename it inline'),
				hasSessionRenameKeybinding: content.includes(`<keybinding:${RENAME_SESSION_COMMAND_ID}>`),
				hasInlineRenameInstructions: content.includes('press Enter to confirm or Escape to cancel'),
				hasChatRenameKeybinding: content.includes(`<keybinding:${RENAME_CHAT_COMMAND_ID}>`),
				hasArchiveKeybinding: content.includes(`<keybinding:${ARCHIVE_SESSION_COMMAND_ID}>`),
				hasPermanentDelete: content.includes('open its context menu and choose Delete'),
				hasDevContainerAvailability: content.includes('Docker is available on the host') && content.includes('a local, SSH, Tunnel, or WSL folder contains a Dev Container configuration'),
				hasRemoteDevContainerPrerequisite: content.includes('first connect to a host that supports Dev Container sessions'),
				hasWslDevContainerPrerequisite: content.includes('Docker must be available in the WSL distribution'),
				hasDevContainerModeSwitch: content.includes('Choose Use Local or Use Remote Host to switch back'),
				hasDevContainerExecution: content.includes('Dev Container Agent Host sessions are enabled'),
				hasNoBackgroundOption: content.includes('choose no background'),
				hasPetAchievements: content.includes('View Achievements'),
				hasSidebarCustomizations: content.includes('Chat Customizations section at the bottom of the left sidebar'),
				activeElement: mainWindow.document.activeElement,
				fallbackFocusCount: fallbackFocusCount(),
			}, {
				hasDoubleClick: true,
				hasContextMenu: true,
				hasMainChatFocus: true,
				hasPeerChatFocus: true,
				scopesChatRenameToAvailability: true,
				hasInlineChatRenameInstructions: true,
				hasSessionRenameKeybinding: true,
				hasInlineRenameInstructions: true,
				hasChatRenameKeybinding: true,
				hasArchiveKeybinding: true,
				hasPermanentDelete: true,
				hasDevContainerAvailability: true,
				hasRemoteDevContainerPrerequisite: true,
				hasWslDevContainerPrerequisite: true,
				hasDevContainerModeSwitch: true,
				hasDevContainerExecution: true,
				hasNoBackgroundOption: true,
				hasPetAchievements: true,
				hasSidebarCustomizations: true,
				activeElement: origin,
				fallbackFocusCount: 0,
			});
		});

		test('omits the desktop customization focus command on phones', () => {
			const origin = mainWindow.document.createElement('button');
			const { provider } = createHelpProvider(origin, false, true);
			assert.strictEqual(provider.provideContent().includes('Chat Customizations section at the bottom of the left sidebar'), false);
		});

		test('falls back to the active session when the originating element is gone', () => {
			const origin = mainWindow.document.createElement('button');
			const { provider, fallbackFocusCount } = createHelpProvider(origin, true);

			provider.onClose();

			assert.strictEqual(fallbackFocusCount(), 1);
		});
	});
});
