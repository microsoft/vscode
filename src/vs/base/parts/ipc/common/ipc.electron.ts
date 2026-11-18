/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../common/buffer.js';
import { Event } from '../../../common/event.js';
import { IMessagePassingProtocol } from './ipc.js';

export interface Sender {
	send(channel: string, msg: unknown): void;
}

/**
 * The Electron `Protocol` leverages Electron style IPC communication (`ipcRenderer`, `ipcMain`)
 * for the implementation of the `IMessagePassingProtocol`. That style of API requires a channel
 * name for sending data.
 */
export class Protocol implements IMessagePassingProtocol {

	constructor(private sender: Sender, readonly onMessage: Event<VSBuffer>) { }

	send(message: VSBuffer): void {
		try {
			this.sender.send('vscode:message', message.buffer);
		} catch (e) {
			// systems are going down
		}
	}

	disconnect(): void {
		this.sender.send('vscode:disconnect', null);
	}
}
