/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel } from 'vs/base/parts/ipc/node/ipc';
import { Event, Emitter } from 'vs/base/common/event';
import { IUpdateService, State } from 'vs/platform/update/common/update';

export class UpdateChannel implements IServerChannel {

	constructor(private service: IUpdateService) { }

	listen(_, event: string): Event<any> {
		switch (event) {
			case 'onStateChange': return this.service.onStateChange;
		}

		throw new Error(`Event not found: ${event}`);
	}

	call(_, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'checkForUpdates': return this.service.checkForUpdates(arg);
			case 'downloadUpdate': return this.service.downloadUpdate();
			case 'applyUpdate': return this.service.applyUpdate();
			case 'quitAndInstall': return this.service.quitAndInstall();
			case '_getInitialState': return Promise.resolve(this.service.state);
			case 'isLatestVersion': return this.service.isLatestVersion();
		}

		throw new Error(`Call not found: ${command}`);
	}
}

export class UpdateChannelClient implements IUpdateService {

	_serviceBrand: any;

	private _onStateChange = new Emitter<State>();
	get onStateChange(): Event<State> { return this._onStateChange.event; }

	private _state: State = State.Uninitialized;
	get state(): State { return this._state; }

	constructor(private channel: IChannel) {
		// always set this._state as the state changes
		this.onStateChange(state => this._state = state);

		channel.call<State>('_getInitialState').then(state => {
			// fire initial state
			this._onStateChange.fire(state);

			// fire subsequent states as they come in from remote

			this.channel.listen<State>('onStateChange')(state => this._onStateChange.fire(state));
		});
	}

	checkForUpdates(context: any): Promise<void> {
		return this.channel.call('checkForUpdates', context);
	}

	downloadUpdate(): Promise<void> {
		return this.channel.call('downloadUpdate');
	}

	applyUpdate(): Promise<void> {
		return this.channel.call('applyUpdate');
	}

	quitAndInstall(): Promise<void> {
		return this.channel.call('quitAndInstall');
	}

	isLatestVersion(): Promise<boolean> {
		return this.channel.call('isLatestVersion');
	}
}
