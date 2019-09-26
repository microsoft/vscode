/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { IRecentlyOpened, IRecent } from 'vs/platform/history/common/history';
import { URI } from 'vs/base/common/uri';
import { Disposable } from 'vs/base/common/lifecycle';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IElectronEnvironmentService } from 'vs/workbench/services/electron/electron-browser/electronEnvironmentService';

export class WindowService extends Disposable implements IWindowService {

	_serviceBrand: undefined;

	constructor(
		@IElectronEnvironmentService private readonly electronEnvironmentService: IElectronEnvironmentService,
		@IWindowsService private readonly windowsService: IWindowsService
	) {
		super();
	}

	getRecentlyOpened(): Promise<IRecentlyOpened> {
		return this.windowsService.getRecentlyOpened(this.electronEnvironmentService.windowId);
	}

	addRecentlyOpened(recents: IRecent[]): Promise<void> {
		return this.windowsService.addRecentlyOpened(recents);
	}

	removeFromRecentlyOpened(paths: URI[]): Promise<void> {
		return this.windowsService.removeFromRecentlyOpened(paths);
	}
}

registerSingleton(IWindowService, WindowService);
