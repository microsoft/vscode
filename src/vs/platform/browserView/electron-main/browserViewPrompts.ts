/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IBrowserViewPromptRequestEvent } from '../common/browserView.js';

/** Who can currently answer a prompt. */
export interface IBrowserViewPromptResponders {
	/** Whether workbench UI is able to show the prompt to the user. */
	readonly workbench: boolean;
	/** Whether a CDP client (an agent) is attached and can answer through `Page.handleJavaScriptDialog`. */
	readonly agent: boolean;
}

export interface IBrowserViewPromptSettledEvent {
	readonly requestId: string;
	/** The entered text, or `null` if the prompt was cancelled. */
	readonly value: string | null;
}

/**
 * Tracks `window.prompt()` calls from a page. The calling renderer is blocked on a synchronous IPC
 * message, so every request must be settled, or the page stays frozen.
 */
export class BrowserViewPrompts extends Disposable {

	private readonly _pending = new Map<string, { readonly request: IBrowserViewPromptRequestEvent; readonly respond: (value: string | null) => void; readonly owner: object | undefined }>();

	private readonly _onDidRequestPrompt = this._register(new Emitter<IBrowserViewPromptRequestEvent>());
	/** Fires for prompts the workbench UI should show. */
	readonly onDidRequestPrompt: Event<IBrowserViewPromptRequestEvent> = this._onDidRequestPrompt.event;

	private readonly _onDidOpenPrompt = this._register(new Emitter<IBrowserViewPromptRequestEvent>());
	/** Fires for every pending prompt, whichever responder can answer it. */
	readonly onDidOpenPrompt: Event<IBrowserViewPromptRequestEvent> = this._onDidOpenPrompt.event;

	private readonly _onDidSettlePrompt = this._register(new Emitter<IBrowserViewPromptSettledEvent>());
	readonly onDidSettlePrompt: Event<IBrowserViewPromptSettledEvent> = this._onDidSettlePrompt.event;

	constructor(private readonly _getResponders: () => IBrowserViewPromptResponders) {
		super();
		this._register(toDisposable(() => this.settleAll()));
	}

	/**
	 * Register a prompt request. `respond` is called exactly once, with the entered text or `null`.
	 * `owner` identifies what raised the prompt (for example its frame), for {@link settleOwnedBy}.
	 */
	request(origin: string, message: string, defaultValue: string, respond: (value: string | null) => void, owner?: object): void {
		const responders = this._getResponders();
		if (!responders.workbench && !responders.agent) {
			respond(null);
			return;
		}
		const request = { requestId: generateUuid(), origin, message, defaultValue };
		this._pending.set(request.requestId, { request, respond, owner });
		this._onDidOpenPrompt.fire(request);
		if (responders.workbench) {
			this._onDidRequestPrompt.fire(request);
		}
	}

	respond(requestId: string, value: string | null): void {
		const pending = this._pending.get(requestId);
		if (pending) {
			this._pending.delete(requestId);
			pending.respond(value);
			this._onDidSettlePrompt.fire({ requestId, value });
		}
	}

	/** Answer the longest-waiting prompt, deriving the answer from its request. Returns whether there was one. */
	respondToOldest(getValue: (request: IBrowserViewPromptRequestEvent) => string | null): boolean {
		const [pending] = this._pending.values();
		if (!pending) {
			return false;
		}
		this.respond(pending.request.requestId, getValue(pending.request));
		return true;
	}

	hasPendingFor(owner: object): boolean {
		for (const pending of this._pending.values()) {
			if (pending.owner === owner) {
				return true;
			}
		}
		return false;
	}

	/** Cancel the outstanding prompts raised by `owner`, leaving other prompts untouched. */
	settleOwnedBy(owner: object): void {
		for (const [requestId, pending] of [...this._pending]) {
			if (pending.owner === owner) {
				this.respond(requestId, null);
			}
		}
	}

	/** Cancel all outstanding prompts, for example because the page navigated or crashed. */
	settleAll(): void {
		for (const requestId of [...this._pending.keys()]) {
			this.respond(requestId, null);
		}
	}
}
