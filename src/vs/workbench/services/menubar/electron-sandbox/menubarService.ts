/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMenubarService } from 'vs/platform/menubar/electron-sandbox/menubar';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

// @ts-ignore: interface is implemented via proxy
export class MenubarService implements IMenubarService {

	declare readonly _serviceBrand: undefined;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		return ProxyChannel.toService<IMenubarService>(mainProcessService.getChannel('menubar'));
	}
}

registerSingleton(IMenubarService, MenubarService, true);
