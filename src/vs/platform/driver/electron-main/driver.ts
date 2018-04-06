/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IDriver, DriverChannel, IElement, IWindowDriverChannel, WindowDriverChannelClient, IWindowDriverRegistry, WindowDriverRegistryChannel } from 'vs/platform/driver/common/driver';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { serve as serveNet } from 'vs/base/parts/ipc/node/ipc.net';
import { combinedDisposable, IDisposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IPCServer, IClientRouter } from 'vs/base/parts/ipc/common/ipc';

class WindowRouter implements IClientRouter {

	constructor(private windowId: number) { }

	route(command: string, arg: any): string {
		return `window:${this.windowId}`;
	}
}

export class Driver implements IDriver, IWindowDriverRegistry {

	_serviceBrand: any;

	private registeredWindowIds = new Set<number>();

	constructor(
		private windowServer: IPCServer,
		@IWindowsMainService private windowsService: IWindowsMainService
	) { }

	registerWindowDriver(windowId: number): TPromise<void> {
		this.registeredWindowIds.add(windowId);
		return TPromise.as(null);
	}

	async getWindowIds(): TPromise<number[]> {
		return this.windowsService.getWindows()
			.map(w => w.id)
			.filter(id => this.registeredWindowIds.has(id));
	}

	getElements(windowId: number, selector: string): TPromise<IElement[], any> {
		const router = new WindowRouter(windowId);
		const windowDriverChannel = this.windowServer.getChannel<IWindowDriverChannel>('windowDriver', router);
		const windowDriver = new WindowDriverChannelClient(windowDriverChannel);

		return windowDriver.getElements(selector);
	}
}

export async function serve(
	windowServer: IPCServer,
	handle: string,
	instantiationService: IInstantiationService
): TPromise<IDisposable> {
	const driver = instantiationService.createInstance(Driver, windowServer);

	const windowDriverRegistryChannel = new WindowDriverRegistryChannel(driver);
	windowServer.registerChannel('windowDriverRegistry', windowDriverRegistryChannel);

	const server = await serveNet(handle);
	const channel = new DriverChannel(driver);
	server.registerChannel('driver', channel);

	return combinedDisposable([server, windowServer]);
}