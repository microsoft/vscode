/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, isISubmenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionLayoutMode } from '../../../../common/sessionGridLayout/sessionGridLayout.js';
import { CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID, ChatWindowContext, ChatWindowHasEditorAreaContext, IChatWindow, IChatWindowKind, IChatWindowService, isChatWindowHandle, SessionLayoutModeContext, SessionSplitLayout } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { chatWindowLayoutModeChoices, TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID, TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID, TOGGLE_CHAT_WINDOW_CONVERSATION_COMMAND_ID } from '../../browser/chatWindowLayoutActions.js';
import { ChatWindowDefaults, ChatWindowState } from '../../browser/chatWindowState.js';

suite('Chat window layout actions', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const kind: IChatWindowKind = { id: 'test', title: 'Test', defaultLayout: SessionLayoutMode.SideBySide };

	function createWindow(windowId: number): { window: IChatWindow; state: ChatWindowState } {
		const state = new ChatWindowState(kind, true, new ChatWindowDefaults(kind, disposables.add(new InMemoryStorageService())));
		const window = new class extends mock<IChatWindow>() {
			override readonly windowId = windowId;
			override readonly handle = { chatWindowId: windowId };
			override readonly layout = state.layout;
			override readonly splitLayout = state.splitLayout;
			override readonly layouts = state.layouts;
			override readonly inputOnly = state.inputOnly;
			override setLayout(layout: SessionLayoutMode) { state.setLayout(layout); }
			override setSplitLayout(splitLayout: SessionSplitLayout) { state.setSplitLayout(splitLayout); }
			override toggleConversation() {
				if (state.layout.get() === SessionLayoutMode.Stacked) {
					state.setInputOnly(!state.inputOnly.get());
				}
			}
		}();
		return { window, state };
	}

	function createEnvironment() {
		const a = createWindow(1);
		const b = createWindow(2);
		const activeWindowId = { value: 1 };
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
			override resolveWindow(context: unknown): IChatWindow | undefined {
				const windowId = isChatWindowHandle(context) ? context.chatWindowId : activeWindowId.value;
				return [a.window, b.window].find(window => window.windowId === windowId);
			}
		}());
		const run = (id: string, context?: unknown) => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor, context));
		return { a, b, run };
	}

	test('an action invoked from a chat window acts on that window, and without one on the window that is active', () => {
		const { a, b, run } = createEnvironment();
		const stacked = chatWindowLayoutModeChoices.find(choice => choice.mode === SessionLayoutMode.Stacked)!.id;
		const editorOnly = chatWindowLayoutModeChoices.find(choice => choice.mode === SessionLayoutMode.EditorOnly)!.id;

		run(stacked, b.window.handle);
		run(editorOnly);
		run(TOGGLE_CHAT_WINDOW_CONVERSATION_COMMAND_ID, b.window.handle);
		run(TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID, { chatWindowId: 99 });

		assert.deepStrictEqual({ a: [a.state.layout.get(), a.state.inputOnly.get()], b: [b.state.layout.get(), b.state.inputOnly.get()] }, {
			a: [SessionLayoutMode.EditorOnly, true],
			b: [SessionLayoutMode.Stacked, false],
		});
	});

	test('Show Chat and Show Editor hide one of the two, never the last one shown, and showing the other returns to how both last showed', () => {
		const { a, run } = createEnvironment();
		const steps: SessionLayoutMode[] = [];
		const step = (id: string) => {
			run(id, a.window.handle);
			steps.push(a.state.layout.get());
		};
		step(CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID);
		step(TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID);
		step(CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID);
		step(TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID);
		step(CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID);
		step(TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID);
		assert.deepStrictEqual(steps, [
			SessionLayoutMode.ChatOnly,
			SessionLayoutMode.ChatOnly,
			SessionLayoutMode.SideBySide,
			SessionLayoutMode.EditorOnly,
			SessionLayoutMode.EditorOnly,
			SessionLayoutMode.SideBySide,
		]);
	});

	test('Stacked changes the arrangement while both show, and only how both show next while one shows', () => {
		const { a, run } = createEnvironment();
		run(TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID, a.window.handle);
		const whileBoth = a.state.layout.get();
		a.state.setLayout(SessionLayoutMode.ChatOnly);
		run(TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID, a.window.handle);
		const whileChatOnly = [a.state.layout.get(), a.state.splitLayout.get()];
		run(CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID, a.window.handle);
		assert.deepStrictEqual({ whileBoth, whileChatOnly, shownAgain: a.state.layout.get() }, {
			whileBoth: SessionLayoutMode.Stacked,
			whileChatOnly: [SessionLayoutMode.ChatOnly, SessionLayoutMode.SideBySide],
			shownAgain: SessionLayoutMode.SideBySide,
		});
	});

	test('the Layout menu of a chat window shows in its title bar in every mode, reads its layout, and never shows in the main window', () => {
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
		const items = MenuRegistry.getMenuItems(Menus.TitleBarRightLayout).filter(isISubmenuItem).filter(item => item.submenu === Menus.ChatWindowLayout);
		const shown = () => items.filter(item => contextKeyService.contextMatchesRules(item.when)).map(item => typeof item.title === 'string' ? item.title : item.title.value);
		const mainWindow = shown();
		ChatWindowContext.bindTo(contextKeyService).set('test');
		ChatWindowHasEditorAreaContext.bindTo(contextKeyService).set(true);
		const layoutContext = SessionLayoutModeContext.bindTo(contextKeyService);
		const perMode = chatWindowLayoutModeChoices.map(choice => {
			layoutContext.set(choice.mode);
			return shown();
		});
		// The Layout menu itself, per mode, in its order: the toggles of the chat and the editor area and the arrangement, not the modes.
		const layoutMenu = chatWindowLayoutModeChoices.map(choice => {
			layoutContext.set(choice.mode);
			return MenuRegistry.getMenuItems(Menus.ChatWindowLayout).filter(isIMenuItem).filter(item => contextKeyService.contextMatchesRules(item.when))
				.sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || (a.order ?? 0) - (b.order ?? 0))
				.map(item => typeof item.command.title === 'string' ? item.command.title : item.command.title.value);
		});
		assert.deepStrictEqual({ mainWindow, perMode, layoutMenu }, {
			mainWindow: [],
			perMode: [['Layout: Chat Only'], ['Layout: Editor Only'], ['Layout: Stacked'], ['Layout: Side by Side']],
			layoutMenu: [
				['Show Chat', 'Show Editor', 'Stacked'],
				['Show Chat', 'Show Editor', 'Stacked'],
				['Show Chat', 'Show Editor', 'Stacked'],
				['Show Chat', 'Show Editor', 'Stacked'],
			],
		});
	});
});
