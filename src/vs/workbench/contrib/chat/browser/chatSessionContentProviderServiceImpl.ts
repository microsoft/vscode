/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IChatModel } from '../common/chatModel.js';
import { IChatSessionContentProvider, IChatSessionContentProviderService } from '../common/chatSessionContentProviderService.js';

export class ChatSessionContentProviderService extends Disposable implements IChatSessionContentProviderService {
	_serviceBrand: undefined;
	private readonly _providers = new Map<string, IChatSessionContentProvider>();

	registerChatSessionContentProvider(type: string, provider: IChatSessionContentProvider): void {
		this._providers.set(type, provider);
	}

	unregisterChatSessionContentProvider(type: string): void {
		this._providers.delete(type);
	}

	getChatSessionContentProvider(type: string): IChatSessionContentProvider | undefined {
		return this._providers.get(type);
	}

	async getChatSession(type: string, id: string, token: CancellationToken): Promise<IChatModel> {
		const provider = this.getChatSessionContentProvider(type);
		if (!provider) {
			throw new Error(`No chat session content provider found for type: ${type}`);
		}

		const model = await provider.provideChatSessionContent(id, token);

		return model;
	}
}

