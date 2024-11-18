/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProcessEnvironment } from '../../../../base/common/platform.js';

export const enum ExtHostConnectionType {
	IPC = 1,
	Socket = 2,
	MessagePort = 3
}

/**
 * The extension host will connect via named pipe / domain socket to its renderer.
 */
export class IPCExtHostConnection {
	public static ENV_KEY = 'VSCODE_EXTHOST_IPC_HOOK';

	public readonly type = ExtHostConnectionType.IPC;

	constructor(
		public readonly pipeName: string
	) { }

	public serialize(env: IProcessEnvironment): void {
		env[IPCExtHostConnection.ENV_KEY] = this.pipeName;
	}
}

/**
 * The extension host will receive via nodejs IPC the socket to its renderer.
 */
export class SocketExtHostConnection {
	public static ENV_KEY = 'VSCODE_EXTHOST_WILL_SEND_SOCKET';

	public readonly type = ExtHostConnectionType.Socket;

	public serialize(env: IProcessEnvironment): void {
		env[SocketExtHostConnection.ENV_KEY] = '1';
	}
}

/**
 * The extension host will receive via nodejs IPC the MessagePort to its renderer.
 */
export class MessagePortExtHostConnection {
	public static ENV_KEY = 'VSCODE_WILL_SEND_MESSAGE_PORT';

	public readonly type = ExtHostConnectionType.MessagePort;

	public serialize(env: IProcessEnvironment): void {
		env[MessagePortExtHostConnection.ENV_KEY] = '1';
	}
}

export type ExtHostConnection = IPCExtHostConnection | SocketExtHostConnection | MessagePortExtHostConnection;

function clean(env: IProcessEnvironment): void {
	delete env[IPCExtHostConnection.ENV_KEY];
	delete env[SocketExtHostConnection.ENV_KEY];
	delete env[MessagePortExtHostConnection.ENV_KEY];
}

/**
 * Write `connection` into `env` and clean up `env`.
 */
export function writeExtHostConnection(connection: ExtHostConnection, env: IProcessEnvironment): void {
	// Avoid having two different keys that might introduce amiguity or problems.
	clean(env);
	connection.serialize(env);
}

/**
 * Read `connection` from `env` and clean up `env`.
 */
export function readExtHostConnection(env: IProcessEnvironment): ExtHostConnection {
	if (env[IPCExtHostConnection.ENV_KEY]) {
		return cleanAndReturn(env, new IPCExtHostConnection(env[IPCExtHostConnection.ENV_KEY]!));
	}
	if (env[SocketExtHostConnection.ENV_KEY]) {
		return cleanAndReturn(env, new SocketExtHostConnection());
	}
	if (env[MessagePortExtHostConnection.ENV_KEY]) {
		return cleanAndReturn(env, new MessagePortExtHostConnection());
	}
	throw new Error(`No connection information defined in environment!`);
}

function cleanAndReturn(env: IProcessEnvironment, result: ExtHostConnection): ExtHostConnection {
	clean(env);
	return result;
}
