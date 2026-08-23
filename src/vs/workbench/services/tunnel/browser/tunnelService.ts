/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IAddressProvider } from '../../../../platform/remote/common/remoteAgentConnection.js';
import { AbstractTunnelService, ITunnelProvider, ITunnelService, RemoteTunnel, isTunnelProvider } from '../../../../platform/tunnel/common/tunnel.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';

export class TunnelService extends AbstractTunnelService {
	constructor(
		@ILogService logService: ILogService,
		@IWorkbenchEnvironmentService private environmentService: IWorkbenchEnvironmentService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(logService, configurationService);
	}

	public isPortPrivileged(_port: number): boolean {
		return false;
	}

	protected retainOrCreateTunnel(tunnelProvider: IAddressProvider | ITunnelProvider, remoteHost: string, remotePort: number, _localHost: string, localPort: number | undefined, elevateIfNeeded: boolean, privacy?: string, protocol?: string): Promise<RemoteTunnel | string | undefined> | undefined {
		const existing = this.getTunnelFromMap(remoteHost, remotePort);
		if (existing) {
			++existing.refcount;
			return existing.value;
		}

		if (isTunnelProvider(tunnelProvider)) {
			return this.createWithProvider(tunnelProvider, remoteHost, remotePort, localPort, elevateIfNeeded, privacy, protocol);
		}
		return undefined;
	}

	override canTunnel(uri: URI): boolean {
		return super.canTunnel(uri) && !!this.environmentService.remoteAuthority;
	}
}

registerSingleton(ITunnelService, TunnelService, InstantiationType.Delayed);
