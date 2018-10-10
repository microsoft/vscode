/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { TPromise } from 'vs/base/common/winjs.base';
import { IMenubarService, IMenubarData } from 'vs/platform/menubar/common/menubar';
import { Event } from 'vs/base/common/event';

export interface IMenubarChannel extends IChannel {
	call(command: 'updateMenubar', arg: [number, IMenubarData]): TPromise<void>;
	call(command: string, arg?: any): TPromise<any>;
}

export class MenubarChannel implements IMenubarChannel {

	constructor(private service: IMenubarService) { }

	listen<T>(event: string, arg?: any): Event<T> {
		throw new Error('No events');
	}

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'updateMenubar': return this.service.updateMenubar(arg[0], arg[1]);
		}
		return undefined;
	}
}

export class MenubarChannelClient implements IMenubarService {

	_serviceBrand: any;

	constructor(private channel: IMenubarChannel) { }

	updateMenubar(windowId: number, menuData: IMenubarData): TPromise<void> {
		return this.channel.call('updateMenubar', [windowId, menuData]);
	}
}