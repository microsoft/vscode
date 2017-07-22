/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import Event, { Emitter } from 'vs/base/common/event';

export interface Sender {
	send(channel: string, ...args: any[]): void;
}

export class Protocol implements IMessagePassingProtocol {

	private listener: IDisposable;

	private _onMessage: Event<any>;
	get onMessage(): Event<any> { return this._onMessage; }

	constructor(private sender: Sender, private onMessageEvent: Event<any>) {
		const emitter = new Emitter<any>();
		onMessageEvent(msg => emitter.fire(msg));
		this._onMessage = emitter.event;
	}

	send(message: any): void {
		try {
			this.sender.send('ipc:message', message);
		} catch (e) {
			// systems are going down
		}
	}

	dispose(): void {
		this.listener = dispose(this.listener);
	}
}