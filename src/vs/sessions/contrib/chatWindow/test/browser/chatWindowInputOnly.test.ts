/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { AbstractChatView } from '../../../../browser/parts/chatView.js';
import { SessionView } from '../../../../browser/parts/sessionView.js';
import { computeSessionGridLayout, ISessionGridLayout, SessionGridCell, SessionLayoutMode, SessionTerminalPosition } from '../../../../common/sessionGridLayout/sessionGridLayout.js';
import { IChatWindowKind } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { ChatWindowCellView, ChatWindowGridHost, IChatWindowCellConstraints } from '../../browser/chatWindowGridHost.js';
import { LayoutPriority } from '../../../../../base/browser/ui/splitview/splitview.js';
import { ChatWindowInputOnlyController } from '../../browser/chatWindowInputOnly.js';
import { getChatWindowDefaultSizing } from '../../browser/chatWindowService.js';
import { ChatWindowDefaults, ChatWindowState } from '../../browser/chatWindowState.js';

suite('Chat window input only', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const kind: IChatWindowKind = { id: 'test', title: 'Test', defaultLayout: SessionLayoutMode.Stacked };
	const chatConstraints: IChatWindowCellConstraints = { minimumWidth: 0, maximumWidth: 2000, minimumHeight: 50, maximumHeight: 2000 };
	const EDITOR_MINIMUM_HEIGHT = 120;
	const INPUT_HEIGHT = 100;

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

	function createController(options: { readonly inputOnly: boolean; readonly chatHeight: number; readonly editorHeight: number }) {
		const state = new ChatWindowState(kind, true, new ChatWindowDefaults(kind, disposables.add(new InMemoryStorageService())));
		state.setInputOnly(options.inputOnly);
		const chatView = new TestChatView();
		const sessionViewMock = new class extends mock<SessionView>() {
			override readonly primaryChatView = constObservable(chatView as unknown as AbstractChatView);
			override readonly primaryChatViewTop = constObservable(0);
		}();
		// Every call on the session view other than reading its chat view, such as one that would hide its header.
		const sessionViewCalls: string[] = [];
		const sessionView = new Proxy(sessionViewMock, {
			get: (target, property, receiver) => Reflect.has(target, property) ? Reflect.get(target, property, receiver) : (..._args: unknown[]) => { sessionViewCalls.push(String(property)); },
		});
		const sizes = new Map<SessionGridCell, number>([[SessionGridCell.Chat, options.chatHeight], [SessionGridCell.SidePane, options.editorHeight]]);
		const resized: number[] = [];
		const onDidLayoutCells = disposables.add(new Emitter<void>());
		const layout = observableValue<ISessionGridLayout>('layout', { mode: SessionLayoutMode.Stacked } as ISessionGridLayout);
		const gridHost = new class extends mock<ChatWindowGridHost>() {
			override readonly onDidLayoutCells = onDidLayoutCells.event;
			override get layout() { return layout.get(); }
			override getSize(cell: SessionGridCell) {
				const height = sizes.get(cell);
				return height === undefined ? undefined : { width: 800, height };
			}
			override resizeCell(cell: SessionGridCell, size: { readonly height?: number }) {
				resized.push(size.height!);
				sizes.set(cell, size.height!);
			}
		}();
		const chatCell = disposables.add(new ChatWindowCellView(SessionGridCell.Chat, chatConstraints));
		const controller = disposables.add(new ChatWindowInputOnlyController(sessionView, state, gridHost, chatCell, $('div'), layout, chatConstraints, EDITOR_MINIMUM_HEIGHT));
		// Kept at its input by giving way last as the window is resized (low priority), never by a fixed height.
		const read = () => ({ shown: chatView.inputOnly.get(), chosen: state.inputOnly.get(), keptToInput: chatCell.priority === LayoutPriority.Low && chatCell.maximumHeight === chatConstraints.maximumHeight });
		/** The window is resized: the chat and the editor area take these heights. */
		const resize = async (chatHeight: number, editorHeight: number) => {
			sizes.set(SessionGridCell.Chat, chatHeight);
			sizes.set(SessionGridCell.SidePane, editorHeight);
			onDidLayoutCells.fire();
			await timeout(0);
		};
		const setMode = (mode: SessionLayoutMode) => layout.set({ mode } as ISessionGridLayout, undefined);
		return { chatView, controller, read, resize, resized, setMode, sessionViewCalls };
	}

	test('in Stacked, the session header stays the top row of the window while the chat shows only its input, chosen or forced by the window: the session view is never asked to hide it', async () => {
		const { chatView, read, resize, sessionViewCalls } = createController({ inputOnly: true, chatHeight: INPUT_HEIGHT, editorHeight: 600 });
		await timeout(0);
		const chosen = read();
		chatView.needConversation();
		await timeout(0);
		chatView.canShowInputOnly.set(true, undefined);
		await resize(150, EDITOR_MINIMUM_HEIGHT);
		const forced = read();
		assert.deepStrictEqual({ chosen: chosen.shown, forced: forced.shown, sessionViewCalls }, { chosen: true, forced: true, sessionViewCalls: [] });
	});

	test('the cell follows what the chat view shows, also when it shows the conversation on its own, without changing what the user chose', async () => {
		const { chatView, read, resized } = createController({ inputOnly: true, chatHeight: INPUT_HEIGHT, editorHeight: 600 });
		await timeout(0);
		const inputOnly = read();
		chatView.needConversation();
		await timeout(0);
		assert.deepStrictEqual({ inputOnly, conversation: read(), resized }, {
			inputOnly: { shown: true, chosen: true, keptToInput: true },
			// Its least height, out of the editor area: the conversation shows, not squeezed to the input.
			conversation: { shown: false, chosen: true, keptToInput: false },
			resized: [INPUT_HEIGHT + 120],
		});
	});

	test('a window too short for the conversation shows only the input, not kept as the user\'s choice, and the conversation again once it grows', async () => {
		const { read, resize } = createController({ inputOnly: false, chatHeight: 300, editorHeight: 400 });
		await timeout(0);
		const conversation = read();
		await resize(150, EDITOR_MINIMUM_HEIGHT);
		const tooShort = read();
		await resize(INPUT_HEIGHT, 500);
		assert.deepStrictEqual({ conversation, tooShort, grown: read() }, {
			conversation: { shown: false, chosen: false, keptToInput: false },
			tooShort: { shown: true, chosen: false, keptToInput: true },
			grown: { shown: false, chosen: false, keptToInput: false },
		});
	});

	test('toggling the conversation while the window forces only the input shows the conversation, and keeps the user\'s choice', async () => {
		const { controller, read, resize } = createController({ inputOnly: false, chatHeight: 300, editorHeight: 400 });
		await timeout(0);
		await resize(150, EDITOR_MINIMUM_HEIGHT);
		const forced = read();
		controller.toggleConversation();
		await timeout(0);
		assert.deepStrictEqual({ forced, toggled: read() }, {
			forced: { shown: true, chosen: false, keptToInput: true },
			toggled: { shown: false, chosen: false, keptToInput: false },
		});
	});

	test('what the window forced no longer holds once the layout leaves Stacked: showing only the input later is the user\'s choice, and stays', async () => {
		const { controller, read, resize, setMode } = createController({ inputOnly: false, chatHeight: 300, editorHeight: 400 });
		await timeout(0);
		await resize(150, EDITOR_MINIMUM_HEIGHT);
		setMode(SessionLayoutMode.SideBySide);
		await resize(300, 500);
		setMode(SessionLayoutMode.Stacked);
		await timeout(0);
		controller.toggleConversation();
		await resize(INPUT_HEIGHT, 500);
		assert.deepStrictEqual(read(), { shown: true, chosen: true, keptToInput: true });
	});

	test('what the window forced no longer holds once the chat shows its conversation: showing only the input from the chat later is the user\'s choice, and stays', async () => {
		const { chatView, read, resize, setMode } = createController({ inputOnly: false, chatHeight: 300, editorHeight: 400 });
		await timeout(0);
		await resize(150, EDITOR_MINIMUM_HEIGHT);
		setMode(SessionLayoutMode.SideBySide);
		await resize(300, 500);
		setMode(SessionLayoutMode.Stacked);
		await timeout(0);
		// From the chat itself, as its own control does.
		chatView.setInputOnly(true);
		await resize(INPUT_HEIGHT, 500);
		assert.deepStrictEqual(read(), { shown: true, chosen: true, keptToInput: true });
	});

	for (const terminals of [false, true]) {
		test(`in Stacked, the sash above a chat that shows only its input can be dragged: the conversation shows live as it is dragged up past the input and hides as it is dragged back down to it, before the drag lets go; a window resize keeps the input alone at its height (terminals: ${terminals})`, async () => {
			const store = disposables.add(new DisposableStore());
			const container = mainWindow.document.body.appendChild($('.chat-window-host'));
			container.style.cssText = 'position: absolute; top: 0; left: 0; width: 800px; height: 700px;';
			store.add(toDisposable(() => container.remove()));
			const cells = new Map<SessionGridCell, ChatWindowCellView>();
			for (const cell of [SessionGridCell.Chat, SessionGridCell.SidePane, SessionGridCell.Terminals, SessionGridCell.Column]) {
				const view = store.add(new ChatWindowCellView(cell, cell === SessionGridCell.Chat ? chatConstraints : { minimumWidth: cell === SessionGridCell.Column ? 34 : 100, maximumWidth: cell === SessionGridCell.Column ? 34 : Number.POSITIVE_INFINITY, minimumHeight: 80, maximumHeight: Number.POSITIVE_INFINITY }));
				view.setContent({ element: $('div'), layout: () => { } });
				cells.set(cell, view);
			}
			const gridHost = store.add(new ChatWindowGridHost(container, cells, (cell, axis) => cell === SessionGridCell.Column && axis === 'row' ? { kind: 'fixed', size: 34 } : getChatWindowDefaultSizing(cell, axis)));
			gridHost.layoutGrid(800, 700);
			const layout = observableValue<ISessionGridLayout>('layout', computeSessionGridLayout({ mode: SessionLayoutMode.Stacked, terminalPosition: SessionTerminalPosition.FullWidth, terminalsVisible: terminals, activityBar: false, inputOnly: true }));
			gridHost.apply(layout.get());
			const state = new ChatWindowState(kind, true, new ChatWindowDefaults(kind, store.add(new InMemoryStorageService())));
			state.setInputOnly(true);
			// As the chat view's input does, it measures taller in the conversation than when only the input shows, and only
			// once it is laid out again, a moment after it switches.
			const chatView = new class extends TestChatView {
				override setInputOnly(inputOnly: boolean): void {
					super.setInputOnly(inputOnly);
					const height = this.inputOnly.get() ? INPUT_HEIGHT : INPUT_HEIGHT + 20;
					queueMicrotask(() => this.inputOnlyHeight.set(height, undefined));
				}
			}();
			const sessionView = new class extends mock<SessionView>() {
				override readonly primaryChatView = constObservable(chatView as unknown as AbstractChatView);
				override readonly primaryChatViewTop = constObservable(0);
			}();
			store.add(new ChatWindowInputOnlyController(sessionView, state, gridHost, cells.get(SessionGridCell.Chat)!, container, layout, chatConstraints, EDITOR_MINIMUM_HEIGHT));
			await timeout(0);
			const chatHeight = () => gridHost.getSize(SessionGridCell.Chat)?.height;
			const inputOnly = { shown: chatView.inputOnly.get(), height: chatHeight() };

			// The window is resized: the editor area takes the change, the chat keeps its input's height.
			gridHost.layoutGrid(800, 600);
			await timeout(0);
			const resized = { shown: chatView.inputOnly.get(), height: chatHeight() };

			// The sash right above the chat, dragged up by 250px as the user does.
			const chatTop = cells.get(SessionGridCell.Chat)!.element.getBoundingClientRect().top;
			const sash = Array.from(container.querySelectorAll<HTMLElement>('.monaco-sash.horizontal')).sort((a, b) => Math.abs(a.getBoundingClientRect().top - chatTop) - Math.abs(b.getBoundingClientRect().top - chatTop))[0];
			const enabled = !sash.classList.contains('disabled');
			const bounds = sash.getBoundingClientRect();
			const x = bounds.left + bounds.width / 2;
			const y = bounds.top + bounds.height / 2;
			sash.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
			sash.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y, button: 0 }));
			// Live, before the drag lets go: dragged up past the input, the conversation shows at the dragged height; dragged
			// back down to the input, only the input shows; up again, the conversation.
			const move = async (dy: number) => {
				mainWindow.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y + dy }));
				await timeout(0);
				return { shown: chatView.inputOnly.get(), height: chatHeight() };
			};
			// Around the input's height, a margin between the two: the conversation at 14px above it, still at 8px, the input
			// alone at 3px; against the input's height as it shows only the input, though the conversation's input is taller,
			// and with no jump as the input measures again.
			const midDrag = { up: await move(-100), down: await move(0), justAbove: await move(-14), stillAbove: await move(-8), atInput: await move(-3), upAgain: await move(-250) };
			mainWindow.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y - 250 }));
			mainWindow.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y - 250 }));
			await timeout(0);
			const dragged = { shown: chatView.inputOnly.get(), taller: (chatHeight() ?? 0) > INPUT_HEIGHT + 200 };

			assert.deepStrictEqual({ inputOnly, resized, enabled, midDrag, dragged }, {
				inputOnly: { shown: true, height: INPUT_HEIGHT },
				resized: { shown: true, height: INPUT_HEIGHT },
				enabled: true,
				midDrag: {
					up: { shown: false, height: INPUT_HEIGHT + 100 },
					down: { shown: true, height: INPUT_HEIGHT },
					justAbove: { shown: false, height: INPUT_HEIGHT + 14 },
					stillAbove: { shown: false, height: INPUT_HEIGHT + 8 },
					atInput: { shown: true, height: INPUT_HEIGHT + 3 },
					upAgain: { shown: false, height: INPUT_HEIGHT + 250 },
				},
				dragged: { shown: false, taller: true },
			});
			store.dispose();
		});
	}
});
