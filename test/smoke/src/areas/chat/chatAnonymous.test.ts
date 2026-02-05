/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Logger } from '../../../../automation';
import { installAllHandlers } from '../../utils';

export function setup(logger: Logger) {
	describe.skip('Chat Anonymous', () => {

		// Shared before/after handling
		installAllHandlers(logger);

		it('can send a chat message with anonymous access', async function () {
			const app = this.app as Application;

			// Enable anonymous access
			await app.workbench.settingsEditor.addUserSetting('chat.allowAnonymousAccess', 'true');

			// Open chat view
			await app.workbench.quickaccess.runCommand('workbench.action.chat.open');

			// Wait for chat view to be visible
			await app.workbench.chat.waitForChatView();

			// Send a message
			await app.workbench.chat.sendMessage('Hello');

			// Wait for a response to complete
			await app.workbench.chat.waitForResponse();

			// Wait for model name to appear in footer
			await app.workbench.chat.waitForModelInFooter();
		});
	});
}
