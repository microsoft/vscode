/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel, eventToCall, eventFromCall } from 'vs/base/parts/ipc/common/ipc';
import { IURLService } from './url';
import Event, { filterEvent } from 'vs/base/common/event';

export interface IURLChannel extends IChannel {
	call(command: 'event:onOpenURL'): TPromise<void>;
	call(command: string, arg: any): TPromise<any>;
}

export class URLChannel implements IURLChannel {

	constructor(private service: IURLService, private eventScope: (id: number) => boolean) { }

	call(command: string, arg: any): TPromise<any> {
		switch (command) {
			case 'event:onOpenURL': return eventToCall(filterEvent(this.service.onOpenURL, () => this.eventScope(arg as number)));
		}
	}
}

export class URLChannelClient implements IURLService {

	_serviceBrand: any;

	constructor(private channel: IChannel, private id: number) { }

	private _onOpenURL = eventFromCall<string>(this.channel, 'event:onOpenURL', this.id);
	get onOpenURL(): Event<string> { return this._onOpenURL; }
}