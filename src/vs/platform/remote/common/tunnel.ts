/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';

export const ITunnelService = createDecorator<ITunnelService>('tunnelService');

export interface RemoteTunnel {
	readonly tunnelRemotePort: number;
	readonly tunnelLocalPort: number;

	dispose(): void;
}

export interface ITunnelService {
	_serviceBrand: undefined;

	readonly tunnels: Promise<readonly RemoteTunnel[]>;

	openTunnel(remotePort: number): Promise<RemoteTunnel> | undefined;
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
