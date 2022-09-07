/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import { join } from 'vs/base/common/path';
import { Promises } from 'vs/base/node/pfs';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILogService } from 'vs/platform/log/common/log';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { EXTENSION_DEVELOPMENT_EMPTY_WINDOW_WORKSPACE } from 'vs/platform/workspace/common/workspace';

export class UnusedWorkspaceStorageDataCleaner extends Disposable {

	// Workspace/Folder storage names are MD5 hashes (128bits / 4 due to hex presentation)
	private static readonly NON_EMPTY_WORKSPACE_ID_LENGTH = 128 / 4;

	constructor(
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@ILogService private readonly logService: ILogService,
		@INativeHostService private readonly nativeHostService: INativeHostService
	) {
		super();

		const scheduler = this._register(new RunOnceScheduler(() => {
			this.cleanUpStorage();
		}, 30 * 1000 /* after 30s */));
		scheduler.schedule();
	}

	private async cleanUpStorage(): Promise<void> {
		this.logService.trace('[storage cleanup]: Starting to clean up workspace storage folders for unused empty workspaces.');

		try {
			const workspaceStorageFolders = await Promises.readdir(this.environmentService.workspaceStorageHome.fsPath);

			await Promise.all(workspaceStorageFolders.map(async workspaceStorageFolder => {
				if (workspaceStorageFolder.length === UnusedWorkspaceStorageDataCleaner.NON_EMPTY_WORKSPACE_ID_LENGTH) {
					return; // keep workspace storage for folders/workspaces that can be accessed still
				}

				if (workspaceStorageFolder === EXTENSION_DEVELOPMENT_EMPTY_WINDOW_WORKSPACE.id) {
					return; // keep workspace storage for empty extension development workspaces
				}

				const windows = await this.nativeHostService.getWindows();
				if (windows.some(window => window.workspace?.id === workspaceStorageFolder)) {
					return; // keep workspace storage for empty workspaces opened as window
				}

				this.logService.trace(`[storage cleanup]: Deleting workspace storage folder ${workspaceStorageFolder} as it seems to be an unused empty workspace.`);

				await Promises.rm(join(this.environmentService.workspaceStorageHome.fsPath, workspaceStorageFolder));
			}));
		} catch (error) {
			onUnexpectedError(error);
		}
	}
}
