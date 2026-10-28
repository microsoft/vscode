/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpression, ContextKeyValue, IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { getSingletonServiceDescriptors } from '../../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus } from '../../../../browser/menus.js';
import { CHAT_WINDOWS_ENABLED_SETTING, IChatWindowService, OPEN_CHAT_IN_WINDOW_COMMAND_ID } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { chatWindowContributions } from '../../browser/chatWindow.contribution.js';

function evaluate(expression: ContextKeyExpression | undefined, values: Record<string, ContextKeyValue>): boolean {
	return expression?.evaluate({ getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined } satisfies IContext) !== false;
}

suite('Chat window contribution', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('loads every module that registers chat window actions, and registers the service', () => {
		const commands = [
			OPEN_CHAT_IN_WINDOW_COMMAND_ID,
			'sessions.openInChatWindow',
			'sessions.chatWindow.moveToMainWindow',
			'sessions.chatWindow.showEditorAboveChat',
			'sessions.chatWindow.toggleTerminal',
			'sessions.chatWindow.openChanges',
		];
		assert.deepStrictEqual({
			modules: [...chatWindowContributions],
			commands: commands.filter(id => !CommandsRegistry.getCommand(id)),
			service: getSingletonServiceDescriptors().some(([id]) => id === IChatWindowService),
		}, {
			modules: ['chatWindowEditorArea', 'chatWindowLayoutActions', 'chatWindowTerminalActions', 'openChatInWindow'],
			commands: [],
			service: true,
		});
	});

	test('the setting is on by default, and opening a chat in a window is offered only with it on and AI features enabled', () => {
		const setting = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties()[CHAT_WINDOWS_ENABLED_SETTING];
		const item = MenuRegistry.getMenuItems(Menus.SessionChatItemContext).filter(isIMenuItem).find(candidate => candidate.command.id === OPEN_CHAT_IN_WINDOW_COMMAND_ID);
		const offered = (values: Record<string, ContextKeyValue>) => evaluate(item?.when, { [IsSessionsWindowContext.key]: true, ...values });
		assert.deepStrictEqual({
			default: setting?.default,
			scope: setting?.scope,
			off: offered({ [ChatContextKeys.enabled.key]: true, [`config.${CHAT_WINDOWS_ENABLED_SETTING}`]: false }),
			on: offered({ [ChatContextKeys.enabled.key]: true, [`config.${CHAT_WINDOWS_ENABLED_SETTING}`]: true }),
			aiDisabled: offered({ [ChatContextKeys.enabled.key]: false, [`config.${CHAT_WINDOWS_ENABLED_SETTING}`]: true }),
		}, { default: true, scope: ConfigurationScope.APPLICATION, off: false, on: true, aiDisabled: false });
	});
});
