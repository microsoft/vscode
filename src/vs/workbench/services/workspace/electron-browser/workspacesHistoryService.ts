/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IRecent, IRecentlyOpened } from 'vs/platform/history/common/history';
import { IWorkspacesHistoryService } from 'vs/workbench/services/workspace/common/workspacesHistoryService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IElectronService } from 'vs/platform/electron/node/electron';

export class NativeWorkspacesHistoryService implements IWorkspacesHistoryService {

	_serviceBrand: undefined;

	readonly onRecentlyOpenedChange = this.electronService.onRecentlyOpenedChange;

	constructor(
		@IElectronService private readonly electronService: IElectronService
	) { }

	async getRecentlyOpened(): Promise<IRecentlyOpened> {
		return this.electronService.getRecentlyOpened();
	}

	async addRecentlyOpened(recents: IRecent[]): Promise<void> {
		return this.electronService.addRecentlyOpened(recents);
	}

	async removeFromRecentlyOpened(paths: URI[]): Promise<void> {
		return this.electronService.removeFromRecentlyOpened(paths);
	}

	async clearRecentlyOpened(): Promise<void> {
		return this.electronService.clearRecentlyOpened();
	}
}

registerSingleton(IWorkspacesHistoryService, NativeWorkspacesHistoryService, true);
