/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel, eventToCall, eventFromCall } from 'vs/base/parts/ipc/common/ipc';
import { IWindowEventService } from 'vs/code/common/windows';
import Event, { buffer } from 'vs/base/common/event';

export interface IWindowEventChannel extends IChannel {
	call(command: 'event:onNewWindowOpen'): TPromise<number>;
	call(command: 'event:onWindowFocus'): TPromise<number>;
	call(command: string, arg: any): any;
}

export class WindowEventChannel implements IWindowEventChannel {

	onNewWindowOpen: Event<number>;
	onWindowFocus: Event<number>;

	constructor(private service: IWindowEventService) {
		this.onNewWindowOpen = buffer(service.onNewWindowOpen, true);
		this.onWindowFocus = buffer(service.onWindowFocus, true);
	}

	call(command: string, args: any): any {
		switch (command) {
			case 'event:onNewWindowOpen':
				return eventToCall(this.onNewWindowOpen);
			case 'event:onWindowFocus':
				return eventToCall(this.onWindowFocus);
		}
		return TPromise.wrapError('invalid command');
	}
}

export class WindowEventChannelClient implements IWindowEventService {

	_serviceBrand: any;

	constructor(private channel: IWindowEventChannel) { }

	private _onNewWindowOpen: Event<number> = eventFromCall<number>(this.channel, 'event:onNewWindowOpen');
	get onNewWindowOpen(): Event<number> {
		return this._onNewWindowOpen;
	}

	private _onWindowFocus: Event<number> = eventFromCall<number>(this.channel, 'event:onWindowFocus');
	get onWindowFocus(): Event<number> {
		return this._onWindowFocus;
	}
}