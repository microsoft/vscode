/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILocalPtyService } from 'vs/platform/terminal/electron-sandbox/terminal';
import { TerminalIpcChannels } from 'vs/platform/terminal/common/terminal';
import { ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/sharedProcessService';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';

// @ts-ignore: interface is implemented via proxy
export class LocalPtyServiceProxy implements ILocalPtyService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService
	) {
		return ProxyChannel.toService<LocalPtyServiceProxy & ILocalPtyService>(sharedProcessService.getChannel(TerminalIpcChannels.LocalPty));
	}
}
