/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import Event, { mapEvent, filterEvent } from 'vs/base/common/event';
import { fromEventEmitter } from 'vs/base/node/event';
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

	constructor(private sender: Sender, private onMessageEvent: Event<any>) {}

	send(message: any): void {
		this.sender.send(Message, message);
	}

	onMessage(callback: (message: any) => void): void {
		this.listener = this.onMessageEvent(callback);
	}

	dispose(): void {
		this.listener = dispose(this.listener);
	}
}

interface IIPCEvent {
	event: any;
	message: string;
}

export class Server implements IServer, IDisposable {

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
		const onRawMessageEvent = fromEventEmitter<IIPCEvent>(this.ipc, eventName, (event, message) => ({ event, message }));
		const onScopedRawMessageEvent = filterEvent<IIPCEvent>(onRawMessageEvent, ({ event }) => event.sender.getId() === senderId);
		return mapEvent<IIPCEvent,string>(onScopedRawMessageEvent, ({ message }) => message);
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