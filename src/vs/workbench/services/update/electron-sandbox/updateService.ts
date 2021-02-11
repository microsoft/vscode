/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUpdateService } from 'vs/platform/update/common/update';
import { IMainProcessService } from 'vs/platform/ipc/common/services';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { UpdateChannelClient } from 'vs/platform/update/common/updateIpc';

// @ts-ignore: interface is implemented via channel client
export class NativeUpdateService implements IUpdateService {

	declare readonly _serviceBrand: undefined;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		return new UpdateChannelClient(mainProcessService.getChannel('update'));
	}
}

registerSingleton(IUpdateService, NativeUpdateService);
