/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { stub } from 'sinon';
import { decodeKeybinding } from '../../../../../base/common/keybindings.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { OS } from '../../../../../base/common/platform.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { SharedChatInputComposer } from '../../../../../workbench/contrib/sessions/browser/chat/sharedChatInputComposer.js';
import { ChatInputSupportsBackgroundContext } from '../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { SEND_IN_BACKGROUND_COMMAND_ID } from '../../../../../workbench/contrib/sessions/common/sessionCommands.js';
import { SESSIONS_LIST_INBOX_ENABLED_SETTING } from '../../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { SendInBackgroundAction } from '../../browser/sharedChatInputComposer.contribution.js';

suite('Send in Background', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const { label, modifier } of [{ label: 'Alt', modifier: KeyMod.Alt }, { label: 'Cmd/Ctrl', modifier: KeyMod.CtrlCmd }]) {
		test(`${label}+Enter applies only to a sendable background-capable composer input in the Agents window`, () => {
			const keybinding = decodeKeybinding(modifier | KeyCode.Enter, OS)!;
			const rule = KeybindingsRegistry.getDefaultKeybindings().find(item =>
				item.command === SEND_IN_BACKGROUND_COMMAND_ID && item.keybinding?.getHashCode() === keybinding.getHashCode());
			const when = rule?.when;
			assert.ok(when);
			const values: Record<string, boolean> = {
				[IsSessionsWindowContext.key]: true,
				[ChatContextKeys.enabled.key]: true,
				[ChatContextKeys.inChatInput.key]: true,
				[ChatInputSupportsBackgroundContext.key]: true,
				[ChatContextKeys.inputHasSendableContent.key]: true,
				[ChatContextKeys.inputBlocked.key]: false,
				[ChatContextKeys.chatSessionOptionsValid.key]: true,
				[`config.${SESSIONS_LIST_INBOX_ENABLED_SETTING}`]: true,
			};
			const matches = (overrides: Record<string, boolean> = {}) => {
				const context: IContext = { getValue: <T>(key: string) => ({ ...values, ...overrides })[key] as T | undefined };
				return when.evaluate(context);
			};
			assert.deepStrictEqual({
				composer: matches(),
				regularWindow: matches({ [IsSessionsWindowContext.key]: false }),
				aiDisabled: matches({ [ChatContextKeys.enabled.key]: false }),
				toolbar: matches({ [ChatContextKeys.inChatInput.key]: false }),
				existingChat: matches({ [ChatInputSupportsBackgroundContext.key]: false }),
				empty: matches({ [ChatContextKeys.inputHasSendableContent.key]: false }),
				blocked: matches({ [ChatContextKeys.inputBlocked.key]: true }),
				invalidOptions: matches({ [ChatContextKeys.chatSessionOptionsValid.key]: false }),
				inboxDisabled: matches({ [`config.${SESSIONS_LIST_INBOX_ENABLED_SETTING}`]: false }),
			}, {
				composer: true, regularWindow: false, aiDisabled: false, toolbar: false,
				existingChat: false, empty: false, blocked: false, invalidOptions: false,
				inboxDisabled: modifier === KeyMod.Alt,
			});
		});
	}

	test('routes to the originating composer or the last-focused widget, and ignores ordinary chat widgets', async () => {
		const instantiation = store.add(new TestInstantiationService());
		const focused = upcastPartial<IChatWidget>({});
		const explicit = upcastPartial<IChatWidget>({});
		const ordinary = upcastPartial<IChatWidget>({});
		const sends: { widget: IChatWidget; background: boolean | undefined }[] = [];
		const lookup = stub(SharedChatInputComposer, 'getBackgroundComposer').callsFake(widget => widget === ordinary
			? undefined
			: upcastPartial<SharedChatInputComposer>({
				submit: async background => {
					sends.push({ widget, background });
					return true;
				},
			}));
		instantiation.stub(IChatWidgetService, { lastFocusedWidget: focused });
		try {
			const action = new SendInBackgroundAction();
			await instantiation.invokeFunction(accessor => action.run(accessor));
			await instantiation.invokeFunction(accessor => action.run(accessor, { widget: explicit }));
			await instantiation.invokeFunction(accessor => action.run(accessor, { widget: ordinary }));
			assert.deepStrictEqual(sends, [{ widget: focused, background: true }, { widget: explicit, background: true }]);
		} finally {
			lookup.restore();
		}
	});
});
