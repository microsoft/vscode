/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toDisposable, type IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IChatSubmitRequestHandlerService = createDecorator<IChatSubmitRequestHandlerService>('chatSubmitRequestHandlerService');

/** A chat input submission before it is sent to the selected chat session. */
export interface IChatSubmitRequest {
	readonly sessionResource: URI;
	readonly providerId?: string;
	readonly sessionId?: string;
	readonly input: string;
}

/** What becomes of a submission that the handlers were offered. */
export enum ChatSubmitRequestOutcome {
	/** The normal send goes on. */
	Continue = 'continue',
	/** A handler handled it: it is not sent, and the input is cleared. */
	Handled = 'handled',
	/** A handler stopped it: it is neither sent nor cleared, the input kept as it is. */
	Cancelled = 'cancelled',
}

/** The handlers' answer to a submission. */
export interface IChatSubmitRequestResult {
	readonly outcome: ChatSubmitRequestOutcome;
	/**
	 * Whether a handler held the submission while it waited on something else, such as the user's answer: the chat, its
	 * input or the draft may have changed meanwhile, which the caller checks before it acts on the outcome.
	 */
	readonly held?: boolean;
}

/** Handler offered a chat input submission before the normal send path: `true` where it handled it, `false` where the send goes on. */
export interface IChatSubmitRequestHandler {
	readonly id: string;
	tryHandle(request: IChatSubmitRequest): Promise<boolean | IChatSubmitRequestResult>;
}

/** Registry for provider-specific pre-submit chat handlers. */
export interface IChatSubmitRequestHandlerService {
	readonly _serviceBrand: undefined;
	register(handler: IChatSubmitRequestHandler): IDisposable;
	tryHandle(request: IChatSubmitRequest): Promise<IChatSubmitRequestResult>;
}

/** Default sequential first-match implementation of the submit handler registry. */
export class ChatSubmitRequestHandlerService implements IChatSubmitRequestHandlerService {

	declare readonly _serviceBrand: undefined;

	private readonly _handlers: IChatSubmitRequestHandler[] = [];

	register(handler: IChatSubmitRequestHandler): IDisposable {
		this._handlers.push(handler);
		return toDisposable(() => {
			const index = this._handlers.indexOf(handler);
			if (index >= 0) {
				this._handlers.splice(index, 1);
			}
		});
	}

	async tryHandle(request: IChatSubmitRequest): Promise<IChatSubmitRequestResult> {
		let held = false;
		for (const handler of this._handlers) {
			const answer = await handler.tryHandle(request);
			const result = typeof answer === 'boolean' ? { outcome: answer ? ChatSubmitRequestOutcome.Handled : ChatSubmitRequestOutcome.Continue } : answer;
			held ||= !!result.held;
			if (result.outcome !== ChatSubmitRequestOutcome.Continue) {
				return { outcome: result.outcome, held };
			}
		}
		return { outcome: ChatSubmitRequestOutcome.Continue, held };
	}
}
