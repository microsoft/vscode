/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Code } from './code';
import { Notification } from './notification';

const CHAT_VIEW = 'div[id="workbench.panel.chat"]';
const CHAT_INPUT = `${CHAT_VIEW} .monaco-editor[role="code"]`;
const CHAT_INPUT_FOCUSED = `${CHAT_VIEW} .monaco-editor.focused[role="code"]`;

export class Chat {

	constructor(private code: Code, private notification: Notification) { }

	async waitForChatView(): Promise<void> {
		await this.code.waitForElement(CHAT_VIEW);
	}

	async waitForInputFocus(): Promise<void> {
		await this.code.waitForElement(CHAT_INPUT_FOCUSED);
	}

	async sendMessage(message: string): Promise<void> {
		if (await this.notification.isNotificationVisible()) {
			throw new Error('Notification is visible');
		}
		// Click on the chat input to focus it
		await this.code.waitAndClick(CHAT_INPUT);

		// Wait for the editor to be focused
		await this.waitForInputFocus();

		// Type the message using pressSequentially - this works with Monaco editors
		// Note: Newlines are replaced with spaces since Enter key submits in chat input
		const sanitizedMessage = message.replace(/\n/g, ' ');
		await this.code.driver.currentPage.locator(CHAT_INPUT).pressSequentially(sanitizedMessage);

		// Submit the message
		await this.code.dispatchKeybinding('enter', () => Promise.resolve());
	}
}
