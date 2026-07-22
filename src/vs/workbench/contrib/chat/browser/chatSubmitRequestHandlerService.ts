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

/** Handler offered a chat input submission before the normal send path. */
export interface IChatSubmitRequestHandler {
	readonly id: string;
	tryHandle(request: IChatSubmitRequest): Promise<boolean>;
}

/** Registry for provider-specific pre-submit chat handlers. */
export interface IChatSubmitRequestHandlerService {
	readonly _serviceBrand: undefined;
	register(handler: IChatSubmitRequestHandler): IDisposable;
	tryHandle(request: IChatSubmitRequest): Promise<boolean>;
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

	async tryHandle(request: IChatSubmitRequest): Promise<boolean> {
		for (const handler of this._handlers) {
			if (await handler.tryHandle(request)) {
				return true;
			}
		}
		return false;
	}
}
