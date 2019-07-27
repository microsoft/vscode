/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { BaseWindowDriver } from 'vs/platform/driver/browser/baseDriver';

class BrowserWindowDriver extends BaseWindowDriver {
	click(selector: string, xoffset?: number | undefined, yoffset?: number | undefined): Promise<void> {
		throw new Error('Method not implemented.');
	}
	doubleClick(selector: string): Promise<void> {
		throw new Error('Method not implemented.');
	}
	openDevTools(): Promise<void> {
		throw new Error('Method not implemented.');
	}
}

export async function registerWindowDriver(): Promise<IDisposable> {
	console.log('registerWindowDriver');
	(<any>window).driver = new BrowserWindowDriver();
	// const windowDriverChannel = new WindowDriverChannel(windowDriver);
	// mainProcessService.registerChannel('windowDriver', windowDriverChannel);

	// const windowDriverRegistryChannel = mainProcessService.getChannel('windowDriverRegistry');
	// const windowDriverRegistry = new WindowDriverRegistryChannelClient(windowDriverRegistryChannel);

	// await windowDriverRegistry.registerWindowDriver(windowService.windowId);
	// const options = await windowDriverRegistry.registerWindowDriver(windowId);

	// if (options.verbose) {
	// 	windowDriver.openDevTools();
	// }

	// return toDisposable(() => windowDriverRegistry.reloadWindowDriver(windowService.windowId));
	return toDisposable(() => {
		return { dispose: () => { } };
	});
}
