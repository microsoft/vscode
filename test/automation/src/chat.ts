/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Code } from './code';

const CHAT_VIEW = 'div[id="workbench.panel.chat"]';
const CHAT_EDITOR = `${CHAT_VIEW} .monaco-editor[role="code"]`;
const CHAT_EDITOR_FOCUSED = `${CHAT_VIEW} .monaco-editor.focused[role="code"]`;
const CHAT_RESPONSE = `${CHAT_VIEW} .interactive-item-container.interactive-response`;
const CHAT_RESPONSE_COMPLETE = `${CHAT_RESPONSE}:not(.chat-response-loading)`;
const CHAT_FOOTER_DETAILS = `${CHAT_VIEW} .chat-footer-details`;

export class Chat {

	constructor(private code: Code) { }

	private get chatInputSelector(): string {
		return `${CHAT_EDITOR} ${!this.code.editContextEnabled ? 'textarea' : '.native-edit-context'}`;
	}

	async waitForChatView(): Promise<void> {
		await this.code.waitForElement(CHAT_VIEW);
	}

	async waitForInputFocus(): Promise<void> {
		await this.code.waitForElement(CHAT_EDITOR_FOCUSED);
	}

	async sendMessage(message: string): Promise<void> {
		// Click on the chat input to focus it
		await this.code.waitAndClick(CHAT_EDITOR);

		// Wait for the editor to be focused
		await this.waitForInputFocus();

		// Type the message using pressSequentially - this works with Monaco editors
		// Note: Newlines are replaced with spaces since Enter key submits in chat input
		const sanitizedMessage = message.replace(/\n/g, ' ');
		await this.code.driver.currentPage.locator(this.chatInputSelector).pressSequentially(sanitizedMessage);

		// Submit the message
		await this.code.dispatchKeybinding('enter', () => Promise.resolve());
	}

	async waitForResponse(retryCount?: number): Promise<void> {

		// First wait for a response element to appear
		await this.code.waitForElement(CHAT_RESPONSE, undefined, retryCount);

		// Then wait for it to complete (not loading)
		await this.code.waitForElement(CHAT_RESPONSE_COMPLETE, undefined, retryCount);
	}

	async waitForModelInFooter(): Promise<void> {
		await this.code.waitForElements(CHAT_FOOTER_DETAILS, false, el => {
			return el.some(el => {
				const text = el && typeof el.textContent === 'string' ? el.textContent : '';
				return !!text && text.length > 0;
			});
		});
	}
}
