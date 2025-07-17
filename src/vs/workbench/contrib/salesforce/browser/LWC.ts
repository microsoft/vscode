/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';

export const CREATE_LWC_COMPONENT_COMMAND_ID = 'salesforce.createLwcComponent';

CommandsRegistry.registerCommand({
	id: CREATE_LWC_COMPONENT_COMMAND_ID,
	handler: async (accessor) => {
		const commandService = accessor.get<ICommandService>(ICommandService);
		const quickInputService = accessor.get<IQuickInputService>(IQuickInputService);

		// Step 1: Get LWC component name
		const componentName = await quickInputService.input({
			placeHolder: 'Enter LWC component name',
			value: ''
		});

		if (!componentName || !/^[A-Za-z_]\w*$/.test(componentName)) {
			console.error('Invalid component name');
			return;
		}

		// Step 2: Ask user to choose directory option
		const directoryOption = await quickInputService.pick([
			{
				label: 'Use default directory',
				description: 'force-app/main/default/lwc',
				detail: 'Create component in the standard Salesforce directory structure'
			},
			{
				label: 'Enter custom directory path',
				description: 'Specify your own directory path',
				detail: 'Choose a custom location for the component'
			}
		], {
			placeHolder: 'Select directory option for LWC component'
		});

		if (!directoryOption) {
			console.error('No directory option selected');
			return;
		}

		let directoryPath: string;

		if (directoryOption.label === 'Use default directory') {
			// Use default directory
			directoryPath = 'force-app/main/default/lwc';
		} else {
			// Step 3: Get custom directory path from user
			const customPath = await quickInputService.input({
				placeHolder: 'Enter directory path to save the component (e.g., force-app/main/default/lwc)',
				value: 'force-app/main/default/lwc'
			});

			if (!customPath || customPath.trim() === '') {
				console.error('Invalid directory path');
				return;
			}

			directoryPath = customPath.trim();
		}

		// Step 4: Open terminal
		await commandService.executeCommand('workbench.action.terminal.new');

		// Step 5: Run SF CLI LWC create command with template
		const createCommand = `sf force lightning component create --type lwc --componentname ${componentName} --outputdir "${directoryPath}" --template default\n`;
		await commandService.executeCommand('workbench.action.terminal.sendSequence', {
			text: createCommand
		});
	}
});
