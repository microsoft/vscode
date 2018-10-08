/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { Event, buffer } from 'vs/base/common/event';
import { ILocalizationsService, LanguageType } from 'vs/platform/localizations/common/localizations';

export interface ILocalizationsChannel extends IChannel {
	listen(event: 'onDidLanguagesChange'): Event<void>;
	listen<T>(event: string, arg?: any): Event<T>;

	call(command: 'getLanguageIds'): Thenable<string[]>;
	call(command: string, arg?: any): Thenable<any>;
}

export class LocalizationsChannel implements ILocalizationsChannel {

	onDidLanguagesChange: Event<void>;

	constructor(private service: ILocalizationsService) {
		this.onDidLanguagesChange = buffer(service.onDidLanguagesChange, true);
	}

	listen<T>(event: string): Event<any> {
		switch (event) {
			case 'onDidLanguagesChange': return this.onDidLanguagesChange;
		}

		throw new Error('No event found');
	}

	call(command: string, arg?: any): Thenable<any> {
		switch (command) {
			case 'getLanguageIds': return this.service.getLanguageIds(arg);
		}
		return undefined;
	}
}

export class LocalizationsChannelClient implements ILocalizationsService {

	_serviceBrand: any;

	constructor(private channel: ILocalizationsChannel) { }

	get onDidLanguagesChange(): Event<void> { return this.channel.listen('onDidLanguagesChange'); }

	getLanguageIds(type?: LanguageType): TPromise<string[]> {
		return TPromise.wrap(this.channel.call('getLanguageIds', type));
	}
}