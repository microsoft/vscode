/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IServerChannel, IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IReloadSessionEvent, ICloseSessionEvent, IAttachSessionEvent, ILogToSessionEvent, ITerminateSessionEvent, IExtensionHostDebugService } from 'vs/platform/debug/common/extensionHostDebug';
import { Event, Emitter } from 'vs/base/common/event';
import { IRemoteConsoleLog } from 'vs/base/common/console';
import { Disposable } from 'vs/base/common/lifecycle';

export class ExtensionHostDebugBroadcastChannel<TContext> implements IServerChannel<TContext> {

	static readonly ChannelName = 'extensionhostdebugservice';

	private _onCloseEmitter = new Emitter<ICloseSessionEvent>();
	private _onReloadEmitter = new Emitter<IReloadSessionEvent>();
	private _onTerminateEmitter = new Emitter<ITerminateSessionEvent>();
	private _onLogToEmitter = new Emitter<ILogToSessionEvent>();
	private _onAttachEmitter = new Emitter<IAttachSessionEvent>();

	call(ctx: TContext, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'close':
				return Promise.resolve(this._onCloseEmitter.fire({ sessionId: arg[0] }));
			case 'reload':
				return Promise.resolve(this._onReloadEmitter.fire({ sessionId: arg[0] }));
			case 'terminate':
				return Promise.resolve(this._onTerminateEmitter.fire({ sessionId: arg[0] }));
			case 'log':
				return Promise.resolve(this._onLogToEmitter.fire({ sessionId: arg[0], log: arg[1] }));
			case 'attach':
				return Promise.resolve(this._onAttachEmitter.fire({ sessionId: arg[0], port: arg[1], subId: arg[2] }));
		}
		throw new Error('Method not implemented.');
	}

	listen(ctx: TContext, event: string, arg?: any): Event<any> {
		switch (event) {
			case 'close':
				return this._onCloseEmitter.event;
			case 'reload':
				return this._onReloadEmitter.event;
			case 'terminate':
				return this._onTerminateEmitter.event;
			case 'log':
				return this._onLogToEmitter.event;
			case 'attach':
				return this._onAttachEmitter.event;
		}
		throw new Error('Method not implemented.');
	}
}

export class ExtensionHostDebugChannelClient extends Disposable implements IExtensionHostDebugService {

	_serviceBrand: any;

	constructor(private channel: IChannel) {
		super();
	}

	reload(sessionId: string): void {
		this.channel.call('reload', [sessionId]);
	}

	get onReload(): Event<IReloadSessionEvent> {
		return this.channel.listen('reload');
	}

	close(sessionId: string): void {
		this.channel.call('close', [sessionId]);
	}

	get onClose(): Event<ICloseSessionEvent> {
		return this.channel.listen('close');
	}

	attachSession(sessionId: string, port: number, subId?: string): void {
		this.channel.call('attach', [sessionId, port, subId]);
	}

	get onAttachSession(): Event<IAttachSessionEvent> {
		return this.channel.listen('attach');
	}

	logToSession(sessionId: string, log: IRemoteConsoleLog): void {
		this.channel.call('log', [sessionId, log]);
	}

	get onLogToSession(): Event<ILogToSessionEvent> {
		return this.channel.listen('log');
	}

	terminateSession(sessionId: string, subId?: string): void {
		this.channel.call('terminate', [sessionId, subId]);
	}

	get onTerminateSession(): Event<ITerminateSessionEvent> {
		return this.channel.listen('terminate');
	}
}