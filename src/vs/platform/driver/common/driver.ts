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
export interface IElement {
	tagName: string;
	className: string;
	textContent: string;
}

export interface IDriver {
	_serviceBrand: any;
	getWindowIds(): TPromise<number[]>;
	getElements(windowId: number, selector: string): TPromise<IElement[]>;
	dispatchKeybinding(windowId: number, keybinding: string): TPromise<void>;
}
//*END

export interface IDriverChannel extends IChannel {
	call(command: 'getWindowIds'): TPromise<number[]>;
	call(command: 'getElements', arg: [number, string]): TPromise<IElement[]>;
	call(command: 'dispatchKeybinding', arg: [number, string]): TPromise<void>;
	call(command: string, arg: any): TPromise<any>;
}

export class DriverChannel implements IDriverChannel {

	constructor(private driver: IDriver) { }

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'getWindowIds': return this.driver.getWindowIds();
			case 'getElements': return this.driver.getElements(arg[0], arg[1]);
			case 'dispatchKeybinding': return this.driver.dispatchKeybinding(arg[0], arg[1]);
		}

		return undefined;
	}
}

export class DriverChannelClient implements IDriver {

	_serviceBrand: any;

	constructor(private channel: IDriverChannel) { }

	getWindowIds(): TPromise<number[]> {
		return this.channel.call('getWindowIds');
	}

	getElements(windowId: number, selector: string): TPromise<IElement[]> {
		return this.channel.call('getElements', [windowId, selector]);
	}

	dispatchKeybinding(windowId: number, keybinding: string): TPromise<void> {
		return this.channel.call('dispatchKeybinding', [windowId, keybinding]);
	}
}

export interface IWindowDriverRegistry {
	registerWindowDriver(windowId: number): TPromise<void>;
}

export interface IWindowDriverRegistryChannel extends IChannel {
	call(command: 'registerWindowDriver', arg: number): TPromise<void>;
	call(command: string, arg: any): TPromise<any>;
}

export class WindowDriverRegistryChannel implements IWindowDriverRegistryChannel {

	constructor(private registry: IWindowDriverRegistry) { }

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'registerWindowDriver': return this.registry.registerWindowDriver(arg);
		}

		return undefined;
	}
}

export class WindowDriverRegistryChannelClient implements IWindowDriverRegistry {

	_serviceBrand: any;

	constructor(private channel: IWindowDriverRegistryChannel) { }

	registerWindowDriver(windowId: number): TPromise<void> {
		return this.channel.call('registerWindowDriver', windowId);
	}
}

export interface IWindowDriver {
	getElements(selector: string): TPromise<IElement[]>;
	dispatchKeybinding(keybinding: string): TPromise<void>;
}

export interface IWindowDriverChannel extends IChannel {
	call(command: 'getElements', arg: string): TPromise<IElement[]>;
	call(command: 'dispatchKeybinding', arg: string): TPromise<void>;
	call(command: string, arg: any): TPromise<any>;
}

export class WindowDriverChannel implements IWindowDriverChannel {

	constructor(private driver: IWindowDriver) { }

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'getElements': return this.driver.getElements(arg);
			case 'dispatchKeybinding': return this.driver.dispatchKeybinding(arg);
		}

		return undefined;
	}
}

export class WindowDriverChannelClient implements IWindowDriver {

	_serviceBrand: any;

	constructor(private channel: IWindowDriverChannel) { }

	getElements(selector: string): TPromise<IElement[]> {
		return this.channel.call('getElements', selector);
	}

	dispatchKeybinding(keybinding: string): TPromise<void> {
		return this.channel.call('dispatchKeybinding', keybinding);
	}
}