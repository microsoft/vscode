/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Client, BufferedProtocol } from 'vs/base/parts/ipc/node/ipc.net';
import { IExtensionHostDebugParams } from 'vs/platform/environment/common/environment';

export interface RemoteAgentConnectionContext {
	remoteAuthority: string;
	clientId: string;
}

export function connectRemoteAgentManagement(remoteAuthority: string, host: string, port: number, clientId: string, isBuilt: boolean): Promise<Client<RemoteAgentConnectionContext>> {
	throw new Error(`Not implemented`);
}

export interface IExtensionHostConnectionResult {
	protocol: BufferedProtocol;
	debugPort?: number;
}

export interface IRemoteExtensionHostDebugParams extends IExtensionHostDebugParams {
	updatePort?: boolean;
}

export function connectRemoteAgentExtensionHost(host: string, port: number, debugArguments: IRemoteExtensionHostDebugParams, isBuilt: boolean): Promise<IExtensionHostConnectionResult> {
	throw new Error(`Not implemented`);
}
