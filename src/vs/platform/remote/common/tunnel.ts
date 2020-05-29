/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';

export const ITunnelService = createDecorator<ITunnelService>('tunnelService');

export interface RemoteTunnel {
	readonly tunnelRemotePort: number;
	readonly tunnelRemoteHost: string;
	readonly tunnelLocalPort?: number;
	readonly localAddress: string;
	dispose(silent?: boolean): void;
}

export interface TunnelOptions {
	remoteAddress: { port: number, host: string };
	localAddressPort?: number;
	label?: string;
}

export interface ITunnelProvider {
	forwardPort(tunnelOptions: TunnelOptions): Promise<RemoteTunnel> | undefined;
}

export interface ITunnelService {
	_serviceBrand: undefined;

	readonly tunnels: Promise<readonly RemoteTunnel[]>;
	readonly onTunnelOpened: Event<RemoteTunnel>;
	readonly onTunnelClosed: Event<{ host: string, port: number }>;

	openTunnel(remoteHost: string | undefined, remotePort: number, localPort?: number): Promise<RemoteTunnel> | undefined;
	closeTunnel(remoteHost: string, remotePort: number): Promise<void>;
	setTunnelProvider(provider: ITunnelProvider | undefined): IDisposable;
}

export function extractLocalHostUriMetaDataForPortMapping(uri: URI): { address: string, port: number } | undefined {
	if (uri.scheme !== 'http' && uri.scheme !== 'https') {
		return undefined;
	}
	const localhostMatch = /^(localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)$/.exec(uri.authority);
	if (!localhostMatch) {
		return undefined;
	}
	return {
		address: localhostMatch[1],
		port: +localhostMatch[2],
	};
}
