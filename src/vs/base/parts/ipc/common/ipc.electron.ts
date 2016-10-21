/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import Event, { Emitter, chain } from 'vs/base/common/event';
import { fromEventEmitter } from 'vs/base/node/event';
import { ChannelServer as IPCServer, ChannelClient as IPCClient, IChannelServer, IChannelClient, IChannel } from 'vs/base/parts/ipc/common/ipc';

const Hello = 'ipc:hello';
const Goodbye = 'ipc:goodbye';
const Message = 'ipc:message';

export interface Sender {
	send(channel: string, ...args: any[]): void;
}

export interface IPC extends Sender, NodeJS.EventEmitter { }

class Protocol implements IMessagePassingProtocol {

	private listener: IDisposable;

	private _onMessage: Event<any>;
	get onMessage(): Event<any> { return this._onMessage; }

	constructor(private sender: Sender, private onMessageEvent: Event<any>) {
		const emitter = new Emitter<any>();
		onMessageEvent(msg => emitter.fire(msg));
		this._onMessage = emitter.event;
	}

	send(message: any): void {
		this.sender.send(Message, message);
	}

	dispose(): void {
		this.listener = dispose(this.listener);
	}
}

interface IIPCEvent {
	event: any;
	message: string;
}

export class Server implements IChannelServer, IDisposable {

	private channels: { [name: string]: IChannel } = Object.create(null);

	constructor(private ipc: NodeJS.EventEmitter) {
		ipc.on(Hello, ({ sender }) => this.onHello(sender));
	}

	registerChannel(channelName: string, channel: IChannel): void {
		this.channels[channelName] = channel;
	}

	private onHello(sender: any): void {
		const senderId = sender.getId();
		const onMessage = this.createScopedEvent(Message, senderId);
		const protocol = new Protocol(sender, onMessage);
		const ipcServer = new IPCServer(protocol);

		Object.keys(this.channels)
			.forEach(name => ipcServer.registerChannel(name, this.channels[name]));

		const onGoodbye = this.createScopedEvent(Goodbye, senderId);
		const listener = onGoodbye(() => {
			listener.dispose();
			ipcServer.dispose();
			protocol.dispose();
		});
	}

	private createScopedEvent(eventName: string, senderId: string) {
		return chain(fromEventEmitter<IIPCEvent>(this.ipc, eventName, (event, message) => ({ event, message })))
			.filter(({ event }) => event.sender.getId() === senderId)
			.map(({ message }) => message)
			.event;
	}

	dispose(): void {
		this.channels = null;
	}
}

export class Client implements IChannelClient, IDisposable {

	private protocol: Protocol;
	private ipcClient: IPCClient;

	constructor(private ipc: IPC) {
		ipc.send(Hello);

		const receiverEvent = fromEventEmitter<string>(ipc, Message, (_, message) => message);
		this.protocol = new Protocol(ipc, receiverEvent);
		this.ipcClient = new IPCClient(this.protocol);
	}

	getChannel<T extends IChannel>(channelName: string): T {
		return this.ipcClient.getChannel(channelName) as T;
	}

	dispose(): void {
		this.ipc.send(Goodbye);
		this.ipcClient = dispose(this.ipcClient);
		this.protocol = dispose(this.protocol);
	}
}