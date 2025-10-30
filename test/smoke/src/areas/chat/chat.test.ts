/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Logger } from '../../../../automation';
import { installAllHandlers } from '../../utils';

export function setup(logger: Logger) {
	describe('Chat', () => {

		// Shared before/after handling
		installAllHandlers(logger);

		it('can run chat setup', async function () {
			const app = this.app as Application;

			await app.workbench.chat.sendMessage('Hello, world!');

			await app.code.waitForElements('.monaco-dialog-box', true, elements => elements.length === 1);
			await app.code.dispatchKeybinding('Escape', async () => { await app.code.waitForElements('.monaco-dialog-box', false, elements => elements.length === 0); });
		});

		it('can disable AI features', async function () {
			const app = this.app as Application;

			await app.workbench.settingsEditor.addUserSetting('chat.disableAIFeatures', 'true');

			// await for setting to apply in the UI
			await app.code.waitForElements('.noauxiliarybar', false, elements => elements.length === 1);

			// assert that AI related commands are not present
			const commands = await app.workbench.quickaccess.getVisibleCommandNames('chat');
			let expectedFound = false;
			const unexpectedFound: string[] = [];
			for (const command of commands) {
				if (command === 'Chat: Use AI Features with Copilot for free...') {
					expectedFound = true;
					continue;
				}

				if (command.includes('Chat') || command.includes('Agent') || command.includes('Copilot')) {
					unexpectedFound.push(command);
				}
			}

			if (!expectedFound) {
				throw new Error(`Expected AI related command not found`);
			}

			if (unexpectedFound.length > 0) {
				throw new Error(`Unexpected AI related commands found after having disabled AI features: ${JSON.stringify(unexpectedFound, undefined, 0)}`);
			}
		});
	});
}
