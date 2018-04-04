/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IDriver, IWindow, DriverChannel } from 'vs/code/common/driver';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { serve as serveNet, Server } from 'vs/base/parts/ipc/node/ipc.net';

export class Driver implements IDriver {

	_serviceBrand: any;

	constructor(
		@IWindowsMainService protected windowsService: IWindowsMainService
	) { }

	getWindows(): TPromise<IWindow[], any> {
		return TPromise.as(this.windowsService.getWindows().map(w => ({ id: `${w.id}` })));
	}
}

export async function serve(handle: string, driver: IDriver): TPromise<Server> {
	const server = await serveNet(handle);
	const channel = new DriverChannel(driver);
	server.registerChannel('driver', channel);
	return server;
}