/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel, eventToCall, eventFromCall } from 'vs/base/parts/ipc/common/ipc';
import Event from 'vs/base/common/event';
import { IUpdateService, IRawUpdate, State, IUpdate } from './update';

export interface IUpdateChannel extends IChannel {
	call(command: 'event:onError'): TPromise<void>;
	call(command: 'event:onUpdateAvailable'): TPromise<void>;
	call(command: 'event:onUpdateNotAvailable'): TPromise<void>;
	call(command: 'event:onUpdateReady'): TPromise<void>;
	call(command: 'event:onStateChange'): TPromise<void>;
	call(command: 'checkForUpdates', arg: boolean): TPromise<IUpdate>;
	call(command: 'quitAndInstall'): TPromise<void>;
	call(command: string, arg?: any): TPromise<any>;
}

export class UpdateChannel implements IUpdateChannel {

	constructor(private service: IUpdateService) { }

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'event:onError': return eventToCall(this.service.onError);
			case 'event:onUpdateAvailable': return eventToCall(this.service.onUpdateAvailable);
			case 'event:onUpdateNotAvailable': return eventToCall(this.service.onUpdateNotAvailable);
			case 'event:onUpdateReady': return eventToCall(this.service.onUpdateReady);
			case 'event:onStateChange': return eventToCall(this.service.onStateChange);
			case 'checkForUpdates': return this.service.checkForUpdates(arg);
			case 'quitAndInstall': return this.service.quitAndInstall();
		}
		return undefined;
	}
}

export class UpdateChannelClient implements IUpdateService {

	_serviceBrand: any;

	private _onError = eventFromCall<any>(this.channel, 'event:onError');
	get onError(): Event<any> { return this._onError; }

	private _onUpdateAvailable = eventFromCall<{ url: string; version: string; }>(this.channel, 'event:onUpdateAvailable');
	get onUpdateAvailable(): Event<{ url: string; version: string; }> { return this._onUpdateAvailable; }

	private _onUpdateNotAvailable = eventFromCall<boolean>(this.channel, 'event:onUpdateNotAvailable');
	get onUpdateNotAvailable(): Event<boolean> { return this._onUpdateNotAvailable; }

	private _onUpdateReady = eventFromCall<IRawUpdate>(this.channel, 'event:onUpdateReady');
	get onUpdateReady(): Event<IRawUpdate> { return this._onUpdateReady; }

	private _onStateChange = eventFromCall<State>(this.channel, 'event:onStateChange');
	get onStateChange(): Event<State> { return this._onStateChange; }

	private _state: State = State.Uninitialized;
	get state(): State { return this._state; };

	constructor(private channel: IChannel) {
		this.onStateChange(state => this._state = state);
	}

	checkForUpdates(explicit: boolean): TPromise<IUpdate> {
		return this.channel.call('checkForUpdates', explicit);
	}

	quitAndInstall(): TPromise<void> {
		return this.channel.call('quitAndInstall');
	}
}