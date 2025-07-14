/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { MainThreadRemoteCodingAgentsShape, ExtHostContext, ExtHostRemoteCodingAgentsShape, RemoteCodingAgentInformationDto, MainContext } from '../common/extHost.protocol.js';
import { IRemoteCodingAgentsService, IRemoteCodingAgent } from '../../contrib/remoteCodingAgents/common/remoteCodingAgentsService.js';

@extHostNamedCustomer(MainContext.MainThreadRemoteCodingAgents)
export class MainThreadRemoteCodingAgents extends Disposable implements MainThreadRemoteCodingAgentsShape {

	private readonly _proxy: ExtHostRemoteCodingAgentsShape;
	private readonly _providers = new Map<number, {
		dispose(): void;
	}>();

	constructor(
		extHostContext: IExtHostContext,
		@IRemoteCodingAgentsService private readonly _remoteCodingAgentsService: IRemoteCodingAgentsService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostRemoteCodingAgents);
	}

	$registerAgentInformationProvider(handle: number): void {
		const providerDisposable = this._register({
			dispose: () => {
				// The provider itself doesn't need specific cleanup beyond removal from map
			}
		});

		this._providers.set(handle, providerDisposable);

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
		try {
			const agentInfos = await this._proxy.$getAgentInformation(handle);
			for (const agentInfo of agentInfos) {
				const agent: IRemoteCodingAgent = {
					id: agentInfo.id,
					command: agentInfo.command,
					displayName: agentInfo.displayName,
					description: agentInfo.description,
					followUpRegex: agentInfo.followUpRegex,
					when: agentInfo.when
				};
				this._remoteCodingAgentsService.registerAgent(agent);
			}
		} catch (error) {
			console.error('Failed to fetch agent information from provider:', error);
		}
	}
}