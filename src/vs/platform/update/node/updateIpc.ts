/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { Event, Emitter } from 'vs/base/common/event';
import { IUpdateService, State } from 'vs/platform/update/common/update';

export interface IUpdateChannel extends IChannel {
	listen(event: 'onStateChange'): Event<State>;
	listen<T>(command: string, arg?: any): Event<T>;

	call(command: 'checkForUpdates', arg: any): TPromise<void>;
	call(command: 'downloadUpdate'): TPromise<void>;
	call(command: 'applyUpdate'): TPromise<void>;
	call(command: 'quitAndInstall'): TPromise<void>;
	call(command: '_getInitialState'): TPromise<State>;
	call(command: 'isLatestVersion'): TPromise<boolean>;
	call(command: string, arg?: any): TPromise<any>;
}

export class UpdateChannel implements IUpdateChannel {

	constructor(private service: IUpdateService) { }

	listen<T>(event: string, arg?: any): Event<any> {
		switch (event) {
			case 'onStateChange': return this.service.onStateChange;
		}

		throw new Error('No event found');
	}

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'checkForUpdates': return this.service.checkForUpdates(arg);
			case 'downloadUpdate': return this.service.downloadUpdate();
			case 'applyUpdate': return this.service.applyUpdate();
			case 'quitAndInstall': return this.service.quitAndInstall();
			case '_getInitialState': return TPromise.as(this.service.state);
			case 'isLatestVersion': return this.service.isLatestVersion();
		}
		return undefined;
	}
}

export class UpdateChannelClient implements IUpdateService {

	_serviceBrand: any;

	private _onStateChange = new Emitter<State>();
	get onStateChange(): Event<State> { return this._onStateChange.event; }

	private _state: State = State.Uninitialized;
	get state(): State { return this._state; }

	constructor(private channel: IUpdateChannel) {
		// always set this._state as the state changes
		this.onStateChange(state => this._state = state);

		channel.call('_getInitialState').then(state => {
			// fire initial state
			this._onStateChange.fire(state);

			// fire subsequent states as they come in from remote

			this.channel.listen('onStateChange')(state => this._onStateChange.fire(state));
		});
	}

	checkForUpdates(context: any): TPromise<void> {
		return this.channel.call('checkForUpdates', context);
	}

	downloadUpdate(): TPromise<void> {
		return this.channel.call('downloadUpdate');
	}

	applyUpdate(): TPromise<void> {
		return this.channel.call('applyUpdate');
	}

	quitAndInstall(): TPromise<void> {
		return this.channel.call('quitAndInstall');
	}

	isLatestVersion(): TPromise<boolean> {
		return this.channel.call('isLatestVersion');
	}
}
