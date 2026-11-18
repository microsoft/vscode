/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../common/lifecycle.js';
import { Client as MessagePortClient } from '../common/ipc.mp.js';

/**
 * An implementation of a `IPCClient` on top of DOM `MessagePort`.
 */
export class Client extends MessagePortClient implements IDisposable {

	/**
	 * @param clientId a way to uniquely identify this client among
	 * other clients. this is important for routing because every
	 * client can also be a server
	 */
	constructor(port: MessagePort, clientId: string) {
		super(port, clientId);
	}
}
