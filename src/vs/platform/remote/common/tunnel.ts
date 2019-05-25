/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ITunnelService = createDecorator<ITunnelService>('tunnelService');

export interface RemoteTunnel {
	readonly tunnelRemotePort: number;
	readonly tunnelLocalPort: number;

	dispose(): void;
}

export interface ITunnelService {
	_serviceBrand: any;

	openTunnel(remotePort: number): Promise<RemoteTunnel> | undefined;
}
