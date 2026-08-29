/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyValue, IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeepSessionAction2, UndoAndCloseSessionAction2, CancelSessionAction, ContinueInlineChatInChatViewAction, RephraseInlineChatSessionAction, } from '../../browser/inlineChatActions.js';
import { registerChatExecuteActions } from '../../../chat/browser/actions/chatExecuteActions.js';
import { registerChatContextActions } from '../../../chat/browser/actions/chatContextActions.js';
import { registerChatToolActions } from '../../../chat/browser/actions/chatToolActions.js';

/**
 * The inline chat zone widget hosts four menus: `ChatEditorInlineExecute`,
 * `ChatEditorInlineInputSide`, `ChatInput`, and `ChatExecute`. The latter
 * two are shared with the regular chat widget, which evolves frequently.
 *
 * These tests evaluate the `when` clauses of menu items against faked
 * inline chat context keys. They guard against regressions where commands
 * from the normal chat panel accidentally become visible in inline chat.
 * When a test fails, double-check that the change is intentional for the
 * inline chat zone widget specifically and update the expected ids.
 */
suite('Inline chat zone widget — menu contributions', function () {

	const disposables = new DisposableStore();

	suiteSetup(() => {
		// Register every action whose menu items can appear in the inline chat
		// zone widget. We only call the public registration helpers so that
		// adding a new action to one of those helpers will surface here.
		disposables.add(registerChatExecuteActions());
		disposables.add(registerChatContextActions());
		disposables.add(registerChatToolActions());

		disposables.add(registerAction2(KeepSessionAction2));
		disposables.add(registerAction2(UndoAndCloseSessionAction2));
		disposables.add(registerAction2(CancelSessionAction));
		disposables.add(registerAction2(ContinueInlineChatInChatViewAction));
		disposables.add(registerAction2(RephraseInlineChatSessionAction));
	});

	suiteTeardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Base context keys for the inline chat zone widget in an editor.
	 * Simulates a typical inline chat state: `chatLocation` is `editor`,
	 * the inline chat agent is available, and `quickChatHasFocus` is false.
	 */
	const inlineChatBaseContext: Record<string, ContextKeyValue> = {
		// inline chat is in an editor, not a panel
		'chatLocation': 'editor',
		// the inline chat agent is available
		'inlineChatHasEditsAgent': true,
		// NOT in quick chat
		'quickChatHasFocus': false,
		// NOT in global editing session (this is inline chat, not panel edits)
		'chatEdits.isGlobalEditingSession': false,
		// NOT locked to coding agent
		'lockedToCodingAgent': false,
		// NOT in sessions window
		'isSessionsWindow': false,
		// chat is enabled
		'chatIsEnabled': true,
		// mode is 'ask'
		'chatAgentKind': 'ask',
	};

	function createContext(overrides: Record<string, ContextKeyValue> = {}): IContext {
		const values: Record<string, ContextKeyValue> = { ...inlineChatBaseContext, ...overrides };
		return { getValue: <T extends ContextKeyValue>(key: string): T | undefined => values[key] as T | undefined };
	}

	function visibleIds(menuId: MenuId, ctx: IContext): string[] {
		return MenuRegistry.getMenuItems(menuId)
			.filter(isIMenuItem)
			.filter(item => !item.when || item.when.evaluate(ctx))
			.map(item => item.command.id)
			.sort();
	}

	// --- ChatEditorInlineExecute ---

	test('ChatEditorInlineExecute — idle, user has typed text', () => {
		const ctx = createContext({
			'chatInputHasText': true,
			'chatSessionHasActiveRequest': false,
			'chatEdits.isRequestInProgress': false,
			'chatEdits.hasEditorModifications': false,
		});
		assert.deepStrictEqual(visibleIds(MenuId.ChatEditorInlineExecute, ctx), [
			'inlineChat2.close',
			'workbench.action.chat.submit',
		].sort());
	});

	test('ChatEditorInlineExecute — request in progress', () => {
		const ctx = createContext({
			'chatEdits.isRequestInProgress': true,
			'chatSessionHasActiveRequest': true,
		});
		assert.deepStrictEqual(visibleIds(MenuId.ChatEditorInlineExecute, ctx), [
			'inlineChat2.close',
			'workbench.action.chat.cancel',
		].sort());
	});

	test('ChatEditorInlineExecute — terminated', () => {
		const ctx = createContext({
			'inlineChatTerminated': true,
			'chatEdits.hasEditorModifications': false,
			'chatEdits.isRequestInProgress': false,
			'chatSessionHasActiveRequest': false,
		});
		assert.deepStrictEqual(visibleIds(MenuId.ChatEditorInlineExecute, ctx), [
			'inlineChat2.close',
			'inlineChat2.continueInChat',
			'inlineChat2.rephrase',
			'workbench.action.chat.submit',
		].sort());
	});

	// --- ChatEditorInlineInputSide ---

	test('ChatEditorInlineInputSide — always empty', () => {
		const ctx = createContext();
		assert.deepStrictEqual(visibleIds(MenuId.ChatEditorInlineInputSide, ctx), []);
	});

	// --- ChatInput (shared with panel) ---

	test('ChatInput — inline chat context must NOT show panel-only items', () => {
		const ctx = createContext({
			'agentSupportsAttachments': true,
		});
		const ids = visibleIds(MenuId.ChatInput, ctx);

		// Panel-only commands must never appear in inline chat (chatLocation == 'editor')
		const panelOnlyCommands = [
			'workbench.action.chat.openModePicker',
			'workbench.action.chat.openSessionTargetPicker',
			'workbench.action.chat.openWorkspacePicker',
			'workbench.action.chat.chatSessionPrimaryPicker',
		];
		for (const cmd of panelOnlyCommands) {
			assert.ok(!ids.includes(cmd), `panel-only command "${cmd}" should NOT appear in inline chat`);
		}

		// The attach context action should be present for inline chat
		assert.ok(ids.includes('workbench.action.chat.attachContext'), 'attachContext should appear in inline chat');
	});

	test('ChatInput — panel context for comparison', () => {
		const ctx = createContext({
			'chatLocation': 'panel',
			'agentSupportsAttachments': true,
			'chatIsEnabled': true,
			'chatSessionHasCustomAgentTarget': true,
		});
		const ids = visibleIds(MenuId.ChatInput, ctx);

		// In the panel, mode picker and attach context should appear
		assert.ok(ids.includes('workbench.action.chat.attachContext'), 'attachContext should appear in panel');
		assert.ok(ids.includes('workbench.action.chat.openModePicker'), 'openModePicker should appear in panel');
	});

	// --- ChatExecute (shared with panel) ---

	test('ChatExecute — inline chat idle with ask mode', () => {
		const ctx = createContext({
			'chatSessionHasActiveRequest': false,
			'withinEditSessionDiff': false,
		});
		const ids = visibleIds(MenuId.ChatExecute, ctx);
		assert.ok(ids.includes('workbench.action.chat.submit'), 'submit should appear');
		assert.ok(!ids.includes('workbench.action.chat.cancel'), 'cancel should NOT appear when idle');
		assert.ok(!ids.includes('workbench.action.edits.submit'), 'edits.submit should NOT appear in ask mode');
	});

	test('ChatExecute — inline chat request in progress', () => {
		const ctx = createContext({
			'chatSessionHasActiveRequest': true,
			'chatSessionCurrentlyEditing': false,
			'chatRemoteJobCreating': false,
		});
		const ids = visibleIds(MenuId.ChatExecute, ctx);
		assert.ok(ids.includes('workbench.action.chat.cancel'), 'cancel should appear during request');
		assert.ok(!ids.includes('workbench.action.chat.submit'), 'submit should NOT appear during request');
	});

	test('ChatExecute — quick chat items do NOT appear in inline chat', () => {
		// Quick chat specific items (those gated on quickChatHasFocus) must not appear
		const ctx = createContext({
			'quickChatHasFocus': false,
			'chatSessionHasActiveRequest': false,
		});
		const ids = visibleIds(MenuId.ChatExecute, ctx);
		// The attach context action in ChatExecute is gated on quickChatHasFocus
		assert.ok(!ids.includes('workbench.action.chat.attachContext'),
			'attachContext (quick chat variant) should NOT appear in inline chat');
	});
});
