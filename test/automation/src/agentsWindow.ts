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
const ACTIVE_SESSION_SEND_BUTTON_ENABLED = `${ACTIVE_SESSION} .interactive-session .chat-input-toolbars > .chat-execute-toolbar .monaco-action-bar .action-item:not(.disabled) > .action-label.codicon-newline`;
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
	 * Start a new session from inside the Agents Window by executing
	 * `workbench.action.sessions.newChat` via the command palette. We
	 * avoid a raw keybinding dispatch because the action's Ctrl+L
	 * binding is gated on `!editorAreaFocus`, which is false after
	 * interacting with the chat editor.
	 */
	async startNewSession(): Promise<void> {
		await this.quickaccess.runCommand('workbench.action.sessions.newChat');
		await this.waitForNewSessionView();
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
	 * Returns whether the given session type appears in the new-session picker.
	 *
	 * The picker dropdown is a one-shot snapshot rendered when it opens and is
	 * populated from the (async) registered session providers — so a provider
	 * that registers a few seconds after the page loads (e.g. the agent-host
	 * Codex provider, which spawns a native app-server first) may not be present
	 * the first time the dropdown opens. We therefore **re-open** the dropdown on
	 * each attempt (a stale open dropdown never gains new rows) and poll until the
	 * label appears or `timeoutMs` elapses, dismissing with Escape between tries.
	 *
	 * Use this to gate tests on optionally-registered providers (skip when
	 * absent) instead of relying on {@link selectSessionType} throwing.
	 */
	async isSessionTypeAvailable(label: string, timeoutMs: number = 30_000): Promise<boolean> {
		await this.code.waitForElement(SESSION_TYPE_PICKER_VISIBLE);

		const itemSel = `.action-widget .monaco-list-row`;
		const needle = label.toLowerCase();
		const deadline = Date.now() + timeoutMs;

		while (Date.now() < deadline) {
			// (Re-)open the dropdown so its rows reflect the current provider set.
			await this.code.waitAndClick(SESSION_TYPE_PICKER_VISIBLE);

			let found = false;
			const openDeadline = Math.min(deadline, Date.now() + 2_000);
			while (Date.now() < openDeadline) {
				const items = await this.code.getElements(itemSel, /* recursive */ true);
				const labels = (items ?? []).map(i => (i.textContent ?? '').trim());
				if (labels.some(t => t.toLowerCase().includes(needle))) {
					found = true;
					break;
				}
				await new Promise(r => setTimeout(r, 200));
			}

			// Dismiss the dropdown so it does not intercept later clicks. Best-effort:
			// a dismiss hiccup must never turn an availability check (and the
			// graceful skip that may follow) into a test failure.
			try {
				await this.code.dispatchKeybinding('escape', async () => { await this.code.waitForElement(itemSel, el => !el, 20); });
			} catch { /* dropdown already gone or slow to close — ignore */ }

			if (found) {
				return true;
			}
			await new Promise(r => setTimeout(r, 500));
		}
		return false;
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
	async selectSessionType(label: string, timeoutMs: number = 60_000): Promise<void> {
		await this.code.waitForElement(SESSION_TYPE_PICKER_VISIBLE);

		const itemSel = `.action-widget .monaco-list-row`;
		const needle = label.toLowerCase();
		const isActionRow = (el: { className: string }) => el.className.includes('action');
		const rowText = (el: { textContent: string }) => (el.textContent ?? '').trim().toLowerCase();
		const deadline = Date.now() + timeoutMs;

		// Outer loop: open dropdown, wait for the desired row, click it, then
		// verify the picker label commits to the request. Each step can fail
		// for reasons that resolve themselves shortly after — the dropdown is
		// async-populated by providers that register a few seconds after page
		// load (e.g. the AgentHost-backed Codex variant downloads its SDK and
		// spawns a native app-server first), and a click landing while that's
		// still in flight silently closes the dropdown without committing the
		// active session type. Keep retrying the whole open→find→click→verify
		// sequence until the picker label reflects `label` or the overall
		// budget expires.
		let lastSeen: string[] = [];
		let displayed = '';
		while (Date.now() < deadline) {
			// Open dropdown and wait for the requested row to appear.
			await this.code.waitAndClick(SESSION_TYPE_PICKER_VISIBLE);
			const openDeadline = Math.min(deadline, Date.now() + 10_000);
			let items: { className: string; textContent: string; attributes: Record<string, string> }[] | undefined;
			while (Date.now() < openDeadline) {
				items = await this.code.getElements(itemSel, /* recursive */ true);
				lastSeen = (items ?? []).map(i => (i.textContent ?? '').trim());
				if (lastSeen.some(t => t.toLowerCase().includes(needle))) {
					break;
				}
				await new Promise(r => setTimeout(r, 250));
			}
			if (!items?.some(el => rowText(el).includes(needle))) {
				// Row never showed in this dropdown pass — close and retry.
				await new Promise(r => setTimeout(r, 1000));
				continue;
			}

			// Prefer an actionable row whose label matches directly. Otherwise
			// treat the label as a section header and pick the first action row
			// beneath it.
			let matchIndex = items.findIndex(el => isActionRow(el) && rowText(el).includes(needle));
			if (matchIndex < 0) {
				const headerIndex = items.findIndex(el => !isActionRow(el) && rowText(el).includes(needle));
				if (headerIndex >= 0) {
					matchIndex = items.findIndex((el, index) => index > headerIndex && isActionRow(el));
				}
			}
			if (matchIndex < 0) {
				await new Promise(r => setTimeout(r, 1000));
				continue;
			}

			const dataIndex = items[matchIndex].attributes['data-index'] ?? String(matchIndex);
			await this.code.waitAndClick(`.action-widget .monaco-list-row[data-index="${dataIndex}"]`);

			// Verify the picker committed to the requested type. Poll briefly
			// because the active label is updated asynchronously after the click.
			const verifyDeadline = Math.min(deadline, Date.now() + 5_000);
			while (Date.now() < verifyDeadline) {
				const labels = await this.code.getElements(SESSION_TYPE_PICKER_VISIBLE, /* recursive */ true);
				displayed = ((labels ?? [])[0]?.textContent ?? '').trim();
				if (displayed.toLowerCase().includes(needle)) {
					return;
				}
				await new Promise(r => setTimeout(r, 200));
			}
			// Click didn't commit — most likely the provider wasn't fully ready
			// at click time. Loop around and re-open the dropdown after a short
			// pause so the provider has a chance to finish registering.
			await new Promise(r => setTimeout(r, 1000));
		}
		throw new Error(`Timed out (${timeoutMs}ms) selecting session type "${label}". Last picker label: "${displayed}". Last dropdown rows: ${lastSeen.join(', ')}`);
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

		const maxClickAttempts = 3;
		for (let attempt = 1; attempt <= maxClickAttempts; attempt++) {
			await this.code.waitAndClick(SEND_BUTTON_ENABLED);
			// Verify the new-session view disappeared (confirms send took effect).
			// Use a generous budget here because on slow dev machines / busy CI the
			// transition can take well over 3 seconds and we don't want to fall
			// through to a retry that then waits 20s for a send button that has
			// since been torn down by the (actually successful) first click.
			try {
				await this.code.waitForElement(NEW_SESSION_VIEW, result => !result, 150 /* ~15 seconds */);
				return; // View gone — send succeeded
			} catch {
				// View still present — click may not have fired. Only retry if the
				// send button is still around; if it's gone, the click did take
				// effect and the view transition is merely lagging behind.
				const sendButtonGone = await this.code
					.waitForElement(SEND_BUTTON_ENABLED, result => !result, 1)
					.then(() => true, () => false);
				if (sendButtonGone) {
					return;
				}
				if (attempt < maxClickAttempts) {
					await new Promise(r => setTimeout(r, 1000));
				}
			}
		}
		// Proceed even if the view didn't disappear — the send may have
		// worked but the view transition is slow.
	}

	/**
	 * Send a follow-up prompt to the currently active session (after the
	 * new-session view has been dismissed by {@link submitNewSessionPrompt}).
	 * Waits for the send button to be enabled before clicking it.
	 *
	 * Pass `expectedActiveLabel` (typically the first response text of the
	 * session you just activated via {@link activateSessionByLabel}) to also
	 * re-verify, immediately before clicking send, that the active session
	 * view still contains a response bubble matching that label. The Agents
	 * Window can auto-swap the active slot to a fresh untitled session
	 * after `activateSessionByLabel` returns; without re-checking, the send
	 * would land in the untitled session and the follow-up never reaches
	 * the intended conversation. When the check fails the active session is
	 * re-activated and the prompt is re-typed before sending.
	 */
	async sendFollowUpMessage(prompt: string, sendButtonRetryCount: number = 600, expectedActiveLabel?: string): Promise<void> {
		const typeAndSend = async () => {
			await this.code.waitForElement(ACTIVE_SESSION_INPUT_EDITOR);
			await this.code.waitAndClick(ACTIVE_SESSION_INPUT_EDITOR);
			await this.code.waitForTypeInEditor(this.activeSessionInputSelector, prompt);
			await this.code.waitForElement(ACTIVE_SESSION_SEND_BUTTON_ENABLED, undefined, sendButtonRetryCount);
		};

		await typeAndSend();

		if (expectedActiveLabel) {
			const stillActive = await this._activeSessionContainsResponse(expectedActiveLabel);
			if (!stillActive) {
				// The active slot swapped between activation and send. Re-bind
				// and re-type the prompt before sending.
				await this.activateSessionByLabel(expectedActiveLabel);
				await typeAndSend();
			}
		}

		await this.code.waitAndClick(ACTIVE_SESSION_SEND_BUTTON_ENABLED);
	}

	private async _activeSessionContainsResponse(label: string): Promise<boolean> {
		const activeResponseSelector = `${ACTIVE_SESSION} .interactive-item-container.interactive-response .rendered-markdown`;
		const responses = await this.code.getElements(activeResponseSelector, /* recursive */ true);
		const needle = label.toLowerCase();
		return (responses ?? []).some(r => (r.textContent ?? '').toLowerCase().includes(needle));
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

		const activeResponseSelector = `${ACTIVE_SESSION} .interactive-item-container.interactive-response`;
		const markdownResponseSelector = `${RESPONSE} .rendered-markdown`;
		const deadline = Date.now() + timeoutMs;
		let lastTexts: string[] = [];
		while (Date.now() < deadline) {
			// Look in BOTH the active session view and the broader workbench
			// scope. The Agents Window can auto-swap the active slot to a
			// fresh untitled session immediately after a follow-up commits,
			// which leaves the just-arrived assistant reply visible only in
			// the previous session's DOM (the rows haven't been recycled yet
			// or the session lives in another non-active slot). Scoping
			// strictly to `.session-view.is-active` would then miss the
			// match even though the response did render. The wider scope
			// also covers the case where the active slot is still bound to
			// the originating session but multiple slots are present.
			const activeResponseElements = await this.code.getElements(activeResponseSelector, /* recursive */ true);
			const activeTexts = (activeResponseElements ?? []).map(el => el.textContent || '');
			const markdownElements = await this.code.getElements(markdownResponseSelector, /* recursive */ true);
			const markdownTexts = (markdownElements ?? []).map(el => el.textContent || '');
			lastTexts = activeTexts.length ? activeTexts : markdownTexts;
			const candidates = [...activeTexts, ...markdownTexts];
			for (const text of candidates) {
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
