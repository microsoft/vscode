/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { SessionLayoutMode, SessionTerminalPosition } from '../../../../common/sessionGridLayout/sessionGridLayout.js';
import { IChatWindowKind } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { ChatWindowChatLayouts, ChatWindowDefaults, ChatWindowState, IRememberedChatLayout } from '../../browser/chatWindowState.js';

suite('ChatWindowState', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const kind: IChatWindowKind = { id: 'test', title: 'Test', defaultLayout: SessionLayoutMode.SideBySide };
	const chat = URI.parse('test:/session/chat');

	function createState(storage: IStorageService, hasEditorArea = true, chatLayouts?: ChatWindowChatLayouts): ChatWindowState {
		const layouts = chatLayouts ?? new ChatWindowChatLayouts(storage);
		return new ChatWindowState(kind, hasEditorArea, new ChatWindowDefaults(kind, storage), {
			initial: layouts.get(chat),
			set: layout => layouts.set(chat, layout),
		});
	}

	function snapshot(state: ChatWindowState) {
		return { layouts: state.layouts, layout: state.layout.get(), splitLayout: state.splitLayout.get(), inputOnly: state.inputOnly.get(), terminalPosition: state.terminalPosition.get() };
	}

	test('offers the layouts that fit, and opens with the layout of its kind until one is chosen', () => {
		const storage = disposables.add(new InMemoryStorageService());
		assert.deepStrictEqual([snapshot(createState(storage)), snapshot(createState(storage, false))], [
			{ layouts: [SessionLayoutMode.Stacked, SessionLayoutMode.SideBySide, SessionLayoutMode.EditorOnly, SessionLayoutMode.ChatOnly], layout: SessionLayoutMode.SideBySide, splitLayout: SessionLayoutMode.SideBySide, inputOnly: true, terminalPosition: SessionTerminalPosition.FullWidth },
			{ layouts: [SessionLayoutMode.ChatOnly], layout: SessionLayoutMode.ChatOnly, splitLayout: SessionLayoutMode.SideBySide, inputOnly: true, terminalPosition: SessionTerminalPosition.FullWidth },
		]);
	});

	test('loads what profiles stored under the keys chat windows always used, and leaves the keys of docked windows as they are', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const store = (key: string, value: string | boolean) => storage.store(`sessions.chatWindow.test.${key}`, value, StorageScope.PROFILE, StorageTarget.USER);
		store('layout', SessionLayoutMode.Stacked);
		store('inputOnly', false);
		store('terminalPosition', SessionTerminalPosition.UnderChat);
		store('docked', true);
		store('dockedLayout', SessionLayoutMode.EditorOnly);
		store('dockedSize', JSON.stringify({ width: 400, height: 300 }));

		const state = createState(storage);
		const loaded = snapshot(state);
		state.setLayout(SessionLayoutMode.EditorOnly);
		state.setTerminalPosition(SessionTerminalPosition.UnderEditor);

		const read = (key: string) => storage.get(`sessions.chatWindow.test.${key}`, StorageScope.PROFILE);
		assert.deepStrictEqual({ loaded, stored: ['layout', 'inputOnly', 'terminalPosition', 'docked', 'dockedLayout', 'dockedSize'].map(read) }, {
			loaded: { layouts: state.layouts, layout: SessionLayoutMode.Stacked, splitLayout: SessionLayoutMode.Stacked, inputOnly: false, terminalPosition: SessionTerminalPosition.UnderChat },
			stored: [SessionLayoutMode.EditorOnly, 'false', SessionTerminalPosition.UnderEditor, 'true', SessionLayoutMode.EditorOnly, JSON.stringify({ width: 400, height: 300 })],
		});
	});

	test('opens as its chat is remembered rather than as its kind was left, and remembers what the user chooses for the chat', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const first = createState(storage);
		first.setLayout(SessionLayoutMode.Stacked);
		first.setInputOnly(false);
		// Another chat window of the kind leaves the kind's default elsewhere.
		new ChatWindowDefaults(kind, storage).setLayout(SessionLayoutMode.EditorOnly);

		assert.deepStrictEqual(snapshot(createState(storage)), {
			layouts: first.layouts, layout: SessionLayoutMode.Stacked, splitLayout: SessionLayoutMode.Stacked, inputOnly: false, terminalPosition: SessionTerminalPosition.FullWidth,
		});
	});

	test('with only the chat or only the editor area shown, flips how both show next, which the chat remembers and showing both uses', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const layouts = new ChatWindowChatLayouts(storage);
		const state = createState(storage, true, layouts);
		state.setLayout(SessionLayoutMode.ChatOnly);
		state.setSplitLayout(SessionLayoutMode.Stacked);
		const whileChatOnly = { layout: state.layout.get(), splitLayout: state.splitLayout.get(), remembered: layouts.get(chat) };
		state.showBoth();
		assert.deepStrictEqual({ whileChatOnly, afterShowBoth: state.layout.get() }, {
			whileChatOnly: { layout: SessionLayoutMode.ChatOnly, splitLayout: SessionLayoutMode.Stacked, remembered: { mode: SessionLayoutMode.ChatOnly, splitLayout: SessionLayoutMode.Stacked, inputOnly: true } },
			afterShowBoth: SessionLayoutMode.Stacked,
		});
	});

	test('never remembers a layout without an editor area, and shows a remembered layout it cannot show as the chat only', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const layouts = new ChatWindowChatLayouts(storage);
		layouts.set(chat, { mode: SessionLayoutMode.EditorOnly, splitLayout: SessionLayoutMode.SideBySide, inputOnly: true });
		const state = createState(storage, false, layouts);
		state.setLayout(SessionLayoutMode.Stacked);
		state.setInputOnly(false);
		assert.deepStrictEqual({ layout: state.layout.get(), remembered: layouts.get(chat), kindLayout: new ChatWindowDefaults(kind, storage).getLayout() }, {
			layout: SessionLayoutMode.ChatOnly,
			remembered: { mode: SessionLayoutMode.EditorOnly, splitLayout: SessionLayoutMode.SideBySide, inputOnly: true },
			kindLayout: undefined,
		});
	});

	test('remembers the layouts of the chats changed last, and ignores what it cannot read', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const layouts = new ChatWindowChatLayouts(storage);
		const layout: IRememberedChatLayout = { mode: SessionLayoutMode.Stacked, splitLayout: SessionLayoutMode.Stacked, inputOnly: false };
		for (let i = 0; i < 205; i++) {
			layouts.set(URI.parse(`test:/chat/${i}`), layout);
		}
		const kept = [0, 4, 5, 204].map(i => !!layouts.get(URI.parse(`test:/chat/${i}`)));
		storage.store(ChatWindowChatLayouts.STORAGE_KEY, JSON.stringify([['test:/chat/x', { mode: 'unknown' }], 'invalid']), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		assert.deepStrictEqual({ kept, invalid: layouts.get(URI.parse('test:/chat/x')) }, { kept: [false, false, true, true], invalid: undefined });
	});
});
