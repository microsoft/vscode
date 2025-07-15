/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IRemoteCodingAgentInformation, IRemoteCodingAgentInformationProvider, IRemoteCodingAgentsService } from '../../contrib/remoteCodingAgents/common/remoteCodingAgentsService.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainContext, MainThreadRemoteCodingAgentsShape } from '../common/extHost.protocol.js';


@extHostNamedCustomer(MainContext.MainThreadRemoteCodingAgents)
export class MainThreadRemoteCodingAgents extends Disposable implements MainThreadRemoteCodingAgentsShape {
	private readonly _registrations = this._register(new DisposableMap<number>());

	constructor(
		private readonly _extHostContext: IExtHostContext,
		@IRemoteCodingAgentsService private readonly _remoteCodingAgentsService: IRemoteCodingAgentsService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	$registerCodingAgentInformationProvider(handle: number): void {
		// Register the provider handle - this tracks that a provider exists
		const provider: IRemoteCodingAgentInformationProvider = {
			onDidSelectItem: (codingAgentId: string) => {
				// Forward the selection to the remote coding agents service
				const proxy = this._extHostContext.getProxy(ExtHostContext.ExtHostRemoteCodingAgents);
				return proxy.$onDidSelectItem(handle, codingAgentId);
			},
			provideCodingAgentsInformation: (token) => this._provideCodingAgentsInformation(handle, token)
		};
		this._registrations.set(handle, this._remoteCodingAgentsService.registerCodingAgentInformationProvider(handle, provider));
	}

	private async *_provideCodingAgentsInformation(handle: number, token: CancellationToken): AsyncIterable<IRemoteCodingAgentInformation> {
		const proxy = this._extHostContext.getProxy(ExtHostContext.ExtHostRemoteCodingAgents);

		try {
			// Get all results as an array from the RPC call
			const results = await proxy.$provideCodingAgentsInformation(handle, token);

			// Yield each result individually to maintain the progressive loading experience
			for (const info of results) {
				if (token.isCancellationRequested) {
					return;
				}
				yield info;
			}
		} catch (error) {
			this._logService.error('Error providing coding agents information:', error);
		}
	}

	$unregisterCodingAgentInformationProvider(handle: number): void {
		this._registrations.deleteAndDispose(handle);
	}

	$onDidChangeCodingAgentInformation(handle: number, information: IRemoteCodingAgentInformation): void {
		this._remoteCodingAgentsService.updateCodingAgentsInformation(handle, information);
	}
}
