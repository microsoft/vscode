/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { LinkedList } from 'vs/base/common/linkedList';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInlineChatService, IInlineChatSessionProvider, CTX_INLINE_CHAT_HAS_PROVIDER } from './inlineChat';

export class InlineChatServiceImpl implements IInlineChatService {

	declare _serviceBrand: undefined;

	private readonly _entries = new LinkedList<IInlineChatSessionProvider>();

	private readonly _ctxHasProvider: IContextKey<boolean>;

	constructor(@IContextKeyService contextKeyService: IContextKeyService) {
		this._ctxHasProvider = CTX_INLINE_CHAT_HAS_PROVIDER.bindTo(contextKeyService);
	}

	addProvider(provider: IInlineChatSessionProvider): IDisposable {

		const rm = this._entries.push(provider);
		this._ctxHasProvider.set(true);

		return toDisposable(() => {
			rm();
			this._ctxHasProvider.set(this._entries.size > 0);
		});
	}

	getAllProvider() {
		return [...this._entries].reverse();
	}
}
