/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/node/ipc';
import { Event, Emitter } from 'vs/base/common/event';

/**
 * This implementation doesn't perform well since it uses base64 encoding for buffers.
 * Electron 3.0 should have suport for buffers in IPC: https://github.com/electron/electron/pull/13055
 */

export interface Sender {
	send(channel: string, msg: string | null): void;
}

export class Protocol implements IMessagePassingProtocol {

	private listener: IDisposable;

	private _onMessage = new Emitter<Buffer>();
	get onMessage(): Event<Buffer> { return this._onMessage.event; }

	constructor(private sender: Sender, onMessageEvent: Event<string>) {
		onMessageEvent(msg => this._onMessage.fire(Buffer.from(msg, 'base64')));
	}

	send(message: Buffer): void {
		try {
			this.sender.send('ipc:message', message.toString('base64'));
		} catch (e) {
			// systems are going down
		}
	}

	dispose(): void {
		this.sender.send('ipc:disconnect', null);
		this.listener = dispose(this.listener);
	}
}