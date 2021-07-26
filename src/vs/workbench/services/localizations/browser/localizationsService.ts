/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// NOTE@coder: This appears to fix localization as of v1.58.2
// However, upstream diverges from this behavior:
// https://github.com/microsoft/vscode/commit/3ef4aa861a38a1aac95e3f560e073fe98929ddda

import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

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
