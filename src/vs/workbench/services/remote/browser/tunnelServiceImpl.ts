/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';
import { IAddressProvider } from 'vs/platform/remote/common/remoteAgentConnection';
import { AbstractTunnelService, isPortPrivileged, RemoteTunnel } from 'vs/platform/remote/common/tunnel';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

export class TunnelService extends AbstractTunnelService {
	constructor(
		@ILogService logService: ILogService,
		@IWorkbenchEnvironmentService private environmentService: IWorkbenchEnvironmentService
	) {
		super(logService);
	}

	protected retainOrCreateTunnel(_addressProvider: IAddressProvider, remoteHost: string, remotePort: number, localPort: number | undefined, elevateIfNeeded: boolean): Promise<RemoteTunnel | undefined> | undefined {
		const existing = this.getTunnelFromMap(remoteHost, remotePort);
		if (existing) {
			++existing.refcount;
			return existing.value;
		}

		if (this._tunnelProvider) {
			const preferredLocalPort = localPort === undefined ? remotePort : localPort;
			const tunnelOptions = { remoteAddress: { host: remoteHost, port: remotePort }, localAddressPort: localPort };
			const creationInfo = { elevationRequired: elevateIfNeeded ? isPortPrivileged(preferredLocalPort) : false };
			const tunnel = this._tunnelProvider.forwardPort(tunnelOptions, creationInfo);
			if (tunnel) {
				this.addTunnelToMap(remoteHost, remotePort, tunnel);
			}
			return tunnel;
		}
		return undefined;
	}

	canTunnel(uri: URI): boolean {
		return super.canTunnel(uri) && !!this.environmentService.remoteAuthority;
	}
}
