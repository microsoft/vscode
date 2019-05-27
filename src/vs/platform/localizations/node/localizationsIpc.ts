/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event } from 'vs/base/common/event';
import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';

export class LocalizationsChannel implements IServerChannel {

	onDidLanguagesChange: Event<void>;

	constructor(private service: ILocalizationsService) {
		this.onDidLanguagesChange = Event.buffer(service.onDidLanguagesChange, true);
	}

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidLanguagesChange': return this.onDidLanguagesChange;
		}

		throw new Error(`Event not found: ${event}`);
	}

	call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'getLanguageIds': return this.service.getLanguageIds(arg);
		}

		throw new Error(`Call not found: ${command}`);
	}
}
