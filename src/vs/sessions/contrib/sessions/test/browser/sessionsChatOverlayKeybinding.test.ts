/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeKeybinding } from '../../../../../base/common/keybindings.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { OS } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { EditorAreaFocusContext, IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ASK_QUICK_QUESTION_ACTION_ID, registerQuickChatActions } from '../../../../../workbench/contrib/chat/browser/actions/chatQuickInputActions.js';
import { IsNewChatSessionContext } from '../../../../common/contextkeys.js';
import { ChatComposerOverlayVisibleContext, OPEN_NEW_SESSION_OVERLAY_COMMAND_ID, OPEN_QUICK_CHAT_OVERLAY_COMMAND_ID } from '../../../chat/common/chatComposerOverlay.js';
import '../../browser/views/sessionsViewActions.js';

const NEW_QUICK_CHAT_COMMAND_ID = 'sessionsView.newQuickChat';
const NEW_QUICK_CHAT_CHORD = decodeKeybinding(KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyN), OS)!.getHashCode();
const QUICK_CHAT_OVERLAY_KEYBINDING = decodeKeybinding(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyL, OS)!.getHashCode();
const NEW_SESSION_OVERLAY_KEYBINDING = decodeKeybinding(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyN, OS)!.getHashCode();

registerQuickChatActions();

function context(values: Record<string, boolean>): IContext {
	return { getValue: <T>(key: string) => values[key] as T | undefined };
}

suite('Sessions - Chat overlay keybindings', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps existing composer actions separate from keyboard-only overlays', () => {
		const bindings = KeybindingsRegistry.getDefaultKeybindings();
		const composerRule = bindings.find(item => item.command === NEW_QUICK_CHAT_COMMAND_ID && item.keybinding?.getHashCode() === NEW_QUICK_CHAT_CHORD);
		const overlayRule = bindings.find(item => item.command === OPEN_QUICK_CHAT_OVERLAY_COMMAND_ID && item.keybinding?.getHashCode() === QUICK_CHAT_OVERLAY_KEYBINDING);
		const newSessionOverlayRule = bindings.find(item => item.command === OPEN_NEW_SESSION_OVERLAY_COMMAND_ID && item.keybinding?.getHashCode() === NEW_SESSION_OVERLAY_KEYBINDING);
		const workbenchQuickChatRule = bindings.find(item => item.command === ASK_QUICK_QUESTION_ACTION_ID && item.keybinding?.getHashCode() === QUICK_CHAT_OVERLAY_KEYBINDING);
		const evaluateOverlay = (values: Record<string, boolean>) => overlayRule?.when?.evaluate(context(values)) ?? false;
		const evaluateNewSessionOverlay = (values: Record<string, boolean>) => newSessionOverlayRule?.when?.evaluate(context(values)) ?? false;
		const evaluateWorkbenchQuickChat = (values: Record<string, boolean>) => workbenchQuickChatRule?.when?.evaluate(context(values)) ?? false;
		const enabled = {
			[ChatContextKeys.enabled.key]: true,
			[AGENT_HOST_ENABLED_CONTEXT_KEY.key]: true,
			[IsNewChatSessionContext.key]: false,
			[ChatComposerOverlayVisibleContext.key]: false,
		};

		assert.deepStrictEqual({
			composerCommandRetainsChord: !!composerRule,
			overlayWinsOverWorkbenchQuickChat: (overlayRule?.weight1 ?? 0) > KeybindingWeight.WorkbenchContrib,
			overlayInNormalWindow: evaluateOverlay(enabled),
			overlayInSessionsWindow: evaluateOverlay({ ...enabled, [IsSessionsWindowContext.key]: true }),
			overlayWithEditorAreaFocused: evaluateOverlay({ ...enabled, [IsSessionsWindowContext.key]: true, [EditorAreaFocusContext.key]: true }),
			overlayInNewSessionOrQuickChatView: evaluateOverlay({ ...enabled, [IsSessionsWindowContext.key]: true, [IsNewChatSessionContext.key]: true }),
			overlayWithAIDisabled: evaluateOverlay({ ...enabled, [IsSessionsWindowContext.key]: true, [ChatContextKeys.enabled.key]: false }),
			overlayWithAgentHostDisabled: evaluateOverlay({ ...enabled, [IsSessionsWindowContext.key]: true, [AGENT_HOST_ENABLED_CONTEXT_KEY.key]: false }),
			overlayWhileAnotherOverlayIsVisible: evaluateOverlay({ ...enabled, [IsSessionsWindowContext.key]: true, [ChatComposerOverlayVisibleContext.key]: true }),
			workbenchQuickChatInNormalWindow: evaluateWorkbenchQuickChat(enabled),
			workbenchQuickChatInSessionsWindow: evaluateWorkbenchQuickChat({ ...enabled, [IsSessionsWindowContext.key]: true }),
			newSessionOverlayInSessionsWindow: evaluateNewSessionOverlay({ ...enabled, [IsSessionsWindowContext.key]: true }),
			newSessionOverlayInNewSessionOrQuickChatView: evaluateNewSessionOverlay({ ...enabled, [IsSessionsWindowContext.key]: true, [IsNewChatSessionContext.key]: true }),
			newSessionOverlayWithAIDisabled: evaluateNewSessionOverlay({ ...enabled, [IsSessionsWindowContext.key]: true, [ChatContextKeys.enabled.key]: false }),
			newSessionOverlayWhileAnotherOverlayIsVisible: evaluateNewSessionOverlay({ ...enabled, [IsSessionsWindowContext.key]: true, [ChatComposerOverlayVisibleContext.key]: true }),
		}, {
			composerCommandRetainsChord: true,
			overlayWinsOverWorkbenchQuickChat: true,
			overlayInNormalWindow: false,
			overlayInSessionsWindow: true,
			overlayWithEditorAreaFocused: true,
			overlayInNewSessionOrQuickChatView: false,
			overlayWithAIDisabled: false,
			overlayWithAgentHostDisabled: false,
			overlayWhileAnotherOverlayIsVisible: false,
			workbenchQuickChatInNormalWindow: true,
			workbenchQuickChatInSessionsWindow: false,
			newSessionOverlayInSessionsWindow: true,
			newSessionOverlayInNewSessionOrQuickChatView: false,
			newSessionOverlayWithAIDisabled: false,
			newSessionOverlayWhileAnotherOverlayIsVisible: false,
		});
	});
});
