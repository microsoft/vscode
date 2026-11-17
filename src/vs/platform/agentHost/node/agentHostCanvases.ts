/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getErrorMessage } from '../../../base/common/errors.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { toAgentCanvasRegistry } from '../common/agent.js';
import { IAgentHostSessionStateStore } from '../common/agentHostSessionStateStore.js';
import { IAgentHostCredentialSource } from '../common/agentHostCredentials.js';
import { AgentHostCanvasesEnabledConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
import { CanvasRegistryStatus } from '../common/state/protocol/channels-canvases/state.js';
import { AgentConfigurationService, IAgentConfigurationService } from './agentConfigurationService.js';
import { createAgentChatContext } from './agentChatContext.js';
import { IAgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { IAgentHostProviderService } from './agentHostProviderService.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';

export const IAgentHostCanvases = createDecorator<IAgentHostCanvases>('agentHostCanvases');

export interface IAgentHostCanvases {
	readonly _serviceBrand: undefined;
	observe(resource: URI): void;
	materialize(resource: string, credentials?: IAgentHostCredentialSource): Promise<void>;
}

/** Owns discovery demand independently of chat rendering and provider startup. */
export class AgentHostCanvases extends Disposable implements IAgentHostCanvases {
	declare readonly _serviceBrand: undefined;
	private readonly _materializations = new Map<string, { readonly activate: boolean; readonly promise: Promise<void> }>();

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostProviderService private readonly _providers: IAgentHostProviderService,
		@IAgentHostAuthenticationService private readonly _authentication: IAgentHostAuthenticationService,
		@IAgentHostSessionStateStore private readonly _sessionStateStore: IAgentHostSessionStateStore,
		@IAgentConfigurationService private readonly _configuration: AgentConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(_stateManager.onDidUnregisterChat(({ chat }) => {
			for (const resource of this._materializations.keys()) {
				if (_stateManager.getCanvasCollection(resource)?.chat === chat || !_stateManager.getCanvasCollection(resource)) {
					this._materializations.delete(resource);
				}
			}
		}));
	}

	observe(resource: URI): void {
		void this._refresh(resource.toString(), false);
	}

	materialize(resource: string, credentials?: IAgentHostCredentialSource): Promise<void> {
		return this._refresh(resource, true, credentials);
	}

	private _refresh(resource: string, activate: boolean, credentials?: IAgentHostCredentialSource): Promise<void> {
		const collection = this._stateManager.getCanvasCollection(resource);
		const existing = this._materializations.get(resource);
		if (existing) {
			return activate && (!existing.activate || collection?.state.registry.status === CanvasRegistryStatus.Error)
				? existing.promise.then(() => this._refresh(resource, true, credentials))
				: existing.promise;
		}
		if (!collection || this._store.isDisposed
			|| this._configuration.getRootValue(platformRootSchema, AgentHostCanvasesEnabledConfigKey) !== true
			|| collection.state.registry.status === CanvasRegistryStatus.Ready
			|| collection.state.registry.status === CanvasRegistryStatus.Loading
			|| (!activate && collection.state.registry.status === CanvasRegistryStatus.Error)) {
			return Promise.resolve();
		}
		const session = this._stateManager.getChatOwner(collection.chat);
		const provider = session ? this._providers.getProviderForChat(session, collection.chat) : undefined;
		if (!session || !provider?.getDescriptor().capabilities?.canvases) {
			return Promise.resolve();
		}
		const chat = URI.parse(collection.chat);
		const sessionUri = URI.parse(session);
		const context = createAgentChatContext(this._stateManager, this._authentication, sessionUri, chat,
			this._stateManager.resolveChatStorageResource(session, collection.chat), this._sessionStateStore.peek(sessionUri));
		const current = () => !this._store.isDisposed && this._stateManager.getCanvasCollection(resource) === collection
			&& this._configuration.getRootValue(platformRootSchema, AgentHostCanvasesEnabledConfigKey) === true;
		if (activate) {
			this._stateManager.setCanvasRegistry(collection.chat, { status: CanvasRegistryStatus.Loading });
		}
		const registryAtStart = collection.state.registry;
		const canPublish = () => current() && collection.state.registry === registryAtStart;
		const operation = (async () => {
			try {
				if (activate && provider.materializeSessionCanvases) {
					await provider.materializeSessionCanvases(sessionUri, chat, { ...context, ...(credentials ? { credentials } : {}) });
				} else {
					if (activate && !provider.listSessionCanvases) {
						throw new Error('Canvas inventory is unavailable for this provider.');
					}
					const canvases = await provider.listSessionCanvases?.(sessionUri, chat, context);
					if (canvases !== undefined && canPublish()) {
						this._stateManager.setCanvasRegistry(collection.chat, { status: CanvasRegistryStatus.Ready, ...toAgentCanvasRegistry(canvases) });
					}
				}
			} catch (error) {
				if (canPublish()) {
					this._stateManager.setCanvasRegistry(collection.chat, {
						status: CanvasRegistryStatus.Error,
						error: { errorType: 'canvasRegistryFailed', message: getErrorMessage(error) },
					});
					this._logService.error('[AgentHostCanvases] Canvas discovery failed', error);
				}
			}
		})();
		const refresh = operation.finally(() => {
			if (this._materializations.get(resource)?.promise === refresh) {
				this._materializations.delete(resource);
			}
		});
		this._materializations.set(resource, { activate, promise: refresh });
		return refresh;
	}
}
