/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { AbstractChatView } from '../../../../browser/parts/chatView.js';
import { SessionView } from '../../../../browser/parts/sessionView.js';
import { ISessionGridLayout, SessionGridCell, SessionLayoutMode } from '../../../../common/sessionGridLayout/sessionGridLayout.js';
import { IChatWindowKind } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { ChatWindowCellView, ChatWindowGridHost, IChatWindowCellConstraints } from '../../browser/chatWindowGridHost.js';
import { ChatWindowInputOnlyController } from '../../browser/chatWindowInputOnly.js';
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
		const read = () => ({ shown: chatView.inputOnly.get(), chosen: state.inputOnly.get(), maximumHeight: chatCell.maximumHeight });
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
			inputOnly: { shown: true, chosen: true, maximumHeight: INPUT_HEIGHT },
			// Its least height, out of the editor area: the conversation shows, not squeezed to the input.
			conversation: { shown: false, chosen: true, maximumHeight: chatConstraints.maximumHeight },
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
			conversation: { shown: false, chosen: false, maximumHeight: chatConstraints.maximumHeight },
			tooShort: { shown: true, chosen: false, maximumHeight: INPUT_HEIGHT },
			grown: { shown: false, chosen: false, maximumHeight: chatConstraints.maximumHeight },
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
			forced: { shown: true, chosen: false, maximumHeight: INPUT_HEIGHT },
			toggled: { shown: false, chosen: false, maximumHeight: chatConstraints.maximumHeight },
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
		assert.deepStrictEqual(read(), { shown: true, chosen: true, maximumHeight: INPUT_HEIGHT });
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
		assert.deepStrictEqual(read(), { shown: true, chosen: true, maximumHeight: INPUT_HEIGHT });
	});
});
