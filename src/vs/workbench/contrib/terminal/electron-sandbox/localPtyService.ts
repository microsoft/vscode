/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILocalPtyService } from 'vs/platform/terminal/electron-sandbox/terminal';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/mainProcessService';
import { createChannelSender } from 'vs/base/parts/ipc/common/ipc';

// @ts-ignore: interface is implemented via proxy
export class LocalPtyService implements ILocalPtyService {

	declare readonly _serviceBrand: undefined;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		return createChannelSender<ILocalPtyService>(mainProcessService.getChannel('localPty'));
	}
}
