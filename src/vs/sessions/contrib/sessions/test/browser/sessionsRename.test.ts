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
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IInputOptions, IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
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
		test('title double-click opens once and requests rename once', () => {
			const { session } = createTestSession('First');
			const harness = createListHarness(disposables, [session]);
			const openCalls: URI[] = [];
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: resource => openCalls.push(resource),
			}));
			list.layout(300, 400);
			const title = container.querySelector<HTMLElement>('.session-item .monaco-highlighted-label');
			assert.ok(title);

			let bubbled = 0;
			container.addEventListener('dblclick', () => bubbled++);
			const doubleClick = dispatchDoubleClick(title);

			assert.deepStrictEqual({
				openCalls: openCalls.map(resource => resource.toString()),
				renameCalls: harness.commandService.calls.filter(call => call.commandId === RENAME_SESSION_COMMAND_ID),
				defaultPrevented: doubleClick.defaultPrevented,
				bubbled,
			}, {
				openCalls: [session.resource.toString()],
				renameCalls: [{ commandId: RENAME_SESSION_COMMAND_ID, args: [session] }],
				defaultPrevented: true,
				bubbled: 0,
			});
		});

		test('rename is title-only, unmodified, capability-gated, and rebound safely', () => {
			const first = createTestSession('First', { resourceId: 'shared' });
			const harness = createListHarness(disposables, [first.session]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);

			for (const selector of ['.session-icon', '.session-title', '.session-details-row', '.session-title-toolbar']) {
				const target = container.querySelector<HTMLElement>(`.session-item ${selector}`);
				assert.ok(target);
				dispatchDoubleClick(target);
			}
			const title = container.querySelector<HTMLElement>('.session-item .monaco-highlighted-label');
			assert.ok(title);
			dispatchDoubleClick(title, { altKey: true });
			assert.strictEqual(harness.commandService.calls.filter(call => call.commandId === RENAME_SESSION_COMMAND_ID).length, 0);

			first.capabilities.set({ supportsMultipleChats: false, supportsRename: false }, undefined);
			const unsupported = dispatchDoubleClick(title);
			assert.strictEqual(unsupported.defaultPrevented, false);
			assert.strictEqual(harness.commandService.calls.filter(call => call.commandId === RENAME_SESSION_COMMAND_ID).length, 0);

			const replacement = createTestSession('Replacement', { resourceId: 'shared' });
			harness.managementService.sessions = [replacement.session];
			list.refresh();
			list.layout(300, 400);
			const replacementTitle = container.querySelector<HTMLElement>('.session-item .monaco-highlighted-label');
			assert.ok(replacementTitle);
			assert.strictEqual(replacementTitle.textContent, 'Replacement');
			dispatchDoubleClick(replacementTitle);

			assert.deepStrictEqual(
				harness.commandService.calls.filter(call => call.commandId === RENAME_SESSION_COMMAND_ID),
				[{ commandId: RENAME_SESSION_COMMAND_ID, args: [replacement.session] }],
			);
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

			assert.strictEqual(harness.commandService.calls.filter(call => call.commandId === RENAME_SESSION_COMMAND_ID).length, 0);
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
			const activeSession = upcastPartial<IActiveSession>({
				...session,
				activeChat,
			});
			instantiationService.stub(IQuickInputService, quickInputService);
			instantiationService.stub(ISessionsManagementService, managementService);
			instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly activeSession = constObservable<IActiveSession | undefined>(activeSession);
			}());
			instantiationService.stub(IViewsService, new class extends mock<IViewsService>() {
				override getViewWithId() { return null; }
			}());
			instantiationService.stub(IUriIdentityService, new class extends mock<IUriIdentityService>() {
				override readonly extUri = extUri;
			}());
			const handler = CommandsRegistry.getCommand(RENAME_CHAT_COMMAND_ID)?.handler;
			assert.ok(handler);
			return { handler, instantiationService, quickInputService, managementService, session, activeSession, mainChat, peerChat, otherPeerChat, activeChat, chats };
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

		test('keeps the captured peer when the active chat changes while Quick Input is open', async () => {
			const harness = createChatHarness();
			const input = new DeferredPromise<string | undefined>();
			harness.quickInputService.inputHandler = async () => input.p;

			const rename = harness.handler(harness.instantiationService);
			harness.activeChat.set(harness.otherPeerChat, undefined);
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
		function createHelpProvider(origin: HTMLElement, removeOrigin = false) {
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
				hasSessionRenameKeybinding: content.includes(`<keybinding:${RENAME_SESSION_COMMAND_ID}>`),
				hasChatRenameKeybinding: content.includes(`<keybinding:${RENAME_CHAT_COMMAND_ID}>`),
				hasArchiveKeybinding: content.includes(`<keybinding:${ARCHIVE_SESSION_COMMAND_ID}>`),
				hasPermanentDelete: content.includes('open its context menu and choose Delete'),
				hasDevContainerAvailability: content.includes('Docker is available') && content.includes('selected local folder contains a Dev Container configuration'),
				hasDevContainerExecution: content.includes('run the session on an Agent Host inside that folder\'s Dev Container'),
				hasNoBackgroundOption: content.includes('choose no background'),
				hasPetAchievements: content.includes('View Achievements'),
				activeElement: mainWindow.document.activeElement,
				fallbackFocusCount: fallbackFocusCount(),
			}, {
				hasDoubleClick: true,
				hasContextMenu: true,
				hasMainChatFocus: true,
				hasPeerChatFocus: true,
				hasSessionRenameKeybinding: true,
				hasChatRenameKeybinding: true,
				hasArchiveKeybinding: true,
				hasPermanentDelete: true,
				hasDevContainerAvailability: true,
				hasDevContainerExecution: true,
				hasNoBackgroundOption: true,
				hasPetAchievements: true,
				activeElement: origin,
				fallbackFocusCount: 0,
			});
		});

		test('falls back to the active session when the originating element is gone', () => {
			const origin = mainWindow.document.createElement('button');
			const { provider, fallbackFocusCount } = createHelpProvider(origin, true);

			provider.onClose();

			assert.strictEqual(fallbackFocusCount(), 1);
		});
	});
});
