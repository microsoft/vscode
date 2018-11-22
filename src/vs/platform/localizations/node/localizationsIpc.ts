/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel } from 'vs/base/parts/ipc/node/ipc';
import { Event, buffer } from 'vs/base/common/event';
import { ILocalizationsService, LanguageType } from 'vs/platform/localizations/common/localizations';

export class LocalizationsChannel implements IServerChannel {

	onDidLanguagesChange: Event<void>;

	constructor(private service: ILocalizationsService) {
		this.onDidLanguagesChange = buffer(service.onDidLanguagesChange, true);
	}

	listen(_, event: string): Event<any> {
		switch (event) {
			case 'onDidLanguagesChange': return this.onDidLanguagesChange;
		}

		throw new Error(`Event not found: ${event}`);
	}

	call(_, command: string, arg?: any): Thenable<any> {
		switch (command) {
			case 'getLanguageIds': return this.service.getLanguageIds(arg);
		}

		throw new Error(`Call not found: ${command}`);
	}
}

export class LocalizationsChannelClient implements ILocalizationsService {

	_serviceBrand: any;

	constructor(private channel: IChannel) { }

	get onDidLanguagesChange(): Event<void> { return this.channel.listen('onDidLanguagesChange'); }

	getLanguageIds(type?: LanguageType): Thenable<string[]> {
		return this.channel.call('getLanguageIds', type);
	}
}