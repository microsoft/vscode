/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';

export const ID = 'driverService';
export const IDriver = createDecorator<IDriver>(ID);

//*START
export interface IWindow {
	id: string;
}

export interface IDriver {
	_serviceBrand: any;
	getWindows(): TPromise<IWindow[]>;
}
//*END

export interface IDriverChannel extends IChannel {
	call(command: 'getWindows'): TPromise<IWindow[]>;
	call(command: string, arg: any): TPromise<any>;
}

export class DriverChannel implements IDriverChannel {

	constructor(private service: IDriver) { }

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'getWindows': return this.service.getWindows();
		}

		return undefined;
	}
}

export class DriverChannelClient implements IDriver {

	_serviceBrand: any;

	constructor(private channel: IDriverChannel) { }

	getWindows(): TPromise<IWindow[]> {
		return this.channel.call('getWindows');
	}
}
