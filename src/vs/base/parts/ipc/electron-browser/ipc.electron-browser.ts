/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IPCClient } from 'vs/base/parts/ipc/node/ipc';
import { Protocol } from 'vs/base/parts/ipc/node/ipc.electron';
import { ipcRenderer } from 'electron';
import { IDisposable } from 'vs/base/common/lifecycle';

export class Client extends IPCClient implements IDisposable {

	private protocol: Protocol;

	private static createProtocol(): Protocol {
		const onMessage = Event.fromNodeEventEmitter<string>(ipcRenderer, 'ipc:message', (_, message: string) => message);
		ipcRenderer.send('ipc:hello');
		return new Protocol(ipcRenderer, onMessage);
	}

	constructor(id: string) {
		const protocol = Client.createProtocol();
		super(protocol, id);
		this.protocol = protocol;
	}

	dispose(): void {
		this.protocol.dispose();
	}
}