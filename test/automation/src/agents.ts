/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Code } from './code';
import { QuickAccess } from './quickaccess';

const AGENTS_WORKBENCH = '.agent-sessions-workbench';
const NEW_SESSION_VIEW = '.sessions-chat-widget .new-chat-widget-container';
const SESSION_TYPE_PICKER = '.sessions-chat-session-type-picker .action-label';
const NEW_CHAT_EDITOR = `${NEW_SESSION_VIEW} .sessions-chat-editor .monaco-editor[role="code"]`;
const SEND_BUTTON_ENABLED = `${NEW_SESSION_VIEW} .sessions-chat-send-button .monaco-button:not(.disabled)`;
const RESPONSE = `${AGENTS_WORKBENCH} .interactive-item-container.interactive-response`;
const RESPONSE_COMPLETE = `${RESPONSE}:not(.chat-response-loading)`;

export class Agents {

	constructor(private code: Code, private quickaccess: QuickAccess) { }

	private get newChatEditorInputSelector(): string {
		return `${NEW_CHAT_EDITOR} ${this.code.editContextEnabled ? '.native-edit-context' : 'textarea'}`;
	}

	/**
	 * Run the "Open in Agents" command from the normal workbench window.
	 * VS Code opens a new Agents Window with the current workspace folder
	 * pre-selected in the workspace picker.
	 *
	 * After calling this, use {@link switchToAgentsWindow} to move the
	 * driver focus to the newly opened Agents Window.
	 */
	async openCurrentFolderInAgentsWindow(): Promise<void> {
		await this.quickaccess.runCommand('workbench.action.openWorkspaceInAgentsWindow');
	}

	/**
	 * Start a new session from inside the Agents Window via the
	 * `workbench.action.sessions.newChat` keybinding (Ctrl+L). The action
	 * is not exposed in the command palette, so we drive it through its
	 * key chord which works cross-platform (mac uses WinCtrl+L as the
	 * secondary binding, which maps to plain Ctrl+L).
	 */
	async startNewSession(): Promise<void> {
		await this.code.dispatchKeybinding('ctrl+l', async () => this.waitForNewSessionView());
	}

	/**
	 * Wait for a new Electron window to appear beyond the current count,
	 * then switch the driver to it. Returns once the new window has had a
	 * moment to install the workbench DOM.
	 */
	async switchToAgentsWindow(previousWindowCount: number, timeoutMs: number = 30_000): Promise<void> {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			const windows = this.code.driver.getAllWindows();
			if (windows.length > previousWindowCount) {
				const newIndex = windows.length - 1;
				this.code.driver.switchToWindow(newIndex);
				// Give the new window time to install workbench DOM
				await new Promise(r => setTimeout(r, 2000));
				return;
			}
			await new Promise(r => setTimeout(r, 300));
		}
		throw new Error(`Timed out waiting for Agents Window to open (${previousWindowCount} → more windows)`);
	}

	/**
	 * Wait until the new-session homepage is visible and ready.
	 * The homepage shows when no session is active yet.
	 */
	async waitForNewSessionView(retryCount: number = 600): Promise<void> {
		await this.code.waitForElement(NEW_SESSION_VIEW, undefined, retryCount);
	}

	/**
	 * Select the given session type from the new-session picker.
	 *
	 * The picker trigger is the `.action-label` inside
	 * `.sessions-chat-session-type-picker`. Clicking it opens the action
	 * widget popup; we then locate the matching `.monaco-list-row` by its
	 * text content and click it. The dropdown is async-populated, so we
	 * wait for at least the requested label to appear before committing.
	 */
	async selectSessionType(label: string): Promise<void> {
		await this.code.waitForElement(SESSION_TYPE_PICKER);

		const itemSel = `.action-widget .monaco-list-row`;
		const maxAttempts = 5;

		// The dropdown entries are populated asynchronously by the session
		// provider. Clicking the picker before the entries exist silently
		// opens an empty widget that immediately closes. Retry the click
		// until populated rows appear.
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			await this.code.waitAndClick(SESSION_TYPE_PICKER);
			try {
				await this.code.waitForElement(itemSel, el => !!el && (el.textContent ?? '').trim().length > 0, 30 /* ~3 seconds */);
				break;
			} catch {
				if (attempt === maxAttempts) {
					throw new Error(`Session type picker did not populate after ${maxAttempts} attempts`);
				}
				// Wait before retrying to give the provider time to populate
				await new Promise(r => setTimeout(r, 2000));
			}
		}

		const items = await this.code.waitForElements(itemSel, /* recursive */ true);
		const matchIndex = items.findIndex(el => (el.textContent ?? '').trim().toLowerCase().includes(label.toLowerCase()));
		if (matchIndex < 0) {
			throw new Error(`Session type "${label}" not found in picker. Available: ${items.map(i => (i.textContent ?? '').trim()).join(', ')}`);
		}
		await this.code.waitAndClick(`.action-widget .monaco-list-row[data-index="${matchIndex}"]`);
	}

	/**
	 * Submit a prompt from the new-session homepage. Waits for the send
	 * button to be enabled (indicates the session provider/extension host
	 * is ready) before clicking it.
	 *
	 * Clicking the explicit send button is more reliable than pressing
	 * Enter — Enter requires the editor to still be focused, but VS Code
	 * may re-focus other elements during initialization.
	 */
	async submitNewSessionPrompt(prompt: string, sendButtonRetryCount: number = 600): Promise<void> {
		await this.code.waitForElement(NEW_CHAT_EDITOR);
		await this.code.waitAndClick(NEW_CHAT_EDITOR);
		await this.code.waitForTypeInEditor(this.newChatEditorInputSelector, prompt);
		await this.code.waitForElement(SEND_BUTTON_ENABLED, undefined, sendButtonRetryCount);
		await this.code.waitAndClick(SEND_BUTTON_ENABLED);
	}

	/**
	 * Wait until at least one assistant response bubble contains text
	 * matching the predicate. Returns the matched element's full text
	 * content.
	 */
	async waitForAssistantText(predicate: RegExp | string, timeoutMs: number = 60_000): Promise<string> {
		const retryCount = Math.ceil(timeoutMs / 100);
		await this.code.waitForElement(RESPONSE, undefined, retryCount);
		await this.code.waitForElement(RESPONSE_COMPLETE, undefined, retryCount);

		const responseSelector = `${RESPONSE_COMPLETE} .rendered-markdown`;
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			const elements = await this.code.getElements(responseSelector, /* recursive */ true);
			for (const el of (elements ?? [])) {
				const text = el.textContent || '';
				if (typeof predicate === 'string' ? text.includes(predicate) : predicate.test(text)) {
					return text;
				}
			}
			await new Promise(r => setTimeout(r, 500));
		}
		throw new Error(`Timed out waiting for assistant text matching ${predicate}`);
	}
}
