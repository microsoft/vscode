/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtHostTunnelServiceShape, MainThreadTunnelServiceShape, MainContext } from 'vs/workbench/api/common/extHost.protocol';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import * as vscode from 'vscode';
import { Disposable } from 'vs/base/common/lifecycle';

export interface TunnelOptions {
	remote: { port: number, host: string };
	localPort?: number;
	name?: string;
	closeable?: boolean;
}

export interface TunnelDto {
	remote: { port: number, host: string };
	localAddress: string;
}

export interface IExtHostTunnelService extends ExtHostTunnelServiceShape {
	readonly _serviceBrand: undefined;
	makeTunnel(forward: TunnelOptions): Promise<vscode.Tunnel | undefined>;
	addDetected(tunnels: { remote: { port: number, host: string }, localAddress: string }[] | undefined): Promise<void>;
}

export const IExtHostTunnelService = createDecorator<IExtHostTunnelService>('IExtHostTunnelService');


export class ExtHostTunnelService extends Disposable implements IExtHostTunnelService {
	readonly _serviceBrand: undefined;
	private readonly _proxy: MainThreadTunnelServiceShape;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService
	) {
		super();
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadTunnelService);
	}
	async makeTunnel(forward: TunnelOptions): Promise<vscode.Tunnel | undefined> {
		const tunnel = await this._proxy.$openTunnel(forward);
		if (tunnel) {
			const disposableTunnel: vscode.Tunnel = {
				remote: tunnel.remote,
				localAddress: tunnel.localAddress,
				dispose: () => {
					return this._proxy.$closeTunnel(tunnel.remote.port);
				}
			};
			this._register(disposableTunnel);
			return disposableTunnel;
		}
		return undefined;
	}

	async addDetected(tunnels: { remote: { port: number, host: string }, localAddress: string }[] | undefined): Promise<void> {
		if (tunnels) {
			return this._proxy.$addDetected(tunnels);
		}
	}

}

