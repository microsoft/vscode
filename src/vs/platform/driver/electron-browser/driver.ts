/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IWindowDriver, IElement, WindowDriverChannel, WindowDriverRegistryChannelClient } from 'vs/platform/driver/common/driver';
import { IPCClient } from 'vs/base/parts/ipc/common/ipc';
import { KeybindingIO } from 'vs/workbench/services/keybinding/common/keybindingIO';
import { SimpleKeybinding } from 'vs/base/common/keyCodes';
import { ScanCodeBinding } from 'vs/workbench/services/keybinding/common/scanCode';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as electron from 'electron';
import { USLayoutResolvedKeybinding } from '../../keybinding/common/usLayoutResolvedKeybinding';
import { OS } from 'vs/base/common/platform';

class WindowDriver implements IWindowDriver {

	constructor() { }

	async dispatchKeybinding(rawKeybinding: string): TPromise<void> {
		const [first, second] = KeybindingIO._readUserBinding(rawKeybinding);

		await this._dispatchKeybinding(first);

		if (second) {
			await this._dispatchKeybinding(second);
		}
	}

	private async _dispatchKeybinding(keybinding: SimpleKeybinding | ScanCodeBinding): TPromise<void> {
		if (keybinding instanceof ScanCodeBinding) {
			throw new Error('ScanCodeBindings not supported');
		}

		const webContents = electron.remote.getCurrentWebContents();
		const noModifiedKeybinding = new SimpleKeybinding(false, false, false, false, keybinding.keyCode);
		const resolvedKeybinding = new USLayoutResolvedKeybinding(noModifiedKeybinding, OS);
		const keyCode = resolvedKeybinding.getElectronAccelerator();

		const modifiers = [];

		if (keybinding.ctrlKey) {
			modifiers.push('ctrl');
		}

		if (keybinding.metaKey) {
			modifiers.push('meta');
		}

		if (keybinding.shiftKey) {
			modifiers.push('shift');
		}

		if (keybinding.altKey) {
			modifiers.push('alt');
		}

		webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers } as any);
		webContents.sendInputEvent({ type: 'char', keyCode, modifiers } as any);
		webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers } as any);

		await TPromise.timeout(100);

		// const event: IKeyboardEvent = {
		// 	ctrlKey: keybinding.ctrlKey,
		// 	altKey: keybinding.altKey,
		// 	shiftKey: keybinding.shiftKey,
		// 	metaKey: keybinding.metaKey,
		// 	keyCode: keybinding.keyCode,
		// 	code: ScanCodeUtils.toString(scanCode)
		// };

		// this.keybindingService.dispatchEvent(event, document.activeElement);

		// console.log(keybinding);

		// const e = new KeyboardEvent('keydown', event);
		// console.log('dispatching', e);
		// document.activeElement.dispatchEvent(e);
		// document.activeElement.dispatchEvent(new KeyboardEvent('keyup', event));
	}


	click(selector: string, xoffset?: number, yoffset?: number): TPromise<void> {
		throw new Error('Method not implemented.');
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

		(element as HTMLInputElement).value = text;
	}

	async getTitle(): TPromise<string> {
		return document.title;
	}

	async isActiveElement(selector: string): TPromise<boolean> {
		const element = document.querySelector(selector);
		return element === document.activeElement;
	}

	async getElements(selector: string): TPromise<IElement[]> {
		const query = document.querySelectorAll(selector);
		const result: IElement[] = [];

		for (let i = 0; i < query.length; i++) {
			const element = query.item(i);

			result.push({
				tagName: element.tagName,
				className: element.className,
				textContent: element.textContent || ''
			});
		}

		return result;
	}

	selectorExecute<P>(selector: string, script: (elements: HTMLElement[], ...args: any[]) => P, ...args: any[]): TPromise<P> {
		return TPromise.wrapError(new Error('not implemented'));
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