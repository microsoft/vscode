/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableMap } from 'vs/base/common/lifecycle';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IProgress, Progress } from 'vs/platform/progress/common/progress';
import { ExtHostChatProviderShape, ExtHostContext, MainContext, MainThreadChatProviderShape } from 'vs/workbench/api/common/extHost.protocol';
import { IChatResponseProviderMetadata, IChatResponseFragment, IChatProviderService, IChatMessage } from 'vs/workbench/contrib/chat/common/chatProvider';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadChatProvider)
export class MainThreadChatProvider implements MainThreadChatProviderShape {

	private readonly _proxy: ExtHostChatProviderShape;
	private readonly _providerRegistrations = new DisposableMap<number>();
	private readonly _pendingProgress = new Map<number, IProgress<IChatResponseFragment>>();

	constructor(
		extHostContext: IExtHostContext,
		@IChatProviderService private readonly _chatProviderService: IChatProviderService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatProvider);
	}

	dispose(): void {
		this._providerRegistrations.dispose();
	}

	$registerProvider(handle: number, identifier: string, metadata: IChatResponseProviderMetadata): void {
		const registration = this._chatProviderService.registerChatResponseProvider(identifier, {
			metadata,
			provideChatResponse: async (messages, options, progress, token) => {
				const requestId = (Math.random() * 1e6) | 0;
				this._pendingProgress.set(requestId, progress);
				try {
					await this._proxy.$provideChatResponse(handle, requestId, messages, options, token);
				} finally {
					this._pendingProgress.delete(requestId);
				}
			}
		});
		this._providerRegistrations.set(handle, registration);
	}

	async $handleProgressChunk(requestId: number, chunk: IChatResponseFragment): Promise<void> {
		this._pendingProgress.get(requestId)?.report(chunk);
	}

	$unregisterProvider(handle: number): void {
		this._providerRegistrations.deleteAndDispose(handle);
	}

	async $fetchResponse(extension: ExtensionIdentifier, providerId: string, requestId: number, messages: IChatMessage[], options: {}, token: CancellationToken): Promise<any> {
		this._logService.debug('[CHAT] extension request STARTED', extension.value, requestId);

		const task = this._chatProviderService.fetchChatResponse(providerId, messages, options, new Progress(value => {
			this._proxy.$handleResponseFragment(requestId, value);
		}), token);

		task.catch(err => {
			this._logService.error('[CHAT] extension request ERRORED', err, extension.value, requestId);
		}).finally(() => {
			this._logService.debug('[CHAT] extension request DONE', extension.value, requestId);
		});

		return task;
	}
}
