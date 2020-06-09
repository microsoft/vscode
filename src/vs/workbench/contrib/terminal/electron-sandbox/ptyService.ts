/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createChannelSender } from 'vs/base/parts/ipc/common/ipc';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/mainProcessService';
import { IPtyService } from 'vs/workbench/contrib/terminal/electron-sandbox/terminal';

export class PtyService {

	declare readonly _serviceBrand: undefined;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		return createChannelSender<IPtyService>(mainProcessService.getChannel('pty'));
	}
}

registerSingleton(IPtyService, PtyService, true);
