/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ChatWindowTerminalPosition, IChatWindowKind } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { SessionLayoutMode } from '../../../../common/sessionLayoutMode.js';
import { IRememberedLayoutMode } from '../../../../services/layoutMode/common/sessionLayoutModeService.js';
import { ChatWindowDefaults, ChatWindowState, IChatWindowRememberedMode } from '../../browser/chatWindowState.js';

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
		window.setLayout(SessionLayoutMode.SideBySide);
		window.setLayout(SessionLayoutMode.ChatOnly);
		const splitWhileChatOnly = window.splitLayout.get();
		window.showBoth();

		const docked = createState(storageService, true, true);
		docked.setLayout(SessionLayoutMode.SideBySide);
		const dockedAfterSideBySide = docked.layout.get();
		docked.setLayout(SessionLayoutMode.EditorOnly);

		assert.deepStrictEqual({
			layouts: { window: window.layouts, docked: docked.layouts, withoutEditor: createState(storageService, false, false).layouts },
			firstWindowLayout,
			splitWhileChatOnly,
			afterShowBoth: window.layout.get(),
			dockedAfterSideBySide,
			reopened: { window: createState(storageService, false, true).layout.get(), docked: createState(storageService, true, true).layout.get() },
		}, {
			layouts: {
				window: [SessionLayoutMode.Stacked, SessionLayoutMode.SideBySide, SessionLayoutMode.EditorOnly, SessionLayoutMode.ChatOnly],
				docked: [SessionLayoutMode.Stacked, SessionLayoutMode.EditorOnly, SessionLayoutMode.ChatOnly],
				withoutEditor: [SessionLayoutMode.ChatOnly],
			},
			firstWindowLayout: SessionLayoutMode.Stacked,
			splitWhileChatOnly: SessionLayoutMode.SideBySide,
			afterShowBoth: SessionLayoutMode.SideBySide,
			dockedAfterSideBySide: SessionLayoutMode.Stacked,
			reopened: { window: SessionLayoutMode.SideBySide, docked: SessionLayoutMode.EditorOnly },
		});
	});

	test('opens with the default layout of its kind until one is chosen, where the layout is available', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const sideBySideKind: IChatWindowKind = { id: 'sideBySide', title: 'Side by Side', defaultLayout: SessionLayoutMode.SideBySide };
		const create = (docked: boolean) => new ChatWindowState(sideBySideKind, docked, true, new ChatWindowDefaults(sideBySideKind, storageService));

		const before = { window: create(false).layout.get(), docked: create(true).layout.get() };
		create(false).setLayout(SessionLayoutMode.EditorOnly);

		assert.deepStrictEqual({ before, after: create(false).layout.get() }, {
			before: { window: SessionLayoutMode.SideBySide, docked: SessionLayoutMode.Stacked },
			after: SessionLayoutMode.EditorOnly,
		});
	});

	test('keeps the chat to its input when docked, and remembers it otherwise', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store('sessions.chatWindow.test.dockedLayout', SessionLayoutMode.SideBySide, StorageScope.PROFILE, StorageTarget.USER);

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
			docked: { inputOnly: true, layoutFromSideBySide: SessionLayoutMode.Stacked },
		});
	});

	test('puts the terminal row across the full width until a position is chosen, and remembers it', () => {
		const storageService = disposables.add(new InMemoryStorageService());

		const window = createState(storageService, false, true);
		const initial = window.terminalPosition.get();
		window.setTerminalPosition(ChatWindowTerminalPosition.UnderChat);

		assert.deepStrictEqual({
			initial,
			chosen: window.terminalPosition.get(),
			reopened: createState(storageService, false, true).terminalPosition.get(),
			otherKind: new ChatWindowState({ id: 'other', title: 'Other' }, false, true, new ChatWindowDefaults({ id: 'other', title: 'Other' }, storageService)).terminalPosition.get(),
		}, {
			initial: ChatWindowTerminalPosition.FullWidth,
			chosen: ChatWindowTerminalPosition.UnderChat,
			reopened: ChatWindowTerminalPosition.UnderChat,
			otherKind: ChatWindowTerminalPosition.FullWidth,
		});
	});

	test('opens as its chat is remembered rather than as its kind was left, and remembers what the user chooses for the chat', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		createState(storageService, false, true).setLayout(SessionLayoutMode.EditorOnly);
		const writes: IRememberedLayoutMode[] = [];
		const remembered = (initial: IRememberedLayoutMode | undefined): IChatWindowRememberedMode => ({ initial, set: mode => writes.push(mode) });
		const sideBySide: IRememberedLayoutMode = { mode: SessionLayoutMode.SideBySide, splitLayout: SessionLayoutMode.SideBySide, inputOnly: false };

		const window = new ChatWindowState(kind, false, true, new ChatWindowDefaults(kind, storageService), remembered(sideBySide));
		const opened = { layout: window.layout.get(), splitLayout: window.splitLayout.get(), inputOnly: window.inputOnly.get() };
		window.setLayout(SessionLayoutMode.ChatOnly);
		window.showBoth();
		window.setLayout(SessionLayoutMode.Stacked);
		window.setInputOnly(true);
		const unremembered = new ChatWindowState(kind, false, true, new ChatWindowDefaults(kind, storageService), remembered(undefined)).layout.get();

		assert.deepStrictEqual({ opened, unremembered, writes }, {
			opened: { layout: SessionLayoutMode.SideBySide, splitLayout: SessionLayoutMode.SideBySide, inputOnly: false },
			// Without a remembered mode, as its kind was last left.
			unremembered: SessionLayoutMode.Stacked,
			writes: [
				{ mode: SessionLayoutMode.ChatOnly, splitLayout: SessionLayoutMode.SideBySide, inputOnly: false },
				{ mode: SessionLayoutMode.SideBySide, splitLayout: SessionLayoutMode.SideBySide, inputOnly: false },
				{ mode: SessionLayoutMode.Stacked, splitLayout: SessionLayoutMode.Stacked, inputOnly: false },
				{ mode: SessionLayoutMode.Stacked, splitLayout: SessionLayoutMode.Stacked, inputOnly: true },
			],
		});
	});

	test('shows a remembered mode it cannot show as the closest it can, without changing what is remembered, and never remembers without an editor', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const writes: IRememberedLayoutMode[] = [];
		const remembered: IChatWindowRememberedMode = { initial: { mode: SessionLayoutMode.SideBySide, splitLayout: SessionLayoutMode.SideBySide, inputOnly: false }, set: mode => writes.push(mode) };

		const docked = new ChatWindowState(kind, true, true, new ChatWindowDefaults(kind, storageService), remembered);
		const dockedOpened = { layout: docked.layout.get(), splitLayout: docked.splitLayout.get(), inputOnly: docked.inputOnly.get() };
		docked.setLayout(SessionLayoutMode.EditorOnly);
		const withoutEditor = new ChatWindowState(kind, false, false, new ChatWindowDefaults(kind, storageService), remembered);
		withoutEditor.setLayout(SessionLayoutMode.ChatOnly);

		assert.deepStrictEqual({ dockedOpened, withoutEditor: withoutEditor.layout.get(), writes }, {
			dockedOpened: { layout: SessionLayoutMode.Stacked, splitLayout: SessionLayoutMode.Stacked, inputOnly: true },
			withoutEditor: SessionLayoutMode.ChatOnly,
			// Docked, what it cannot show stays as it was remembered.
			writes: [{ mode: SessionLayoutMode.EditorOnly, splitLayout: SessionLayoutMode.SideBySide, inputOnly: false }],
		});
	});
});
