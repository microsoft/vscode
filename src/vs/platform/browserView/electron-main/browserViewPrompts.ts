/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IBrowserViewPromptRequestEvent } from '../common/browserView.js';

/**
 * Tracks `window.prompt()` calls from a page. The calling renderer is blocked on a synchronous IPC
 * message, so every request must be settled, or the page stays frozen.
 */
export class BrowserViewPrompts extends Disposable {

	private readonly _pending = new Map<string, (value: string | null) => void>();

	private readonly _onDidRequestPrompt = this._register(new Emitter<IBrowserViewPromptRequestEvent>());
	readonly onDidRequestPrompt: Event<IBrowserViewPromptRequestEvent> = this._onDidRequestPrompt.event;

	/**
	 * @param _canPrompt Whether something in the workbench is currently able to show a prompt.
	 */
	constructor(private readonly _canPrompt: () => boolean) {
		super();
		this._register(toDisposable(() => this.settleAll()));
	}

	/**
	 * Register a prompt request. `respond` is called exactly once, with the entered text or `null`.
	 */
	request(origin: string, message: string, defaultValue: string, respond: (value: string | null) => void): void {
		if (!this._canPrompt()) {
			respond(null);
			return;
		}
		const requestId = generateUuid();
		this._pending.set(requestId, respond);
		this._onDidRequestPrompt.fire({ requestId, origin, message, defaultValue });
	}

	respond(requestId: string, value: string | null): void {
		const respond = this._pending.get(requestId);
		if (respond) {
			this._pending.delete(requestId);
			respond(value);
		}
	}

	/** Cancel all outstanding prompts, for example because the page navigated or crashed. */
	settleAll(): void {
		for (const requestId of [...this._pending.keys()]) {
			this.respond(requestId, null);
		}
	}
}
