/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IAddress } from 'vs/platform/remote/common/remoteAgentConnection';

export const ISharedProcessTunnelService = createDecorator<ISharedProcessTunnelService>('sharedProcessTunnelService');

export const ipcSharedProcessTunnelChannelName = 'sharedProcessTunnel';

export interface ISharedProcessTunnel {
	tunnelLocalPort: number | undefined;
	localAddress: string;
}

/**
 * A service that creates tunnels on the shared process
 */
export interface ISharedProcessTunnelService {
	readonly _serviceBrand: undefined;

	/**
	 * Create a tunnel.
	 */
	createTunnel(): Promise<{ id: string }>;
	/**
	 * Start a previously created tunnel.
	 * Can only be called once per created tunnel.
	 */
	startTunnel(id: string, address: IAddress, tunnelRemoteHost: string, tunnelRemotePort: number, tunnelLocalPort: number | undefined, elevateIfNeeded: boolean | undefined): Promise<ISharedProcessTunnel>;
	/**
	 * Destroy a previously created tunnel.
	 */
	destroyTunnel(id: string): Promise<void>;
}
