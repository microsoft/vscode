/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { IChatContextItem, IChatContextSupport } from '../../contrib/chat/common/chatContext.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostChatContextShape, ExtHostContext, IDocumentFilterDto, MainContext, MainThreadChatContextShape } from '../common/extHost.protocol.js';
import { IChatContextService } from '../../contrib/chat/browser/chatContextService.js';
import { URI } from '../../../base/common/uri.js';

@extHostNamedCustomer(MainContext.MainThreadChatContext)
export class MainThreadChatContext extends Disposable implements MainThreadChatContextShape {
	private readonly _proxy: ExtHostChatContextShape;
	private readonly _providers = new Map<number, { id: string; selector: IDocumentFilterDto[] | undefined; support: IChatContextSupport }>();

	constructor(
		extHostContext: IExtHostContext,
		@IChatContextService private readonly _chatContextService: IChatContextService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatContext);
	}

	$registerChatContextProvider(handle: number, id: string, selector: IDocumentFilterDto[] | undefined, _options: { icon: ThemeIcon }, support: IChatContextSupport): void {
		this._providers.set(handle, { selector, support, id });
		this._chatContextService.registerChatContextProvider(id, selector, {
			provideChatContext: (token: CancellationToken) => {
				return this._proxy.$provideChatContext(handle, token);
			},
			resolveChatContext: support.supportsResolve ? (context: IChatContextItem, token: CancellationToken) => {
				return this._proxy.$resolveChatContext(handle, context, token);
			} : undefined,
			provideChatContextForResource: support.supportsResource ? (resource: URI, withValue: boolean, token: CancellationToken) => {
				return this._proxy.$provideChatContextForResource(handle, { resource, withValue }, token);
			} : undefined
		});
	}

	$unregisterChatContextProvider(handle: number): void {
		const provider = this._providers.get(handle);
		if (!provider) {
			return;
		}
		this._chatContextService.unregisterChatContextProvider(provider.id);
		this._providers.delete(handle);
	}

	$updateWorkspaceContextItems(handle: number, items: IChatContextItem[]): void {
		const provider = this._providers.get(handle);
		if (!provider) {
			return;
		}
		this._chatContextService.updateWorkspaceContextItems(provider.id, items);
	}
}
