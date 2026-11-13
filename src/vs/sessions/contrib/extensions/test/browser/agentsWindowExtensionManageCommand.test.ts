/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { EXTENSIONS_AGENTS_WINDOW_MANAGEMENT, MANAGE_EXTENSION_COMMAND_ID } from '../../../../../platform/extensions/common/extensions.js';
import { AgentsWindowExtensionManageCommand } from '../../browser/agentsWindowExtensionManageCommand.js';

suite('AgentsWindowExtensionManageCommand', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers Manage Extension only while the Agents window manages extensions', async () => {
		const configurationService = new TestConfigurationService({ [EXTENSIONS_AGENTS_WINDOW_MANAGEMENT]: false });
		const setManagement = async (value: boolean) => {
			await configurationService.setUserConfiguration(EXTENSIONS_AGENTS_WINDOW_MANAGEMENT, value);
			configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: (key: string) => key === EXTENSIONS_AGENTS_WINDOW_MANAGEMENT }));
		};
		const isRegistered = () => !!CommandsRegistry.getCommand(MANAGE_EXTENSION_COMMAND_ID);

		const contribution = new AgentsWindowExtensionManageCommand(configurationService);
		const states = [isRegistered()];
		await setManagement(true);
		states.push(isRegistered());
		await setManagement(false);
		states.push(isRegistered());
		await setManagement(true);
		states.push(isRegistered());
		contribution.dispose();
		states.push(isRegistered());

		assert.deepStrictEqual(states, [false, true, false, true, false]);
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
	});
});
