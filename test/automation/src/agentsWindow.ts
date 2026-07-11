/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Code } from './code';
import { acceptToolConfirmationIfPresent } from './chat';
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

// The Agents Window active session input reuses the workbench `ChatInputPart`,
// so its model picker renders the same `.model-picker-name` / `.model-picker-config`
// buttons as the panel chat (see `test/automation/src/chat.ts`). Scope to the
// active session view so we never touch the new-session homepage's picker.
const ACTIVE_SESSION_MODEL_PICKER_NAME = `${ACTIVE_SESSION} .interactive-input-part .model-picker-name`;
const ACTIVE_SESSION_MODEL_PICKER_CONFIG = `${ACTIVE_SESSION} .interactive-input-part .model-picker-config`;
// The action widget popup (model list / config dropdown) is rendered at the
// document body, not inside the chat view, so these selectors are unscoped.
const ACTION_WIDGET = '.action-widget';
const ACTION_WIDGET_ROW = '.action-widget .monaco-list-row.action';

// Context-usage gauge in the active session's secondary toolbar. The inline
// widget only renders a percentage; the absolute context-window denominator
// lives in the click-through details popup (rendered in a body-level hover).
const ACTIVE_SESSION_CONTEXT_USAGE = `${ACTIVE_SESSION} .chat-context-usage-widget`;
const CONTEXT_USAGE_DETAILS = '.chat-context-usage-details';
// The token-count label is the unclassed `<span>` in `.quota-label` (the
// sibling `span.quota-value` holds the percentage).
const CONTEXT_USAGE_TOKEN_LABEL = `${CONTEXT_USAGE_DETAILS} .quota-label span:not(.quota-value)`;

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
		const isActionRow = (el: { className: string }) => el.className.includes('action');
		const rowText = (el: { textContent: string }) => (el.textContent ?? '').trim().toLowerCase();

		// Prefer an actionable row whose label matches directly (e.g. a
		// session type label like "Claude" or "Copilot CLI").
		let matchIndex = items.findIndex(el => isActionRow(el) && rowText(el).includes(needle));
		// Otherwise treat the label as a provider section header (e.g. "Local
		// Agent Host"): headers are non-clickable rows rendered above their
		// session types, so select the first actionable row beneath the header.
		if (matchIndex < 0) {
			const headerIndex = items.findIndex(el => !isActionRow(el) && rowText(el).includes(needle));
			if (headerIndex >= 0) {
				matchIndex = items.findIndex((el, index) => index > headerIndex && isActionRow(el));
			}
		}
		if (matchIndex < 0) {
			throw new Error(`Session type "${label}" not found in picker. Available: ${items.map(i => (i.textContent ?? '').trim()).join(', ')}`);
		}
		const dataIndex = items[matchIndex].attributes['data-index'] ?? String(matchIndex);
		await this.code.waitAndClick(`.action-widget .monaco-list-row[data-index="${dataIndex}"]`);
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
	 *
	 * `activeRowMatch` (defaulting to `expectedActiveLabel`) is forwarded to
	 * {@link activateSessionByLabel} to locate the row on re-activation; pass
	 * both the first prompt and the response so row matching is robust against
	 * the asynchronously generated session title (see that method's docs).
	 */
	async sendFollowUpMessage(prompt: string, sendButtonRetryCount: number = 600, expectedActiveLabel?: string, activeRowMatch?: string | string[]): Promise<void> {
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
				await this.activateSessionByLabel(activeRowMatch ?? expectedActiveLabel, expectedActiveLabel);
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
	 * `rowMatch` is one (or several) substrings used to locate the row; a row
	 * matches when its text contains ANY of them. We can't simply click the
	 * topmost row because the sessions list contains workspace folder group
	 * headers and historical sessions from prior runs.
	 *
	 * Pass BOTH the user's first prompt and the expected response here. The
	 * row's text is the session title, which is auto-generated asynchronously
	 * by a utility model after the first turn: until that lands the title is
	 * the synchronous fallback (the user's prompt), and once it lands the
	 * title becomes the generated value (which, in the smoke mock, echoes the
	 * scenario reply because the title prompt embeds the tagged user message).
	 * Matching on the prompt alone is racy because the generated title can
	 * replace it; matching on the response alone is racy because the generated
	 * title may not have landed yet. Accepting either makes activation
	 * deterministic regardless of when the title generation completes.
	 *
	 * `responseLabel` (defaulting to the first `rowMatch` entry) is the text
	 * the just-completed conversation's response bubble must contain; it is
	 * verified in the active session view after the row is clicked.
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
	async activateSessionByLabel(rowMatch: string | string[], responseLabel?: string, timeoutMs: number = 30_000): Promise<void> {
		const retryCount = Math.ceil(timeoutMs / 100);
		await this.code.waitForElement(SESSION_LIST_ROW, undefined, retryCount);
		const workingStatus = 'Working...';
		const deadline = Date.now() + timeoutMs;
		const rowMatches = Array.isArray(rowMatch) ? rowMatch : [rowMatch];
		const rowNeedles = rowMatches.map(s => s.toLowerCase());
		const responseNeedle = (responseLabel ?? rowMatches[0]).toLowerCase();
		const activeResponseSelector = `${ACTIVE_SESSION} .interactive-item-container.interactive-response .rendered-markdown`;
		let lastTexts: string[] = [];
		let lastActiveTexts: string[] = [];
		while (Date.now() < deadline) {
			const rows = await this.code.getElements(SESSION_LIST_ROW, /* recursive */ true);
			lastTexts = (rows ?? []).map(r => (r.textContent ?? '').trim());
			const matchIndex = lastTexts.findIndex(t => !t.includes(workingStatus) && rowNeedles.some(n => t.toLowerCase().includes(n)));
			if (matchIndex < 0) {
				await new Promise(r => setTimeout(r, 250));
				continue;
			}

			const summary = lastTexts.map((t, i) => `[${i}] ${JSON.stringify(t.slice(0, 120))}`).join('\n');
			console.log(`[agentsWindow] activateSessionByLabel(${JSON.stringify(rowMatches)}) clicking index ${matchIndex}; all rows:\n${summary}`);
			await this.code.waitAndClick(`${SESSION_LIST_ROW}[data-index="${matchIndex}"]`);
			await this.code.waitForElement(ACTIVE_SESSION_INPUT_EDITOR, undefined, retryCount);

			// Wait until the active session view's chat widget actually shows a
			// response matching `responseLabel`. A bare `is-active` check is not
			// enough because the workbench may auto-create a fresh untitled
			// session and route it into the active slot between row-render and click.
			while (Date.now() < deadline) {
				const responses = await this.code.getElements(activeResponseSelector, /* recursive */ true);
				lastActiveTexts = (responses ?? []).map(el => (el.textContent ?? '').trim());
				if (lastActiveTexts.some(t => t.toLowerCase().includes(responseNeedle))) {
					return;
				}
				await new Promise(r => setTimeout(r, 250));
			}
			const activeSummary = lastActiveTexts.length
				? lastActiveTexts.map((t, i) => `  [${i}] ${JSON.stringify(t.slice(0, 120))}`).join('\n')
				: '  (no response bubbles in active session view)';
			throw new Error(`Activated row index ${matchIndex} but the active session view never rendered a response containing "${responseLabel ?? rowMatches[0]}". Active view responses:\n${activeSummary}`);
		}
		const summary = lastTexts.map((t, i) => `  [${i}] ${JSON.stringify(t.slice(0, 120))}`).join('\n');
		throw new Error(`Timed out waiting for a settled session list row containing any of ${JSON.stringify(rowMatches)} (without "${workingStatus}"). Last-seen rows:\n${summary}`);
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
	async waitForAssistantText(predicate: RegExp | string, timeoutMs: number = 60_000, options?: { acceptToolConfirmations?: boolean }): Promise<string> {
		const retryCount = Math.ceil(timeoutMs / 100);
		await this.code.waitForElement(RESPONSE, undefined, retryCount);

		const activeResponseSelector = `${ACTIVE_SESSION} .interactive-item-container.interactive-response`;
		const markdownResponseSelector = `${RESPONSE} .rendered-markdown`;
		const deadline = Date.now() + timeoutMs;
		let lastTexts: string[] = [];
		while (Date.now() < deadline) {
			// When requested, accept any pending terminal tool confirmation so
			// the agentic loop can proceed. No-op for sessions that
			// auto-approve their shell commands.
			if (options?.acceptToolConfirmations) {
				await acceptToolConfirmationIfPresent(this.code);
			}
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
					// Synchronize with the workbench-side untitled → committed
					// URI swap: the {@link ChatView} sets `data-bound-chat-resource`
					// on its root element after binding its inner widget to the
					// loaded chat model, and clears it during rebind. Without this
					// wait, follow-up typing can land in the about-to-be-replaced
					// widget while the rebind is still in flight, losing the typed
					// prompt when the widget swaps to the committed session.
					await this.waitForActiveChatBoundToCommittedResource();
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

	/**
	 * Wait until the active session view's {@link ChatView} root advertises
	 * a non-untitled chat resource via the `data-bound-chat-resource`
	 * attribute. The Agents Window's `ChatView.setChat` sets this attribute
	 * after binding its inner chat widget to the loaded chat model, and
	 * clears it during rebind — so this CSS selector matches precisely
	 * once the untitled → committed URI swap has landed and the widget is
	 * bound to the committed chat.
	 *
	 * Uses Playwright's `page.waitForSelector` (push-based via
	 * `MutationObserver` in the renderer) so we don't add any polling on
	 * the test-driver side. Soft no-op when the selector never matches
	 * within `timeoutMs` (e.g. for sessions that don't use {@link ChatView}
	 * such as the local AgentHost smoke tests).
	 */
	private async waitForActiveChatBoundToCommittedResource(timeoutMs: number = 15_000): Promise<void> {
		const selector = `${ACTIVE_SESSION} .chat-view-chat[data-bound-chat-resource]:not([data-bound-chat-resource*="/untitled-"])`;
		try {
			await this.code.driver.waitForElement(selector, { state: 'attached', timeout: timeoutMs });
		} catch {
			// Soft failure: callers have already verified the response text
			// is on screen, so proceed and let downstream assertions surface
			// any actual problem.
		}
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

	/**
	 * Open the model picker in the active session input and select the model
	 * whose displayed name contains `modelName`. Clicks the model-picker name
	 * button to open the popup, types the name to narrow the list (a model may
	 * otherwise be hidden in a collapsed "Other Models" section), clicks the
	 * matching row, then waits for the popup to dismiss.
	 *
	 * The model list is populated asynchronously after the session activates, so
	 * the row can be absent the first time the picker opens. A stale open picker
	 * never gains new rows, so we re-open it on each attempt (dismissing with
	 * Escape in between) and poll until the row appears or `timeoutMs` elapses —
	 * mirroring {@link selectSessionType}.
	 *
	 * Mirrors {@link Chat.selectModel} but scoped to the Agents Window's active
	 * session view rather than the panel chat.
	 */
	async selectModel(modelName: string, timeoutMs: number = 60_000): Promise<void> {
		const page = this.code.driver.currentPage;
		const row = page.locator(ACTION_WIDGET_ROW, { hasText: modelName }).first();
		const deadline = Date.now() + timeoutMs;
		let lastError: unknown;

		while (Date.now() < deadline) {
			try {
				await page.locator(`${ACTIVE_SESSION_MODEL_PICKER_NAME}:visible`).first().click();
				await this.code.waitForElement(ACTION_WIDGET);
				// The picker opens with a focused filter input. Type the model name
				// to narrow the list.
				await page.keyboard.type(modelName);
				await row.waitFor({ state: 'visible', timeout: 5_000 });
				// `force` bypasses the transient `context-view-pointerBlock` overlay
				// that intercepts pointer events while the action widget animates open.
				await row.click({ force: true });
				// Confirm the selection actually committed: the picker name button
				// must now reflect the chosen model. A non-committing click (e.g.
				// absorbed by the animating pointer-block overlay) silently leaves the
				// previous model selected and the picker dismissed, so waiting only
				// for the popup to close would miss it. Match on the button's accessible
				// name (aria-label, e.g. "Models, <modelName>") rather than the visible
				// text: when the input is narrow the picker collapses to an icon-only
				// button and no longer renders the model name as visible text. Scope to
				// `:visible` so a hidden overflow duplicate of the name button can't
				// produce a false positive.
				await page.locator(`${ACTIVE_SESSION_MODEL_PICKER_NAME}[aria-label*="${modelName}"]:visible`)
					.first()
					.waitFor({ state: 'visible', timeout: 15_000 });
				return;
			} catch (error) {
				lastError = error;
				// Dismiss the (possibly empty) dropdown so the next attempt re-opens a
				// freshly-populated one.
				try {
					await page.keyboard.press('Escape');
				} catch { /* dropdown already gone */ }
				await new Promise(r => setTimeout(r, 500));
			}
		}
		throw new Error(`Timed out selecting model "${modelName}" in the active session model picker. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
	}

	/**
	 * Open the combined model configuration dropdown (Thinking Effort / Context
	 * Size) by clicking the active session model picker's configuration button.
	 * The button is only visible when the selected model advertises configurable
	 * options, so this waits for it to become visible before clicking.
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
		const configButton = page.locator(`${ACTIVE_SESSION_MODEL_PICKER_CONFIG}:visible`).first();
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
	 * Click the option whose label contains `label` in the open model
	 * configuration dropdown, then wait until that option reads back as checked
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
	 * Dismiss the open model configuration dropdown.
	 */
	async closeModelConfig(): Promise<void> {
		const page = this.code.driver.currentPage;
		await page.keyboard.press('Escape');
		await page.waitForFunction(
			(sel: string) => { const c = document.querySelector(sel); return !c || c.getAttribute('aria-expanded') !== 'true'; },
			ACTIVE_SESSION_MODEL_PICKER_CONFIG,
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
	 * Open the context-usage details popup for the active session and return the
	 * full "{used} / {total} tokens" label text. The inline gauge only renders a
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
		const widget = page.locator(`${ACTIVE_SESSION_CONTEXT_USAGE}:visible`).first();
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
