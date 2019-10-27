/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITunnelService, RemoteTunnel } from 'vs/platform/remote/common/tunnel';

export class NoOpTunnelService implements ITunnelService {
	_serviceBrand: undefined;

	public readonly tunnels: Promise<readonly RemoteTunnel[]> = Promise.resolve([]);

	openTunnel(_remotePort: number): Promise<RemoteTunnel> | undefined {
		return undefined;
	}
}
