/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IChannel, IServerChannel } from 'vs/base/parts/ipc/node/ipc';
import { TPromise } from 'vs/base/common/winjs.base';
import { IMenubarService, IMenubarData } from 'vs/platform/menubar/common/menubar';
import { Event } from 'vs/base/common/event';

export class MenubarChannel implements IServerChannel {

	constructor(private service: IMenubarService) { }

	listen<T>(_, event: string): Event<T> {
		throw new Error(`Event not found: ${event}`);
	}

	call(_, command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'updateMenubar': return this.service.updateMenubar(arg[0], arg[1]);
		}

		throw new Error(`Call not found: ${command}`);
	}
}

export class MenubarChannelClient implements IMenubarService {

	_serviceBrand: any;

	constructor(private channel: IChannel) { }

	updateMenubar(windowId: number, menuData: IMenubarData): TPromise<void> {
		return this.channel.call('updateMenubar', [windowId, menuData]);
	}
}