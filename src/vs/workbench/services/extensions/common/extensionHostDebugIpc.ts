/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { RemoteAgentConnectionContext } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { IReloadSessionEvent, ICloseSessionEvent, IAttachSessionEvent, ILogToSessionEvent, ITerminateSessionEvent } from 'vs/workbench/services/extensions/common/extensionHostDebug';
import { Event, Emitter } from 'vs/base/common/event';

export class EchoChannel implements IServerChannel<RemoteAgentConnectionContext> {

	private _onCloseEmitter = new Emitter<ICloseSessionEvent>();
	private _onReloadEmitter = new Emitter<IReloadSessionEvent>();
	private _onTerminateEmitter = new Emitter<ITerminateSessionEvent>();
	private _onLogToEmitter = new Emitter<ILogToSessionEvent>();
	private _onAttachEmitter = new Emitter<IAttachSessionEvent>();

	call(ctx: RemoteAgentConnectionContext, command: string, arg?: any): Promise<any> {
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

	listen(ctx: RemoteAgentConnectionContext, event: string, arg?: any): Event<any> {
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
