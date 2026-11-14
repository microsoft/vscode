/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ContextKeyValue, IContext } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { NEW_CHAT_ICON_VARIANTS, NewChatAction, newChatIconVariantAction } from '../../../browser/actions/chatNewActions.js';
import { IChatViewHostService } from '../../../browser/chatViewHost.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';

function context(values: Record<string, ContextKeyValue>): IContext {
	return { getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined };
}

suite('Chat new actions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('Ctrl+N opens a new editor from a chat editor without clearing the current chat', () => {
		const action = new NewChatAction();
		const keybinding = Array.isArray(action.desc.keybinding) ? action.desc.keybinding[0] : action.desc.keybinding;
		assert.ok(keybinding?.when);

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
			primary: keybinding.primary,
			newChatInView: keybinding.when.evaluate(chatViewContext),
			newChatInEditor: keybinding.when.evaluate(chatEditorContext),
		}, {
			primary: KeyMod.CtrlCmd | KeyCode.KeyN,
			newChatInView: true,
			newChatInEditor: false,
		});
	});

	test('New Chat of every icon lets the host that replaces the Chat view start the new chat', async () => {
		let started = 0;
		const accessor = upcastPartial<ServicesAccessor>({
			get: (<T>(id: unknown) => {
				assert.strictEqual(id, IChatViewHostService);
				return { newChat: () => { started++; return true; } } as T;
			}) as ServicesAccessor['get'],
		});
		for (const action of [new NewChatAction(), ...NEW_CHAT_ICON_VARIANTS.map(variant => new (newChatIconVariantAction(variant))())]) {
			await action.run(accessor);
		}

		assert.strictEqual(started, 1 + NEW_CHAT_ICON_VARIANTS.length);
	});
});
