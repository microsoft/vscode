/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { connect as connectNet, Client } from 'vs/base/parts/ipc/node/ipc.net';
import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IChannel, IServerChannel } from 'vs/base/parts/ipc/node/ipc';
import { Event } from 'vs/base/common/event';

export const ID = 'driverService';
export const IDriver = createDecorator<IDriver>(ID);

// !! Do not remove the following START and END markers, they are parsed by the smoketest build

//*START
export interface IElement {
	tagName: string;
	className: string;
	textContent: string;
	attributes: { [name: string]: string; };
	children: IElement[];
	top: number;
	left: number;
}

export interface IDriver {
	_serviceBrand: any;

	getWindowIds(): TPromise<number[]>;
	capturePage(windowId: number): TPromise<string>;
	reloadWindow(windowId: number): TPromise<void>;
	dispatchKeybinding(windowId: number, keybinding: string): TPromise<void>;
	click(windowId: number, selector: string, xoffset?: number | undefined, yoffset?: number | undefined): TPromise<void>;
	doubleClick(windowId: number, selector: string): TPromise<void>;
	setValue(windowId: number, selector: string, text: string): TPromise<void>;
	getTitle(windowId: number): TPromise<string>;
	isActiveElement(windowId: number, selector: string): TPromise<boolean>;
	getElements(windowId: number, selector: string, recursive?: boolean): TPromise<IElement[]>;
	typeInEditor(windowId: number, selector: string, text: string): TPromise<void>;
	getTerminalBuffer(windowId: number, selector: string): TPromise<string[]>;
	writeInTerminal(windowId: number, selector: string, text: string): TPromise<void>;
}
//*END

export class DriverChannel implements IServerChannel {

	constructor(private driver: IDriver) { }

	listen<T>(_, event: string): Event<T> {
		throw new Error('No event found');
	}

	call(_, command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'getWindowIds': return this.driver.getWindowIds();
			case 'capturePage': return this.driver.capturePage(arg);
			case 'reloadWindow': return this.driver.reloadWindow(arg);
			case 'dispatchKeybinding': return this.driver.dispatchKeybinding(arg[0], arg[1]);
			case 'click': return this.driver.click(arg[0], arg[1], arg[2], arg[3]);
			case 'doubleClick': return this.driver.doubleClick(arg[0], arg[1]);
			case 'setValue': return this.driver.setValue(arg[0], arg[1], arg[2]);
			case 'getTitle': return this.driver.getTitle(arg[0]);
			case 'isActiveElement': return this.driver.isActiveElement(arg[0], arg[1]);
			case 'getElements': return this.driver.getElements(arg[0], arg[1], arg[2]);
			case 'typeInEditor': return this.driver.typeInEditor(arg[0], arg[1], arg[2]);
			case 'getTerminalBuffer': return this.driver.getTerminalBuffer(arg[0], arg[1]);
			case 'writeInTerminal': return this.driver.writeInTerminal(arg[0], arg[1], arg[2]);
		}

		throw new Error(`Call not found: ${command}`);
	}
}

export class DriverChannelClient implements IDriver {

	_serviceBrand: any;

	constructor(private channel: IChannel) { }

	getWindowIds(): TPromise<number[]> {
		return TPromise.wrap(this.channel.call('getWindowIds'));
	}

	capturePage(windowId: number): TPromise<string> {
		return TPromise.wrap(this.channel.call('capturePage', windowId));
	}

	reloadWindow(windowId: number): TPromise<void> {
		return TPromise.wrap(this.channel.call('reloadWindow', windowId));
	}

	dispatchKeybinding(windowId: number, keybinding: string): TPromise<void> {
		return TPromise.wrap(this.channel.call('dispatchKeybinding', [windowId, keybinding]));
	}

	click(windowId: number, selector: string, xoffset: number | undefined, yoffset: number | undefined): TPromise<void> {
		return TPromise.wrap(this.channel.call('click', [windowId, selector, xoffset, yoffset]));
	}

	doubleClick(windowId: number, selector: string): TPromise<void> {
		return TPromise.wrap(this.channel.call('doubleClick', [windowId, selector]));
	}

	setValue(windowId: number, selector: string, text: string): TPromise<void> {
		return TPromise.wrap(this.channel.call('setValue', [windowId, selector, text]));
	}

	getTitle(windowId: number): TPromise<string> {
		return TPromise.wrap(this.channel.call('getTitle', [windowId]));
	}

	isActiveElement(windowId: number, selector: string): TPromise<boolean> {
		return TPromise.wrap(this.channel.call('isActiveElement', [windowId, selector]));
	}

	getElements(windowId: number, selector: string, recursive: boolean): TPromise<IElement[]> {
		return TPromise.wrap(this.channel.call('getElements', [windowId, selector, recursive]));
	}

	typeInEditor(windowId: number, selector: string, text: string): TPromise<void> {
		return TPromise.wrap(this.channel.call('typeInEditor', [windowId, selector, text]));
	}

	getTerminalBuffer(windowId: number, selector: string): TPromise<string[]> {
		return TPromise.wrap(this.channel.call('getTerminalBuffer', [windowId, selector]));
	}

	writeInTerminal(windowId: number, selector: string, text: string): TPromise<void> {
		return TPromise.wrap(this.channel.call('writeInTerminal', [windowId, selector, text]));
	}
}

export interface IDriverOptions {
	verbose: boolean;
}

export interface IWindowDriverRegistry {
	registerWindowDriver(windowId: number): TPromise<IDriverOptions>;
	reloadWindowDriver(windowId: number): TPromise<void>;
}

export class WindowDriverRegistryChannel implements IServerChannel {

	constructor(private registry: IWindowDriverRegistry) { }

	listen<T>(_, event: string): Event<T> {
		throw new Error(`Event not found: ${event}`);
	}

	call(_, command: string, arg?: any): Thenable<any> {
		switch (command) {
			case 'registerWindowDriver': return this.registry.registerWindowDriver(arg);
			case 'reloadWindowDriver': return this.registry.reloadWindowDriver(arg);
		}

		throw new Error(`Call not found: ${command}`);
	}
}

export class WindowDriverRegistryChannelClient implements IWindowDriverRegistry {

	_serviceBrand: any;

	constructor(private channel: IChannel) { }

	registerWindowDriver(windowId: number): TPromise<IDriverOptions> {
		return TPromise.wrap(this.channel.call('registerWindowDriver', windowId));
	}

	reloadWindowDriver(windowId: number): TPromise<void> {
		return TPromise.wrap(this.channel.call('reloadWindowDriver', windowId));
	}
}

export interface IWindowDriver {
	click(selector: string, xoffset?: number | undefined, yoffset?: number | undefined): TPromise<void>;
	doubleClick(selector: string): TPromise<void>;
	setValue(selector: string, text: string): TPromise<void>;
	getTitle(): TPromise<string>;
	isActiveElement(selector: string): TPromise<boolean>;
	getElements(selector: string, recursive: boolean): TPromise<IElement[]>;
	typeInEditor(selector: string, text: string): TPromise<void>;
	getTerminalBuffer(selector: string): TPromise<string[]>;
	writeInTerminal(selector: string, text: string): TPromise<void>;
}

export class WindowDriverChannel implements IServerChannel {

	constructor(private driver: IWindowDriver) { }

	listen<T>(_, event: string): Event<T> {
		throw new Error(`No event found: ${event}`);
	}

	call(_, command: string, arg?: any): Thenable<any> {
		switch (command) {
			case 'click': return this.driver.click(arg[0], arg[1], arg[2]);
			case 'doubleClick': return this.driver.doubleClick(arg);
			case 'setValue': return this.driver.setValue(arg[0], arg[1]);
			case 'getTitle': return this.driver.getTitle();
			case 'isActiveElement': return this.driver.isActiveElement(arg);
			case 'getElements': return this.driver.getElements(arg[0], arg[1]);
			case 'typeInEditor': return this.driver.typeInEditor(arg[0], arg[1]);
			case 'getTerminalBuffer': return this.driver.getTerminalBuffer(arg);
			case 'writeInTerminal': return this.driver.writeInTerminal(arg[0], arg[1]);
		}

		throw new Error(`Call not found: ${command}`);
	}
}

export class WindowDriverChannelClient implements IWindowDriver {

	_serviceBrand: any;

	constructor(private channel: IChannel) { }

	click(selector: string, xoffset?: number, yoffset?: number): TPromise<void> {
		return TPromise.wrap(this.channel.call('click', [selector, xoffset, yoffset]));
	}

	doubleClick(selector: string): TPromise<void> {
		return TPromise.wrap(this.channel.call('doubleClick', selector));
	}

	setValue(selector: string, text: string): TPromise<void> {
		return TPromise.wrap(this.channel.call('setValue', [selector, text]));
	}

	getTitle(): TPromise<string> {
		return TPromise.wrap(this.channel.call('getTitle'));
	}

	isActiveElement(selector: string): TPromise<boolean> {
		return TPromise.wrap(this.channel.call('isActiveElement', selector));
	}

	getElements(selector: string, recursive: boolean): TPromise<IElement[]> {
		return TPromise.wrap(this.channel.call('getElements', [selector, recursive]));
	}

	typeInEditor(selector: string, text: string): TPromise<void> {
		return TPromise.wrap(this.channel.call('typeInEditor', [selector, text]));
	}

	getTerminalBuffer(selector: string): TPromise<string[]> {
		return TPromise.wrap(this.channel.call('getTerminalBuffer', selector));
	}

	writeInTerminal(selector: string, text: string): TPromise<void> {
		return TPromise.wrap(this.channel.call('writeInTerminal', [selector, text]));
	}
}

export async function connect(handle: string): Promise<{ client: Client, driver: IDriver }> {
	const client = await connectNet(handle, 'driverClient');
	const channel = client.getChannel('driver');
	const driver = new DriverChannelClient(channel);
	return { client, driver };
}
