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
	call(command: 'reloadWindow', arg: number): TPromise<void>;
	call(command: 'toggleDevTools', arg: number): TPromise<void>;
	call(command: 'windowOpen', arg: [string[], boolean]): TPromise<void>;
	call(command: 'closeFolder', arg: number): TPromise<void>;
	call(command: string, arg?: any): TPromise<any>;
}

export class WindowsChannel implements IWindowsChannel {

	constructor(private service: IWindowsService) { }

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'openFileFolderPicker': return this.service.openFileFolderPicker(arg[0], arg[1]);
			case 'openFilePicker': return this.service.openFilePicker(arg[0], arg[1], arg[2]);
			case 'openFolderPicker': return this.service.openFolderPicker(arg[0], arg[1]);
			case 'reloadWindow': return this.service.reloadWindow(arg);
			case 'toggleDevTools': return this.service.toggleDevTools(arg);
			case 'windowOpen': return this.service.windowOpen(arg[0], arg[1]);
			case 'closeFolder': return this.service.closeFolder(arg);
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

	reloadWindow(windowId: number): TPromise<void> {
		return this.channel.call('reloadWindow', windowId);
	}

	toggleDevTools(windowId: number): TPromise<void> {
		return this.channel.call('toggleDevTools', windowId);
	}

	windowOpen(paths: string[], forceNewWindow?: boolean): TPromise<void> {
		return this.channel.call('windowOpen', [paths, forceNewWindow]);
	}

	closeFolder(windowId: number): TPromise<void> {
		return this.channel.call('closeFolder', windowId);
	}
}