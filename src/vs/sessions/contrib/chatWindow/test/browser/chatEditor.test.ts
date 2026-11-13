/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { autorun, constObservable, IObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IViewEditorRegistry, ViewEditorExtensions } from '../../../../../workbench/browser/parts/editor/viewEditorRegistry.js';
import { ChatWindowLayoutMode } from '../../../../../workbench/contrib/chatWindow/common/chatWindowLayout.js';
import { $ } from '../../../../../base/browser/dom.js';
import { setARIAContainer } from '../../../../../base/browser/ui/aria/aria.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { INewSessionDraftHost } from '../../../../../workbench/contrib/sessions/browser/parts/chatView.js';
import { ISessionPaneContent } from '../../../../../workbench/services/sessions/common/sessionPane.js';
import { Event } from '../../../../../base/common/event.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { ChatAgentLocation } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatModelStore, IStartSessionProps } from '../../../../../workbench/contrib/chat/common/model/chatModelStore.js';
import { IChatAgentService } from '../../../../../workbench/contrib/chat/common/participants/chatAgents.js';
import { CHAT_MODEL_HOLD_TIMEOUT } from '../../../../../workbench/contrib/sessions/browser/chatEditor/sessionChatOpening.js';
import { IChatModelReference, IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatWindow, IChatWindowOpenOptions, IChatWindowService } from '../../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { IContentPart, IEditorGroup } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { testPaneContentOf } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
import { createSessionViewTestServices, createTestActiveSession } from '../../../../test/browser/sessionViewTestUtils.js';
import { isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CLOSE_SESSION_COMMAND_ID } from '../../../../../workbench/contrib/sessions/common/sessionCommands.js';
// The session header's actions, which the tab bar shows for a chat while its header hides
import '../../../sessions/browser/sessionsActions.js';
import { Menus } from '../../../../../workbench/contrib/sessions/browser/menus.js';
import { MultipleSessionsVisibleContext, SessionInChatEditorContext } from '../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { fillSessionChatDragData } from '../../../../../workbench/contrib/sessions/browser/dnd.js';
import { Verbosity } from '../../../../../workbench/common/editor.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IChat, ISession, ISessionPreparationProgress, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { ISessionsListModelService } from '../../../../../workbench/contrib/sessions/browser/sessionsListModelService.js';
import { ChatEditorInput, getChatEditorInputDetails, ChatEditorView, IInputOnlySessionView, ISessionChatViewHost, SESSION_CHAT_VIEW_HOST_OPTIONS, SESSION_CHAT_VIEW_MINIMUM_HEIGHT, SESSION_CHAT_VIEW_TYPE, SessionChatViewInputOnly, registerSessionChatViewEditor } from '../../../../../workbench/contrib/sessions/browser/chatEditor/chatEditor.js';
import { IChatEditorComposer } from '../../../../../workbench/contrib/sessions/browser/chatEditor/chatEditorContent.js';
import { ChatWindowSessionDropTarget } from '../../browser/chatWindowSessionDropTarget.js';

suite('Session chat view editor', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/** The services of a chat editor's view, with a chat service that has no chat model loaded. */
	function createServices() {
		const services = createSessionViewTestServices(disposables);
		services.instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override acquireExistingSession() { return undefined; }
		}());
		return services;
	}

	const INPUT_HEIGHT = 100;
	/** The top of the chat view while it shows only its input: below the bar of its group, the session header hidden then. */
	const CHAT_VIEW_TOP = 30;

	/** A chat view that shows only its input when asked to, unless it cannot, and shows the conversation when it needs it. */
	class TestChatView {
		readonly inputOnly = observableValue('inputOnly', false);
		readonly canShowInputOnly = observableValue('canShowInputOnly', true);
		readonly inputOnlyHeight = observableValue('inputOnlyHeight', INPUT_HEIGHT);
		enableInputOnly(options: { readonly inputOnly?: boolean }): void { this.setInputOnly(!!options.inputOnly); }
		disableInputOnly(): void { this.inputOnly.set(false, undefined); }
		setInputOnly(inputOnly: boolean): void {
			if (!inputOnly || this.canShowInputOnly.get()) {
				this.inputOnly.set(inputOnly, undefined);
			}
		}
		/** Its input cannot show what it needs, such as a confirmation: it shows the conversation. */
		needConversation(): void {
			this.canShowInputOnly.set(false, undefined);
			this.inputOnly.set(false, undefined);
		}
	}

	function createInputOnly(options: { readonly inputOnly: boolean; readonly mode: ChatWindowLayoutMode }) {
		const chatView = new TestChatView();
		const sessionView: IInputOnlySessionView = {
			primaryChatView: constObservable(chatView) as IInputOnlySessionView['primaryChatView'],
			inputOnlyChatViewTop: constObservable(CHAT_VIEW_TOP),
		};
		const layoutMode = observableValue<ChatWindowLayoutMode>('layoutMode', options.mode);
		const inputOnly = observableValue('inputOnly', options.inputOnly);
		const resizing = observableValue('resizing', false);
		const window = {
			layoutMode: layoutMode as IObservable<ChatWindowLayoutMode>,
			inputOnly: inputOnly as IObservable<boolean>,
			resizing: resizing as IObservable<boolean>,
			toggleConversation: () => {
				if (layoutMode.get() === ChatWindowLayoutMode.Stacked) {
					inputOnly.set(!inputOnly.get(), undefined);
				}
			},
		};
		const controller = disposables.add(new SessionChatViewInputOnly(sessionView, constObservable(window)));
		const read = () => ({ shown: chatView.inputOnly.get(), chosen: inputOnly.get(), maximumHeight: controller.maximumHeight.get(), minimumHeight: controller.minimumHeight.get() });
		return { chatView, layoutMode, window, read, resizing, controller };
	}

	test('registers the chat of a session as a view editor, which shows its session as the chat windows did: its header, its Session Activity Bar and its pills', () => {
		disposables.add(registerSessionChatViewEditor());
		const descriptor = Registry.as<IViewEditorRegistry>(ViewEditorExtensions.ViewEditors).get(SESSION_CHAT_VIEW_TYPE);
		assert.deepStrictEqual({ registered: !!descriptor, name: descriptor?.name, options: SESSION_CHAT_VIEW_HOST_OPTIONS }, {
			registered: true,
			name: 'Chat',
			options: { showHeader: true, showActivityBar: true, input: { showPills: true } },
		});
	});

	test('in Stacked, the chat shows only its input as its window chose, and is as tall as its input then, but a pixel for its sash to drag; elsewhere it shows its conversation, unbounded', () => {
		const { layoutMode, read, window } = createInputOnly({ inputOnly: true, mode: ChatWindowLayoutMode.Stacked });
		const stacked = read();
		window.toggleConversation();
		const conversation = read();
		window.toggleConversation();
		layoutMode.set(ChatWindowLayoutMode.SideBySide, undefined);
		const sideBySide = read();

		const collapsed = CHAT_VIEW_TOP + INPUT_HEIGHT;
		assert.deepStrictEqual({ stacked, conversation, sideBySide }, {
			stacked: { shown: true, chosen: true, maximumHeight: collapsed + 1, minimumHeight: collapsed },
			conversation: { shown: false, chosen: false, maximumHeight: Number.POSITIVE_INFINITY, minimumHeight: SESSION_CHAT_VIEW_MINIMUM_HEIGHT },
			sideBySide: { shown: false, chosen: true, maximumHeight: Number.POSITIVE_INFINITY, minimumHeight: SESSION_CHAT_VIEW_MINIMUM_HEIGHT },
		});
	});

	test('the chat follows what the chat view shows, also when it shows the conversation on its own, without changing what the user chose', () => {
		const { chatView, read } = createInputOnly({ inputOnly: true, mode: ChatWindowLayoutMode.Stacked });
		const inputOnly = read();
		chatView.needConversation();

		assert.deepStrictEqual({ inputOnly, conversation: read() }, {
			inputOnly: { shown: true, chosen: true, maximumHeight: CHAT_VIEW_TOP + INPUT_HEIGHT + 1, minimumHeight: CHAT_VIEW_TOP + INPUT_HEIGHT },
			conversation: { shown: false, chosen: true, maximumHeight: Number.POSITIVE_INFINITY, minimumHeight: SESSION_CHAT_VIEW_MINIMUM_HEIGHT },
		});
	});

	test('dragged by the sash beside it, the chat showing only its input grows and shows its conversation once past its input, and only its input again once dragged back down to it (a snap); let go there, it is as tall as its input', async () => {
		const { controller, read, resizing } = createInputOnly({ inputOnly: true, mode: ChatWindowLayoutMode.Stacked });
		const collapsed = CHAT_VIEW_TOP + INPUT_HEIGHT;
		const dragTo = async (height: number) => {
			controller.layout(height);
			await timeout(0);
			return read();
		};
		resizing.set(true, undefined);
		const pressed = read();
		const slightlyUp = await dragTo(collapsed + 5);
		const pastTheInput = await dragTo(collapsed + 60);
		const backDown = await dragTo(collapsed + 2);
		resizing.set(false, undefined);

		assert.deepStrictEqual({ pressed, slightlyUp, pastTheInput, backDown, letGo: read() }, {
			pressed: { shown: true, chosen: true, maximumHeight: Number.POSITIVE_INFINITY, minimumHeight: collapsed },
			slightlyUp: { shown: true, chosen: true, maximumHeight: Number.POSITIVE_INFINITY, minimumHeight: collapsed },
			pastTheInput: { shown: false, chosen: false, maximumHeight: Number.POSITIVE_INFINITY, minimumHeight: Math.min(collapsed, SESSION_CHAT_VIEW_MINIMUM_HEIGHT) },
			backDown: { shown: true, chosen: true, maximumHeight: Number.POSITIVE_INFINITY, minimumHeight: collapsed },
			letGo: { shown: true, chosen: true, maximumHeight: collapsed + 1, minimumHeight: collapsed },
		});
	});

	test('let go past its input, the chat shows its conversation at the height it was dragged to; laid out while not dragged, it does not change what it shows', async () => {
		const { controller, read, resizing } = createInputOnly({ inputOnly: true, mode: ChatWindowLayoutMode.Stacked });
		const collapsed = CHAT_VIEW_TOP + INPUT_HEIGHT;
		controller.layout(collapsed + 200);
		await timeout(0);
		const notDragged = read().chosen;
		resizing.set(true, undefined);
		controller.layout(collapsed + 200);
		await timeout(0);
		resizing.set(false, undefined);

		assert.deepStrictEqual({ notDragged, letGo: read() }, {
			notDragged: true,
			letGo: { shown: false, chosen: false, maximumHeight: Number.POSITIVE_INFINITY, minimumHeight: Math.min(collapsed, SESSION_CHAT_VIEW_MINIMUM_HEIGHT) },
		});
	});

	test('what a drag of the sash showed is announced once, as it lets go: the conversation shown or hidden, and nothing for a drag that changed nothing', async () => {
		const { controller, resizing } = createInputOnly({ inputOnly: true, mode: ChatWindowLayoutMode.Stacked });
		const ariaContainer = $('.aria-container');
		setARIAContainer(ariaContainer);
		const collapsed = CHAT_VIEW_TOP + INPUT_HEIGHT;
		const announced = () => ariaContainer.textContent ?? '';
		const drag = async (...heights: number[]) => {
			ariaContainer.querySelectorAll('[aria-live]').forEach(element => element.textContent = '');
			resizing.set(true, undefined);
			for (const height of heights) {
				controller.layout(height);
				await timeout(0);
			}
			const whileDragging = announced();
			resizing.set(false, undefined);
			return { whileDragging, letGo: announced() };
		};

		assert.deepStrictEqual({
			up: await drag(collapsed + 60),
			upAndDownAndUp: await drag(collapsed + 60, collapsed + 2, collapsed + 80),
			down: await drag(collapsed + 2),
			nothing: await drag(collapsed + 3),
		}, {
			up: { whileDragging: '', letGo: 'Chat conversation shown' },
			upAndDownAndUp: { whileDragging: '', letGo: '' },
			down: { whileDragging: '', letGo: 'Chat conversation hidden' },
			nothing: { whileDragging: '', letGo: '' },
		});
	});

	test('showing only the input, or the conversation, from the chat is what its window shows next time', () => {
		const { chatView, read } = createInputOnly({ inputOnly: false, mode: ChatWindowLayoutMode.Stacked });
		chatView.setInputOnly(true);
		const inputOnly = read().chosen;
		chatView.setInputOnly(false);

		assert.deepStrictEqual({ inputOnly, conversation: read().chosen }, { inputOnly: true, conversation: false });
	});

	test('a chat editor shows exactly one chat, with no tabs of chats in it, also of a session of several chats: its chats are editors of their own', () => {
		const { instantiationService, chatViews } = createServices();
		const host: ISessionChatViewHost = {
			content: constObservable(testPaneContentOf(createTestActiveSession('session', true, { chatCount: 3 }), () => { })),
			window: constObservable(undefined),
			active: constObservable(true),
			attach: () => Disposable.None,
			view: constObservable(undefined),
		};
		const view = disposables.add(instantiationService.createInstance(ChatEditorView, host));
		view.layout(800, 600, 0, 0);

		const shownTabStrips = [...view.element.querySelectorAll<HTMLElement>('.session-chat-tabs-bar')].filter(strip => strip.style.display !== 'none');
		assert.deepStrictEqual({ chatViews: chatViews.length, shownTabStrips: shownTabStrips.length, chatsToSwitchTo: view.element.querySelectorAll('.chat-composite-bar-tab').length - 1 }, { chatViews: 1, shownTabStrips: 0, chatsToSwitchTo: 0 });
	});

	test('a chat of another window dragged over a chat editor shows where it opens, and opens beside the chat of the editor on drop', async () => {
		const { instantiationService } = createServices();
		const opened: { chat: string; tabOf: string | undefined }[] = [];
		const other = createTestActiveSession('other');
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = Event.None;
			override readonly onDidChangeSessionTypes = Event.None;
			override getSessionForChatResource() {
				const chat = new class extends mock<IChat>() {
					override readonly resource = other.mainChat.get().resource;
					override readonly isArchived = constObservable(false);
				}();
				const session = new class extends mock<ISession>() {
					override readonly loading = constObservable(false);
					override readonly chats = constObservable([chat]);
					override readonly mainChat = constObservable(chat);
				}();
				return { session, chat };
			}
		}());
		instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
			override getWindow() { return {} as ReturnType<IChatWindowService['getWindow']>; }
			override async open(chat: URI, options?: IChatWindowOpenOptions) {
				opened.push({ chat: chat.toString(), tabOf: options?.tabOf?.toString() });
				return undefined;
			}
		}());
		const host: ISessionChatViewHost = {
			content: constObservable(testPaneContentOf(createTestActiveSession('session'), () => { })),
			window: constObservable(undefined),
			active: constObservable(true),
			attach: () => Disposable.None,
			view: constObservable(undefined),
			// As a chat window's chat does
			createDropTarget: (element, chat) => instantiationService.createInstance(ChatWindowSessionDropTarget, element, chat),
		};
		const view = disposables.add(instantiationService.createInstance(ChatEditorView, host));
		mainWindow.document.body.appendChild(view.element);
		disposables.add(toDisposable(() => view.element.remove()));
		const dataTransfer = new DataTransfer();
		fillSessionChatDragData(new DragEvent('dragstart', { dataTransfer }), 'other', URI.parse('test-chat://other'));

		view.element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer }));
		const overlay = view.element.querySelector<HTMLElement>('.chat-window-session-drop-overlay');
		overlay?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
		await timeout(0);

		assert.deepStrictEqual({ overlay: !!overlay, opened }, { overlay: true, opened: [{ chat: 'test-chat://other', tabOf: 'test-chat://session' }] });
	});

	test('before its editor moves, the chat saves what it shows, such as where it is scrolled to, for the view where it moves to', () => {
		const { instantiationService, chatViews } = createServices();
		const host: ISessionChatViewHost = {
			content: constObservable(testPaneContentOf(createTestActiveSession('session'), () => { })),
			window: constObservable(undefined),
			active: constObservable(true),
			attach: () => Disposable.None,
			view: constObservable(undefined),
		};
		const view = disposables.add(instantiationService.createInstance(ChatEditorView, host));
		const saved: string[] = [];
		for (const chatView of chatViews) {
			chatView.saveViewState = () => saved.push(chatView.kind);
		}
		view.saveViewState();

		assert.deepStrictEqual({ primary: view.sessionView.primaryChatView.get() === chatViews.at(-1), saved }, { primary: true, saved: ['chat'] });
	});
	test('only the window\'s active chat shows the Session Activity Bar: of two chats split in Stacked, the active one; with only its main part shown, still the active one, outside of its hidden chat', () => {
		const { instantiationService } = createServices();
		const layoutMode = observableValue('layoutMode', ChatWindowLayoutMode.Stacked);
		const window = upcastPartial<IChatWindow>({
			layoutMode,
			inputOnly: constObservable(false),
			resizing: constObservable(false),
			mainPart: upcastPartial<IContentPart>({ activeGroup: upcastPartial<IEditorGroup>({ activeEditorPane: undefined, onDidActiveEditorChange: Event.None }), onDidChangeActiveGroup: Event.None }),
		});
		const createView = (sessionId: string, active: boolean) => disposables.add(instantiationService.createInstance(ChatEditorView, {
			content: constObservable(testPaneContentOf(createTestActiveSession(sessionId), () => { })),
			window: constObservable(window),
			active: constObservable(active),
			attach: () => Disposable.None,
			view: constObservable(undefined),
		}));
		const views = [createView('a', true), createView('b', false)];
		const read = () => views.map(view => {
			// What decides whether the group's Session Activity Bar shows, and where
			const group = (view.sessionView as unknown as { readonly _group: { readonly groupActive: boolean; readonly _sessionVisible: boolean; readonly _sessionPartVisible: boolean } })._group;
			return { active: group.groupActive, visible: group._sessionVisible, partVisible: group._sessionPartVisible };
		});

		const stacked = read();
		layoutMode.set(ChatWindowLayoutMode.EditorOnly, undefined);
		const editorOnly = read();

		assert.deepStrictEqual({ stacked, editorOnly }, {
			stacked: [{ active: true, visible: true, partVisible: true }, { active: false, visible: true, partVisible: true }],
			editorOnly: [{ active: true, visible: false, partVisible: false }, { active: false, visible: false, partVisible: false }],
		});
	});

	test('a chat editor tells its host whether it shows the chat from the moment it attaches: not in a window that shows only its main part, until the window shows its chat', () => {
		const { instantiationService } = createSessionViewTestServices(disposables);
		const layoutMode = observableValue('layoutMode', ChatWindowLayoutMode.EditorOnly);
		const window = upcastPartial<IChatWindow>({
			layoutMode,
			inputOnly: constObservable(false),
			resizing: constObservable(false),
			mainPart: upcastPartial<IContentPart>({ activeGroup: upcastPartial<IEditorGroup>({ activeEditorPane: undefined, onDidActiveEditorChange: Event.None }), onDidChangeActiveGroup: Event.None }),
		});
		// What the host sees of the view's visibility, from the moment it attaches, as a chat window's chat marks it read
		const seen: boolean[] = [];
		disposables.add(instantiationService.createInstance(ChatEditorView, {
			content: constObservable(testPaneContentOf(createTestActiveSession('session'), () => { })),
			window: constObservable(window),
			active: constObservable(true),
			attach: view => autorun(reader => { seen.push(view.visible.read(reader)); }),
			view: constObservable(undefined),
		}));
		const editorOnly = [...seen];
		layoutMode.set(ChatWindowLayoutMode.SideBySide, undefined);

		assert.deepStrictEqual({ editorOnly, sideBySide: seen }, { editorOnly: [false], sideBySide: [false, true] });
	});

	test('the session header shows at the top of the chat\'s card, as in the main window, in every layout mode, and hides while the chat shows only its input in Stacked; its title drags the editor of the chat', () => {
		const { instantiationService } = createServices();
		const layoutMode = observableValue('layoutMode', ChatWindowLayoutMode.SideBySide);
		const inputOnly = observableValue('inputOnly', true);
		const window = upcastPartial<IChatWindow>({
			layoutMode,
			inputOnly,
			resizing: constObservable(false),
			toggleConversation: () => inputOnly.set(!inputOnly.get(), undefined),
			mainPart: upcastPartial<IContentPart>({ activeGroup: upcastPartial<IEditorGroup>({ activeEditorPane: undefined, onDidActiveEditorChange: Event.None }), onDidChangeActiveGroup: Event.None }),
		});
		const view = disposables.add(instantiationService.createInstance(ChatEditorView, {
			content: constObservable(testPaneContentOf(createTestActiveSession('session'), () => { })),
			window: constObservable(window),
			active: constObservable(true),
			attach: () => Disposable.None,
			view: constObservable(undefined),
		}));
		view.layout(400, 800, 0, 0);
		const read = () => {
			const header = view.element.querySelector<HTMLElement>('.session-header-bar');
			return { inCard: !!header && view.sessionView.element.contains(header), shown: !!header && header.style.display !== 'none', dragsSession: !!header?.draggable, headerDragsEditor: view.dragHandle === view.sessionView.headerElement };
		};

		const modes: Record<string, ReturnType<typeof read>> = {};
		for (const mode of [ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.Stacked]) {
			layoutMode.set(mode, undefined);
			modes[mode] = read();
		}
		window.toggleConversation();
		const stackedConversation = read();

		const shown = { inCard: true, shown: true, dragsSession: false, headerDragsEditor: true };
		assert.deepStrictEqual({ modes, stackedConversation }, {
			modes: {
				[ChatWindowLayoutMode.SideBySide]: shown,
				[ChatWindowLayoutMode.ChatOnly]: shown,
				[ChatWindowLayoutMode.Stacked]: { ...shown, shown: false },
			},
			stackedConversation: shown,
		});
	});

	test('while the group of its editor shows its tabs, as it holds other editors too, the chat hides its session header, whose actions the tab bar shows for it, in its scope and on its session; alone in its group again, it shows its header', () => {
		const { instantiationService } = createServices();
		const session = createTestActiveSession('session');
		const view = disposables.add(instantiationService.createInstance(ChatEditorView, {
			content: constObservable(testPaneContentOf(session, () => { })),
			window: constObservable(undefined),
			active: constObservable(true),
			attach: () => Disposable.None,
			view: constObservable(undefined),
		}));
		view.layout(400, 800, 0, 0);
		const headerShown = () => view.element.querySelector<HTMLElement>('.session-header-bar')?.style.display !== 'none';

		const alone = headerShown();
		view.setProvidedTitleVisible(false);
		const withTabs = headerShown();
		view.setProvidedTitleVisible(true);
		const aloneAgain = headerShown();

		const { menuId, contextKeyService, options } = view.titleMenu;
		assert.deepStrictEqual({ alone, withTabs, aloneAgain, menu: menuId.id, inChatEditorScope: SessionInChatEditorContext.getValue(contextKeyService), onSession: options.args?.[0] === session }, {
			alone: true,
			withTabs: false,
			aloneAgain: true,
			menu: Menus.SessionBarToolbar.id,
			inChatEditorScope: true,
			onSession: true,
		});
	});

	test('the tab of a chat shows its status as the sessions list does, spinning while in progress, its pull request once it is done, and its session in its tooltip and for screen readers; it changes only as these do', () => {
		const status = observableValue('status', SessionStatus.InProgress);
		const isRead = observableValue('isRead', true);
		const pullRequest = observableValue<ThemeIcon | undefined>('pullRequest', undefined);
		const mainChat = upcastPartial<IChat>({ resource: URI.parse('test-chat:/main'), title: constObservable('Main') });
		const chat = upcastPartial<IChat>({ resource: URI.parse('test-chat:/side'), title: constObservable('Side chat'), status, isRead, isArchived: constObservable(false), completedStateIcon: pullRequest });
		const session = upcastPartial<ISession>({ title: constObservable('The session'), mainChat: constObservable(mainChat), chats: constObservable([mainChat, chat]), isQuickChat: constObservable(false) });
		const sessionsListModelService = upcastPartial<ISessionsListModelService>({
			getStatusIcon: (status, isRead, _isArchived, completedStateIcon) => ({ id: `${status}${isRead ? '' : '-unread'}${completedStateIcon ? `-${completedStateIcon.id}` : ''}` }),
		});
		const input = disposables.add(new ChatEditorInput(chat.resource));
		input.setName('Side chat');
		let labelChanges = 0;
		disposables.add(input.onDidChangeLabel(() => labelChanges++));
		disposables.add(autorun(reader => input.setDetails(getChatEditorInputDetails(session, chat, 'Side chat', reader, sessionsListModelService, () => constObservable(undefined)))));
		const read = () => ({ icon: input.getIcon().id, title: input.getTitle(Verbosity.LONG), ariaLabel: input.getAriaLabel(), labelChanges });

		const inProgress = read();
		isRead.set(true, undefined);
		const unchanged = read();
		transaction(tx => {
			status.set(SessionStatus.Completed, tx);
			isRead.set(false, tx);
		});
		const unread = read();
		transaction(tx => {
			isRead.set(true, tx);
			pullRequest.set(Codicon.gitPullRequest, tx);
		});
		const withPullRequest = read();

		assert.deepStrictEqual({ inProgress, unchanged, unread, withPullRequest }, {
			inProgress: { icon: 'loading~spin', title: 'The session / Side chat', ariaLabel: 'The session / Side chat, State: In Progress', labelChanges: 1 },
			unchanged: { icon: 'loading~spin', title: 'The session / Side chat', ariaLabel: 'The session / Side chat, State: In Progress', labelChanges: 1 },
			unread: { icon: `${SessionStatus.Completed}-unread`, title: 'The session / Side chat', ariaLabel: 'The session / Side chat, State: Completed, unread', labelChanges: 2 },
			withPullRequest: { icon: `${SessionStatus.Completed}-${Codicon.gitPullRequest.id}`, title: 'The session / Side chat', ariaLabel: 'The session / Side chat, State: Completed', labelChanges: 3 },
		});
	});

	test('the tab of a chat without details yet shows a chat and its name', () => {
		const input = disposables.add(new ChatEditorInput(URI.parse('test-chat:/main')));
		input.setName('Main');

		assert.deepStrictEqual({ icon: input.getIcon().id, title: input.getTitle(Verbosity.LONG), ariaLabel: input.getAriaLabel() }, { icon: Codicon.commentDiscussion.id, title: 'Main', ariaLabel: 'Main' });
	});

	test('a chat editor shows a new-session composer until its session is created, without the session header: a send that prepares the session shows its chat, a failed one the composer again, and focus moves between them only where it was', () => {
		const { instantiationService, chatViews } = createServices();
		const inProgress = observableValue('inProgress', false);
		const preparationProgress = observableValue<ISessionPreparationProgress | undefined>('preparationProgress', undefined);
		const draft = createTestActiveSession('draft', false, { isNewSessionRequestInProgress: inProgress, preparationProgress });
		const content = observableValue<ISessionPaneContent | undefined>('content', undefined);
		const view = disposables.add(instantiationService.createInstance(ChatEditorView, {
			content,
			composer: constObservable({ draftHost: upcastPartial<INewSessionDraftHost>({}), session: constObservable(draft) }),
			window: constObservable(undefined),
			active: constObservable(true),
			attach: () => Disposable.None,
			view: constObservable(undefined),
		}));
		mainWindow.document.body.appendChild(view.element);
		disposables.add(toDisposable(() => view.element.remove()));
		view.layout(800, 600, 0, 0);
		const read = () => {
			const shown = chatViews.filter(chatView => !chatView.disposed && view.element.contains(chatView.element));
			const header = view.element.querySelector<HTMLElement>('.session-header-bar');
			return {
				shown: shown.map(chatView => chatView.kind),
				focused: shown.find(chatView => chatView.element.contains(mainWindow.document.activeElement))?.kind,
				header: !!header && header.style.display !== 'none',
				label: view.sessionView.element.getAttribute('aria-label'),
			};
		};
		chatViews.find(chatView => chatView.kind === 'newSession')!.focus();

		const composing = read();
		transaction(tx => {
			inProgress.set(true, tx);
			preparationProgress.set({ message: 'Preparing', cancel: () => { } }, tx);
		});
		const preparing = read();
		transaction(tx => {
			inProgress.set(false, tx);
			preparationProgress.set(undefined, tx);
		});
		const failed = read();
		transaction(tx => {
			draft.isCreated.set(true, tx);
			content.set(testPaneContentOf(draft, () => { }), tx);
		});
		const created = read();

		assert.deepStrictEqual({ composing, preparing, failed, created, composerViewsLeft: chatViews.filter(chatView => !chatView.disposed && chatView.kind === 'newSession').length }, {
			composing: { shown: ['newSession'], focused: 'newSession', header: false, label: 'Chat: New Session' },
			preparing: { shown: ['chat'], focused: 'chat', header: false, label: 'Chat: New Session' },
			failed: { shown: ['newSession'], focused: 'newSession', header: false, label: 'Chat: New Session' },
			created: { shown: ['chat'], focused: 'chat', header: true, label: 'Chat: Main Chat' },
			composerViewsLeft: 0,
		});
	});

	test('as its session\'s chat shows, the chat model the composer was bound to stays loaded, taken before the composer goes, until the chat editor shows other content, so the chat\'s view does not load the chat again from its provider; a composer that goes without its session showing takes nothing', () => {
		const { instantiationService, chatViews } = createServices();
		const events: string[] = [];
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override acquireExistingSession(resource: URI) {
				events.push(`take ${resource.toString()}${chatViews.some(chatView => chatView.kind === 'newSession' && !chatView.disposed) ? ' while the composer shows' : ''}`);
				return upcastPartial<IChatModelReference>({ dispose: () => events.push(`release ${resource.toString()}`) });
			}
		}());
		const draft = createTestActiveSession('draft', false);
		const content = observableValue<ISessionPaneContent | undefined>('content', undefined);
		const composer = observableValue<IChatEditorComposer | undefined>('composer', { draftHost: upcastPartial<INewSessionDraftHost>({}), session: constObservable(draft) });
		const view = disposables.add(instantiationService.createInstance(ChatEditorView, {
			content,
			composer,
			window: constObservable(undefined),
			active: constObservable(true),
			attach: () => Disposable.None,
			view: constObservable(undefined),
		}));

		transaction(tx => {
			draft.isCreated.set(true, tx);
			content.set(testPaneContentOf(draft, () => { }), tx);
		});
		const created = events.splice(0);
		const other = createTestActiveSession('other');
		content.set(testPaneContentOf(other, () => { }), undefined);
		const otherContent = events.splice(0);

		// A composer that goes while nothing shows in its place, such as when it is closed.
		const unsent = createTestActiveSession('unsent', false);
		content.set(undefined, undefined);
		composer.set({ draftHost: upcastPartial<INewSessionDraftHost>({}), session: constObservable(unsent) }, undefined);
		composer.set(undefined, undefined);
		const closed = events.splice(0);

		content.set(testPaneContentOf(draft, () => { }), undefined);
		view.dispose();

		assert.deepStrictEqual({ created, otherContent, closed, disposed: events }, {
			created: ['take test-chat://draft while the composer shows'],
			otherContent: ['release test-chat://draft'],
			closed: [],
			disposed: [],
		});
	});

	test('the chat model of a composer\'s session stays held only until the chat\'s view has bound to it, so that once its provider is replaced the view lets go of it, it is evicted and the chat loads again, without the chat editor changing what it shows; a view that never binds lets go of it after a while', () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1_000 }, async () => {
		const { instantiationService, chatViews } = createServices();
		const models = disposables.add(new ChatModelStore({
			createModel: props => {
				const modelServices = disposables.add(new TestInstantiationService());
				modelServices.stub(ILogService, new NullLogService());
				modelServices.stub(IChatAgentService, new class extends mock<IChatAgentService>() {
					override getDefaultAgent() { return undefined; }
				}());
				return modelServices.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: false, resource: props.sessionResource, disableBackgroundKeepAlive: true });
			},
			willDisposeModel: async () => { },
		}, new NullLogService()));
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override acquireExistingSession(resource: URI) { return models.acquireExisting(resource); }
		}());
		const evicted: string[] = [];
		disposables.add(models.onDidDisposeModel(model => evicted.push(model.sessionResource.toString())));

		/** A chat editor whose composer, bound to its draft's chat model, sent its session: the session's chat shows instead. */
		const graduate = (id: string) => {
			const draft = createTestActiveSession(id, false);
			const resource = draft.mainChat.get().resource;
			const props: IStartSessionProps = { sessionResource: resource, location: ChatAgentLocation.Chat, canUseTools: false };
			const composerModel = models.acquireOrCreate(props);
			const original = composerModel.object;
			const content = observableValue<ISessionPaneContent | undefined>('content', undefined);
			const view = disposables.add(instantiationService.createInstance(ChatEditorView, {
				content,
				composer: constObservable<IChatEditorComposer | undefined>({ draftHost: upcastPartial<INewSessionDraftHost>({}), session: constObservable(draft) }),
				window: constObservable(undefined),
				active: constObservable(true),
				attach: () => Disposable.None,
				view: constObservable(undefined),
			}));
			transaction(tx => {
				draft.isCreated.set(true, tx);
				content.set(testPaneContentOf(draft, () => { }), tx);
			});
			// The composer's view went as the chat showed, and with it its model reference.
			composerModel.dispose();
			const chatView = chatViews.filter(chatView => chatView.kind === 'chat' && !chatView.disposed).at(-1)!;
			return { resource, props, original, chatView, content, view };
		};
		const isLoaded = (resource: URI) => !!models.get(resource);

		const bound = graduate('bound');
		const handedOff = isLoaded(bound.resource);
		// The chat's view loads its chat and binds to the model that is still loaded.
		bound.chatView.isLoadingTranscript.set(true, undefined);
		const viewModel = models.acquireExisting(bound.resource)!;
		bound.chatView.isLoadingTranscript.set(false, undefined);
		await timeout(100);
		const contentBefore = bound.content.get();
		// Its provider is replaced: the view lets go of the model and waits for it to be evicted before it loads the chat again.
		viewModel.dispose();
		await models.waitForModelDisposals();
		const reloaded = disposables.add(models.acquireOrCreate(bound.props));
		const boundResult = {
			handedOff,
			evicted: evicted.includes(bound.resource.toString()),
			fresh: reloaded.object !== bound.original,
			sameContent: bound.content.get() === contentBefore,
			sameChatView: !bound.chatView.disposed,
		};

		const unbound = graduate('unbound');
		await timeout(CHAT_MODEL_HOLD_TIMEOUT - 200);
		const beforeTimeout = isLoaded(unbound.resource);
		await timeout(200);
		await models.waitForModelDisposals();
		const afterTimeout = isLoaded(unbound.resource);

		reloaded.dispose();
		await models.waitForModelDisposals();
		assert.deepStrictEqual({ bound: boundResult, unbound: { beforeTimeout, afterTimeout } }, {
			bound: { handedOff: true, evicted: true, fresh: true, sameContent: true, sameChatView: true },
			unbound: { beforeTimeout: true, afterTimeout: false },
		});
	}));

	test('the actions its tab bar shows for a new-session composer do not offer Close Session, which has no pane to close there, also while the main window shows several sessions; once the session is created they do, as for any chat', () => {
		const { instantiationService, contextKeyService } = createServices();
		const draft = createTestActiveSession('draft', false);
		const content = observableValue<ISessionPaneContent | undefined>('content', undefined);
		const view = disposables.add(instantiationService.createInstance(ChatEditorView, {
			content,
			composer: constObservable({ draftHost: upcastPartial<INewSessionDraftHost>({}), session: constObservable(draft) }),
			window: constObservable(undefined),
			active: constObservable(true),
			attach: () => Disposable.None,
			view: constObservable(undefined),
		}));
		const multipleSessions = MultipleSessionsVisibleContext.bindTo(contextKeyService);
		const aiEnabled = ChatContextKeys.enabled.bindTo(contextKeyService);
		// Its entry among the session header's actions, as the tab bar shows them while the header hides
		const close = MenuRegistry.getMenuItems(view.titleMenu.menuId).filter(isIMenuItem).find(item => item.command.id === CLOSE_SESSION_COMMAND_ID && item.group === 'secondary/0_pane');
		const offersClose = (multiple: boolean, ai = true) => {
			multipleSessions.set(multiple);
			aiEnabled.set(ai);
			return !!close && view.titleMenu.contextKeyService.contextMatchesRules(close.when);
		};

		const composer = { singleSession: offersClose(false), severalSessions: offersClose(true), aiHidden: offersClose(true, false) };
		draft.isCreated.set(true, undefined);
		content.set(testPaneContentOf(draft, () => { }), undefined);
		const created = { singleSession: offersClose(false), severalSessions: offersClose(true) };

		assert.deepStrictEqual({ composer, created }, {
			composer: { singleSession: false, severalSessions: false, aiHidden: false },
			created: { singleSession: true, severalSessions: true },
		});
	});

	test('a send that reports more preparation progress keeps the chat it shows, and its focus; focus outside the chat editor stays there', () => {
		const run = (focusOutside: boolean) => {
			const store = disposables.add(new DisposableStore());
			const { instantiationService, chatViews } = createSessionViewTestServices(store);
			const inProgress = observableValue('inProgress', false);
			const preparationProgress = observableValue<ISessionPreparationProgress | undefined>('preparationProgress', undefined);
			const draft = createTestActiveSession('draft', false, { isNewSessionRequestInProgress: inProgress, preparationProgress });
			const view = store.add(instantiationService.createInstance(ChatEditorView, {
				content: constObservable(undefined),
				composer: constObservable({ draftHost: upcastPartial<INewSessionDraftHost>({}), session: constObservable(draft) }),
				window: constObservable(undefined),
				active: constObservable(true),
				attach: () => Disposable.None,
				view: constObservable(undefined),
			}));
			const outside = mainWindow.document.createElement('button');
			mainWindow.document.body.append(view.element, outside);
			store.add(toDisposable(() => { view.element.remove(); outside.remove(); }));
			view.layout(800, 600, 0, 0);
			if (focusOutside) {
				outside.focus();
			} else {
				chatViews.find(chatView => chatView.kind === 'newSession')!.focus();
			}
			const read = () => {
				const preparation = chatViews.filter(chatView => chatView.kind === 'chat');
				return { created: preparation.length, shown: preparation.filter(chatView => !chatView.disposed && view.element.contains(chatView.element)).length, focus: mainWindow.document.activeElement === outside ? 'outside' : preparation.some(chatView => chatView.element.contains(mainWindow.document.activeElement)) ? 'chat' : 'elsewhere' };
			};

			transaction(tx => {
				inProgress.set(true, tx);
				preparationProgress.set({ message: 'Cloning', cancel: () => { } }, tx);
			});
			const first = read();
			preparationProgress.set({ message: 'Starting the container', cancel: () => { } }, undefined);
			const second = read();
			store.dispose();
			return { first, second };
		};

		assert.deepStrictEqual({ focusedInside: run(false), focusedOutside: run(true) }, {
			focusedInside: { first: { created: 1, shown: 1, focus: 'chat' }, second: { created: 1, shown: 1, focus: 'chat' } },
			focusedOutside: { first: { created: 1, shown: 1, focus: 'outside' }, second: { created: 1, shown: 1, focus: 'outside' } },
		});
	});

	test('a chat editor kept in its window refuses moves to other windows and to a new window with its reason; without that, it moves anywhere', () => {
		const input = disposables.add(new ChatEditorInput(URI.parse('test:/chat')));
		const read = () => ({ sameWindow: input.canMove(1, 2), otherWindow: input.canMove(1, 3), newWindow: input.canMoveToNewWindow(1) });
		const free = read();
		input.setMoveRestriction({ reason: 'Send it first.', canMoveTo: group => group === 2 });
		const kept = read();
		input.setMoveRestriction(undefined);

		assert.deepStrictEqual({ free, kept, freeAgain: read() }, {
			free: { sameWindow: true, otherWindow: true, newWindow: true },
			kept: { sameWindow: true, otherWindow: 'Send it first.', newWindow: 'Send it first.' },
			freeAgain: { sameWindow: true, otherWindow: true, newWindow: true },
		});
	});
});
