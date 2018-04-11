/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IWindowDriver, IElement, WindowDriverChannel, WindowDriverRegistryChannelClient } from 'vs/platform/driver/common/driver';
import { IPCClient } from 'vs/base/parts/ipc/common/ipc';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { getTopLeftOffset, getClientArea } from 'vs/base/browser/dom';
import * as electron from 'electron';

function serializeElement(element: Element, recursive: boolean): IElement {
	const attributes = Object.create(null);

	for (let j = 0; j < element.attributes.length; j++) {
		const attr = element.attributes.item(j);
		attributes[attr.name] = attr.value;
	}

	const children = [];

	if (recursive) {
		for (let i = 0; i < element.children.length; i++) {
			children.push(serializeElement(element.children.item(i), true));
		}
	}

	return {
		tagName: element.tagName,
		className: element.className,
		textContent: element.textContent || '',
		attributes,
		children
	};
}

class WindowDriver implements IWindowDriver {

	constructor() { }

	async click(selector: string, xoffset?: number, yoffset?: number): TPromise<void> {
		const element = document.querySelector(selector);

		if (!element) {
			throw new Error('Element not found');
		}

		const { left, top } = getTopLeftOffset(element as HTMLElement);
		const { width, height } = getClientArea(element as HTMLElement);
		let x: number, y: number;

		if ((typeof xoffset === 'number') || (typeof yoffset === 'number')) {
			x = left + xoffset;
			y = top + yoffset;
		} else {
			x = left + (width / 2);
			y = top + (height / 2);
		}

		x = Math.round(x);
		y = Math.round(y);

		const webContents = electron.remote.getCurrentWebContents();
		webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 } as any);
		webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 } as any);

		await TPromise.timeout(100);
	}

	doubleClick(selector: string): TPromise<void> {
		throw new Error('Method not implemented.');
	}

	move(selector: string): TPromise<void> {
		throw new Error('Method not implemented.');
	}

	async setValue(selector: string, text: string): TPromise<void> {
		const element = document.querySelector(selector);

		if (!element) {
			throw new Error('Element not found');
		}

		const inputElement = element as HTMLInputElement;
		inputElement.value = text;

		const event = new Event('input', { bubbles: true, cancelable: true });
		inputElement.dispatchEvent(event);
	}

	async getTitle(): TPromise<string> {
		return document.title;
	}

	async isActiveElement(selector: string): TPromise<boolean> {
		const element = document.querySelector(selector);
		return element === document.activeElement;
	}

	async getElements(selector: string, recursive: boolean): TPromise<IElement[]> {
		const query = document.querySelectorAll(selector);
		const result: IElement[] = [];

		for (let i = 0; i < query.length; i++) {
			const element = query.item(i);
			result.push(serializeElement(element, recursive));
		}

		return result;
	}

	async typeInEditor(selector: string, text: string): TPromise<void> {
		const element = document.querySelector(selector);

		if (!element) {
			throw new Error('Editor not found: ' + selector);
		}

		const textarea = element as HTMLTextAreaElement;
		const start = textarea.selectionStart;
		const newStart = start + text.length;
		const value = textarea.value;
		const newValue = value.substr(0, start) + text + value.substr(start);

		textarea.value = newValue;
		textarea.setSelectionRange(newStart, newStart);

		const event = new Event('input', { 'bubbles': true, 'cancelable': true });
		textarea.dispatchEvent(event);
	}

	async getTerminalBuffer(selector: string): TPromise<string[]> {
		const element = document.querySelector(selector);

		if (!element) {
			throw new Error('Terminal not found: ' + selector);
		}

		const buffer = (element as any).xterm.buffer;

		const lines: string[] = [];

		for (let i = 0; i < buffer.lines.length; i++) {
			lines.push(buffer.translateBufferLineToString(i, true));
		}

		return lines;
	}
}

export async function registerWindowDriver(
	client: IPCClient,
	windowId: number,
	instantiationService: IInstantiationService
): TPromise<IDisposable> {
	const windowDriver = instantiationService.createInstance(WindowDriver);
	const windowDriverChannel = new WindowDriverChannel(windowDriver);
	client.registerChannel('windowDriver', windowDriverChannel);

	const windowDriverRegistryChannel = client.getChannel('windowDriverRegistry');
	const windowDriverRegistry = new WindowDriverRegistryChannelClient(windowDriverRegistryChannel);

	await windowDriverRegistry.registerWindowDriver(windowId);

	return client;
}