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

class WindowDriver implements IWindowDriver {

	constructor() { }

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