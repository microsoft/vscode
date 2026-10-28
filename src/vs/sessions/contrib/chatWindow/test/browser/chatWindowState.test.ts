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
import { ChatWindowDefaults, ChatWindowState, createChatWindowRememberedMode, IChatWindowRememberedMode } from '../../browser/chatWindowState.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { Event } from '../../../../../base/common/event.js';
import { SESSIONS_LAYOUT_SCOPE_SETTING } from '../../../../common/chatLayout.js';
import { SessionLayoutModeService } from '../../../../services/layoutMode/browser/sessionLayoutModeService.js';
import { IRememberedLayoutMode, LayoutModeOwnerKind } from '../../../../services/layoutMode/common/sessionLayoutModeService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { makeSession } from '../../../layout/test/browser/layoutControllerTestUtils.js';

suite('ChatWindowState', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const kind: IChatWindowKind = { id: 'test', title: 'Test', defaultLayout: SessionLayoutMode.SideBySide };

	/** What chat windows remember for the chat, in memory, one memory per storage as the layout mode service keeps it. */
	const memories = new WeakMap<IStorageService, { value: IRememberedLayoutMode | undefined }>();
	function createRememberedMode(storage: IStorageService, initial?: IRememberedLayoutMode): IChatWindowRememberedMode & { readonly remembered: IRememberedLayoutMode | undefined } {
		let memory = memories.get(storage);
		if (!memory) {
			memory = { value: initial };
			memories.set(storage, memory);
		}
		const kept = memory;
		return { initial: kept.value, get remembered() { return kept.value; }, set: layout => { kept.value = layout; } };
	}

	function createState(storage: IStorageService, hasEditorArea = true, rememberedMode: IChatWindowRememberedMode = createRememberedMode(storage)): ChatWindowState {
		return new ChatWindowState(kind, hasEditorArea, new ChatWindowDefaults(kind, storage), rememberedMode);
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
		const rememberedMode = createRememberedMode(storage);
		const state = createState(storage, true, rememberedMode);
		state.setLayout(SessionLayoutMode.ChatOnly);
		state.setSplitLayout(SessionLayoutMode.Stacked);
		const whileChatOnly = { layout: state.layout.get(), splitLayout: state.splitLayout.get(), remembered: rememberedMode.remembered };
		state.showBoth();
		assert.deepStrictEqual({ whileChatOnly, afterShowBoth: state.layout.get() }, {
			whileChatOnly: { layout: SessionLayoutMode.ChatOnly, splitLayout: SessionLayoutMode.Stacked, remembered: { mode: SessionLayoutMode.ChatOnly, splitLayout: SessionLayoutMode.Stacked, inputOnly: true } },
			afterShowBoth: SessionLayoutMode.Stacked,
		});
	});

	test('never remembers a layout without an editor area, and shows a remembered layout it cannot show as the chat only', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const rememberedMode = createRememberedMode(storage, { mode: SessionLayoutMode.EditorOnly, splitLayout: SessionLayoutMode.SideBySide, inputOnly: true });
		const state = createState(storage, false, rememberedMode);
		state.setLayout(SessionLayoutMode.Stacked);
		state.setInputOnly(false);
		assert.deepStrictEqual({ layout: state.layout.get(), remembered: rememberedMode.remembered, kindLayout: new ChatWindowDefaults(kind, storage).getLayout() }, {
			layout: SessionLayoutMode.ChatOnly,
			remembered: { mode: SessionLayoutMode.EditorOnly, splitLayout: SessionLayoutMode.SideBySide, inputOnly: true },
			kindLayout: undefined,
		});
	});

	test('a chat opens in a chat window as it last showed in one, else as the main window shows it, and what the user chooses there is remembered for the chat the window shows', () => {
		const storage = disposables.add(new InMemoryStorageService());
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override readonly onDidDeleteChat = Event.None;
			override readonly onDidDeleteSession = Event.None;
			override readonly onDidArchiveSession = Event.None;
			override readonly onDidReplaceSession = Event.None;
		};
		const layoutModeService = disposables.add(new SessionLayoutModeService(storage, new TestConfigurationService({ [SESSIONS_LAYOUT_SCOPE_SETTING]: 'chat' }), new NullLogService(), sessionsManagementService));
		const session = makeSession(URI.parse('test:/session'));
		// The chat the window shows: the session's active chat.
		const shownChat = session.activeChat.get().resource;
		const owner = { sessionResource: session.resource, chatResource: shownChat };
		const stacked: IRememberedLayoutMode = { mode: SessionLayoutMode.Stacked, splitLayout: SessionLayoutMode.Stacked, inputOnly: false };
		const editorOnly: IRememberedLayoutMode = { mode: SessionLayoutMode.EditorOnly, splitLayout: SessionLayoutMode.SideBySide, inputOnly: true };
		// The main window shows the chat stacked.
		layoutModeService.setMainWindowMode(owner, LayoutModeOwnerKind.Existing, stacked);

		const first = createChatWindowRememberedMode(layoutModeService, session, shownChat, constObservable(session));
		const openedAsMainWindow = createState(storage, true, first).layout.get();
		first.set(editorOnly);
		const reopened = createChatWindowRememberedMode(layoutModeService, session, shownChat, constObservable(session)).initial;

		assert.deepStrictEqual({ openedAsMainWindow, chatWindowMode: layoutModeService.getChatWindowMode(owner), reopened, mainWindowAfterReturn: layoutModeService.returnToMainWindow(owner, LayoutModeOwnerKind.Existing) }, {
			openedAsMainWindow: SessionLayoutMode.Stacked,
			chatWindowMode: editorOnly,
			reopened: editorOnly,
			// Where the main window remembers modes per chat, it adopts the chat window's back.
			mainWindowAfterReturn: editorOnly,
		});
	});
});
