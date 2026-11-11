/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ChatWindowLayoutMode, ChatWindowTerminalPosition } from '../../common/chatWindowLayout.js';
import { ChatWindowChatLayouts, ChatWindowChatSizes, ChatWindowDefaults, ChatWindowState, IRememberedChatLayout } from '../../common/chatWindowState.js';

suite('ChatWindowState', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const chat = URI.parse('test:/session/chat');

	function createState(storage: IStorageService, chatLayouts?: ChatWindowChatLayouts): ChatWindowState {
		const layouts = chatLayouts ?? new ChatWindowChatLayouts(storage);
		return new ChatWindowState(new ChatWindowDefaults(storage), {
			initial: layouts.get(chat),
			set: layout => layouts.set(chat, layout),
		});
	}

	function snapshot(state: ChatWindowState) {
		return { layoutMode: state.layoutMode.get(), splitLayout: state.splitLayout.get(), inputOnly: state.inputOnly.get(), terminalPosition: state.terminalPosition.get() };
	}

	test('opens side by side until a layout is chosen', () => {
		const storage = disposables.add(new InMemoryStorageService());
		assert.deepStrictEqual(snapshot(createState(storage)), { layoutMode: ChatWindowLayoutMode.SideBySide, splitLayout: ChatWindowLayoutMode.SideBySide, inputOnly: true, terminalPosition: ChatWindowTerminalPosition.FullWidth });
	});

	test('loads what profiles stored under the keys chat windows always used', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const store = (key: string, value: string | boolean) => storage.store(`sessions.chatWindow.chatWithEditors.${key}`, value, StorageScope.PROFILE, StorageTarget.USER);
		store('layout', ChatWindowLayoutMode.Stacked);
		store('inputOnly', false);
		store('terminalPosition', ChatWindowTerminalPosition.UnderChat);

		const state = createState(storage);
		const loaded = snapshot(state);
		state.setLayoutMode(ChatWindowLayoutMode.EditorOnly);
		state.setTerminalPosition(ChatWindowTerminalPosition.UnderEditor);

		const read = (key: string) => storage.get(`sessions.chatWindow.chatWithEditors.${key}`, StorageScope.PROFILE);
		assert.deepStrictEqual({ loaded, stored: ['layout', 'inputOnly', 'terminalPosition'].map(read) }, {
			loaded: { layoutMode: ChatWindowLayoutMode.Stacked, splitLayout: ChatWindowLayoutMode.Stacked, inputOnly: false, terminalPosition: ChatWindowTerminalPosition.UnderChat },
			stored: [ChatWindowLayoutMode.EditorOnly, 'false', ChatWindowTerminalPosition.UnderEditor],
		});
	});

	test('opens as its chat is remembered rather than as chat windows were last left, and remembers what the user chooses for the chat', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const first = createState(storage);
		first.setLayoutMode(ChatWindowLayoutMode.Stacked);
		first.setInputOnly(false);
		// Another chat window leaves the defaults elsewhere.
		new ChatWindowDefaults(storage).setLayoutMode(ChatWindowLayoutMode.EditorOnly);

		assert.deepStrictEqual(snapshot(createState(storage)), {
			layoutMode: ChatWindowLayoutMode.Stacked, splitLayout: ChatWindowLayoutMode.Stacked, inputOnly: false, terminalPosition: ChatWindowTerminalPosition.FullWidth,
		});
	});

	test('with only the chat or only the main part shown, flips how both show next, which the chat remembers and showing both uses', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const layouts = new ChatWindowChatLayouts(storage);
		const state = createState(storage, layouts);
		state.setLayoutMode(ChatWindowLayoutMode.ChatOnly);
		state.setSplitLayout(ChatWindowLayoutMode.Stacked);
		const whileChatOnly = { layoutMode: state.layoutMode.get(), splitLayout: state.splitLayout.get(), remembered: layouts.get(chat) };
		state.showBoth();
		assert.deepStrictEqual({ whileChatOnly, afterShowBoth: state.layoutMode.get() }, {
			whileChatOnly: { layoutMode: ChatWindowLayoutMode.ChatOnly, splitLayout: ChatWindowLayoutMode.Stacked, remembered: { mode: ChatWindowLayoutMode.ChatOnly, splitLayout: ChatWindowLayoutMode.Stacked, inputOnly: true } },
			afterShowBoth: ChatWindowLayoutMode.Stacked,
		});
	});

	test('showing only the chat while the main part has nothing to show changes neither the remembered layout nor the defaults', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const layouts = new ChatWindowChatLayouts(storage);
		const state = createState(storage, layouts);
		state.setLayoutMode(ChatWindowLayoutMode.Stacked);
		state.showChatOnly();
		assert.deepStrictEqual({ layoutMode: state.layoutMode.get(), remembered: layouts.get(chat)?.mode, defaults: new ChatWindowDefaults(storage).getLayoutMode() }, {
			layoutMode: ChatWindowLayoutMode.ChatOnly, remembered: ChatWindowLayoutMode.Stacked, defaults: ChatWindowLayoutMode.Stacked,
		});
	});

	test('remembers the layouts and sizes of the chats changed last, and ignores what it cannot read', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const layouts = new ChatWindowChatLayouts(storage);
		const sizes = new ChatWindowChatSizes(storage);
		const layout: IRememberedChatLayout = { mode: ChatWindowLayoutMode.Stacked, splitLayout: ChatWindowLayoutMode.Stacked, inputOnly: false };
		for (let i = 0; i < 205; i++) {
			layouts.set(URI.parse(`test:/chat/${i}`), layout);
		}
		sizes.set(chat, { stacked: { chat: { width: 10, height: 20 } } });
		const kept = [0, 4, 5, 204].map(i => !!layouts.get(URI.parse(`test:/chat/${i}`)));
		storage.store(ChatWindowChatLayouts.STORAGE_KEY, JSON.stringify([['test:/chat/x', { mode: 'unknown' }], 'invalid']), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		assert.deepStrictEqual({ kept, invalid: layouts.get(URI.parse('test:/chat/x')), sizes: sizes.get(chat) }, {
			kept: [false, false, true, true], invalid: undefined, sizes: { stacked: { chat: { width: 10, height: 20 } } },
		});
	});

	test('forgetting the layout and sizes of a chat leaves those of the other chats', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const layouts = new ChatWindowChatLayouts(storage);
		const sizes = new ChatWindowChatSizes(storage);
		const other = URI.parse('test:/other');
		const layout: IRememberedChatLayout = { mode: ChatWindowLayoutMode.Stacked, splitLayout: ChatWindowLayoutMode.Stacked, inputOnly: false };
		for (const candidate of [chat, other]) {
			layouts.set(candidate, layout);
			sizes.set(candidate, { stacked: { chat: { width: 10, height: 20 } } });
		}
		layouts.delete(chat);
		sizes.delete(chat);

		assert.deepStrictEqual({ chat: [layouts.get(chat), sizes.get(chat)], other: [layouts.get(other)?.mode, !!sizes.get(other)] }, { chat: [undefined, undefined], other: [ChatWindowLayoutMode.Stacked, true] });
	});

	test('sizes stored by earlier builds, which kept the sizes the window forced the parts to, are not read: the parts take their defaults', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const [oldKey] = ChatWindowChatSizes.OLD_STORAGE_KEYS;
		storage.store(oldKey, JSON.stringify([[chat.toString(), { terminals: { terminals: { width: 1192, height: 123 } } }]]), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const sizes = new ChatWindowChatSizes(storage);

		assert.deepStrictEqual({ sizes: sizes.get(chat), oldKeyRemoved: storage.get(oldKey, StorageScope.WORKSPACE) === undefined }, { sizes: undefined, oldKeyRemoved: true });
	});
});
