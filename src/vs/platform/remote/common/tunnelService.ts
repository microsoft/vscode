/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITunnelService, RemoteTunnel, ITunnelProvider } from 'vs/platform/remote/common/tunnel';
import { Event, Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';

export class NoOpTunnelService implements ITunnelService {
	_serviceBrand: undefined;

	public readonly tunnels: Promise<readonly RemoteTunnel[]> = Promise.resolve([]);
	private _onTunnelOpened: Emitter<RemoteTunnel> = new Emitter();
	public onTunnelOpened: Event<RemoteTunnel> = this._onTunnelOpened.event;
	private _onTunnelClosed: Emitter<number> = new Emitter();
	public onTunnelClosed: Event<number> = this._onTunnelClosed.event;
	openTunnel(_remotePort: number): Promise<RemoteTunnel> | undefined {
		return undefined;
	}
	async closeTunnel(_remotePort: number): Promise<void> {
	}
	setTunnelProvider(provider: ITunnelProvider | undefined): IDisposable {
		throw new Error('Method not implemented.');
	}
}
