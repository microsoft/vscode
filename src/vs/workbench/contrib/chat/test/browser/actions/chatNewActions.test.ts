/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeKeybinding } from '../../../../../../base/common/keybindings.js';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ContextKeyValue, IContext } from '../../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { ACTION_ID_NEW_CHAT, ACTION_ID_OPEN_CHAT, registerChatActions } from '../../../browser/actions/chatActions.js';
import { registerNewChatActions } from '../../../browser/actions/chatNewActions.js';

registerChatActions();
registerNewChatActions();

function context(values: Record<string, ContextKeyValue>): IContext {
	return { getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined };
}

function getCtrlNKeybinding(commandId: string) {
	const keybinding = decodeKeybinding(KeyMod.CtrlCmd | KeyCode.KeyN, OperatingSystem.Windows)!.getHashCode();
	return KeybindingsRegistry.getDefaultKeybindingsForOS(OperatingSystem.Windows)
		.find(item => item.command === commandId && item.keybinding?.getHashCode() === keybinding);
}

suite('Chat new actions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('Ctrl+N opens a new editor from a chat editor without clearing the current chat', () => {
		const newChatKeybinding = getCtrlNKeybinding(ACTION_ID_NEW_CHAT);
		const newChatEditorKeybinding = getCtrlNKeybinding(ACTION_ID_OPEN_CHAT);
		assert.ok(newChatKeybinding?.when);
		assert.ok(newChatEditorKeybinding?.when);

		const chatContext = {
			[ChatContextKeys.enabled.key]: true,
			[ChatContextKeys.inChatSession.key]: true,
			[ChatContextKeys.location.key]: ChatAgentLocation.Chat,
		};
		const chatViewContext = context({
			...chatContext,
			[ChatContextKeys.inChatEditor.key]: false,
		});
		const chatEditorContext = context({
			...chatContext,
			[ChatContextKeys.inChatEditor.key]: true,
		});

		assert.deepStrictEqual({
			newChatInView: newChatKeybinding.when.evaluate(chatViewContext),
			newChatInEditor: newChatKeybinding.when.evaluate(chatEditorContext),
			newEditorInView: newChatEditorKeybinding.when.evaluate(chatViewContext),
			newEditorInEditor: newChatEditorKeybinding.when.evaluate(chatEditorContext),
		}, {
			newChatInView: true,
			newChatInEditor: false,
			newEditorInView: false,
			newEditorInEditor: true,
		});
	});
});
