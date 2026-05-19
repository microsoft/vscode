/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Code } from './code';

export type ChatLocation = 'panel' | 'editor';

const CHAT_VIEW = 'div[id="workbench.panel.chat"]';
const CHAT_EDITOR = '.editor-instance .interactive-session';
const CHAT_INPUT_EDITOR = '.interactive-input-part .monaco-editor[role="code"]';
const CHAT_INPUT_EDITOR_FOCUSED = '.interactive-input-part .monaco-editor.focused[role="code"]';
const CHAT_RESPONSE = '.interactive-item-container.interactive-response';
const CHAT_RESPONSE_COMPLETE = `${CHAT_RESPONSE}:not(.chat-response-loading)`;
const CHAT_FOOTER_DETAILS = '.chat-footer-details';

export class Chat {

	constructor(private code: Code) { }

	private getRootSelector(location: ChatLocation = 'panel'): string {
		return location === 'editor' ? CHAT_EDITOR : CHAT_VIEW;
	}

	private getChatInputEditorSelector(location: ChatLocation = 'panel'): string {
		return `${this.getRootSelector(location)} ${CHAT_INPUT_EDITOR}`;
	}

	private getChatInputEditorFocusedSelector(location: ChatLocation = 'panel'): string {
		return `${this.getRootSelector(location)} ${CHAT_INPUT_EDITOR_FOCUSED}`;
	}

	private getChatInputSelector(location: ChatLocation = 'panel'): string {
		return `${this.getChatInputEditorSelector(location)} ${!this.code.editContextEnabled ? 'textarea' : '.native-edit-context'}`;
	}

	private getChatResponseSelector(location: ChatLocation = 'panel'): string {
		return `${this.getRootSelector(location)} ${CHAT_RESPONSE}`;
	}

	private getChatResponseCompleteSelector(location: ChatLocation = 'panel'): string {
		return `${this.getRootSelector(location)} ${CHAT_RESPONSE_COMPLETE}`;
	}

	async waitForChatView(): Promise<void> {
		await this.code.waitForElement(CHAT_VIEW);
	}

	async waitForChatEditor(retryCount?: number): Promise<void> {
		await this.code.waitForElement(CHAT_EDITOR, undefined, retryCount);
	}

	async waitForInputFocus(location: ChatLocation = 'panel'): Promise<void> {
		await this.code.waitForElement(this.getChatInputEditorFocusedSelector(location));
	}

	async sendMessage(message: string, location: ChatLocation = 'panel'): Promise<void> {
		// Click on the chat input to focus it
		await this.code.waitAndClick(this.getChatInputEditorSelector(location));

		// Wait for the editor to be focused
		await this.waitForInputFocus(location);

		// Type the message using pressSequentially - this works with Monaco editors
		// Note: Newlines are replaced with spaces since Enter key submits in chat input
		const sanitizedMessage = message.replace(/\n/g, ' ');
		await this.code.driver.currentPage.locator(this.getChatInputSelector(location)).pressSequentially(sanitizedMessage);

		// Submit the message
		await this.code.dispatchKeybinding('enter', () => Promise.resolve());
	}

	async waitForResponse(retryCount?: number, location: ChatLocation = 'panel'): Promise<void> {

		// First wait for a response element to appear
		await this.code.waitForElement(this.getChatResponseSelector(location), undefined, retryCount);

		// Then wait for it to complete (not loading)
		await this.code.waitForElement(this.getChatResponseCompleteSelector(location), undefined, retryCount);
	}

	async getLatestResponseText(location: ChatLocation = 'panel'): Promise<string> {
		const response = this.code.driver.currentPage.locator(this.getChatResponseCompleteSelector(location)).last();
		return (await response.textContent()) ?? '';
	}

	async waitForModelInFooter(): Promise<void> {
		await this.code.waitForElements(`${CHAT_VIEW} ${CHAT_FOOTER_DETAILS}`, false, el => {
			return el.some(el => {
				const text = el && typeof el.textContent === 'string' ? el.textContent : '';
				return !!text && text.length > 0;
			});
		});
	}
}
