/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMessagePassingProtocol } from 'vs/base/parts/ipc/node/ipc';
import { Event } from 'vs/base/common/event';

export interface Sender {
	send(channel: string, msg: Buffer | null): void;
}

export class Protocol implements IMessagePassingProtocol {

	constructor(private sender: Sender, readonly onMessage: Event<Buffer>) { }

	send(message: Buffer): void {
		try {
			this.sender.send('ipc:message', message);
		} catch (e) {
			// systems are going down
		}
	}

	dispose(): void {
		this.sender.send('ipc:disconnect', null);
	}
}