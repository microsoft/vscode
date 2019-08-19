/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IMenubarService, IMenubarData } from 'vs/platform/menubar/node/menubar';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export class MenubarService implements IMenubarService {

	_serviceBrand!: ServiceIdentifier<any>;

	private channel: IChannel;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		this.channel = mainProcessService.getChannel('menubar');
	}

	updateMenubar(windowId: number, menuData: IMenubarData): Promise<void> {
		return this.channel.call('updateMenubar', [windowId, menuData]);
	}
}
