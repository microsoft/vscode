/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import {
	KeepSessionAction2,
	UndoSessionAction2,
	UndoAndCloseSessionAction2,
	CancelSessionAction,
	ContinueInlineChatInChatViewAction,
	RephraseInlineChatSessionAction,
} from '../../browser/inlineChatActions.js';
import { registerChatExecuteActions } from '../../../chat/browser/actions/chatExecuteActions.js';
import { registerChatContextActions } from '../../../chat/browser/actions/chatContextActions.js';
import { registerChatToolActions } from '../../../chat/browser/actions/chatToolActions.js';

/**
 * The inline chat zone widget hosts four menus: `ChatEditorInlineExecute`,
 * `ChatEditorInlineInputSide`, `ChatInput`, and `ChatExecute`. The latter
 * two are shared with the regular chat widget, which evolves frequently.
 *
 * These snapshot tests guard against accidental additions, removals, or `when`
 * changes that would silently affect the inline chat zone widget toolbars.
 * When a snapshot fails, double-check that the change is intentional for the
 * inline chat zone widget specifically and update the snapshot.
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
		disposables.add(registerAction2(UndoSessionAction2));
		disposables.add(registerAction2(UndoAndCloseSessionAction2));
		disposables.add(registerAction2(CancelSessionAction));
		disposables.add(registerAction2(ContinueInlineChatInChatViewAction));
		disposables.add(registerAction2(RephraseInlineChatSessionAction));
	});

	suiteTeardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function snapshot(menuId: MenuId): Array<{ id: string; group: string; order: number; when: string }> {
		return MenuRegistry.getMenuItems(menuId)
			.filter(isIMenuItem)
			.map(item => ({
				id: item.command.id,
				group: item.group ?? '',
				order: item.order ?? 0,
				when: item.when?.serialize() ?? '',
			}))
			.sort((a, b) => a.id.localeCompare(b.id) || a.group.localeCompare(b.group) || a.order - b.order);
	}

	test('ChatEditorInlineExecute', () => {
		assert.deepStrictEqual(snapshot(MenuId.ChatEditorInlineExecute), [
			{
				id: 'inlineChat2.cancel',
				group: 'navigation',
				order: 100,
				when: 'chatEdits.isRequestInProgress && inlineChatHasEditsAgent && config.inlineChat.renderMode == \'hover\' || chatEdits.isRequestInProgress && inlineChatHasNotebookAgent && activeEditor == \'workbench.editor.notebook\' && config.inlineChat.renderMode == \'hover\'',
			},
			{
				id: 'inlineChat2.close',
				group: 'navigation',
				order: 100,
				when: 'inlineChatHasEditsAgent && config.inlineChat.renderMode != \'hover\' || inlineChatHasEditsAgent && inlineChatPendingConfirmation && config.inlineChat.renderMode == \'hover\' || inlineChatHasNotebookAgent && activeEditor == \'workbench.editor.notebook\' && config.inlineChat.renderMode != \'hover\' || inlineChatHasEditsAgent && !chatEdits.hasEditorModifications && !chatEdits.isRequestInProgress && config.inlineChat.renderMode == \'hover\' || inlineChatHasNotebookAgent && inlineChatPendingConfirmation && activeEditor == \'workbench.editor.notebook\' && config.inlineChat.renderMode == \'hover\' || inlineChatHasNotebookAgent && !chatEdits.hasEditorModifications && !chatEdits.isRequestInProgress && activeEditor == \'workbench.editor.notebook\' && config.inlineChat.renderMode == \'hover\'',
			},
			{
				id: 'inlineChat2.continueInChat',
				group: 'navigation',
				order: 2,
				when: 'inlineChatHasEditsAgent && inlineChatTerminated || inlineChatHasNotebookAgent && inlineChatTerminated && activeEditor == \'workbench.editor.notebook\'',
			},
			{
				id: 'inlineChat2.keep',
				group: 'navigation',
				order: 4,
				when: 'chatEdits.hasEditorModifications && inlineChatHasEditsAgent && !chatEdits.isRequestInProgress && !chatInputHasText || chatEdits.hasEditorModifications && inlineChatHasNotebookAgent && !chatEdits.isRequestInProgress && !chatInputHasText && activeEditor == \'workbench.editor.notebook\'',
			},
			{
				id: 'inlineChat2.rephrase',
				group: 'navigation',
				order: 1,
				when: 'inlineChatHasEditsAgent && inlineChatTerminated || inlineChatHasNotebookAgent && inlineChatTerminated && activeEditor == \'workbench.editor.notebook\'',
			},
			{
				id: 'inlineChat2.undo',
				group: 'navigation',
				order: 100,
				when: 'chatEdits.hasEditorModifications && inlineChatHasEditsAgent && !chatEdits.isRequestInProgress && config.inlineChat.renderMode == \'hover\' || chatEdits.hasEditorModifications && inlineChatHasNotebookAgent && !chatEdits.isRequestInProgress && activeEditor == \'workbench.editor.notebook\' && config.inlineChat.renderMode == \'hover\'',
			},
			{
				id: 'workbench.action.chat.cancel',
				group: 'navigation',
				order: 4,
				when: 'chatEdits.isRequestInProgress && !chatEdits.isGlobalEditingSession && config.inlineChat.renderMode != \'hover\'',
			},
			{
				id: 'workbench.action.chat.submit',
				group: 'navigation',
				order: 4,
				when: 'chatInputHasText && !chatSessionHasActiveRequest && chatAgentKind == \'ask\' || !chatEdits.hasEditorModifications && !chatSessionHasActiveRequest && chatAgentKind == \'ask\'',
			},
		]);
	});

	test('ChatEditorInlineInputSide', () => {
		// This menu is inline-chat-zone-widget specific. Any item appearing
		// here must be deliberately scoped to the inline chat zone widget.
		assert.deepStrictEqual(snapshot(MenuId.ChatEditorInlineInputSide), []);
	});

	test('ChatInput', () => {
		// This menu is shared with the regular chat widget. The inline chat
		// zone widget renders these as the attachment/picker row below the
		// input. Any new item here will appear in inline chat too.
		assert.deepStrictEqual(snapshot(MenuId.ChatInput), [
			{
				id: 'workbench.action.chat.attachContext',
				group: 'navigation',
				order: -1,
				when: 'agentSupportsAttachments && !quickChatHasFocus && chatLocation == \'panel\' || !lockedToCodingAgent && !quickChatHasFocus && chatLocation == \'panel\'',
			},
			{
				id: 'workbench.action.chat.attachContext',
				group: 'navigation',
				order: 2,
				when: 'agentSupportsAttachments && inlineChatHasEditsAgent && !quickChatHasFocus && chatLocation == \'editor\' || inlineChatHasEditsAgent && !lockedToCodingAgent && !quickChatHasFocus && chatLocation == \'editor\' || agentSupportsAttachments && inlineChatHasNotebookAgent && !quickChatHasFocus && activeEditor == \'workbench.editor.notebook\' && chatLocation == \'editor\' || inlineChatHasNotebookAgent && !lockedToCodingAgent && !quickChatHasFocus && activeEditor == \'workbench.editor.notebook\' && chatLocation == \'editor\'',
			},
			{
				id: 'workbench.action.chat.chatSessionPrimaryPicker',
				group: 'navigation',
				order: 4,
				when: 'chatSessionHasModels && lockedToCodingAgent || chatSessionHasModels && inAgentSessionsWelcome && chatSessionType != \'local\'',
			},
			{
				id: 'workbench.action.chat.configureTools',
				group: 'navigation',
				order: 100,
				when: '!lockedToCodingAgent && chatAgentKind == \'agent\'',
			},
			{
				id: 'workbench.action.chat.openModelPicker',
				group: 'navigation',
				order: 3,
				when: 'chatSessionHasTargetedModels && chatLocation == \'editor\' || chatSessionHasTargetedModels && chatLocation == \'notebook\' || chatSessionHasTargetedModels && chatLocation == \'panel\' || chatSessionHasTargetedModels && chatLocation == \'terminal\' || chatSessionHasTargetedModels && !inAgentSessionsWelcome && chatLocation == \'editor\' || chatSessionHasTargetedModels && !inAgentSessionsWelcome && chatLocation == \'notebook\' || chatSessionHasTargetedModels && !inAgentSessionsWelcome && chatLocation == \'panel\' || chatSessionHasTargetedModels && !inAgentSessionsWelcome && chatLocation == \'terminal\' || chatSessionHasTargetedModels && !lockedToCodingAgent && chatLocation == \'editor\' || chatSessionHasTargetedModels && !lockedToCodingAgent && chatLocation == \'notebook\' || chatSessionHasTargetedModels && !lockedToCodingAgent && chatLocation == \'panel\' || chatSessionHasTargetedModels && !lockedToCodingAgent && chatLocation == \'terminal\' || chatSessionHasTargetedModels && chatLocation == \'editor\' && chatSessionType == \'local\' || chatSessionHasTargetedModels && chatLocation == \'notebook\' && chatSessionType == \'local\' || chatSessionHasTargetedModels && chatLocation == \'panel\' && chatSessionType == \'local\' || chatSessionHasTargetedModels && chatLocation == \'terminal\' && chatSessionType == \'local\' || !inAgentSessionsWelcome && !lockedToCodingAgent && chatLocation == \'editor\' || !inAgentSessionsWelcome && !lockedToCodingAgent && chatLocation == \'notebook\' || !inAgentSessionsWelcome && !lockedToCodingAgent && chatLocation == \'panel\' || !inAgentSessionsWelcome && !lockedToCodingAgent && chatLocation == \'terminal\' || !lockedToCodingAgent && chatLocation == \'editor\' && chatSessionType == \'local\' || !lockedToCodingAgent && chatLocation == \'notebook\' && chatSessionType == \'local\' || !lockedToCodingAgent && chatLocation == \'panel\' && chatSessionType == \'local\' || !lockedToCodingAgent && chatLocation == \'terminal\' && chatSessionType == \'local\'',
			},
			{
				id: 'workbench.action.chat.openModePicker',
				group: 'navigation',
				order: 1,
				when: 'chatIsEnabled && chatSessionHasCustomAgentTarget && !quickChatHasFocus && chatLocation == \'panel\' || chatIsEnabled && chatSessionHasCustomAgentTarget && !inAgentSessionsWelcome && !quickChatHasFocus && chatLocation == \'panel\' || chatIsEnabled && chatSessionHasCustomAgentTarget && !lockedToCodingAgent && !quickChatHasFocus && chatLocation == \'panel\' || chatIsEnabled && chatSessionHasCustomAgentTarget && !quickChatHasFocus && chatLocation == \'panel\' && chatSessionType == \'local\' || chatIsEnabled && !inAgentSessionsWelcome && !lockedToCodingAgent && !quickChatHasFocus && chatLocation == \'panel\' || chatIsEnabled && !lockedToCodingAgent && !quickChatHasFocus && chatLocation == \'panel\' && chatSessionType == \'local\'',
			},
			{
				id: 'workbench.action.chat.openSessionTargetPicker',
				group: 'navigation',
				order: 0,
				when: 'chatIsEnabled && chatSessionIsEmpty && isSessionsWindow && !quickChatHasFocus && chatLocation == \'panel\'',
			},
			{
				id: 'workbench.action.chat.openWorkspacePicker',
				group: 'navigation',
				order: 0.6,
				when: 'inAgentSessionsWelcome && isSessionsWindow && chatSessionType == \'local\'',
			},
		]);
	});

	test('ChatExecute', () => {
		// This menu is shared with the regular chat widget. The inline chat
		// zone widget exposes it as the execute toolbar.
		assert.deepStrictEqual(snapshot(MenuId.ChatExecute), [
			{
				id: 'workbench.action.chat.attachContext',
				group: 'navigation',
				order: -1,
				when: 'agentSupportsAttachments && quickChatHasFocus || quickChatHasFocus && !lockedToCodingAgent',
			},
			{
				id: 'workbench.action.chat.cancel',
				group: 'navigation',
				order: 4,
				when: 'chatSessionHasActiveRequest && !chatRemoteJobCreating && !chatSessionCurrentlyEditing',
			},
			{
				id: 'workbench.action.chat.submit',
				group: 'navigation',
				order: 4,
				when: '!chatSessionHasActiveRequest && !withinEditSessionDiff && chatAgentKind == \'ask\'',
			},
			{
				id: 'workbench.action.edits.submit',
				group: 'navigation',
				order: 4,
				when: '!chatSessionHasActiveRequest && chatAgentKind != \'ask\' && chatEditingSentRequest != \'q\' && chatEditingSentRequest != \'st\' || chatEditingSentRequest == \'s\' && chatAgentKind != \'ask\' && chatEditingSentRequest != \'q\' && chatEditingSentRequest != \'st\'',
			},
		]);
	});
});
