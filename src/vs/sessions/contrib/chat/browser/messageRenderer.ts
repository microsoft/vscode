/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/messageRenderer.css';
import * as dom from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import {
	AgentEvent,
	ErrorEvent,
	ThinkingDeltaEvent,
	ToolUseStartEvent,
	UsageEvent,
	addUsage,
	emptyUsage,
} from '../../../common/agentEvents.js';

interface ActiveToolCard {
	readonly card: HTMLElement;
	readonly statusEl: HTMLElement;
	readonly argsEl: HTMLElement;
	argBuffer: string;
}

/**
 * Context passed to the `onRetry` callback so the caller can route the retry
 * to a fallback provider (Sprint 3 section 10.1) rather than the provider that failed.
 */
export interface RetryContext {
	/** Provider ID that was active when the error occurred, if known. */
	readonly failedProvider: string | undefined;
	/**
	 * Provider ID the user explicitly chose for the retry by clicking a
	 * provider-specific button. `undefined` means generic retry (same provider
	 * or whatever the router decides).
	 */
	readonly preferredProvider: string | undefined;
}

/**
 * A provider the renderer can offer as an alternative when retrying after an error.
 * Passed at construction time; the renderer filters out whichever provider just failed.
 */
export interface AlternativeProvider {
	readonly id: string;
	readonly displayName: string;
}

/**
 * Renders a streaming AgentEvent sequence into a DOM container.
 *
 * Each instance corresponds to a single assistant turn. Create once,
 * call `render(events, signal)` to start consuming the stream; call
 * `cancel()` to abort it early.
 *
 * Text deltas are appended directly as Text nodes — no innerHTML, no
 * diffing — so the DOM update cost per token is O(1).
 */
export class MessageRenderer extends Disposable {

	private readonly _thinkingSection: HTMLElement;
	private readonly _thinkingContent: HTMLElement;
	private _thinkingVisible = false;
	private _hasThinking = false;

	private readonly _textContainer: HTMLElement;
	private _textNode: Text | undefined;

	private readonly _toolsContainer: HTMLElement;
	private readonly _activeTools = new Map<string, ActiveToolCard>();

	private readonly _usageChip: HTMLElement;
	private _usage: UsageEvent = emptyUsage();

	private readonly _errorSection: HTMLElement;
	private readonly _errorProviderBadge: HTMLElement;
	private readonly _errorMessage: HTMLElement;
	private readonly _retryButton: HTMLElement;
	private readonly _altRetryContainer: HTMLElement;
	private readonly _altButtonDisposables = this._register(new DisposableStore());

	private _activeProvider: string | undefined;
	private _failedProvider: string | undefined;

	private readonly _cancelButton: HTMLElement;

	private _abortController = new AbortController();
	private _streaming = false;

	/**
	 * @param _container The element to render into.
	 * @param _onRetry Called when the user clicks a retry button. Receives context
	 *   including the provider that failed and (when clicking a provider-specific
	 *   button) the provider the user wants to use for the retry.
	 * @param _onCancel Called when the user clicks the Cancel button.
	 * @param _alternatives Known alternative providers offered as retry targets on error.
	 *   The renderer filters out whichever provider is active at error time.
	 */
	constructor(
		private readonly _container: HTMLElement,
		private readonly _onRetry: (ctx: RetryContext) => void,
		private readonly _onCancel: () => void,
		private readonly _alternatives: ReadonlyArray<AlternativeProvider> = [],
	) {
		super();

		_container.classList.add('message-renderer');

		// Thinking panel — collapsed by default
		this._thinkingSection = dom.append(_container, dom.$('.message-renderer-thinking.collapsed'));
		const thinkingToggle = dom.append(this._thinkingSection, dom.$('button.message-renderer-thinking-toggle'));
		dom.append(thinkingToggle, renderIcon(Codicon.chevronRight));
		dom.append(thinkingToggle, dom.$('span', undefined, localize('thinking', "Thinking")));
		this._thinkingContent = dom.append(this._thinkingSection, dom.$('.message-renderer-thinking-content'));
		this._register(dom.addDisposableListener(thinkingToggle, dom.EventType.CLICK, () => this._toggleThinking()));

		// Main text area
		this._textContainer = dom.append(_container, dom.$('.message-renderer-text'));

		// Tool call cards
		this._toolsContainer = dom.append(_container, dom.$('.message-renderer-tools'));

		// Usage chip — hidden until we receive a usage event
		this._usageChip = dom.append(_container, dom.$('.message-renderer-usage.hidden'));

		// Error section — hidden until we receive an error event; role=alert notifies screen readers
		this._errorSection = dom.append(_container, dom.$('.message-renderer-error.hidden'));
		this._errorSection.setAttribute('role', 'alert');

		const errorHeader = dom.append(this._errorSection, dom.$('.message-renderer-error-header'));
		this._errorProviderBadge = dom.append(errorHeader, dom.$('span.message-renderer-error-provider.hidden'));
		this._errorMessage = dom.append(errorHeader, dom.$('span.message-renderer-error-message'));

		const retryArea = dom.append(this._errorSection, dom.$('.message-renderer-retry-area'));
		this._retryButton = dom.append(retryArea, dom.$('button.message-renderer-retry-button'));
		dom.append(this._retryButton, renderIcon(Codicon.refresh));
		dom.append(this._retryButton, dom.$('span', undefined, localize('retry', "Retry")));
		this._register(dom.addDisposableListener(this._retryButton, dom.EventType.CLICK, () =>
			this._onRetry({ failedProvider: this._failedProvider, preferredProvider: undefined })
		));

		this._altRetryContainer = dom.append(retryArea, dom.$('.message-renderer-alt-retry-container.hidden'));

		// Cancel button — shown while streaming
		this._cancelButton = dom.append(_container, dom.$('button.message-renderer-cancel.hidden'));
		dom.append(this._cancelButton, renderIcon(Codicon.stopCircle));
		dom.append(this._cancelButton, dom.$('span', undefined, localize('cancel', "Cancel")));
		this._register(dom.addDisposableListener(this._cancelButton, dom.EventType.CLICK, () => this.cancel()));
	}

	/**
	 * Begin consuming the event stream. The AbortSignal controls cancellation:
	 * callers may either use the signal they pass in OR call `this.cancel()`,
	 * which aborts the internal controller that is also wired to the outer signal.
	 */
	render(events: AsyncIterable<AgentEvent>, signal: AbortSignal): void {
		if (this._streaming) {
			return;
		}
		// Replace internal controller so cancel() works even when an external
		// signal was provided.
		this._abortController = new AbortController();
		signal.addEventListener('abort', () => this._abortController.abort(), { once: true });

		this._streaming = true;
		this._container.classList.add('streaming');
		this._cancelButton.classList.remove('hidden');

		void this._consume(events);
	}

	cancel(): void {
		this._abortController.abort();
		this._onCancel();
	}

	// Private rendering helpers

	private async _consume(events: AsyncIterable<AgentEvent>): Promise<void> {
		try {
			for await (const event of events) {
				if (this._abortController.signal.aborted) {
					break;
				}
				this._dispatch(event);
			}
		} finally {
			this._finalize();
		}
	}

	private _dispatch(event: AgentEvent): void {
		switch (event.type) {
			case 'message_start':
				this._activeProvider = event.provider;
				break;
			case 'text_delta':
				this._appendText(event.text);
				break;
			case 'thinking_delta':
				this._appendThinking(event);
				break;
			case 'tool_use_start':
				this._openToolCard(event);
				break;
			case 'tool_use_delta':
				this._updateToolArgs(event.toolUseId, event.partialInput);
				break;
			case 'tool_use_stop':
				this._closeToolCard(event.toolUseId);
				break;
			case 'usage':
				this._updateUsage(event);
				break;
			case 'error':
				this._showError(event);
				break;
			// message_stop needs no visual action beyond lifecycle
		}
	}

	private _appendText(text: string): void {
		if (!this._textNode) {
			this._textNode = document.createTextNode(text);
			this._textContainer.appendChild(this._textNode);
		} else {
			this._textNode.appendData(text);
		}
	}

	private _appendThinking(event: ThinkingDeltaEvent): void {
		if (!this._hasThinking) {
			this._hasThinking = true;
			this._thinkingSection.classList.remove('hidden');
		}
		// Append as text to avoid XSS
		const existing = this._thinkingContent.lastChild;
		if (existing instanceof Text) {
			existing.appendData(event.text);
		} else {
			this._thinkingContent.appendChild(document.createTextNode(event.text));
		}
	}

	private _toggleThinking(): void {
		this._thinkingVisible = !this._thinkingVisible;
		this._thinkingSection.classList.toggle('collapsed', !this._thinkingVisible);
		this._thinkingSection.classList.toggle('expanded', this._thinkingVisible);
	}

	private _openToolCard(event: ToolUseStartEvent): void {
		const card = dom.append(this._toolsContainer, dom.$('.message-renderer-tool-card'));
		card.dataset['toolId'] = event.toolUseId;

		const header = dom.append(card, dom.$('.message-renderer-tool-header'));
		dom.append(header, renderIcon(Codicon.tools));
		dom.append(header, dom.$('span.message-renderer-tool-name', undefined, event.name));
		const statusEl = dom.append(header, dom.$('span.message-renderer-tool-status', undefined, localize('toolRunning', "running…")));

		const argsEl = dom.append(card, dom.$('pre.message-renderer-tool-args'));

		const initial = event.input !== undefined ? JSON.stringify(event.input, null, 2) : '';
		if (initial) {
			argsEl.textContent = initial;
		}

		this._activeTools.set(event.toolUseId, { card, statusEl, argsEl, argBuffer: initial });
	}

	private _updateToolArgs(toolUseId: string, partialInput: string): void {
		const tool = this._activeTools.get(toolUseId);
		if (!tool) {
			return;
		}
		tool.argBuffer += partialInput;
		tool.argsEl.textContent = tool.argBuffer;
	}

	private _closeToolCard(toolUseId: string): void {
		const tool = this._activeTools.get(toolUseId);
		if (!tool) {
			return;
		}
		tool.statusEl.textContent = localize('toolDone', "done");
		tool.card.classList.add('done');
		this._activeTools.delete(toolUseId);
	}

	private _updateUsage(event: UsageEvent): void {
		this._usage = addUsage(this._usage, event);
		this._usageChip.classList.remove('hidden');
		this._usageChip.textContent = this._formatUsage(this._usage);
	}

	private _formatUsage(u: UsageEvent): string {
		const parts: string[] = [`${localize('usageIn', "In")}: ${u.inputTokens}`, `${localize('usageOut', "Out")}: ${u.outputTokens}`];
		if (u.cacheReadInputTokens) {
			parts.push(`${localize('usageCacheRead', "Cache read")}: ${u.cacheReadInputTokens}`);
		}
		if (u.cacheCreationInputTokens) {
			parts.push(`${localize('usageCacheCreate', "Cache write")}: ${u.cacheCreationInputTokens}`);
		}
		return parts.join(' · ');
	}

	private _showError(event: ErrorEvent): void {
		// Reset all error UI state so a second error never shows stale data
		this._errorProviderBadge.textContent = '';
		this._errorProviderBadge.classList.add('hidden');
		this._retryButton.classList.remove('hidden');
		this._altButtonDisposables.clear();
		dom.clearNode(this._altRetryContainer);
		this._altRetryContainer.classList.add('hidden');

		this._errorSection.classList.remove('hidden');
		this._errorMessage.textContent = event.message;

		// Prefer the provider named in the event; fall back to the provider seen in message_start
		const failedProvider = event.provider ?? this._activeProvider;
		this._failedProvider = failedProvider;
		if (failedProvider) {
			const alt = this._alternatives.find(a => a.id === failedProvider);
			this._errorProviderBadge.textContent = alt?.displayName ?? failedProvider;
			this._errorProviderBadge.classList.remove('hidden');
		}

		if (!event.retryable) {
			this._retryButton.classList.add('hidden');
		} else {
			this._renderAltRetryButtons(failedProvider);
		}
	}

	private _renderAltRetryButtons(failedProvider: string | undefined): void {
		const alts = this._alternatives.filter(a => a.id !== failedProvider);
		if (alts.length === 0) {
			return;
		}

		this._altRetryContainer.classList.remove('hidden');

		for (const alt of alts) {
			const btn = dom.append(this._altRetryContainer, dom.$('button.message-renderer-retry-button.message-renderer-retry-alt'));
			dom.append(btn, renderIcon(Codicon.refresh));
			dom.append(btn, dom.$('span', undefined, localize('retryOnProvider', "Retry on {0}", alt.displayName)));
			this._altButtonDisposables.add(dom.addDisposableListener(btn, dom.EventType.CLICK, () =>
				this._onRetry({ failedProvider, preferredProvider: alt.id })
			));
		}
	}

	private _finalize(): void {
		this._streaming = false;
		this._container.classList.remove('streaming');
		this._container.classList.add('done');
		this._cancelButton.classList.add('hidden');

		// Finalize any open tool cards (e.g., stream aborted mid-tool)
		for (const [id] of this._activeTools) {
			this._closeToolCard(id);
		}
	}
}
