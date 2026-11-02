/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatWindowPartsLayout, divideChatWindowRoom, IChatWindowLayoutChrome, IChatWindowLayoutPart } from '../../browser/chatWindowPartsLayout.js';
import { ChatWindowLayoutCell, ChatWindowLayoutMode } from '../../common/chatWindowLayout.js';

suite('Chat window parts layout', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function box(element: HTMLElement): string {
		return element.style.display === 'none' ? 'hidden' : `${element.style.left},${element.style.top} ${element.style.width}x${element.style.height}`.replace(/px/g, '');
	}

	function setup() {
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.SideBySide);
		const onDidChangeChat = disposables.add(new Emitter<void>());
		let chatMaximumHeight = Number.POSITIVE_INFINITY;
		const main: IChatWindowLayoutPart = { element: $('.main'), layout: () => { } };
		const chat: IChatWindowLayoutPart = { element: $('.chat'), get maximumHeight() { return chatMaximumHeight; }, onDidChange: onDidChangeChat.event, layout: () => { } };
		const titleRow: IChatWindowLayoutChrome = { element: $('.title'), visible: constObservable(true), size: constObservable(30), layout: () => { } };
		const strip: IChatWindowLayoutChrome = { element: $('.strip'), visible: constObservable(true), size: constObservable(34), layout: () => { } };
		const layout = disposables.add(new ChatWindowPartsLayout(new Map([[ChatWindowLayoutCell.SidePane, main], [ChatWindowLayoutCell.Chat, chat]]), mode, constObservable(10), { titleRow, strip }));
		layout.layout(1010, 830);
		const read = () => ({ title: box(titleRow.element), chat: box(chat.element), main: box(main.element), strip: box(strip.element) });
		const setChatMaximumHeight = (height: number) => {
			chatMaximumHeight = height;
			onDidChangeChat.fire();
		};
		return { mode, read, setChatMaximumHeight };
	}

	test('the title row is above the chat while the main part is beside it, else across the window; the strip has a column of its own at the right while the chat is below the main part or hidden', () => {
		const { mode, read } = setup();
		const layouts: Record<string, ReturnType<typeof read>> = {};
		for (const candidate of [ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.EditorOnly]) {
			mode.set(candidate, undefined);
			layouts[candidate] = read();
		}

		assert.deepStrictEqual(layouts, {
			[ChatWindowLayoutMode.SideBySide]: { title: '0,0 400x30', chat: '0,30 400x800', main: '410,0 600x830', strip: 'hidden' },
			[ChatWindowLayoutMode.ChatOnly]: { title: '0,0 1010x30', chat: '0,30 1010x800', main: 'hidden', strip: 'hidden' },
			[ChatWindowLayoutMode.Stacked]: { title: '0,0 1010x30', chat: '0,475 966x355', main: '0,30 966x435', strip: '976,30 34x800' },
			[ChatWindowLayoutMode.EditorOnly]: { title: '0,0 1010x30', chat: 'hidden', main: '0,30 966x800', strip: '976,30 34x800' },
		});
	});

	test('a chat that bounds its height, such as one that shows only its input, gives the rest to the main part above it, and takes its share again once unbounded', () => {
		const { mode, read, setChatMaximumHeight } = setup();
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		setChatMaximumHeight(100);
		const bounded = read();
		setChatMaximumHeight(Number.POSITIVE_INFINITY);

		assert.deepStrictEqual({ bounded: { chat: bounded.chat, main: bounded.main }, unbounded: { chat: read().chat, main: read().main } }, {
			bounded: { chat: '0,730 966x100', main: '0,30 966x690' },
			unbounded: { chat: '0,475 966x355', main: '0,30 966x435' },
		});
	});

	test('divides the room by shares, after fixed sizes and maximums', () => {
		assert.deepStrictEqual([
			divideChatWindowRoom(100, [{ share: 1 }, { share: 1 }]),
			divideChatWindowRoom(100, [{ share: 1 }, { share: 1, fixed: 20 }]),
			divideChatWindowRoom(100, [{ share: 3 }, { share: 1, maximum: 10 }]),
			divideChatWindowRoom(100, [{ share: 1, maximum: 10 }, { share: 1, maximum: 10 }]),
		], [[50, 50], [80, 20], [90, 10], [10, 10]]);
	});
});
