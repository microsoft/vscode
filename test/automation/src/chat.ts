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
const CHAT_MODEL_PICKER_NAME = `${CHAT_VIEW} .interactive-input-part .model-picker-name`;
const CHAT_MODEL_PICKER_CONFIG = `${CHAT_VIEW} .interactive-input-part .model-picker-config`;
const ACTION_WIDGET = '.action-widget';
const ACTION_WIDGET_ROW = '.action-widget .monaco-list-row.action';
// Context-usage gauge in the panel chat input. The inline widget only renders a
// percentage; the absolute context-window denominator lives in the click-through
// details popup (rendered in a body-level hover).
const CHAT_CONTEXT_USAGE_WIDGET = `${CHAT_VIEW} .chat-context-usage-widget`;
const CONTEXT_USAGE_DETAILS = '.chat-context-usage-details';
// The token-count label is the unclassed `<span>` in `.quota-label` (the sibling
// `span.quota-value` holds the percentage).
const CONTEXT_USAGE_TOKEN_LABEL = `${CONTEXT_USAGE_DETAILS} .quota-label span:not(.quota-value)`;
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

	/**
	 * Opens the model picker (in the panel chat input) and selects the model
	 * whose displayed name contains `modelName`. Clicks the model-picker name
	 * button to open the popup, waits for the matching row to appear (models may
	 * still be registering), clicks it, then confirms the selection committed.
	 *
	 * The row click can occasionally fail to commit — e.g. absorbed by the
	 * action-widget's animating `context-view-pointerBlock` overlay — silently
	 * leaving the previous model (often "Auto") selected. That model advertises
	 * no configurable options, so the config button never appears and a later
	 * `openModelConfig` wedges. To absorb this, re-open the picker and retry until
	 * the name button reflects the chosen model or `timeoutMs` elapses.
	 */
	async selectModel(modelName: string, timeoutMs: number = 60_000): Promise<void> {
		const page = this.code.driver.currentPage;
		const nameButton = page.locator(`${CHAT_MODEL_PICKER_NAME}:visible`).first();
		const row = page.locator(ACTION_WIDGET_ROW, { hasText: modelName }).first();
		const deadline = Date.now() + timeoutMs;
		let lastError: unknown;

		while (Date.now() < deadline) {
			try {
				await nameButton.click();
				await this.code.waitForElement(ACTION_WIDGET);
				// The picker opens with a focused filter input. Type the model name to
				// narrow the list — otherwise the model may be hidden in a collapsed
				// "Other Models" section.
				await page.keyboard.type(modelName);
				await row.waitFor({ state: 'visible', timeout: 10_000 });
				// `force` bypasses the transient `context-view-pointerBlock` overlay
				// that intercepts pointer events while the action widget animates open.
				await row.click({ force: true });
				// Confirm the selection actually committed: the picker name button must
				// now display the chosen model. (A non-committing click leaves the old
				// model selected and the picker dismissed, so waiting only for the
				// popup to close would miss it.) Scope to `:visible` so a hidden overflow
				// duplicate of the name button can't produce a false positive.
				await page.locator(`${CHAT_MODEL_PICKER_NAME}:visible`, { hasText: modelName })
					.first()
					.waitFor({ state: 'visible', timeout: 10_000 });
				return;
			} catch (error) {
				lastError = error;
				// Dismiss the (possibly empty / stale) picker so the next attempt
				// re-opens a freshly-populated one.
				try { await page.keyboard.press('Escape'); } catch { /* picker already gone */ }
				await new Promise(r => setTimeout(r, 500));
			}
		}
		throw new Error(`Timed out selecting model "${modelName}". Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
	}

	/**
	 * Opens the combined model configuration dropdown (Thinking Effort / Context
	 * Size) by clicking the model picker's configuration button. The button is
	 * only visible when the selected model advertises configurable options, so
	 * this waits for it to become visible before clicking.
	 *
	 * The config popup is shown through the singleton action-widget service and
	 * its rows are built once at open (rebuilt only on selection), so a popup
	 * observed mid-teardown of a previous open never self-heals. Waiting only for
	 * the popup container would therefore race a half-open / tearing-down popup
	 * that has no rows. To absorb that, this waits for actual option rows to
	 * render and re-opens (Escape + re-click) until they do — mirroring
	 * {@link selectModel}.
	 */
	async openModelConfig(timeoutMs: number = 30_000): Promise<void> {
		const page = this.code.driver.currentPage;
		// There can be a hidden duplicate of the config button (e.g. an overflow
		// copy); target the visible one.
		const configButton = page.locator(`${CHAT_MODEL_PICKER_CONFIG}:visible`).first();
		const anyRow = page.locator(`${ACTION_WIDGET_ROW}:visible`).first();
		const deadline = Date.now() + timeoutMs;
		let lastError: unknown;

		// A context-usage details hover from a prior `readContextUsageTokenLabel`
		// can linger as a body-level overlay over the model-config button; a forced
		// click would then land on the popup instead of opening the dropdown,
		// wedging it open without rows. Park the pointer away and wait for the
		// overlay to detach before clicking.
		await this.dismissContextUsageDetails();

		while (Date.now() < deadline) {
			try {
				await configButton.waitFor({ state: 'visible', timeout: 15_000 });
				await configButton.click({ force: true });
				await this.code.waitForElement(ACTION_WIDGET);
				// Wait for the option rows to actually render, not just the popup
				// container, so callers don't race a half-open / tearing-down popup.
				await anyRow.waitFor({ state: 'visible', timeout: 5_000 });
				return;
			} catch (error) {
				lastError = error;
				// Dismiss the (possibly empty / stale) popup so the next attempt
				// re-opens a freshly-built one.
				try {
					await page.keyboard.press('Escape');
				} catch { /* popup already gone */ }
				await new Promise(r => setTimeout(r, 250));
			}
		}
		throw new Error(`Timed out opening the model configuration dropdown. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
	}

	/**
	 * Clicks the option whose label contains `label` in the open model
	 * configuration dropdown, then waits until that option reads back as checked
	 * (the dropdown stays open and rebuilds in place after each selection, so the
	 * checked state confirms the underlying async configuration write resolved).
	 *
	 * The config picker only rebuilds its rows on selection, so a popup that
	 * opened without this option's row (e.g. mid-teardown of a previous open)
	 * never gains it. If the row doesn't appear, re-open the popup and retry;
	 * prior selections persist as configuration writes, so re-opening is safe.
	 */
	async selectModelConfigOption(label: string, timeoutMs: number = 30_000): Promise<void> {
		const page = this.code.driver.currentPage;
		const row = page.locator(ACTION_WIDGET_ROW, { hasText: label }).first();
		const deadline = Date.now() + timeoutMs;
		let lastError: unknown;

		while (Date.now() < deadline) {
			try {
				await row.waitFor({ state: 'visible', timeout: 5_000 });
				await row.click({ force: true });
				await row.locator('.codicon-check').waitFor({ state: 'visible', timeout: 15_000 });
				return;
			} catch (error) {
				lastError = error;
				// Re-open the popup so the next attempt sees a freshly-built list
				// containing this option's row.
				try {
					await this.openModelConfig(Math.max(5_000, deadline - Date.now()));
				} catch { /* will retry until the outer deadline */ }
			}
		}
		throw new Error(`Timed out selecting model config option "${label}". Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
	}

	/**
	 * Dismisses the open model configuration dropdown.
	 */
	async closeModelConfig(): Promise<void> {
		const page = this.code.driver.currentPage;
		await page.keyboard.press('Escape');
		await page.waitForFunction(
			(sel: string) => { const c = document.querySelector(sel); return !c || c.getAttribute('aria-expanded') !== 'true'; },
			CHAT_MODEL_PICKER_CONFIG,
			{ timeout: 15_000 },
		);
		// Also wait for the popup's option rows to detach so a subsequent open
		// starts from a clean state rather than racing this teardown. Best-effort:
		// the rows may already be gone (the locator then resolves immediately).
		await page.locator(`${ACTION_WIDGET_ROW}:visible`).first()
			.waitFor({ state: 'hidden', timeout: 5_000 })
			.catch(() => { /* already detached */ });
	}

	/**
	 * Returns the visible model-configuration button label (the combined
	 * "Effort Context" summary, e.g. "High 200K", shown in UBB mode).
	 */
	async getModelConfigLabel(): Promise<string> {
		const page = this.code.driver.currentPage;
		const button = page.locator(`${CHAT_MODEL_PICKER_CONFIG}:visible`).first();
		await button.waitFor({ state: 'visible', timeout: 15_000 });
		return ((await button.textContent()) ?? '').trim();
	}

	/**
	 * Open the panel chat's context-usage details popup and return the full
	 * "{used} / {total} tokens" label text. The inline gauge only renders a
	 * percentage; the absolute context-window denominator lives in the details
	 * hover (a body-level overlay).
	 *
	 * Reads via a *hover* rather than a click on purpose: clicking the gauge opens
	 * a sticky, focus-trapping details hover that Escape cannot close and that
	 * then overlaps — and wedges — the model-config button on the next operation.
	 * The delayed (mouse) hover shows the same details and auto-hides once the
	 * pointer leaves the gauge. The gauge stays hidden until a response carrying
	 * token usage has rendered, so this waits for it first, then retries the
	 * hover + read since the delayed hover can occasionally need a second attempt.
	 * Moves the pointer off the gauge before returning so nothing lingers.
	 */
	async readContextUsageTokenLabel(timeoutMs: number = 30_000): Promise<string> {
		const page = this.code.driver.currentPage;
		const widget = page.locator(`${CHAT_CONTEXT_USAGE_WIDGET}:visible`).first();
		await widget.waitFor({ state: 'visible', timeout: timeoutMs });
		const label = page.locator(CONTEXT_USAGE_TOKEN_LABEL).first();
		const deadline = Date.now() + timeoutMs;
		let lastError: unknown;
		while (Date.now() < deadline) {
			try {
				// Trigger the gauge's delayed (non-sticky) hover with a raw pointer
				// move to its center. A normal hover() waits on Playwright
				// actionability — the gauge expands on hover and its progress arc
				// animates, so the stability check can hang for the full timeout and
				// eat the whole deadline (defeating this retry loop). Moving the
				// pointer away first guarantees a fresh mouse-enter that (re-)opens
				// the hover on every attempt.
				const box = await widget.boundingBox();
				if (!box) {
					throw new Error('context-usage gauge has no bounding box');
				}
				await page.mouse.move(0, 0);
				await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
				await label.waitFor({ state: 'visible', timeout: 5_000 });
				const text = (await label.textContent()) ?? '';
				// Move the pointer off the gauge so the non-sticky hover auto-hides
				// and leaves no overlay to intercept later clicks.
				await this.dismissContextUsageDetails();
				return text.trim();
			} catch (error) {
				lastError = error;
				await this.dismissContextUsageDetails();
				await new Promise(r => setTimeout(r, 500));
			}
		}
		throw new Error(`Timed out reading the context-usage details token label. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
	}

	/**
	 * Dismiss the context-usage details hover by moving the pointer off the gauge
	 * and waiting for the overlay to fully detach. The details popup is shown as a
	 * hover anchored to the context-usage gauge; the read path uses a non-sticky
	 * hover that hides once the pointer leaves, so parking the pointer away from
	 * every widget dismisses it (Escape does not close it). Best-effort: if it
	 * never detaches within the budget, the caller proceeds regardless.
	 */
	private async dismissContextUsageDetails(timeoutMs: number = 5_000): Promise<void> {
		const page = this.code.driver.currentPage;
		const details = page.locator(CONTEXT_USAGE_DETAILS);
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			// Park the pointer away from the gauge (and every other widget) so the
			// hover hides and cannot be re-triggered by a lingering cursor.
			try { await page.mouse.move(0, 0); } catch { /* no page */ }
			if (await details.count() === 0) {
				return;
			}
			await new Promise(r => setTimeout(r, 150));
		}
	}
}
