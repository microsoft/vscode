/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { MainThreadRemoteCodingAgentsShape, ExtHostContext, ExtHostRemoteCodingAgentsShape, RemoteCodingAgentInformationDto, MainContext } from '../common/extHost.protocol.js';
import { IRemoteCodingAgentsService, IRemoteCodingAgent } from '../../contrib/remoteCodingAgents/common/remoteCodingAgentsService.js';

interface ProviderInfo {
	readonly handle: number;
	readonly registeredAgentIds: Set<string>;
	dispose(): void;
}

@extHostNamedCustomer(MainContext.MainThreadRemoteCodingAgents)
export class MainThreadRemoteCodingAgents extends Disposable implements MainThreadRemoteCodingAgentsShape {

	private readonly _proxy: ExtHostRemoteCodingAgentsShape;
	private readonly _providers = new Map<number, ProviderInfo>();

	constructor(
		extHostContext: IExtHostContext,
		@IRemoteCodingAgentsService private readonly _remoteCodingAgentsService: IRemoteCodingAgentsService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostRemoteCodingAgents);
	}

	$registerAgentInformationProvider(handle: number): void {
		const registeredAgentIds = new Set<string>();
		
		const providerInfo: ProviderInfo = {
			handle,
			registeredAgentIds,
			dispose: () => {
				// When provider is disposed, we don't need to remove agents from the service
				// since they may still be useful. The service will handle lifecycle of agents.
				registeredAgentIds.clear();
			}
		};

		this._providers.set(handle, providerInfo);
		this._register(providerInfo);

		// Immediately fetch and register agents when a provider is registered
		this._fetchAndRegisterAgents(handle);
	}

	$unregisterAgentInformationProvider(handle: number): void {
		const provider = this._providers.get(handle);
		if (provider) {
			provider.dispose();
			this._providers.delete(handle);
		}
	}

	private async _fetchAndRegisterAgents(handle: number): Promise<void> {
		const providerInfo = this._providers.get(handle);
		if (!providerInfo) {
			return;
		}

		try {
			const agentInfos = await this._proxy.$getAgentInformation(handle);
			
			for (const agentInfo of agentInfos) {
				// Validate required fields
				if (!agentInfo.id || !agentInfo.displayName || !agentInfo.command) {
					console.warn('Skipping invalid agent information: missing required fields', agentInfo);
					continue;
				}

				const agent: IRemoteCodingAgent = {
					id: agentInfo.id,
					command: agentInfo.command,
					displayName: agentInfo.displayName,
					description: agentInfo.description,
					followUpRegex: agentInfo.followUpRegex,
					when: agentInfo.when
				};
				
				this._remoteCodingAgentsService.registerAgent(agent);
				providerInfo.registeredAgentIds.add(agentInfo.id);
			}
		} catch (error) {
			console.error('Failed to fetch agent information from provider:', error);
		}
	}
}