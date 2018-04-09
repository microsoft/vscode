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
	dispatchKeybinding(windowId: number, keybinding: string): TPromise<void>;
	click(windowId: number, selector: string, xoffset?: number | undefined, yoffset?: number | undefined): TPromise<void>;
	doubleClick(windowId: number, selector: string): TPromise<void>;
	move(windowId: number, selector: string): TPromise<void>;
	setValue(windowId: number, selector: string, text: string): TPromise<void>;
	getTitle(windowId: number): TPromise<void>;
	isActiveElement(windowId: number, selector: string): TPromise<void>;
	getElements(windowId: number, selector: string): TPromise<IElement[]>;
	selectorExecute<P>(windowId: number, selector: string, script: (elements: HTMLElement[], ...args: any[]) => P, ...args: any[]): TPromise<P>;
}
//*END

export interface IDriverChannel extends IChannel {
	call(command: 'getWindowIds'): TPromise<number[]>;
	call(command: 'dispatchKeybinding', arg: [number, string]): TPromise<void>;
	call(command: 'click', arg: [number, string, number | undefined, number | undefined]): TPromise<void>;
	call(command: 'doubleClick', arg: [number, string]): TPromise<void>;
	call(command: 'move', arg: [number, string]): TPromise<void>;
	call(command: 'setValue', arg: [number, string, string]): TPromise<void>;
	call(command: 'getTitle', arg: [number]): TPromise<void>;
	call(command: 'isActiveElement', arg: [number, string]): TPromise<void>;
	call(command: 'getElements', arg: [number, string]): TPromise<IElement[]>;
	call(command: 'selectorExecute', arg: [number, string, string, any[]]): TPromise<any>;
	call(command: string, arg: any): TPromise<any>;
}

export class DriverChannel implements IDriverChannel {

	constructor(private driver: IDriver) { }

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'getWindowIds': return this.driver.getWindowIds();
			case 'dispatchKeybinding': return this.driver.dispatchKeybinding(arg[0], arg[1]);
			case 'click': return this.driver.click(arg[0], arg[1], arg[2], arg[3]);
			case 'doubleClick': return this.driver.doubleClick(arg[0], arg[1]);
			case 'move': return this.driver.move(arg[0], arg[1]);
			case 'setValue': return this.driver.setValue(arg[0], arg[1], arg[2]);
			case 'getTitle': return this.driver.getTitle(arg[0]);
			case 'isActiveElement': return this.driver.isActiveElement(arg[0], arg[1]);
			case 'getElements': return this.driver.getElements(arg[0], arg[1]);
			case 'selectorExecute': return this.driver.selectorExecute(arg[0], arg[1], new Function(arg[2]), ...arg[2]);
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

	dispatchKeybinding(windowId: number, keybinding: string): TPromise<void> {
		return this.channel.call('dispatchKeybinding', [windowId, keybinding]);
	}

	click(windowId: number, selector: string, xoffset: number | undefined, yoffset: number | undefined): TPromise<void> {
		return this.channel.call('click', [windowId, selector, xoffset, yoffset]);
	}

	doubleClick(windowId: number, selector: string): TPromise<void> {
		return this.channel.call('doubleClick', [windowId, selector]);
	}

	move(windowId: number, selector: string): TPromise<void> {
		return this.channel.call('move', [windowId, selector]);
	}

	setValue(windowId: number, selector: string, text: string): TPromise<void> {
		return this.channel.call('setValue', [windowId, selector, text]);
	}

	getTitle(windowId: number): TPromise<void> {
		return this.channel.call('getTitle', [windowId]);
	}

	isActiveElement(windowId: number, selector: string): TPromise<void> {
		return this.channel.call('isActiveElement', [windowId, selector]);
	}

	getElements(windowId: number, selector: string): TPromise<IElement[]> {
		return this.channel.call('getElements', [windowId, selector]);
	}

	selectorExecute<P>(windowId: number, selector: string, script: (elements: HTMLElement[], ...args: any[]) => P, ...args: any[]): TPromise<P> {
		return this.channel.call('selectorExecute', [windowId, selector, script.toString(), args]);
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
	dispatchKeybinding(keybinding: string): TPromise<void>;
	click(selector: string, xoffset?: number | undefined, yoffset?: number | undefined): TPromise<void>;
	doubleClick(selector: string): TPromise<void>;
	move(selector: string): TPromise<void>;
	setValue(selector: string, text: string): TPromise<void>;
	getTitle(): TPromise<void>;
	isActiveElement(selector: string): TPromise<void>;
	getElements(selector: string): TPromise<IElement[]>;
	selectorExecute<P>(selector: string, script: (elements: HTMLElement[], ...args: any[]) => P, ...args: any[]): TPromise<P>;
}

export interface IWindowDriverChannel extends IChannel {
	call(command: 'dispatchKeybinding', arg: string): TPromise<void>;
	call(command: 'click', arg: [string, number | undefined, number | undefined]): TPromise<void>;
	call(command: 'doubleClick', arg: string): TPromise<void>;
	call(command: 'move', arg: string): TPromise<void>;
	call(command: 'setValue', arg: [string, string]): TPromise<void>;
	call(command: 'getTitle'): TPromise<void>;
	call(command: 'isActiveElement', arg: string): TPromise<void>;
	call(command: 'getElements', arg: string): TPromise<IElement[]>;
	call(command: 'selectorExecute', arg: [string, string, any[]]): TPromise<any>;
	call(command: string, arg: any): TPromise<any>;
}

export class WindowDriverChannel implements IWindowDriverChannel {

	constructor(private driver: IWindowDriver) { }

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'dispatchKeybinding': return this.driver.dispatchKeybinding(arg);
			case 'click': return this.driver.click(arg[0], arg[1], arg[2]);
			case 'doubleClick': return this.driver.doubleClick(arg);
			case 'move': return this.driver.move(arg);
			case 'setValue': return this.driver.setValue(arg[0], arg[1]);
			case 'getTitle': return this.driver.getTitle();
			case 'isActiveElement': return this.driver.isActiveElement(arg);
			case 'getElements': return this.driver.getElements(arg);
			case 'selectorExecute': return this.driver.selectorExecute(arg[0], arg[1], arg[2], ...arg[2]);
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