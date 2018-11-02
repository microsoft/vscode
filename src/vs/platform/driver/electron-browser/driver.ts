/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, toDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { IWindowDriver, IElement, WindowDriverChannel, WindowDriverRegistryChannelClient } from 'vs/platform/driver/node/driver';
import { IPCClient } from 'vs/base/parts/ipc/node/ipc';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { getTopLeftOffset, getClientArea } from 'vs/base/browser/dom';
import * as electron from 'electron';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { Terminal } from 'vscode-xterm';
import { timeout } from 'vs/base/common/async';

function serializeElement(element: Element, recursive: boolean): IElement {
	const attributes = Object.create(null);

	for (let j = 0; j < element.attributes.length; j++) {
		const attr = element.attributes.item(j);
		attributes[attr.name] = attr.value;
	}

	const children: IElement[] = [];

	if (recursive) {
		for (let i = 0; i < element.children.length; i++) {
			children.push(serializeElement(element.children.item(i), true));
		}
	}

	const { left, top } = getTopLeftOffset(element as HTMLElement);

	return {
		tagName: element.tagName,
		className: element.className,
		textContent: element.textContent || '',
		attributes,
		children,
		left,
		top
	};
}

class WindowDriver implements IWindowDriver {

	constructor(
		@IWindowService private windowService: IWindowService
	) { }

	click(selector: string, xoffset?: number, yoffset?: number): TPromise<void> {
		return this._click(selector, 1, xoffset, yoffset);
	}

	doubleClick(selector: string): TPromise<void> {
		return this._click(selector, 2);
	}

	private _getElementXY(selector: string, xoffset?: number, yoffset?: number): TPromise<{ x: number; y: number; }> {
		const element = document.querySelector(selector);

		if (!element) {
			return TPromise.wrapError(new Error(`Element not found: ${selector}`));
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

		return TPromise.as({ x, y });
	}

	private _click(selector: string, clickCount: number, xoffset?: number, yoffset?: number): TPromise<void> {
		return this._getElementXY(selector, xoffset, yoffset).then(({ x, y }) => {

			const webContents: electron.WebContents = (electron as any).remote.getCurrentWebContents();
			webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount } as any);

			return TPromise.wrap(timeout(10)).then(() => {
				webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount } as any);
				return TPromise.wrap(timeout(100));
			});
		});
	}

	setValue(selector: string, text: string): TPromise<void> {
		const element = document.querySelector(selector);

		if (!element) {
			return TPromise.wrapError(new Error(`Element not found: ${selector}`));
		}

		const inputElement = element as HTMLInputElement;
		inputElement.value = text;

		const event = new Event('input', { bubbles: true, cancelable: true });
		inputElement.dispatchEvent(event);

		return TPromise.as(null);
	}

	getTitle(): TPromise<string> {
		return TPromise.as(document.title);
	}

	isActiveElement(selector: string): TPromise<boolean> {
		const element = document.querySelector(selector);

		if (element !== document.activeElement) {
			const chain: string[] = [];
			let el = document.activeElement;

			while (el) {
				const tagName = el.tagName;
				const id = el.id ? `#${el.id}` : '';
				const classes = el.className.split(/\s+/g).map(c => c.trim()).filter(c => !!c).map(c => `.${c}`).join('');
				chain.unshift(`${tagName}${id}${classes}`);

				el = el.parentElement;
			}

			return TPromise.wrapError(new Error(`Active element not found. Current active element is '${chain.join(' > ')}'. Looking for ${selector}`));
		}

		return TPromise.as(true);
	}

	getElements(selector: string, recursive: boolean): TPromise<IElement[]> {
		const query = document.querySelectorAll(selector);
		const result: IElement[] = [];

		for (let i = 0; i < query.length; i++) {
			const element = query.item(i);
			result.push(serializeElement(element, recursive));
		}

		return TPromise.as(result);
	}

	typeInEditor(selector: string, text: string): TPromise<void> {
		const element = document.querySelector(selector);

		if (!element) {
			return TPromise.wrapError(new Error(`Editor not found: ${selector}`));
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

		return TPromise.as(null);
	}

	getTerminalBuffer(selector: string): TPromise<string[]> {
		const element = document.querySelector(selector);

		if (!element) {
			return TPromise.wrapError(new Error(`Terminal not found: ${selector}`));
		}

		const xterm: Terminal = (element as any).xterm;

		if (!xterm) {
			return TPromise.wrapError(new Error(`Xterm not found: ${selector}`));
		}

		const lines: string[] = [];

		for (let i = 0; i < xterm._core.buffer.lines.length; i++) {
			lines.push(xterm._core.buffer.translateBufferLineToString(i, true));
		}

		return TPromise.as(lines);
	}

	writeInTerminal(selector: string, text: string): TPromise<void> {
		const element = document.querySelector(selector);

		if (!element) {
			return TPromise.wrapError(new Error(`Element not found: ${selector}`));
		}

		const xterm: Terminal = (element as any).xterm;

		if (!xterm) {
			return TPromise.wrapError(new Error(`Xterm not found: ${selector}`));
		}

		xterm._core.handler(text);

		return TPromise.as(null);
	}

	openDevTools(): TPromise<void> {
		return this.windowService.openDevTools({ mode: 'detach' });
	}
}

export async function registerWindowDriver(
	client: IPCClient,
	windowId: number,
	instantiationService: IInstantiationService
): Promise<IDisposable> {
	const windowDriver = instantiationService.createInstance(WindowDriver);
	const windowDriverChannel = new WindowDriverChannel(windowDriver);
	client.registerChannel('windowDriver', windowDriverChannel);

	const windowDriverRegistryChannel = client.getChannel('windowDriverRegistry');
	const windowDriverRegistry = new WindowDriverRegistryChannelClient(windowDriverRegistryChannel);

	await windowDriverRegistry.registerWindowDriver(windowId);
	// const options = await windowDriverRegistry.registerWindowDriver(windowId);

	// if (options.verbose) {
	// 	windowDriver.openDevTools();
	// }

	const disposable = toDisposable(() => windowDriverRegistry.reloadWindowDriver(windowId));
	return combinedDisposable([disposable, client]);
}
