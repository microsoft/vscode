/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IDriver, IWindow, DriverChannel } from 'vs/code/common/driver';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { serve } from 'vs/base/parts/ipc/node/ipc.net';

class Driver implements IDriver {

	_serviceBrand: any;

	constructor(
		@IWindowsMainService protected windowsService: IWindowsMainService
	) { }

	getWindows(): TPromise<IWindow[], any> {
		return TPromise.as(this.windowsService.getWindows().map(w => ({ id: `${w.id}` })));
	}
}

export async function startDriver(handle: string, instantiationService: IInstantiationService): TPromise<void> {
	const server = await serve(handle);
	const driver = instantiationService.createInstance(Driver);
	const channel = new DriverChannel(driver);
	server.registerChannel('driver', channel);
}