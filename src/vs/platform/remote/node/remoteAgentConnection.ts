/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { Client, Protocol } from 'vs/base/parts/ipc/node/ipc.net';
import { IExtensionHostDebugParams } from 'vs/platform/environment/common/environment';

export function connectRemoteAgentManagement(host: string, port: number, clientId: string): TPromise<Client> {
	throw new Error(`Not implemented`);
}

export interface IExtensionHostConnectionResult {
	protocol: Protocol;
	debugPort?: number;
}

export function connectRemoteAgentExtensionHost(host: string, port: number, debugArguments: IExtensionHostDebugParams): TPromise<IExtensionHostConnectionResult> {
	throw new Error(`Not implemented`);
}
