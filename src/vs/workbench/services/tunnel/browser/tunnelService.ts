/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IAddressProvider } from 'vs/platform/remote/common/remoteAgentConnection';
import { AbstractTunnelService, ITunnelProvider, ITunnelService, RemoteTunnel, isTunnelProvider } from 'vs/platform/tunnel/common/tunnel';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

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
