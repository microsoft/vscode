/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { WindowDriverChannel, WindowDriverRegistryChannelClient } from 'vs/platform/driver/node/driver';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import * as electron from 'electron';
import { timeout } from 'vs/base/common/async';
import { BaseWindowDriver } from 'vs/platform/driver/browser/baseDriver';
import { IElectronService } from 'vs/platform/electron/node/electron';

class WindowDriver extends BaseWindowDriver {

	constructor(
		@IElectronService private readonly electronService: IElectronService
	) {
		super();
	}

	click(selector: string, xoffset?: number, yoffset?: number): Promise<void> {
		const offset = typeof xoffset === 'number' && typeof yoffset === 'number' ? { x: xoffset, y: yoffset } : undefined;
		return this._click(selector, 1, offset);
	}

	doubleClick(selector: string): Promise<void> {
		return this._click(selector, 2);
	}

	private async _click(selector: string, clickCount: number, offset?: { x: number, y: number }): Promise<void> {
		const { x, y } = await this._getElementXY(selector, offset);

		const webContents: electron.WebContents = (electron as any).remote.getCurrentWebContents();
		webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount } as any);
		await timeout(10);

		webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount } as any);
		await timeout(100);
	}

	async openDevTools(): Promise<void> {
		await this.electronService.openDevTools({ mode: 'detach' });
	}
}

export async function registerWindowDriver(accessor: ServicesAccessor, windowId: number): Promise<IDisposable> {
	const instantiationService = accessor.get(IInstantiationService);
	const mainProcessService = accessor.get(IMainProcessService);

	const windowDriver = instantiationService.createInstance(WindowDriver);
	const windowDriverChannel = new WindowDriverChannel(windowDriver);
	mainProcessService.registerChannel('windowDriver', windowDriverChannel);

	const windowDriverRegistryChannel = mainProcessService.getChannel('windowDriverRegistry');
	const windowDriverRegistry = new WindowDriverRegistryChannelClient(windowDriverRegistryChannel);

	await windowDriverRegistry.registerWindowDriver(windowId);
	// const options = await windowDriverRegistry.registerWindowDriver(windowId);

	// if (options.verbose) {
	// 	windowDriver.openDevTools();
	// }

	return toDisposable(() => windowDriverRegistry.reloadWindowDriver(windowId));
}
