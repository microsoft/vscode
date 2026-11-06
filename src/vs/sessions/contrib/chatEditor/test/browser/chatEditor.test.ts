/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IViewEditorRegistry, ViewEditorExtensions } from '../../../../../workbench/browser/parts/editor/viewEditorRegistry.js';
import { ChatWindowLayoutMode } from '../../../../../workbench/contrib/chatWindow/common/chatWindowLayout.js';
import { $ } from '../../../../../base/browser/dom.js';
import { setARIAContainer } from '../../../../../base/browser/ui/aria/aria.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { IChatWindow } from '../../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { IContentPart, IEditorGroup } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { createSessionViewTestServices, createTestActiveSession } from '../../../../test/browser/sessionViewTestUtils.js';
import { ChatEditorView, IInputOnlySessionView, ISessionChatViewHost, SESSION_CHAT_VIEW_HOST_OPTIONS, SESSION_CHAT_VIEW_MINIMUM_HEIGHT, SESSION_CHAT_VIEW_TYPE, SessionChatViewInputOnly } from '../../browser/chatEditor.js';

suite('Session chat view editor', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

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
		const { instantiationService, chatViews } = createSessionViewTestServices(disposables);
		const host: ISessionChatViewHost = {
			session: constObservable(createTestActiveSession('session', true, { chatCount: 3 })),
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

	test('before its editor moves, the chat saves what it shows, such as where it is scrolled to, for the view where it moves to', () => {
		const { instantiationService, chatViews } = createSessionViewTestServices(disposables);
		const host: ISessionChatViewHost = {
			session: constObservable(createTestActiveSession('session')),
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
		const { instantiationService } = createSessionViewTestServices(disposables);
		const layoutMode = observableValue('layoutMode', ChatWindowLayoutMode.Stacked);
		const window = upcastPartial<IChatWindow>({
			layoutMode,
			inputOnly: constObservable(false),
			resizing: constObservable(false),
			mainPart: upcastPartial<IContentPart>({ activeGroup: upcastPartial<IEditorGroup>({ activeEditorPane: undefined, onDidActiveEditorChange: Event.None }), onDidChangeActiveGroup: Event.None }),
		});
		const createView = (sessionId: string, active: boolean) => disposables.add(instantiationService.createInstance(ChatEditorView, {
			session: constObservable(createTestActiveSession(sessionId)),
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

	test('the session header shows at the top of the chat\'s card, as in the main window, in every layout mode, and hides while the chat shows only its input in Stacked; its title drags the editor of the chat', () => {
		const { instantiationService } = createSessionViewTestServices(disposables);
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
			session: constObservable(createTestActiveSession('session')),
			window: constObservable(window),
			active: constObservable(true),
			attach: () => Disposable.None,
			view: constObservable(undefined),
		}));
		view.layout(400, 800, 0, 0);
		const read = () => {
			const header = view.element.querySelector<HTMLElement>('.session-header-bar');
			return { inCard: !!header && view.sessionView.element.contains(header), shown: !!header && header.style.display !== 'none', dragsSession: !!header?.draggable, titleDragsEditor: view.dragHandle === view.sessionView.headerTitleElement };
		};

		const modes: Record<string, ReturnType<typeof read>> = {};
		for (const mode of [ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.Stacked]) {
			layoutMode.set(mode, undefined);
			modes[mode] = read();
		}
		window.toggleConversation();
		const stackedConversation = read();

		const shown = { inCard: true, shown: true, dragsSession: false, titleDragsEditor: true };
		assert.deepStrictEqual({ modes, stackedConversation }, {
			modes: {
				[ChatWindowLayoutMode.SideBySide]: shown,
				[ChatWindowLayoutMode.ChatOnly]: shown,
				[ChatWindowLayoutMode.Stacked]: { ...shown, shown: false },
			},
			stackedConversation: shown,
		});
	});
});
