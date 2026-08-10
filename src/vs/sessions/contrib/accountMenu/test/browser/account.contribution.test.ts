/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { CHAT_SETUP_ACTION_ID } from '../../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { Menus } from '../../../../browser/menus.js';
import { shouldShowAccountPanelSummary } from '../../browser/account.contribution.js';

suite('Sessions - Account Menu', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('labels the signed-out Copilot account action', () => {
		const signIn = MenuRegistry.getMenuItems(Menus.AccountMenu)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'workbench.action.agenticSignIn');

		assert.ok(signIn);
		assert.strictEqual(typeof signIn.command.title === 'string' ? signIn.command.title : signIn.command.title.value, 'Sign in to use GitHub Copilot');
	});

	test('uses the shared Chat setup flow for Copilot sign-in', async () => {
		const executedCommands: string[] = [];
		const command = CommandsRegistry.getCommand('workbench.action.agenticSignIn');
		assert.ok(command);
		const accessor = {
			get: () => ({
				executeCommand: async (commandId: string) => {
					executedCommands.push(commandId);
				},
			}),
		} as ServicesAccessor;

		await command.handler(accessor);

		assert.deepStrictEqual(executedCommands, [CHAT_SETUP_ACTION_ID]);
	});

	test('omits the redundant signed-out summary', () => {
		assert.deepStrictEqual({
			signedOut: shouldShowAccountPanelSummary({ source: 'copilot', kind: 'prominent' }, false, false),
			unavailable: shouldShowAccountPanelSummary({ source: 'copilot', kind: 'warning' }, false, false),
			loading: shouldShowAccountPanelSummary({ source: 'account', kind: 'default' }, false, true),
		}, {
			signedOut: false,
			unavailable: true,
			loading: false,
		});
	});
});
