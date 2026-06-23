/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Code } from './code';

const CHAT_VIEW = 'div[id="workbench.panel.chat"]';
const CHAT_EDITOR = '.editor-instance .interactive-session';
const CHAT_INPUT_EDITOR = `${CHAT_VIEW} .interactive-input-part .monaco-editor[role="code"]`;
const CHAT_INPUT_EDITOR_FOCUSED = `${CHAT_VIEW} .interactive-input-part .monaco-editor.focused[role="code"]`;
const CHAT_SEND_BUTTON_ENABLED = `${CHAT_VIEW} .chat-input-toolbars > .chat-execute-toolbar .monaco-action-bar .action-item:not(.disabled) > .action-label.codicon-newline`;
const CHAT_RESPONSE = `${CHAT_VIEW} .interactive-item-container.interactive-response`;
const CHAT_REQUEST = `${CHAT_VIEW} .interactive-item-container.interactive-request`;
const CHAT_RESPONSE_COMPLETE = `${CHAT_RESPONSE}:not(.chat-response-loading)`;
// Primary dialog button — explicitly excludes the `.secondary` class so we don't accidentally
// click Cancel. Button order is platform-dependent (see `Dialog.rearrangeButtons`), but the
// `secondary` class is always set to `!primary` regardless of order, so this is reliable.
const DIALOG_PRIMARY_BUTTON = '.monaco-dialog-box .dialog-buttons .monaco-button:not(.secondary)';
const CHAT_CHECKPOINT_TOOLBAR = `${CHAT_VIEW} .checkpoint-container .monaco-toolbar`;
const CHAT_CHECKPOINT_FORK_BUTTON = `${CHAT_CHECKPOINT_TOOLBAR} .action-label.codicon-repo-forked`;
const CHAT_CHECKPOINT_REWIND_BUTTON = `${CHAT_CHECKPOINT_TOOLBAR} .action-label.codicon-discard`;
const CHAT_FOOTER_DETAILS = `${CHAT_VIEW} .chat-footer-details`;
const CHAT_EDITOR_INPUT_EDITOR = `${CHAT_EDITOR} .interactive-input-part .monaco-editor[role="code"]`;
const CHAT_EDITOR_INPUT_EDITOR_FOCUSED = `${CHAT_EDITOR} .interactive-input-part .monaco-editor.focused[role="code"]`;
const CHAT_EDITOR_SEND_BUTTON_ENABLED = `${CHAT_EDITOR} .chat-input-toolbars > .chat-execute-toolbar .monaco-action-bar .action-item:not(.disabled) > .action-label.codicon-newline`;
const CHAT_EDITOR_RESPONSE = `${CHAT_EDITOR} .interactive-item-container.interactive-response`;
const CHAT_EDITOR_RESPONSE_COMPLETE = `${CHAT_EDITOR_RESPONSE}:not(.chat-response-loading)`;

export class Chat {

	constructor(private code: Code) { }

	private get chatInputSelector(): string {
		return `${CHAT_INPUT_EDITOR} ${!this.code.editContextEnabled ? 'textarea' : '.native-edit-context'}`;
	}

	private get chatEditorInputSelector(): string {
		return `${CHAT_EDITOR_INPUT_EDITOR} ${!this.code.editContextEnabled ? 'textarea' : '.native-edit-context'}`;
	}

	async waitForChatView(): Promise<void> {
		await this.code.waitForElement(CHAT_VIEW);
	}

	async waitForChatEditor(retryCount?: number): Promise<void> {
		await this.code.waitForElement(CHAT_EDITOR, undefined, retryCount);
	}

	async waitForInputFocus(): Promise<void> {
		await this.code.waitForElement(CHAT_INPUT_EDITOR_FOCUSED);
	}

	async sendMessage(message: string): Promise<void> {
		// Click on the chat input to focus it
		await this.code.waitAndClick(CHAT_INPUT_EDITOR);

		// Wait for the editor to be focused
		await this.waitForInputFocus();

		// Insert via Monaco's executeEdits rather than character-by-character
		// keypresses so suggestion widgets (e.g. the `[`-triggered chat reference
		// picker) cannot intercept characters and corrupt the prompt.
		// Newlines are replaced with spaces since Enter submits in chat input.
		const sanitizedMessage = message.replace(/\n/g, ' ');
		await this.code.waitForTypeInEditor(this.chatInputSelector, sanitizedMessage);

		// Wait for the send button to be enabled before clicking. The send
		// button stays disabled until the chat participant is fully ready to
		// receive a request — relying on Enter alone is fragile for providers
		// that initialize asynchronously.
		await this.code.waitForElement(CHAT_SEND_BUTTON_ENABLED, undefined, 600);
		await this.code.waitAndClick(CHAT_SEND_BUTTON_ENABLED);
	}

	async sendEditorMessage(message: string): Promise<void> {
		await this.code.waitAndClick(CHAT_EDITOR_INPUT_EDITOR);
		await this.code.waitForElement(CHAT_EDITOR_INPUT_EDITOR_FOCUSED);

		// Insert via Monaco's executeEdits rather than character-by-character
		// keypresses so suggestion widgets (e.g. the `[`-triggered chat reference
		// picker) cannot intercept characters and corrupt the prompt.
		const sanitizedMessage = message.replace(/\n/g, ' ');
		await this.code.waitForTypeInEditor(this.chatEditorInputSelector, sanitizedMessage);

		// Wait for the send button to be enabled before clicking. The send
		// button stays disabled until the chat session participant is fully
		// ready to receive a request — relying on Enter alone is fragile for
		// session types whose providers initialize asynchronously (e.g. Claude
		// Agent).
		await this.code.waitForElement(CHAT_EDITOR_SEND_BUTTON_ENABLED, undefined, 600);
		await this.code.waitAndClick(CHAT_EDITOR_SEND_BUTTON_ENABLED);
	}

	async waitForResponse(retryCount?: number): Promise<void> {

		// First wait for a response element to appear
		await this.code.waitForElement(CHAT_RESPONSE, undefined, retryCount);

		// Then wait for it to complete (not loading)
		await this.code.waitForElement(CHAT_RESPONSE_COMPLETE, undefined, retryCount);
	}

	async waitForEditorResponse(retryCount?: number): Promise<void> {
		await this.code.waitForElement(CHAT_EDITOR_RESPONSE, undefined, retryCount);
		await this.code.waitForElement(CHAT_EDITOR_RESPONSE_COMPLETE, undefined, retryCount);
	}

	async getLatestEditorResponseText(): Promise<string> {
		const response = this.code.driver.currentPage.locator(CHAT_EDITOR_RESPONSE_COMPLETE).last();
		return (await response.textContent()) ?? '';
	}

	async getLatestResponseText(): Promise<string> {
		const response = this.code.driver.currentPage.locator(CHAT_RESPONSE_COMPLETE).last();
		return (await response.textContent()) ?? '';
	}

	async waitForModelInFooter(): Promise<void> {
		await this.code.waitForElements(CHAT_FOOTER_DETAILS, false, el => {
			return el.some(el => {
				const text = el && typeof el.textContent === 'string' ? el.textContent : '';
				return !!text && text.length > 0;
			});
		});
	}

	/**
	 * Number of user request rows currently rendered in the panel chat. Used by
	 * the rewind smoke test to assert that turns were discarded.
	 */
	async getRequestCount(): Promise<number> {
		return await this.code.driver.currentPage.locator(CHAT_REQUEST).count();
	}

	/**
	 * Runs the `/rewind` slash command from the chat input and confirms the
	 * destructive-action dialog, rewinding the conversation to before its most
	 * recent turn.
	 */
	async rewindLastTurnViaSlashCommand(): Promise<void> {
		await this.code.waitAndClick(CHAT_INPUT_EDITOR);
		await this.waitForInputFocus();
		await this.code.waitForTypeInEditor(this.chatInputSelector, '/rewind');
		await this.code.waitForElement(CHAT_SEND_BUTTON_ENABLED, undefined, 600);
		await this.code.waitAndClick(CHAT_SEND_BUTTON_ENABLED);

		// Rewind is destructive, so confirm the warning dialog.
		await this.code.waitForElement(DIALOG_PRIMARY_BUTTON);
		await this.code.waitAndClick(DIALOG_PRIMARY_BUTTON);
	}

	/**
	 * Whether the per-message checkpoint toolbar (where Fork lives) contributes both the Fork
	 * and Rewind buttons. Checks DOM presence, so it holds even before the toolbar is revealed.
	 * Used by the rewind smoke test to assert Rewind is offered as a button next to Fork.
	 */
	async checkpointToolbarHasForkAndRewind(): Promise<boolean> {
		const forkCount = await this.code.driver.currentPage.locator(CHAT_CHECKPOINT_FORK_BUTTON).count();
		const rewindCount = await this.code.driver.currentPage.locator(CHAT_CHECKPOINT_REWIND_BUTTON).count();
		return forkCount > 0 && rewindCount > 0;
	}

	/**
	 * Diagnostic helper: returns the outer HTML of every checkpoint container so a failing
	 * rewind assertion can show what the toolbar actually rendered.
	 */
	async dumpCheckpointContainersHtml(): Promise<string> {
		return await this.code.driver.currentPage.locator(`${CHAT_VIEW} .checkpoint-container`).evaluateAll(els => els.map(el => (el as HTMLElement).outerHTML).join('\n---\n'));
	}
}
