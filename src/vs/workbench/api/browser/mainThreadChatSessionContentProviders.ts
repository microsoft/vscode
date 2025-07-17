/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { revive } from '../../../base/common/marshalling.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ChatModel, IChatModel } from '../../contrib/chat/common/chatModel.js';
import { ChatRequestParser } from '../../contrib/chat/common/chatRequestParser.js';
import { IChatProgress } from '../../contrib/chat/common/chatService.js';
import { IChatSessionContentProviderService } from '../../contrib/chat/common/chatSessionContentProviderService.js';
import { ChatAgentLocation } from '../../contrib/chat/common/constants.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostChatSessionContentProvidersShape, ExtHostContext, MainContext, MainThreadChatSessionContentProvidersShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadChatSessionContentProviders)
export class MainThreadChatSessionContentProviders implements MainThreadChatSessionContentProvidersShape {

	private readonly _providers = new DisposableMap<number>();
	private readonly _proxy: ExtHostChatSessionContentProvidersShape;

	constructor(
		extHostContext: import('../../services/extensions/common/extHostCustomers.js').IExtHostContext,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatSessionContentProviderService private readonly chatSessionContentProviderService: IChatSessionContentProviderService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatSessionContentProviders);
	}

	dispose(): void {
		this._providers.dispose();
	}

	$registerChatSessionContentProvider(handle: number, _chatSessionType: string): void {
		this._providers.set(handle, Disposable.None);
		this.chatSessionContentProviderService.registerChatSessionContentProvider(_chatSessionType, {
			provideChatSessionContent: async (id, token): Promise<IChatModel> => {
				const parser = this.instantiationService.createInstance(ChatRequestParser);

				// TODO: use real data
				const results = await this._proxy.$provideChatSessionContent(handle, id, token);
				const model = this.instantiationService.createInstance(ChatModel, undefined, ChatAgentLocation.Panel);

				for (let i = 0; i < results.history.length; i++) {
					const item = results.history[i];
					if (item.type === 'response') {
						// We can only create request response pairs :(
						// Figure out how to add this in the UI
						continue;
					}
					const parsedRequest = parser.parseChatRequest('sessionId', item.prompt).parts;
					const request = model.addRequest({
						text: item.prompt,
						parts: parsedRequest,
					}, { variables: [] }, 0);

					const next = results.history[i + 1];
					if (next && next.type === 'response') {
						i++;
						for (const responsePart of next.parts) {
							const revivedProgress = revive(responsePart) as IChatProgress;
							model.acceptResponseProgress(request, revivedProgress);
						}
						model.completeResponse(request);
					}
				}

				return model;
			}
		});
	}
	$unregisterChatSessionContentProvider(handle: number): void {
		this._providers.deleteAndDispose(handle);
	}

}
