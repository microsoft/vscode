/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel, eventToCall, eventFromCall } from 'vs/base/parts/ipc/common/ipc';
import { Event, buffer } from 'vs/base/common/event';
import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';

export interface ILocalizationsChannel extends IChannel {
	call(command: 'event:onDidLanguagesChange'): TPromise<void>;
	call(command: 'getLanguageIds'): TPromise<string[]>;
	call(command: string, arg?: any): TPromise<any>;
}

export class LocalizationsChannel implements ILocalizationsChannel {

	onDidLanguagesChange: Event<void>;

	constructor(private service: ILocalizationsService) {
		this.onDidLanguagesChange = buffer(service.onDidLanguagesChange, true);
	}

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'event:onDidLanguagesChange': return eventToCall(this.onDidLanguagesChange);
			case 'getLanguageIds': return this.service.getLanguageIds();
		}
		return undefined;
	}
}

export class LocalizationsChannelClient implements ILocalizationsService {

	_serviceBrand: any;

	constructor(private channel: ILocalizationsChannel) { }

	private _onDidLanguagesChange = eventFromCall<void>(this.channel, 'event:onDidLanguagesChange');
	get onDidLanguagesChange(): Event<void> { return this._onDidLanguagesChange; }

	getLanguageIds(): TPromise<string[]> {
		return this.channel.call('getLanguageIds');
	}
}