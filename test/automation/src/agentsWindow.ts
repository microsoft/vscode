/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Code } from './code';
import { QuickAccess } from './quickaccess';

const AGENTS_WORKBENCH = '.agent-sessions-workbench';
const NEW_SESSION_VIEW = '.sessions-chat-widget .new-chat-widget-container';
const SESSION_TYPE_PICKER = '.sessions-chat-session-type-picker .action-label';
const SESSION_TYPE_PICKER_VISIBLE = `${SESSION_TYPE_PICKER}:not(.hidden)`;
const NEW_CHAT_EDITOR = `${NEW_SESSION_VIEW} .sessions-chat-editor .monaco-editor[role="code"]`;
const SEND_BUTTON_ENABLED = `${NEW_SESSION_VIEW} .sessions-chat-send-button .monaco-button:not(.disabled)`;
const ACTIVE_SESSION = `${AGENTS_WORKBENCH} .session-view.is-active`;
const ACTIVE_SESSION_INPUT_EDITOR = `${ACTIVE_SESSION} .interactive-session .interactive-input-part .monaco-editor[role="code"]`;
const ACTIVE_SESSION_SEND_BUTTON_ENABLED = `${ACTIVE_SESSION} .interactive-session .chat-input-toolbars > .chat-execute-toolbar .monaco-action-bar .action-item:not(.disabled) > .action-label.codicon-arrow-up`;
const RESPONSE = `${AGENTS_WORKBENCH} .interactive-item-container.interactive-response`;
const SESSION_LIST_ROW = `${AGENTS_WORKBENCH} .sessions-list-control .monaco-list-row`;

export class AgentsWindow {

	constructor(private code: Code, private quickaccess: QuickAccess) { }

	private get newChatEditorInputSelector(): string {
		return `${NEW_CHAT_EDITOR} ${this.code.editContextEnabled ? '.native-edit-context' : 'textarea'}`;
	}

	private get activeSessionInputSelector(): string {
		return `${ACTIVE_SESSION_INPUT_EDITOR} ${this.code.editContextEnabled ? '.native-edit-context' : 'textarea'}`;
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
	 * then switch the driver to it. Returns once the Agents Window's
	 * workbench DOM is present so the caller can immediately drive UI.
	 */
	async switchToAgentsWindow(previousWindowCount: number, timeoutMs: number = 30_000): Promise<void> {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			const windows = this.code.driver.getAllWindows();
			if (windows.length > previousWindowCount) {
				const newIndex = windows.length - 1;
				this.code.driver.switchToWindow(newIndex);
				// Wait for the Agents workbench DOM to be installed instead of
				// sleeping a fixed amount — Copilot review feedback #317545.
				await this.code.waitForElement(AGENTS_WORKBENCH);
				return;
			}
			await new Promise(r => setTimeout(r, 300));
		}
		throw new Error(`Timed out waiting for Agents Window to open (${previousWindowCount} → more windows)`);
	}

	/**
	 * Wait until the new-session homepage is visible and the session type
	 * picker is populated (i.e. no longer has the `.hidden` class). The
	 * picker is hidden until the provider has loaded session types; clicking
	 * it before that point silently does nothing.
	 */
	async waitForNewSessionView(retryCount: number = 600): Promise<void> {
		await this.code.waitForElement(NEW_SESSION_VIEW, undefined, retryCount);
		await this.code.waitForElement(SESSION_TYPE_PICKER_VISIBLE, undefined, retryCount);
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
		await this.code.waitForElement(SESSION_TYPE_PICKER_VISIBLE);

		const itemSel = `.action-widget .monaco-list-row`;
		const maxAttempts = 3;
		const needle = label.toLowerCase();

		// The picker click can silently do nothing if the active session
		// isn't fully initialized yet, and the dropdown is async-populated:
		// providers (e.g. the AgentHost-backed Copilot CLI variant) can
		// register a few seconds after the dropdown first renders. Retry
		// opening the dropdown and poll its rows until the requested label
		// appears, instead of just waiting for "any item".
		let lastSeen: string[] = [];
		outer: for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			await this.code.waitAndClick(SESSION_TYPE_PICKER_VISIBLE);
			const deadline = Date.now() + 10_000;
			while (Date.now() < deadline) {
				const items = await this.code.getElements(itemSel, /* recursive */ true);
				lastSeen = (items ?? []).map(i => (i.textContent ?? '').trim());
				if (lastSeen.some(t => t.toLowerCase().includes(needle))) {
					break outer;
				}
				await new Promise(r => setTimeout(r, 250));
			}
			if (attempt === maxAttempts) {
				throw new Error(`Session type "${label}" not found in picker. Available: ${lastSeen.join(', ')}`);
			}
			await new Promise(r => setTimeout(r, 2000));
		}

		const items = await this.code.waitForElements(itemSel, /* recursive */ true);
		const matchIndex = items.findIndex(el => (el.textContent ?? '').trim().toLowerCase().includes(needle));
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
	 * After clicking, verifies the new-session homepage disappears to
	 * confirm the send took effect. Retries the click if the view is
	 * still visible (the first click can silently fail if the button
	 * moved or an overlay intercepted the event).
	 */
	async submitNewSessionPrompt(prompt: string, sendButtonRetryCount: number = 600): Promise<void> {
		await this.code.waitForElement(NEW_CHAT_EDITOR);
		await this.code.waitAndClick(NEW_CHAT_EDITOR);
		await this.code.waitForTypeInEditor(this.newChatEditorInputSelector, prompt);
		await this.code.waitForElement(SEND_BUTTON_ENABLED, undefined, sendButtonRetryCount);
		await this.code.waitAndClick(SEND_BUTTON_ENABLED);
		// Verify the new-session view disappeared (confirms send took effect).
		// Don't retry the click — once submitted, the button becomes disabled
		// while the session is provisioning, so a retry would only fail.
		// The first session (especially Copilot CLI) can take longer to
		// transition, so allow up to ~30 seconds for the view to go away.
		await this.code.waitForElement(NEW_SESSION_VIEW, result => !result, 300);
	}

	/**
	 * Send a follow-up prompt to the currently active session (after the
	 * new-session view has been dismissed by {@link submitNewSessionPrompt}).
	 * Waits for the send button to be enabled before clicking it.
	 */
	async sendFollowUpMessage(prompt: string, sendButtonRetryCount: number = 600): Promise<void> {
		await this.code.waitForElement(ACTIVE_SESSION_INPUT_EDITOR);
		await this.code.waitAndClick(ACTIVE_SESSION_INPUT_EDITOR);
		await this.code.waitForTypeInEditor(this.activeSessionInputSelector, prompt);
		await this.code.waitForElement(ACTIVE_SESSION_SEND_BUTTON_ENABLED, undefined, sendButtonRetryCount);
		await this.code.waitAndClick(ACTIVE_SESSION_SEND_BUTTON_ENABLED);
	}

	/**
	 * Click the session in the sidebar whose item text contains `label` to
	 * make it the active session view. This is needed for session types
	 * (notably Copilot CLI) where the workbench auto-creates a fresh untitled
	 * session after a request completes; without re-selecting the
	 * just-completed session, a follow-up prompt would land in the new
	 * untitled session and spawn a brand new agent session instead of
	 * continuing the existing conversation.
	 *
	 * `label` should be a substring of the session row's text (typically the
	 * first response text from message 1, e.g. `MOCKED_COPILOT_RESPONSE`).
	 * We can't simply click the topmost row because the sessions list
	 * contains workspace folder group headers and historical sessions from
	 * prior runs.
	 *
	 * Returns once the active session has loaded and is ready for input.
	 *
	 * We also wait for the row to drop the `Working...` status indicator
	 * before clicking. While the session is still `SessionStatus.InProgress`
	 * (i.e. the workbench-side commit/swap of the untitled session into its
	 * real SDK-backed session is still in flight) the chat widget remains
	 * bound to the untitled URI. Sending a follow-up prompt during that
	 * window routes the request through the still-in-flight `_sendFirstChat`
	 * path again, and the response stream ends up attached to the untitled
	 * chat model that is then disposed when the swap finally lands. The
	 * caller never sees msg2's response in the active session view.
	 *
	 * After clicking the row we additionally wait until the
	 * `.session-view.is-active` element contains a response bubble whose
	 * rendered markdown matches `label`. The workbench auto-creates a fresh
	 * untitled session as soon as one commits, and that fresh session becomes
	 * the active view. If the row click and the auto-create race, the active
	 * view ends up bound to the new untitled session and shows the empty
	 * homepage, not the just-completed conversation. The post-click wait
	 * guarantees the chat widget has actually re-bound to the session we
	 * intended to activate before the caller types a follow-up.
	 */
	async activateSessionByLabel(label: string, timeoutMs: number = 30_000): Promise<void> {
		const retryCount = Math.ceil(timeoutMs / 100);
		await this.code.waitForElement(SESSION_LIST_ROW, undefined, retryCount);
		const workingStatus = 'Working...';
		const deadline = Date.now() + timeoutMs;
		const needle = label.toLowerCase();
		const activeResponseSelector = `${ACTIVE_SESSION} .interactive-item-container.interactive-response .rendered-markdown`;
		let lastTexts: string[] = [];
		let lastActiveTexts: string[] = [];
		while (Date.now() < deadline) {
			const rows = await this.code.getElements(SESSION_LIST_ROW, /* recursive */ true);
			lastTexts = (rows ?? []).map(r => (r.textContent ?? '').trim());
			const matchIndex = lastTexts.findIndex(t => t.toLowerCase().includes(needle) && !t.includes(workingStatus));
			if (matchIndex < 0) {
				await new Promise(r => setTimeout(r, 250));
				continue;
			}

			const summary = lastTexts.map((t, i) => `[${i}] ${JSON.stringify(t.slice(0, 120))}`).join('\n');
			console.log(`[agentsWindow] activateSessionByLabel("${label}") clicking index ${matchIndex}; all rows:\n${summary}`);
			await this.code.waitAndClick(`${SESSION_LIST_ROW}[data-index="${matchIndex}"]`);
			await this.code.waitForElement(ACTIVE_SESSION_INPUT_EDITOR, undefined, retryCount);

			// Wait until the active session view's chat widget actually shows a
			// response matching `label`. A bare `is-active` check is not enough
			// because the workbench may auto-create a fresh untitled session
			// and route it into the active slot between row-render and click.
			while (Date.now() < deadline) {
				const responses = await this.code.getElements(activeResponseSelector, /* recursive */ true);
				lastActiveTexts = (responses ?? []).map(el => (el.textContent ?? '').trim());
				if (lastActiveTexts.some(t => t.toLowerCase().includes(needle))) {
					return;
				}
				await new Promise(r => setTimeout(r, 250));
			}
			const activeSummary = lastActiveTexts.length
				? lastActiveTexts.map((t, i) => `  [${i}] ${JSON.stringify(t.slice(0, 120))}`).join('\n')
				: '  (no response bubbles in active session view)';
			throw new Error(`Activated row index ${matchIndex} but the active session view never rendered a response containing "${label}". Active view responses:\n${activeSummary}`);
		}
		const summary = lastTexts.map((t, i) => `  [${i}] ${JSON.stringify(t.slice(0, 120))}`).join('\n');
		throw new Error(`Timed out waiting for a settled session list row containing "${label}" (without "${workingStatus}"). Last-seen rows:\n${summary}`);
	}

	/**
	 * Wait until at least one assistant response bubble contains text
	 * matching the predicate. Returns the matched element's full text
	 * content.
	 *
	 * Matches any response bubble (loading or complete). The mock LLM
	 * server returns its full payload in one chunk, so the content is
	 * rendered as soon as the streaming starts — even if the session
	 * provider hasn't yet flipped the bubble out of `chat-response-loading`.
	 * For some providers (e.g. Copilot CLI) the "loading" class can linger
	 * well after the content is on screen, so requiring `:not(.chat-response-loading)`
	 * causes false-negative timeouts.
	 */
	async waitForAssistantText(predicate: RegExp | string, timeoutMs: number = 60_000): Promise<string> {
		const retryCount = Math.ceil(timeoutMs / 100);
		await this.code.waitForElement(RESPONSE, undefined, retryCount);

		const responseSelector = `${RESPONSE} .rendered-markdown`;
		const deadline = Date.now() + timeoutMs;
		let lastTexts: string[] = [];
		while (Date.now() < deadline) {
			const elements = await this.code.getElements(responseSelector, /* recursive */ true);
			lastTexts = (elements ?? []).map(el => el.textContent || '');
			for (const text of lastTexts) {
				if (typeof predicate === 'string' ? text.includes(predicate) : predicate.test(text)) {
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
					await this.waitForResponseSettled(15_000, 4_000);
					return text;
				}
			}
			await new Promise(r => setTimeout(r, 500));
		}
		const seen = lastTexts.length
			? lastTexts.map((t, i) => `  [${i}] ${JSON.stringify(t.length > 500 ? t.slice(0, 500) + '…' : t)}`).join('\n')
			: '  (no assistant response elements found)';
		const rowsAtFailure = await this.code.getElements(SESSION_LIST_ROW, /* recursive */ true);
		const rowsSummary = (rowsAtFailure ?? []).map((r, i) => `  [${i}] ${JSON.stringify((r.textContent ?? '').trim().slice(0, 120))}`).join('\n');
		const activeViews = await this.code.getElements(ACTIVE_SESSION, /* recursive */ false);
		const activeSummary = (activeViews ?? []).map((v, i) => `  [${i}] class=${JSON.stringify(v.className)} text=${JSON.stringify((v.textContent ?? '').trim().slice(0, 200))}`).join('\n');
		throw new Error(`Timed out waiting for assistant text matching ${predicate}\nLast-seen response text(s):\n${seen}\nSession list rows at failure:\n${rowsSummary}\nActive session views:\n${activeSummary}`);
	}

	private async waitForResponseSettled(timeoutMs: number, fallbackQuietMs: number): Promise<void> {
		const settledSelector = `${RESPONSE}:not(.chat-response-loading)`;
		const start = Date.now();
		const deadline = start + timeoutMs;
		while (Date.now() < deadline) {
			const settled = await this.code.getElements(settledSelector, /* recursive */ true);
			if ((settled ?? []).length > 0) {
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
}
