/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IChatSessionRoutingProvider, IChatSessionRoutingProviderService } from '../../common/sessionRouter.js';

class ChatSessionRoutingProviderService implements IChatSessionRoutingProviderService {

	declare readonly _serviceBrand: undefined;

	private provider: IChatSessionRoutingProvider | undefined;

	registerProvider(provider: IChatSessionRoutingProvider) {
		if (this.provider) {
			throw new Error('A chat session routing provider is already registered');
		}
		this.provider = provider;
		return toDisposable(() => {
			if (this.provider === provider) {
				this.provider = undefined;
			}
		});
	}

	getProvider(): IChatSessionRoutingProvider | undefined {
		return this.provider;
	}
}

registerSingleton(IChatSessionRoutingProviderService, ChatSessionRoutingProviderService, InstantiationType.Delayed);
