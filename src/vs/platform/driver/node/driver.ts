/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { connect as connectNet, Client } from 'vs/base/parts/ipc/node/ipc.net';
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

	getWindowIds(): Promise<number[]>;
	capturePage(windowId: number): Promise<string>;
	reloadWindow(windowId: number): Promise<void>;
	exitApplication(): Promise<void>;
	dispatchKeybinding(windowId: number, keybinding: string): Promise<void>;
	click(windowId: number, selector: string, xoffset?: number | undefined, yoffset?: number | undefined): Promise<void>;
	doubleClick(windowId: number, selector: string): Promise<void>;
	setValue(windowId: number, selector: string, text: string): Promise<void>;
	getTitle(windowId: number): Promise<string>;
	isActiveElement(windowId: number, selector: string): Promise<boolean>;
	getElements(windowId: number, selector: string, recursive?: boolean): Promise<IElement[]>;
	typeInEditor(windowId: number, selector: string, text: string): Promise<void>;
	getTerminalBuffer(windowId: number, selector: string): Promise<string[]>;
	writeInTerminal(windowId: number, selector: string, text: string): Promise<void>;
}
//*END

export class DriverChannel implements IServerChannel {

	constructor(private driver: IDriver) { }

	listen<T>(_, event: string): Event<T> {
		throw new Error('No event found');
	}

	call(_, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'getWindowIds': return this.driver.getWindowIds();
			case 'capturePage': return this.driver.capturePage(arg);
			case 'reloadWindow': return this.driver.reloadWindow(arg);
			case 'exitApplication': return this.driver.exitApplication();
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

	getWindowIds(): Promise<number[]> {
		return this.channel.call('getWindowIds');
	}

	capturePage(windowId: number): Promise<string> {
		return this.channel.call('capturePage', windowId);
	}

	reloadWindow(windowId: number): Promise<void> {
		return this.channel.call('reloadWindow', windowId);
	}

	exitApplication(): Promise<void> {
		return this.channel.call('exitApplication');
	}

	dispatchKeybinding(windowId: number, keybinding: string): Promise<void> {
		return this.channel.call('dispatchKeybinding', [windowId, keybinding]);
	}

	click(windowId: number, selector: string, xoffset: number | undefined, yoffset: number | undefined): Promise<void> {
		return this.channel.call('click', [windowId, selector, xoffset, yoffset]);
	}

	doubleClick(windowId: number, selector: string): Promise<void> {
		return this.channel.call('doubleClick', [windowId, selector]);
	}

	setValue(windowId: number, selector: string, text: string): Promise<void> {
		return this.channel.call('setValue', [windowId, selector, text]);
	}

	getTitle(windowId: number): Promise<string> {
		return this.channel.call('getTitle', [windowId]);
	}

	isActiveElement(windowId: number, selector: string): Promise<boolean> {
		return this.channel.call('isActiveElement', [windowId, selector]);
	}

	getElements(windowId: number, selector: string, recursive: boolean): Promise<IElement[]> {
		return this.channel.call('getElements', [windowId, selector, recursive]);
	}

	typeInEditor(windowId: number, selector: string, text: string): Promise<void> {
		return this.channel.call('typeInEditor', [windowId, selector, text]);
	}

	getTerminalBuffer(windowId: number, selector: string): Promise<string[]> {
		return this.channel.call('getTerminalBuffer', [windowId, selector]);
	}

	writeInTerminal(windowId: number, selector: string, text: string): Promise<void> {
		return this.channel.call('writeInTerminal', [windowId, selector, text]);
	}
}

export interface IDriverOptions {
	verbose: boolean;
}

export interface IWindowDriverRegistry {
	registerWindowDriver(windowId: number): Promise<IDriverOptions>;
	reloadWindowDriver(windowId: number): Promise<void>;
}

export class WindowDriverRegistryChannel implements IServerChannel {

	constructor(private registry: IWindowDriverRegistry) { }

	listen<T>(_, event: string): Event<T> {
		throw new Error(`Event not found: ${event}`);
	}

	call(_, command: string, arg?: any): Promise<any> {
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

	registerWindowDriver(windowId: number): Promise<IDriverOptions> {
		return this.channel.call('registerWindowDriver', windowId);
	}

	reloadWindowDriver(windowId: number): Promise<void> {
		return this.channel.call('reloadWindowDriver', windowId);
	}
}

export interface IWindowDriver {
	click(selector: string, xoffset?: number | undefined, yoffset?: number | undefined): Promise<void>;
	doubleClick(selector: string): Promise<void>;
	setValue(selector: string, text: string): Promise<void>;
	getTitle(): Promise<string>;
	isActiveElement(selector: string): Promise<boolean>;
	getElements(selector: string, recursive: boolean): Promise<IElement[]>;
	typeInEditor(selector: string, text: string): Promise<void>;
	getTerminalBuffer(selector: string): Promise<string[]>;
	writeInTerminal(selector: string, text: string): Promise<void>;
}

export class WindowDriverChannel implements IServerChannel {

	constructor(private driver: IWindowDriver) { }

	listen<T>(_, event: string): Event<T> {
		throw new Error(`No event found: ${event}`);
	}

	call(_, command: string, arg?: any): Promise<any> {
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

	click(selector: string, xoffset?: number, yoffset?: number): Promise<void> {
		return this.channel.call('click', [selector, xoffset, yoffset]);
	}

	doubleClick(selector: string): Promise<void> {
		return this.channel.call('doubleClick', selector);
	}

	setValue(selector: string, text: string): Promise<void> {
		return this.channel.call('setValue', [selector, text]);
	}

	getTitle(): Promise<string> {
		return this.channel.call('getTitle');
	}

	isActiveElement(selector: string): Promise<boolean> {
		return this.channel.call('isActiveElement', selector);
	}

	getElements(selector: string, recursive: boolean): Promise<IElement[]> {
		return this.channel.call('getElements', [selector, recursive]);
	}

	typeInEditor(selector: string, text: string): Promise<void> {
		return this.channel.call('typeInEditor', [selector, text]);
	}

	getTerminalBuffer(selector: string): Promise<string[]> {
		return this.channel.call('getTerminalBuffer', selector);
	}

	writeInTerminal(selector: string, text: string): Promise<void> {
		return this.channel.call('writeInTerminal', [selector, text]);
	}
}

export async function connect(handle: string): Promise<{ client: Client, driver: IDriver }> {
	const client = await connectNet(handle, 'driverClient');
	const channel = client.getChannel('driver');
	const driver = new DriverChannelClient(channel);
	return { client, driver };
}
