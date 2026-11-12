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

	private readonly _pending = new Map<string, (value: string | null) => void>();

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
	 */
	request(origin: string, message: string, defaultValue: string, respond: (value: string | null) => void): void {
		const responders = this._getResponders();
		if (!responders.workbench && !responders.agent) {
			respond(null);
			return;
		}
		const request = { requestId: generateUuid(), origin, message, defaultValue };
		this._pending.set(request.requestId, respond);
		this._onDidOpenPrompt.fire(request);
		if (responders.workbench) {
			this._onDidRequestPrompt.fire(request);
		}
	}

	respond(requestId: string, value: string | null): void {
		const respond = this._pending.get(requestId);
		if (respond) {
			this._pending.delete(requestId);
			respond(value);
			this._onDidSettlePrompt.fire({ requestId, value });
		}
	}

	/** Answer the longest-waiting prompt. Returns whether there was one. */
	respondToOldest(value: string | null): boolean {
		const [requestId] = this._pending.keys();
		if (requestId === undefined) {
			return false;
		}
		this.respond(requestId, value);
		return true;
	}

	/** Cancel all outstanding prompts, for example because the page navigated or crashed. */
	settleAll(): void {
		for (const requestId of [...this._pending.keys()]) {
			this.respond(requestId, null);
		}
	}
}
