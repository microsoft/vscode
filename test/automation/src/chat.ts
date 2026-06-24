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
const CHAT_RESPONSE_COMPLETE = `${CHAT_RESPONSE}:not(.chat-response-loading)`;
const CHAT_RESPONSE_RENDERED = `${CHAT_RESPONSE} .rendered-markdown`;
const CHAT_FOOTER_DETAILS = `${CHAT_VIEW} .chat-footer-details`;
const CHAT_EDITOR_INPUT_EDITOR = `${CHAT_EDITOR} .interactive-input-part .monaco-editor[role="code"]`;
const CHAT_EDITOR_INPUT_EDITOR_FOCUSED = `${CHAT_EDITOR} .interactive-input-part .monaco-editor.focused[role="code"]`;
const CHAT_EDITOR_SEND_BUTTON_ENABLED = `${CHAT_EDITOR} .chat-input-toolbars > .chat-execute-toolbar .monaco-action-bar .action-item:not(.disabled) > .action-label.codicon-newline`;
const CHAT_EDITOR_RESPONSE = `${CHAT_EDITOR} .interactive-item-container.interactive-response`;
const CHAT_EDITOR_RESPONSE_COMPLETE = `${CHAT_EDITOR_RESPONSE}:not(.chat-response-loading)`;
const CHAT_EDITOR_RESPONSE_RENDERED = `${CHAT_EDITOR_RESPONSE} .rendered-markdown`;

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

	async waitForResponse(retryCount?: number, expectedCount: number = 1): Promise<void> {

		// Wait until at least `expectedCount` completed (non-loading) response
		// bubbles are present. Using a count-aware wait is needed for follow-up
		// messages: after the first response is complete, a naive
		// `waitForElement` would immediately satisfy on the prior response and
		// miss the in-flight one.
		await this.code.waitForElements(CHAT_RESPONSE_COMPLETE, false, els => els.length >= expectedCount, retryCount);
	}

	async waitForEditorResponse(retryCount?: number, expectedCount: number = 1): Promise<void> {
		await this.code.waitForElements(CHAT_EDITOR_RESPONSE_COMPLETE, false, els => els.length >= expectedCount, retryCount);
	}

	/**
	 * Poll until at least one response bubble contains rendered markdown whose
	 * text matches `predicate`. Returns the matched text of the last matching
	 * bubble.
	 *
	 * Unlike {@link waitForResponse} this does NOT gate on the bubble losing
	 * the `chat-response-loading` class — some chat session types (notably
	 * Copilot CLI) keep the loading class on the bubble even after the
	 * assistant text has been fully streamed and rendered, which would
	 * otherwise cause a 180s timeout. Polling for the expected text makes the
	 * wait robust against that lingering loading state while still ensuring
	 * the content has actually arrived (avoiding false matches on placeholder
	 * text like "Considering" that appears before streaming begins).
	 */
	async waitForResponseText(predicate: string | RegExp, timeoutMs: number = 60_000): Promise<string> {
		return await this.pollForResponseText(CHAT_RESPONSE, CHAT_RESPONSE_RENDERED, predicate, timeoutMs);
	}

	async waitForEditorResponseText(predicate: string | RegExp, timeoutMs: number = 60_000): Promise<string> {
		const matched = await this.pollForResponseText(CHAT_EDITOR_RESPONSE, CHAT_EDITOR_RESPONSE_RENDERED, predicate, timeoutMs);
		// After a contributed chat session (e.g. Copilot CLI, Claude) returns
		// its first response, the workbench commits the untitled session into
		// a real (titled) one and `replaceEditors` swaps the chat editor over.
		// If a follow-up message is sent during that swap, the participant
		// request can be cancelled mid-flight by the editor swap. The
		// {@link ChatEditor} sets `data-bound-chat-resource` on its editor
		// container after binding its widget to the loaded chat model, and
		// clears it during rebind — so we can wait for the swap to land via
		// Playwright's push-based `waitForSelector` (no polling on our side).
		await this.waitForEditorChatBoundToCommittedResource();
		return matched;
	}

	/**
	 * Wait until the chat editor's root container advertises a non-untitled
	 * chat resource via `data-bound-chat-resource`. Uses Playwright's
	 * `page.waitForSelector` which is push-based (MutationObserver in the
	 * renderer). Soft no-op when the selector never matches within
	 * `timeoutMs` (e.g. for local sessions that don't go through the
	 * untitled → committed swap).
	 */
	private async waitForEditorChatBoundToCommittedResource(timeoutMs: number = 15_000): Promise<void> {
		const selector = `.editor-instance .chat-editor-relative[data-bound-chat-resource]:not([data-bound-chat-resource*="/untitled-"])`;
		try {
			await this.code.driver.waitForElement(selector, { state: 'attached', timeout: timeoutMs });
		} catch {
			// Soft failure: caller already verified the response text is on
			// screen, so proceed and let downstream assertions surface any
			// actual problem.
		}
	}

	private async pollForResponseText(bubbleSelector: string, renderedSelector: string, predicate: string | RegExp, timeoutMs: number): Promise<string> {
		const deadline = Date.now() + timeoutMs;
		const matches = (text: string) => typeof predicate === 'string' ? text.includes(predicate) : predicate.test(text);
		while (Date.now() < deadline) {
			const elements = await this.code.driver.getElements(renderedSelector, /* recursive */ true);
			const matched = elements.map(el => el.textContent ?? '').filter(matches);
			if (matched.length > 0) {
				// Give the chat session a grace period to transition out of the
				// in-progress state before returning. The chat-request lifecycle
				// in extensions (notably Copilot CLI) has post-response async
				// work (usage metrics, metadata persistence, session bookkeeping)
				// that runs after the markdown is rendered. Sending a follow-up
				// message while that work is in flight routes the second request
				// through the steering code path, which does not reliably
				// surface the response in the UI. We wait (with a generous cap)
				// for any response bubble to drop the `chat-response-loading`
				// class. Some providers leave the class set even after content
				// has rendered, so we additionally enforce a small minimum
				// quiet period before returning.
				await this.waitForResponseSettled(bubbleSelector, 15_000, 4_000);
				return matched[matched.length - 1];
			}
			await new Promise(r => setTimeout(r, 250));
		}
		throw new Error(`Timed out waiting for response matching ${predicate} in '${renderedSelector}'`);
	}

	private async waitForResponseSettled(bubbleSelector: string, timeoutMs: number, fallbackQuietMs: number): Promise<void> {
		const settledSelector = `${bubbleSelector}:not(.chat-response-loading)`;
		const start = Date.now();
		const deadline = start + timeoutMs;
		while (Date.now() < deadline) {
			const settled = await this.code.driver.getElements(settledSelector, /* recursive */ true);
			if (settled.length > 0) {
				return;
			}
			await new Promise(r => setTimeout(r, 200));
		}
		// Loading class never cleared (e.g. Copilot CLI). Wait a bit longer
		// unconditionally so the underlying session has time to finish its
		// post-response bookkeeping before the next request is dispatched.
		const elapsed = Date.now() - start;
		if (elapsed < fallbackQuietMs) {
			await new Promise(r => setTimeout(r, fallbackQuietMs - elapsed));
		}
	}

	async getLatestEditorResponseText(): Promise<string> {
		const response = this.code.driver.currentPage.locator(CHAT_EDITOR_RESPONSE).last();
		return (await response.textContent()) ?? '';
	}

	async getLatestResponseText(): Promise<string> {
		const response = this.code.driver.currentPage.locator(CHAT_RESPONSE).last();
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
}
