/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Logger } from '../../../../automation';
import { installAllHandlers } from '../../utils';

export function setup(logger: Logger) {
	describe('Chat Export as Markdown', () => {

		// Shared before/after handling
		installAllHandlers(logger);

		it('Export Chat as Markdown command is available', async function () {
			const app = this.app as Application;

			// First verify AI features are enabled (default)
			// Open the chat view to ensure chat commands are registered
			await app.workbench.quickaccess.runCommand('workbench.action.chat.open');
			await app.workbench.chat.waitForChatView();

			// Check that the Export Chat as Markdown command is discoverable
			const commands = await app.workbench.quickaccess.getVisibleCommandNames('Export Chat as Markdown');
			const found = commands.some(cmd => cmd.includes('Export Chat as Markdown'));

			if (!found) {
				throw new Error('Expected "Export Chat as Markdown" command to be available in the command palette');
			}
		});

		it('Export Chat (JSON) command is available', async function () {
			const app = this.app as Application;

			// Ensure chat view is open
			await app.workbench.quickaccess.runCommand('workbench.action.chat.open');
			await app.workbench.chat.waitForChatView();

			// Check Export Chat (JSON) command
			const commands = await app.workbench.quickaccess.getVisibleCommandNames('Export Chat...');
			const found = commands.some(cmd => cmd.includes('Export Chat'));

			if (!found) {
				throw new Error('Expected "Export Chat..." command to be available in the command palette');
			}
		});

		it('Import Chat command is available', async function () {
			const app = this.app as Application;

			// Ensure chat view is open
			await app.workbench.quickaccess.runCommand('workbench.action.chat.open');
			await app.workbench.chat.waitForChatView();

			// Check Import Chat command
			const commands = await app.workbench.quickaccess.getVisibleCommandNames('Import Chat');
			const found = commands.some(cmd => cmd.includes('Import Chat'));

			if (!found) {
				throw new Error('Expected "Import Chat..." command to be available in the command palette');
			}
		});
	});
}
