/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event } from 'vs/base/common/event';
import { ILocalizationsService, LanguageType } from 'vs/platform/localizations/common/localizations';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export class LocalizationsService implements ILocalizationsService {

	_serviceBrand!: ServiceIdentifier<any>;

	private channel: IChannel;

	constructor(@ISharedProcessService sharedProcessService: ISharedProcessService) {
		this.channel = sharedProcessService.getChannel('localizations');
	}

	get onDidLanguagesChange(): Event<void> { return this.channel.listen('onDidLanguagesChange'); }

	getLanguageIds(type?: LanguageType): Promise<string[]> {
		return this.channel.call('getLanguageIds', type);
	}
}
