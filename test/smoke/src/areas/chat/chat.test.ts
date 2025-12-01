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

		it('can disable AI features', async function () {
			const app = this.app as Application;

			await app.workbench.settingsEditor.addUserSetting('chat.disableAIFeatures', 'true');

			// await for setting to apply in the UI
			await app.code.waitForElements('.noauxiliarybar', true, elements => elements.length === 1);

			// assert that AI related commands are not present
			let expectedFound = false;
			const unexpectedFound: Set<string> = new Set();
			for (const term of ['chat', 'agent', 'copilot', 'mcp']) {
				const commands = await app.workbench.quickaccess.getVisibleCommandNames(term);
				for (const command of commands) {
					if (command === 'Chat: Use AI Features with Copilot for free...') {
						expectedFound = true;
						continue;
					}

					if (command.includes('Chat') || command.includes('Agent') || command.includes('Copilot') || command.includes('MCP')) {
						unexpectedFound.add(command);
					}
				}
			}

			if (!expectedFound) {
				throw new Error(`Expected AI related command not found`);
			}

			if (unexpectedFound.size > 0) {
				throw new Error(`Unexpected AI related commands found after having disabled AI features: ${JSON.stringify(Array.from(unexpectedFound), undefined, 0)}`);
			}
		});
	});
}
