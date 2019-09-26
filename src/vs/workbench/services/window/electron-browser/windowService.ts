/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { IRecentlyOpened, IRecent } from 'vs/platform/history/common/history';
import { URI } from 'vs/base/common/uri';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class WindowService extends Disposable implements IWindowService {

	_serviceBrand: undefined;

	constructor(
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IWindowsService private readonly windowsService: IWindowsService
	) {
		super();
	}

	getRecentlyOpened(): Promise<IRecentlyOpened> {
		return this.windowsService.getRecentlyOpened(this.environmentService.configuration.windowId);
	}

	addRecentlyOpened(recents: IRecent[]): Promise<void> {
		return this.windowsService.addRecentlyOpened(recents);
	}

	removeFromRecentlyOpened(paths: URI[]): Promise<void> {
		return this.windowsService.removeFromRecentlyOpened(paths);
	}
}

registerSingleton(IWindowService, WindowService);
