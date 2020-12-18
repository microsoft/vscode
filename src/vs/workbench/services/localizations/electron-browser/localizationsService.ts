/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createChannelSender } from 'vs/base/parts/ipc/common/ipc';
import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

// @ts-ignore: interface is implemented via proxy
export class LocalizationsService implements ILocalizationsService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
	) {
		return createChannelSender<ILocalizationsService>(sharedProcessService.getChannel('localizations'));
	}
}

registerSingleton(ILocalizationsService, LocalizationsService, true);
