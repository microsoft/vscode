/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IWindow, IDriverService } from './driver';

export interface IDriverChannel extends IChannel {
	call(command: 'getWindows'): TPromise<IWindow[]>;
	call(command: string, arg: any): TPromise<any>;
}

export class DriverChannel implements IDriverChannel {

	constructor(private service: IDriverService) { }

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'getWindows': return this.service.getWindows();
		}

		return undefined;
	}
}

export class DriverChannelClient implements IDriverService {

	_serviceBrand: any;

	constructor(private channel: IDriverChannel) { }

	getWindows(): TPromise<IWindow[]> {
		return this.channel.call('getWindows');
	}
}
