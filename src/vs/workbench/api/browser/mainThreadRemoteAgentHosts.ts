/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { IExtensionRemoteAgentHostsService } from '../../../platform/agentHost/common/extensionRemoteAgentHosts.js';
import { parseRemoteAgentHostAddress } from '../../../platform/agentHost/common/remoteAgentHostAddress.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { MainContext, MainThreadRemoteAgentHostsShape, RemoteAgentHostDto } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadRemoteAgentHosts)
export class MainThreadRemoteAgentHosts extends Disposable implements MainThreadRemoteAgentHostsShape {

	private readonly _registrations = this._register(new DisposableMap<number>());

	constructor(
		_extHostContext: IExtHostContext,
		@IExtensionRemoteAgentHostsService private readonly _extensionRemoteAgentHostsService: IExtensionRemoteAgentHostsService,
	) {
		super();
	}

	$registerRemoteAgentHost(handle: number, host: RemoteAgentHostDto): void {
		// The extension host sends a canonical address. Accept only that, unchanged, since the DTO crosses a process boundary.
		const name = host.name.trim();
		if (parseRemoteAgentHostAddress(host.address)?.address !== host.address || !name) {
			throw new Error(`Invalid remote agent host from ${host.extensionId}.`);
		}
		this._registrations.set(handle, this._extensionRemoteAgentHostsService.registerHost({ ...host, name }));
	}

	$unregisterRemoteAgentHost(handle: number): void {
		this._registrations.deleteAndDispose(handle);
	}
}
