/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IWindowsService } from './windows';

export interface IWindowsChannel extends IChannel {
	call(command: 'openFileFolderPicker', args: [number, boolean]): TPromise<void>;
	call(command: 'openFilePicker', args: [number, boolean, string]): TPromise<void>;
	call(command: 'openFolderPicker', args: [number, boolean]): TPromise<void>;
	call(command: string, arg?: any): TPromise<any>;
}

export class WindowsChannel implements IWindowsChannel {

	constructor(private service: IWindowsService) { }

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'openFileFolderPicker': return this.service.openFileFolderPicker(arg[0], arg[1]);
			case 'openFilePicker': return this.service.openFilePicker(arg[0], arg[1], arg[2]);
			case 'openFolderPicker': return this.service.openFolderPicker(arg[0], arg[1]);
		}
	}
}

export class WindowsChannelClient implements IWindowsService {

	_serviceBrand: any;

	constructor(private channel: IWindowsChannel) { }

	openFileFolderPicker(windowId: number, forceNewWindow?: boolean): TPromise<void> {
		return this.channel.call('openFileFolderPicker', [windowId, forceNewWindow]);
	}

	openFilePicker(windowId: number, forceNewWindow?: boolean, path?: string): TPromise<void> {
		return this.channel.call('openFilePicker', [windowId, forceNewWindow, path]);
	}

	openFolderPicker(windowId: number, forceNewWindow?: boolean): TPromise<void> {
		return this.channel.call('openFolderPicker', [windowId, forceNewWindow]);
	}
}