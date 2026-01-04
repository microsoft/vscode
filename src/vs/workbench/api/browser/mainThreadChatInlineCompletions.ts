/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { onUnexpectedExternalError } from '../../../base/common/errors.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import * as languages from '../../../editor/common/languages.js';
import { IChatInlineCompletionsService } from '../../contrib/chat/common/chatInlineCompletionsService.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostChatInlineCompletionsShape, ExtHostContext, MainContext, MainThreadChatInlineCompletionsShape } from '../common/extHost.protocol.js';

/**
 * Main thread coordinator for chat inline completions.
 * Receives provider registrations from the extension host via RPC and delegates
 * to the service layer for aggregation and provider orchestration.
 */
@extHostNamedCustomer(MainContext.MainThreadChatInlineCompletions)
export class MainThreadChatInlineCompletions extends Disposable implements MainThreadChatInlineCompletionsShape {
	private readonly _registrations = this._register(new DisposableMap<number>());
	private readonly _proxy: ExtHostChatInlineCompletionsShape;

	constructor(
		extHostContext: IExtHostContext,
		@IChatInlineCompletionsService private readonly _chatInlineCompletionsService: IChatInlineCompletionsService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatInlineCompletions);
	}

	$registerChatInlineCompletionsProvider(handle: number): void {
		const registration = this._chatInlineCompletionsService.registerProvider(handle, {
			provideCompletions: (input, position, token) => this._provideCompletions(handle, input, position, token)
		});
		this._registrations.set(handle, registration);
	}

	$unregisterChatInlineCompletionsProvider(handle: number): void {
		this._registrations.deleteAndDispose(handle);
	}

	private async _provideCompletions(
		handle: number,
		input: string,
		position: number,
		token: CancellationToken
	): Promise<languages.InlineCompletions | undefined> {
		try {
			const result = await this._proxy.$provideChatInlineCompletions(handle, input, position, token);
			if (result?.items && result.items.length > 0) {
				return { items: result.items };
			}
		} catch (err) {
			onUnexpectedExternalError(err);
		}
		return undefined;
	}
}
