/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtHostTunnelServiceShape } from 'vs/workbench/api/common/extHost.protocol';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import * as vscode from 'vscode';
import { RemoteTunnel } from 'vs/platform/remote/common/tunnel';
import { IDisposable } from 'vs/base/common/lifecycle';

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

export namespace TunnelDto {
	export function fromApiTunnel(tunnel: vscode.Tunnel): TunnelDto {
		return { remote: tunnel.remote, localAddress: tunnel.localAddress };
	}
	export function fromServiceTunnel(tunnel: RemoteTunnel): TunnelDto {
		return { remote: { host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort }, localAddress: tunnel.localAddress };
	}
}

export interface Tunnel extends vscode.Disposable {
	remote: { port: number, host: string };
	localAddress: string;
}

export interface IExtHostTunnelService extends ExtHostTunnelServiceShape {
	readonly _serviceBrand: undefined;
	makeTunnel(forward: TunnelOptions): Promise<vscode.Tunnel | undefined>;
	setForwardPortProvider(provider: vscode.RemoteAuthorityResolver | undefined): Promise<IDisposable>;
}

export const IExtHostTunnelService = createDecorator<IExtHostTunnelService>('IExtHostTunnelService');

export class ExtHostTunnelService implements IExtHostTunnelService {
	_serviceBrand: undefined;
	async makeTunnel(forward: TunnelOptions): Promise<vscode.Tunnel | undefined> {
		return undefined;
	}
	async $findCandidatePorts(): Promise<{ port: number; detail: string; }[]> {
		return [];
	}
	async setForwardPortProvider(provider: vscode.RemoteAuthorityResolver | undefined): Promise<IDisposable> { return { dispose: () => { } }; }
	$forwardPort(tunnelOptions: TunnelOptions): Promise<TunnelDto> | undefined { return undefined; }
	async $closeTunnel(remote: { host: string, port: number }): Promise<void> { }

}
