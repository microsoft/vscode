/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { ActiveTunnelMode, INACTIVE_TUNNEL_MODE, IRemoteTunnelService, TunnelMode, TunnelStates, TunnelStatus } from '../common/remoteTunnel.js';

/**
 * Browser-safe Remote Tunnel service. Tunnel hosting requires the local CLI,
 * but discovery consumers still need the authoritative inactive state.
 */
export class BrowserRemoteTunnelService implements IRemoteTunnelService {

	declare readonly _serviceBrand: undefined;

	readonly onDidChangeTunnelStatus = Event.None;
	readonly onDidChangeMode = Event.None;
	readonly onDidTokenFailed = Event.None;

	async getTunnelStatus(): Promise<TunnelStatus> {
		return TunnelStates.uninitialized;
	}

	async getMode(): Promise<TunnelMode> {
		return INACTIVE_TUNNEL_MODE;
	}

	async initialize(_mode: TunnelMode): Promise<TunnelStatus> {
		return TunnelStates.uninitialized;
	}

	async startTunnel(_mode: ActiveTunnelMode): Promise<TunnelStatus> {
		return TunnelStates.uninitialized;
	}

	async stopTunnel(): Promise<void> { }

	async getTunnelName(): Promise<string | undefined> {
		return undefined;
	}
}

registerSingleton(IRemoteTunnelService, BrowserRemoteTunnelService, InstantiationType.Delayed);
