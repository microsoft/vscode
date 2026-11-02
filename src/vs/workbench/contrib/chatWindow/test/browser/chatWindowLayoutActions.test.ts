/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { IsSessionsWindowContext, LayoutModeContext } from '../../../../common/contextkeys.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { IChatWindow, IChatWindowService } from '../../browser/chatWindow.js';
import { ChatWindowLayoutCommandsContext, chatWindowLayoutModeChoices, TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID, TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID, TOGGLE_CHAT_WINDOW_CONVERSATION_COMMAND_ID, TOGGLE_CHAT_WINDOW_EDITOR_COMMAND_ID } from '../../browser/chatWindowLayoutActions.js';
import { ChatWindowLayoutMode, ChatWindowSplitLayout } from '../../common/chatWindowLayout.js';
import { ChatWindowDefaults, ChatWindowState } from '../../common/chatWindowState.js';

suite('Chat window layout actions', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createWindow(windowId: number): { window: IChatWindow; state: ChatWindowState } {
		const state = new ChatWindowState(new ChatWindowDefaults(disposables.add(new InMemoryStorageService())));
		const window = new class extends mock<IChatWindow>() {
			override readonly windowId = windowId;
			override readonly layoutMode = state.layoutMode;
			override readonly splitLayout = state.splitLayout;
			override readonly inputOnly = state.inputOnly;
			override setLayoutMode(mode: ChatWindowLayoutMode) { state.setLayoutMode(mode); }
			override setSplitLayout(splitLayout: ChatWindowSplitLayout) { state.setSplitLayout(splitLayout); }
			override toggleConversation() {
				if (state.layoutMode.get() === ChatWindowLayoutMode.Stacked) {
					state.setInputOnly(!state.inputOnly.get());
				}
			}
		}();
		return { window, state };
	}

	function createEnvironment() {
		const a = createWindow(1);
		const b = createWindow(2);
		const active: { window: IChatWindow | undefined } = { window: a.window };
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
			override get activeWindow() { return active.window; }
		}());
		const run = (id: string) => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor));
		return { a, b, active, run };
	}

	test('a command acts on the chat window that has focus, and on none while another window has focus', () => {
		const { a, b, active, run } = createEnvironment();
		const stacked = chatWindowLayoutModeChoices.find(choice => choice.mode === ChatWindowLayoutMode.Stacked)!.id;
		const editorOnly = chatWindowLayoutModeChoices.find(choice => choice.mode === ChatWindowLayoutMode.EditorOnly)!.id;

		active.window = b.window;
		run(stacked);
		run(TOGGLE_CHAT_WINDOW_CONVERSATION_COMMAND_ID);
		active.window = a.window;
		run(editorOnly);
		active.window = undefined;
		run(TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID);

		assert.deepStrictEqual({ a: [a.state.layoutMode.get(), a.state.inputOnly.get()], b: [b.state.layoutMode.get(), b.state.inputOnly.get()] }, {
			a: [ChatWindowLayoutMode.EditorOnly, true],
			b: [ChatWindowLayoutMode.Stacked, false],
		});
	});

	test('Show Chat and Show Editor hide one of the two, never the last one shown, and showing the other returns to how both last showed', () => {
		const { a, run } = createEnvironment();
		const steps: ChatWindowLayoutMode[] = [];
		const step = (id: string) => {
			run(id);
			steps.push(a.state.layoutMode.get());
		};
		step(TOGGLE_CHAT_WINDOW_EDITOR_COMMAND_ID);
		step(TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID);
		step(TOGGLE_CHAT_WINDOW_EDITOR_COMMAND_ID);
		step(TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID);
		step(TOGGLE_CHAT_WINDOW_EDITOR_COMMAND_ID);
		step(TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID);
		assert.deepStrictEqual(steps, [
			ChatWindowLayoutMode.ChatOnly,
			ChatWindowLayoutMode.ChatOnly,
			ChatWindowLayoutMode.SideBySide,
			ChatWindowLayoutMode.EditorOnly,
			ChatWindowLayoutMode.EditorOnly,
			ChatWindowLayoutMode.SideBySide,
		]);
	});

	test('Stacked changes the arrangement while both show, and only how both show next while one shows', () => {
		const { a, run } = createEnvironment();
		run(TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID);
		const whileBoth = a.state.layoutMode.get();
		a.state.setLayoutMode(ChatWindowLayoutMode.ChatOnly);
		run(TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID);
		const whileChatOnly = [a.state.layoutMode.get(), a.state.splitLayout.get()];
		run(TOGGLE_CHAT_WINDOW_EDITOR_COMMAND_ID);
		assert.deepStrictEqual({ whileBoth, whileChatOnly, shownAgain: a.state.layoutMode.get() }, {
			whileBoth: ChatWindowLayoutMode.Stacked,
			whileChatOnly: [ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.SideBySide],
			shownAgain: ChatWindowLayoutMode.SideBySide,
		});
	});

	test('the layout commands apply only in a window with layout modes of the Agents window, while AI features are enabled', () => {
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const matches = (sessionsWindow: boolean, aiEnabled: boolean, layoutMode: string | undefined) => {
			const scoped = disposables.add(contextKeyService.createScoped(document.createElement('div')));
			IsSessionsWindowContext.bindTo(scoped).set(sessionsWindow);
			ChatContextKeys.enabled.bindTo(scoped).set(aiEnabled);
			LayoutModeContext.bindTo(scoped).set(layoutMode);
			return scoped.contextMatchesRules(ChatWindowLayoutCommandsContext);
		};
		assert.deepStrictEqual([
			matches(true, true, ChatWindowLayoutMode.Stacked),
			matches(true, true, undefined),
			matches(true, false, ChatWindowLayoutMode.Stacked),
			matches(false, true, ChatWindowLayoutMode.Stacked),
		], [true, false, false, false]);
	});
});
