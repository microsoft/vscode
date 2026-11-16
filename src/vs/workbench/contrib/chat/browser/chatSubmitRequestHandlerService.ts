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

/**
 * A handler's answer to a submission: `true` where it handled it, so it is not sent and the input is cleared; `false` where
 * the normal send goes on; {@link ChatSubmitRequestCancelled} where it is neither sent nor cleared, the input kept as it is.
 * A caller that reads only truthiness treats a cancelled submission as handled.
 */
export type ChatSubmitRequestResult = boolean | typeof ChatSubmitRequestCancelled;

/** A submission that a handler stopped: it is not sent, and the input keeps it. */
export const ChatSubmitRequestCancelled = 'cancelled';

/** Handler offered a chat input submission before the normal send path. */
export interface IChatSubmitRequestHandler {
	readonly id: string;
	tryHandle(request: IChatSubmitRequest): Promise<ChatSubmitRequestResult>;
}

/** Registry for provider-specific pre-submit chat handlers. */
export interface IChatSubmitRequestHandlerService {
	readonly _serviceBrand: undefined;
	register(handler: IChatSubmitRequestHandler): IDisposable;
	tryHandle(request: IChatSubmitRequest): Promise<ChatSubmitRequestResult>;
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

	async tryHandle(request: IChatSubmitRequest): Promise<ChatSubmitRequestResult> {
		for (const handler of this._handlers) {
			const result = await handler.tryHandle(request);
			if (result) {
				return result;
			}
		}
		return false;
	}
}
