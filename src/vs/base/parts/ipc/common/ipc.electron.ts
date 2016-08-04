/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable, dispose } from 'vs/base/common/lifecycle';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { Server as IPCServer, Client as IPCClient, IServer, IClient, IChannel } from 'vs/base/parts/ipc/common/ipc';

const Hello = 'ipc:hello';
const Goodbye = 'ipc:goodbye';
const Message = 'ipc:message';

export interface Sender {
	send(channel: string, ...args: any[]): void;
}

export interface IPC extends Sender, NodeJS.EventEmitter {}

class Protocol implements IMessagePassingProtocol {

	private listener: IDisposable;

	constructor(private sender: Sender, private receiver: NodeJS.EventEmitter) {}

	send(message: any): void {
		this.sender.send(Message, message);
	}

	onMessage(callback: (message: any) => void): void {
		const cb = (_, m) => callback(m);
		this.receiver.on(Message, cb);
		this.listener = toDisposable(() => this.receiver.removeListener(Message, cb));
	}

	dispose(): void {
		this.listener = dispose(this.listener);
	}
}

export class Server implements IServer, IDisposable {

	private channels: { [name: string]: IChannel };

	constructor(ipc: NodeJS.EventEmitter) {
		this.channels = Object.create(null);

		ipc.on(Hello, ({ sender }) => {
			const protocol = new Protocol(sender, ipc);
			const ipcServer = new IPCServer(protocol);

			Object.keys(this.channels)
				.forEach(name => ipcServer.registerChannel(name, this.channels[name]));

			sender.once(Goodbye, () => {
				ipcServer.dispose();
				protocol.dispose();
			});
		});
	}

	registerChannel(channelName: string, channel: IChannel): void {
		this.channels[channelName] = channel;
	}

	dispose(): void {
		this.channels = null;
	}
}

export class Client implements IClient, IDisposable {

	private protocol: Protocol;
	private ipcClient: IPCClient;

	constructor(private ipc: IPC) {
		ipc.send(Hello);
		this.protocol = new Protocol(ipc, ipc);
		this.ipcClient = new IPCClient(this.protocol);
	}

	getChannel<T extends IChannel>(channelName: string): T {
		return this.ipcClient.getChannel(channelName) as T;
	}

	dispose(): void {
		this.ipc.send(Goodbye);
		this.protocol = dispose(this.protocol);
	}
}