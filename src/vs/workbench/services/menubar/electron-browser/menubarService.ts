/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMenubarService } from 'vs/platform/menubar/node/menubar';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { createChannelSender } from 'vs/base/parts/ipc/node/ipc';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class MenubarService {

	_serviceBrand: undefined;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		return createChannelSender<IMenubarService>(mainProcessService.getChannel('menubar'));
	}
}

registerSingleton(IMenubarService, MenubarService, true);
