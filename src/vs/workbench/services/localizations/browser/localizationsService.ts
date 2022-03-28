/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

/**
 * Add localizations service for the browser.
 */

// @ts-ignore: interface is implemented via proxy
export class LocalizationsService implements ILocalizationsService {

	declare readonly _serviceBrand: undefined;
	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
	) {
		return ProxyChannel.toService<ILocalizationsService>(remoteAgentService.getConnection()!.getChannel('localizations'));
	}
}

registerSingleton(ILocalizationsService, LocalizationsService, true);
