/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUpdateService } from 'vs/platform/update/common/update';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/mainProcessService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { UpdateChannelClient } from 'vs/platform/update/common/updateIpc';

export class NativeUpdateService extends UpdateChannelClient {

	declare readonly _serviceBrand: undefined;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		super(mainProcessService.getChannel('update'));
	}
}

registerSingleton(IUpdateService, NativeUpdateService);
