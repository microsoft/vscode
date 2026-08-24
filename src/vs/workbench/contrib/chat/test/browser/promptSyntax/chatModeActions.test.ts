/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService, CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../browser/aiCustomization/aiCustomizationManagement.js';
import { registerAgentActions } from '../../../browser/promptSyntax/chatModeActions.js';

registerAgentActions();

suite('Chat mode actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('Configure Custom Agents opens the Agents customizations section', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const calls: unknown[][] = [];
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand(commandId: string, ...args: unknown[]): Promise<undefined> {
				calls.push([commandId, ...args]);
				return undefined;
			}
		}());

		const command = CommandsRegistry.getCommand('workbench.action.chat.picker.customagents');
		assert.ok(command);
		await instantiationService.invokeFunction(command.handler);

		assert.deepStrictEqual(calls, [[AICustomizationManagementCommands.OpenEditor, AICustomizationManagementSection.Agents]]);
	});
});
