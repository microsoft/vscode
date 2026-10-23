/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ChatWindowLayout, IChatWindowKind } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { ChatWindowDefaults, ChatWindowState } from '../../browser/chatWindowState.js';

suite('ChatWindowState', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const kind: IChatWindowKind = { id: 'test', title: 'Test' };

	function createState(storageService: InMemoryStorageService, docked: boolean, hasEditor: boolean): ChatWindowState {
		return new ChatWindowState(kind, docked, hasEditor, new ChatWindowDefaults(kind, storageService));
	}

	test('offers the layouts that fit where it shows, and opens with the layout last chosen there', () => {
		const storageService = disposables.add(new InMemoryStorageService());

		const window = createState(storageService, false, true);
		const firstWindowLayout = window.layout.get();
		window.setLayout(ChatWindowLayout.SideBySide);
		window.setLayout(ChatWindowLayout.ChatOnly);
		const splitWhileChatOnly = window.splitLayout.get();
		window.showBoth();

		const docked = createState(storageService, true, true);
		docked.setLayout(ChatWindowLayout.SideBySide);
		const dockedAfterSideBySide = docked.layout.get();
		docked.setLayout(ChatWindowLayout.EditorOnly);

		assert.deepStrictEqual({
			layouts: { window: window.layouts, docked: docked.layouts, withoutEditor: createState(storageService, false, false).layouts },
			firstWindowLayout,
			splitWhileChatOnly,
			afterShowBoth: window.layout.get(),
			dockedAfterSideBySide,
			reopened: { window: createState(storageService, false, true).layout.get(), docked: createState(storageService, true, true).layout.get() },
		}, {
			layouts: {
				window: [ChatWindowLayout.EditorAboveChat, ChatWindowLayout.SideBySide, ChatWindowLayout.EditorOnly, ChatWindowLayout.ChatOnly],
				docked: [ChatWindowLayout.EditorAboveChat, ChatWindowLayout.EditorOnly, ChatWindowLayout.ChatOnly],
				withoutEditor: [ChatWindowLayout.ChatOnly],
			},
			firstWindowLayout: ChatWindowLayout.EditorAboveChat,
			splitWhileChatOnly: ChatWindowLayout.SideBySide,
			afterShowBoth: ChatWindowLayout.SideBySide,
			dockedAfterSideBySide: ChatWindowLayout.EditorAboveChat,
			reopened: { window: ChatWindowLayout.SideBySide, docked: ChatWindowLayout.EditorOnly },
		});
	});

	test('opens with the default layout of its kind until one is chosen, where the layout is available', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const sideBySideKind: IChatWindowKind = { id: 'sideBySide', title: 'Side by Side', defaultLayout: ChatWindowLayout.SideBySide };
		const create = (docked: boolean) => new ChatWindowState(sideBySideKind, docked, true, new ChatWindowDefaults(sideBySideKind, storageService));

		const before = { window: create(false).layout.get(), docked: create(true).layout.get() };
		create(false).setLayout(ChatWindowLayout.EditorOnly);

		assert.deepStrictEqual({ before, after: create(false).layout.get() }, {
			before: { window: ChatWindowLayout.SideBySide, docked: ChatWindowLayout.EditorAboveChat },
			after: ChatWindowLayout.EditorOnly,
		});
	});

	test('keeps the chat to its input when docked, and remembers it otherwise', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store('sessions.chatWindow.test.dockedLayout', ChatWindowLayout.SideBySide, StorageScope.PROFILE, StorageTarget.USER);

		const window = createState(storageService, false, true);
		const initiallyInputOnly = window.inputOnly.get();
		window.setInputOnly(false);
		const docked = createState(storageService, true, true);
		docked.setInputOnly(false);

		assert.deepStrictEqual({
			initiallyInputOnly,
			reopenedInputOnly: createState(storageService, false, true).inputOnly.get(),
			docked: { inputOnly: docked.inputOnly.get(), layoutFromSideBySide: docked.layout.get() },
		}, {
			initiallyInputOnly: true,
			reopenedInputOnly: false,
			docked: { inputOnly: true, layoutFromSideBySide: ChatWindowLayout.EditorAboveChat },
		});
	});
});
