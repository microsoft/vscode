/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fromNodeEventEmitter } from 'vs/base/common/event';
import { IPCClient } from 'vs/base/parts/ipc/common/ipc';
import { Protocol } from 'vs/base/parts/ipc/common/ipc.electron';
import { ipcRenderer } from 'electron';

export class Client extends IPCClient {

	private static createProtocol(): Protocol {
		const onMessage = fromNodeEventEmitter<string>(ipcRenderer, 'ipc:message', (_, message) => message);
		ipcRenderer.send('ipc:hello');
		return new Protocol(ipcRenderer, onMessage);
	}

	constructor(id: string) {
		super(Client.createProtocol(), id);
	}
}