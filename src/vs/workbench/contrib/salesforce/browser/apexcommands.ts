/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';

export const CREATE_APEX_CLASS_COMMAND_ID = 'salesforce.createApexClass';

CommandsRegistry.registerCommand({
	id: CREATE_APEX_CLASS_COMMAND_ID,
	handler: async (accessor) => {
		const commandService = accessor.get<ICommandService>(ICommandService);
		const quickInputService = accessor.get<IQuickInputService>(IQuickInputService);

		// Step 1: Get Apex class name
		const className = await quickInputService.input({
			placeHolder: 'Enter Apex class name',
			value: ''
		});

		if (!className || !/^[A-Za-z_]\w*$/.test(className)) {
			console.error('Invalid class name');
			return;
		}

		// Step 2: Ask user to choose directory option
		const directoryOption = await quickInputService.pick([
			{
				label: 'Use default directory',
				description: 'force-app/main/default/classes',
				detail: 'Create Apex class in the standard Salesforce directory structure'
			},
			{
				label: 'Enter custom directory path',
				description: 'Specify your own directory path',
				detail: 'Choose a custom location for the Apex class'
			}
		], {
			placeHolder: 'Select directory option for Apex class'
		});

		if (!directoryOption) {
			console.error('No directory option selected');
			return;
		}

		let directoryPath: string;

		if (directoryOption.label === 'Use default directory') {
			// Use default directory
			directoryPath = 'force-app/main/default/classes';
		} else {
			// Step 3: Get custom directory path from user
			const customPath = await quickInputService.input({
				placeHolder: 'Enter directory path to save the class (e.g., force-app/main/default/classes)',
				value: 'force-app/main/default/classes'
			});

			if (!customPath || customPath.trim() === '') {
				console.error('Invalid directory path');
				return;
			}

			directoryPath = customPath.trim();
		}

		// Step 4: Open terminal
		await commandService.executeCommand('workbench.action.terminal.new');

		// Step 5: Run SFDX create command with full path
		const createCommand = `sfdx force:apex:class:create -n ${className} -d "${directoryPath}"\n`;
		await commandService.executeCommand('workbench.action.terminal.sendSequence', {
			text: createCommand
		});
	}
});
