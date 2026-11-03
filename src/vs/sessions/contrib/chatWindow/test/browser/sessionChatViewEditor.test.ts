/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IViewEditorRegistry, ViewEditorExtensions } from '../../../../../workbench/browser/parts/editor/viewEditorRegistry.js';
import { ChatWindowLayoutMode } from '../../../../../workbench/contrib/chatWindow/common/chatWindowLayout.js';
import { $ } from '../../../../../base/browser/dom.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { IChatWindow } from '../../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { IContentPart, IEditorGroup } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { createSessionViewTestServices, createTestActiveSession } from '../../../../test/browser/sessionViewTestUtils.js';
import { IInputOnlySessionView, ISessionChatViewHost, SessionChatViewEditorView, SESSION_CHAT_VIEW_HOST_OPTIONS, SESSION_CHAT_VIEW_MINIMUM_HEIGHT, SESSION_CHAT_VIEW_TYPE, SessionChatViewInputOnly } from '../../browser/sessionChatViewEditor.js';

suite('Session chat view editor', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const INPUT_HEIGHT = 100;
	const HEADER_HEIGHT = 30;

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
			primaryChatViewTop: constObservable(HEADER_HEIGHT),
		};
		const layoutMode = observableValue<ChatWindowLayoutMode>('layoutMode', options.mode);
		const inputOnly = observableValue('inputOnly', options.inputOnly);
		const window = {
			layoutMode: layoutMode as IObservable<ChatWindowLayoutMode>,
			inputOnly: inputOnly as IObservable<boolean>,
			toggleConversation: () => {
				if (layoutMode.get() === ChatWindowLayoutMode.Stacked) {
					inputOnly.set(!inputOnly.get(), undefined);
				}
			},
		};
		const controller = disposables.add(new SessionChatViewInputOnly(sessionView, constObservable(window)));
		const read = () => ({ shown: chatView.inputOnly.get(), chosen: inputOnly.get(), maximumHeight: controller.maximumHeight.get(), minimumHeight: controller.minimumHeight.get() });
		return { chatView, layoutMode, window, read };
	}

	test('registers the chat of a session as a view editor, which shows its session as the chat windows did: its header, its Session Activity Bar and its pills', () => {
		const descriptor = Registry.as<IViewEditorRegistry>(ViewEditorExtensions.ViewEditors).get(SESSION_CHAT_VIEW_TYPE);
		assert.deepStrictEqual({ registered: !!descriptor, name: descriptor?.name, options: SESSION_CHAT_VIEW_HOST_OPTIONS }, {
			registered: true,
			name: 'Chat',
			options: { showHeader: true, showActivityBar: true, input: { showPills: true } },
		});
	});

	test('in Stacked, the chat shows only its input as its window chose, and is as tall as its input then, at most; elsewhere it shows its conversation, unbounded', () => {
		const { layoutMode, read, window } = createInputOnly({ inputOnly: true, mode: ChatWindowLayoutMode.Stacked });
		const stacked = read();
		window.toggleConversation();
		const conversation = read();
		window.toggleConversation();
		layoutMode.set(ChatWindowLayoutMode.SideBySide, undefined);
		const sideBySide = read();

		const collapsed = HEADER_HEIGHT + INPUT_HEIGHT;
		assert.deepStrictEqual({ stacked, conversation, sideBySide }, {
			stacked: { shown: true, chosen: true, maximumHeight: collapsed, minimumHeight: SESSION_CHAT_VIEW_MINIMUM_HEIGHT },
			conversation: { shown: false, chosen: false, maximumHeight: Number.POSITIVE_INFINITY, minimumHeight: SESSION_CHAT_VIEW_MINIMUM_HEIGHT },
			sideBySide: { shown: false, chosen: true, maximumHeight: Number.POSITIVE_INFINITY, minimumHeight: SESSION_CHAT_VIEW_MINIMUM_HEIGHT },
		});
	});

	test('the chat follows what the chat view shows, also when it shows the conversation on its own, without changing what the user chose', () => {
		const { chatView, read } = createInputOnly({ inputOnly: true, mode: ChatWindowLayoutMode.Stacked });
		const inputOnly = read();
		chatView.needConversation();

		assert.deepStrictEqual({ inputOnly, conversation: read() }, {
			inputOnly: { shown: true, chosen: true, maximumHeight: HEADER_HEIGHT + INPUT_HEIGHT, minimumHeight: SESSION_CHAT_VIEW_MINIMUM_HEIGHT },
			conversation: { shown: false, chosen: true, maximumHeight: Number.POSITIVE_INFINITY, minimumHeight: SESSION_CHAT_VIEW_MINIMUM_HEIGHT },
		});
	});

	test('showing only the input, or the conversation, from the chat is what its window shows next time', () => {
		const { chatView, read } = createInputOnly({ inputOnly: false, mode: ChatWindowLayoutMode.Stacked });
		chatView.setInputOnly(true);
		const inputOnly = read().chosen;
		chatView.setInputOnly(false);

		assert.deepStrictEqual({ inputOnly, conversation: read().chosen }, { inputOnly: true, conversation: false });
	});

	test('the session header leaves the title row it shows in with its view, so that the view that shows the chat after a move is the only one there', () => {
		const { instantiationService } = createSessionViewTestServices(disposables);
		const titleRow = $('.title-row');
		const host: ISessionChatViewHost = {
			session: constObservable(undefined),
			window: constObservable(undefined),
			header: constObservable({ element: titleRow, actionsElement: undefined, setShown: () => { } }),
			showsTitle: constObservable(false),
			createTitle: () => undefined,
			attach: () => Disposable.None,
		};
		const first = instantiationService.createInstance(SessionChatViewEditorView, host);
		const second = disposables.add(instantiationService.createInstance(SessionChatViewEditorView, host));
		const whileBoth = titleRow.childElementCount;
		first.dispose();

		assert.deepStrictEqual({ whileBoth, afterMove: titleRow.childElementCount, ofSecond: titleRow.firstElementChild?.parentElement === titleRow && second.sessionView.element.contains(titleRow.firstElementChild) === false }, { whileBoth: 2, afterMove: 1, ofSecond: true });
	});

	test('before its editor moves, the chat saves what it shows, such as where it is scrolled to, for the view where it moves to', () => {
		const { instantiationService, chatViews } = createSessionViewTestServices(disposables);
		const host: ISessionChatViewHost = {
			session: constObservable(createTestActiveSession('session')),
			window: constObservable(undefined),
			header: constObservable(undefined),
			showsTitle: constObservable(false),
			createTitle: () => undefined,
			attach: () => Disposable.None,
		};
		const view = disposables.add(instantiationService.createInstance(SessionChatViewEditorView, host));
		const saved: string[] = [];
		for (const chatView of chatViews) {
			chatView.saveViewState = () => saved.push(chatView.kind);
		}
		view.saveViewState();

		assert.deepStrictEqual({ primary: view.sessionView.primaryChatView.get() === chatViews.at(-1), saved }, { primary: true, saved: ['chat'] });
	});
	test('its own title row shows at the top of its card while its host says so, as tall in chat only as side by side, with the chat below it', () => {
		const { instantiationService } = createSessionViewTestServices(disposables);
		const run = (mode: ChatWindowLayoutMode) => {
			const showsTitle = observableValue('showsTitle', true);
			const titleElement = $('.own-title');
			const window = upcastPartial<IChatWindow>({
				layoutMode: constObservable(mode),
				inputOnly: constObservable(false),
				mainPart: upcastPartial<IContentPart>({ activeGroup: upcastPartial<IEditorGroup>({ activeEditorPane: undefined, onDidActiveEditorChange: Event.None }), onDidChangeActiveGroup: Event.None }),
			});
			const host: ISessionChatViewHost = {
				session: constObservable(undefined),
				window: constObservable(window),
				header: constObservable(undefined),
				showsTitle,
				createTitle: container => {
					container.insertBefore(titleElement, container.firstChild);
					return { element: titleElement, size: constObservable(33), layout: () => { }, dispose: () => titleElement.remove() };
				},
				attach: () => Disposable.None,
			};
			const view = disposables.add(instantiationService.createInstance(SessionChatViewEditorView, host));
			let chat: { height: number; top: number } | undefined;
			view.sessionView.layout = (_width, height, top) => { chat = { height, top }; };
			view.layout(400, 800, 0, 0);
			const read = () => ({ shown: titleElement.style.display !== 'none' && view.element.firstElementChild === titleElement, extraMinimumHeight: view.minimumHeight - SESSION_CHAT_VIEW_MINIMUM_HEIGHT, chat });
			const shown = read();
			showsTitle.set(false, undefined);
			const hidden = read();
			showsTitle.set(true, undefined);
			return { shown, hidden, shownAgain: read() };
		};

		const expected = {
			shown: { shown: true, extraMinimumHeight: 33, chat: { height: 767, top: 33 } },
			hidden: { shown: false, extraMinimumHeight: 0, chat: { height: 800, top: 0 } },
			shownAgain: { shown: true, extraMinimumHeight: 33, chat: { height: 767, top: 33 } },
		};
		assert.deepStrictEqual({ chatOnly: run(ChatWindowLayoutMode.ChatOnly), sideBySide: run(ChatWindowLayoutMode.SideBySide) }, { chatOnly: expected, sideBySide: expected });
	});

	test('a view that disposes, as its window closes, creates no title row on the way, which the services it disposed could not create', () => {
		const { instantiationService } = createSessionViewTestServices(disposables);
		const window = () => upcastPartial<IChatWindow>({
			layoutMode: constObservable(ChatWindowLayoutMode.SideBySide),
			inputOnly: constObservable(false),
			mainPart: upcastPartial<IContentPart>({ activeGroup: upcastPartial<IEditorGroup>({ activeEditorPane: undefined, onDidActiveEditorChange: Event.None }), onDidChangeActiveGroup: Event.None }),
		});
		const hostWindow = observableValue<IChatWindow | undefined>('window', window());
		let created = 0;
		const host: ISessionChatViewHost = {
			session: constObservable(undefined),
			window: hostWindow,
			header: constObservable(undefined),
			showsTitle: constObservable(true),
			createTitle: () => {
				created++;
				return { element: $('.own-title'), size: constObservable(33), layout: () => { }, dispose: () => { } };
			},
			// What changes the window of the view as it disposes, such as its window closing.
			attach: () => toDisposable(() => hostWindow.set(window(), undefined)),
		};
		const view = instantiationService.createInstance(SessionChatViewEditorView, host);
		const beforeDispose = created;
		view.dispose();

		assert.deepStrictEqual({ beforeDispose, afterDispose: created }, { beforeDispose: 1, afterDispose: 1 });
	});
});
