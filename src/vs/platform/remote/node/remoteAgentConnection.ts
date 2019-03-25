/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Client, PersistentProtocol } from 'vs/base/parts/ipc/common/ipc.net';
import { RemoteAgentConnectionContext } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { Disposable } from 'vs/base/common/lifecycle';

export interface IRemoteExtensionHostStartParams {
	language: string;
	debugId?: string;
	break?: boolean;
	port?: number | null;
	updatePort?: boolean;
}

export interface IConnectionOptions {
	isBuilt: boolean;
	commit: string | undefined;
	addressProvider: IAddressProvider;
}

export interface IAddress {
	host: string;
	port: number;
}

export interface IAddressProvider {
	getAddress(): Promise<IAddress>;
}

export async function connectRemoteAgentManagement(options: IConnectionOptions, remoteAuthority: string, clientId: string): Promise<ManagementPersistentConnection> {
	throw new Error(`Not implemented`);
}

export async function connectRemoteAgentExtensionHost(options: IConnectionOptions, startArguments: IRemoteExtensionHostStartParams): Promise<ExtensionHostPersistentConnection> {
	throw new Error(`Not implemented`);
}

export async function createRemoteTunnel(options: IConnectionOptions, tunnelRemotePort: number): Promise<RemoteTunnel> {
	throw new Error(`Not implemented`);
}

export class RemoteTunnel extends Disposable {
}

abstract class PersistentConnection extends Disposable {

	public readonly reconnectionToken: string;
	public readonly protocol: PersistentProtocol;

	constructor(reconnectionToken: string, protocol: PersistentProtocol) {
		super();
		this.reconnectionToken = reconnectionToken;
		this.protocol = protocol;
	}
}

export class ManagementPersistentConnection extends PersistentConnection {

	public readonly client: Client<RemoteAgentConnectionContext>;

	constructor(remoteAuthority: string, host: string, port: number, clientId: string, isBuilt: boolean, reconnectionToken: string, protocol: PersistentProtocol) {
		super(reconnectionToken, protocol);

		this.client = this._register(new Client<RemoteAgentConnectionContext>(protocol, {
			remoteAuthority: remoteAuthority,
			clientId: clientId
		}));
	}
}

export class ExtensionHostPersistentConnection extends PersistentConnection {

	public readonly debugPort: number | undefined;

	constructor(host: string, port: number, startArguments: IRemoteExtensionHostStartParams, isBuilt: boolean, reconnectionToken: string, protocol: PersistentProtocol, debugPort: number | undefined) {
		super(reconnectionToken, protocol);
		this.debugPort = debugPort;
	}
}
