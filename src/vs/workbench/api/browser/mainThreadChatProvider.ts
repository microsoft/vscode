/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableMap, DisposableStore } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IProgress, Progress } from 'vs/platform/progress/common/progress';
import { Registry } from 'vs/platform/registry/common/platform';
import { ExtHostChatProviderShape, ExtHostContext, MainContext, MainThreadChatProviderShape } from 'vs/workbench/api/common/extHost.protocol';
import { IChatResponseProviderMetadata, IChatResponseFragment, IChatProviderService, IChatMessage } from 'vs/workbench/contrib/chat/common/chatProvider';
import { Extensions, IExtensionFeaturesManagementService, IExtensionFeaturesRegistry } from 'vs/workbench/services/extensionManagement/common/extensionFeatures';
import { IExtHostContext, extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadChatProvider)
export class MainThreadChatProvider implements MainThreadChatProviderShape {

	private readonly _proxy: ExtHostChatProviderShape;
	private readonly _store = new DisposableStore();
	private readonly _providerRegistrations = new DisposableMap<number>();
	private readonly _pendingProgress = new Map<number, IProgress<IChatResponseFragment>>();

	constructor(
		extHostContext: IExtHostContext,
		@IChatProviderService private readonly _chatProviderService: IChatProviderService,
		@IExtensionFeaturesManagementService private readonly _extensionFeaturesManagementService: IExtensionFeaturesManagementService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatProvider);

		this._proxy.$updateLanguageModels({ added: _chatProviderService.getProviders() });
		this._store.add(_chatProviderService.onDidChangeProviders(this._proxy.$updateLanguageModels, this._proxy));
	}

	dispose(): void {
		this._providerRegistrations.dispose();
		this._store.dispose();
	}

	$registerProvider(handle: number, identifier: string, metadata: IChatResponseProviderMetadata): void {
		const dipsosables = new DisposableStore();
		dipsosables.add(this._chatProviderService.registerChatResponseProvider(identifier, {
			metadata,
			provideChatResponse: async (messages, from, options, progress, token) => {
				const requestId = (Math.random() * 1e6) | 0;
				this._pendingProgress.set(requestId, progress);
				try {
					await this._proxy.$provideLanguageModelResponse(handle, requestId, from, messages, options, token);
				} finally {
					this._pendingProgress.delete(requestId);
				}
			}
		}));
		dipsosables.add(Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
			id: `lm-${identifier}`,
			label: localize('languageModels', "Language Model ({0})", `${identifier}-${metadata.model}`),
			access: {
				canToggle: false,
			},
		}));
		this._providerRegistrations.set(handle, dipsosables);
	}

	async $handleProgressChunk(requestId: number, chunk: IChatResponseFragment): Promise<void> {
		this._pendingProgress.get(requestId)?.report(chunk);
	}

	$unregisterProvider(handle: number): void {
		this._providerRegistrations.deleteAndDispose(handle);
	}

	async $prepareChatAccess(extension: ExtensionIdentifier, providerId: string, justification?: string): Promise<IChatResponseProviderMetadata | undefined> {
		return this._chatProviderService.lookupChatResponseProvider(providerId);
	}

	async $fetchResponse(extension: ExtensionIdentifier, providerId: string, requestId: number, messages: IChatMessage[], options: {}, token: CancellationToken): Promise<any> {
		await this._extensionFeaturesManagementService.getAccess(extension, `lm-${providerId}`);

		this._logService.debug('[CHAT] extension request STARTED', extension.value, requestId);

		const task = this._chatProviderService.fetchChatResponse(providerId, extension, messages, options, new Progress(value => {
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
