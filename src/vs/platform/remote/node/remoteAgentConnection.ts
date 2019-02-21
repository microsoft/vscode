/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Client, BufferedProtocol } from 'vs/base/parts/ipc/node/ipc.net';

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

export interface IRemoteExtensionHostStartParams {
	language: string;
	debugId?: string;
	break: boolean;
	port: number | null;
	updatePort?: boolean;
}

export function connectRemoteAgentExtensionHost(host: string, port: number, startArguments: IRemoteExtensionHostStartParams, isBuilt: boolean): Promise<IExtensionHostConnectionResult> {
	throw new Error(`Not implemented`);
}
