/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import { join } from 'vs/base/common/path';
import { Promises } from 'vs/base/node/pfs';
import { IBackupWorkspacesFormat } from 'vs/platform/backup/node/backup';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILogService } from 'vs/platform/log/common/log';

export class StorageDataCleaner extends Disposable {

	// Workspace/Folder storage names are MD5 hashes (128bits / 4 due to hex presentation)
	private static readonly NON_EMPTY_WORKSPACE_ID_LENGTH = 128 / 4;

	// Reserved empty window workspace storage name when in extension development
	private static readonly EXTENSION_DEV_EMPTY_WINDOW_ID = 'ext-dev';

	constructor(
		private readonly backupWorkspacesPath: string,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		const scheduler = this._register(new RunOnceScheduler(() => {
			this.cleanUpStorage();
		}, 30 * 1000 /* after 30s */));
		scheduler.schedule();
	}

	private async cleanUpStorage(): Promise<void> {
		this.logService.trace('[storage cleanup]: Starting to clean up storage folders.');

		try {

			// Leverage the backup workspace file to find out which empty workspace is currently in use to
			// determine which empty workspace storage can safely be deleted
			const contents = await Promises.readFile(this.backupWorkspacesPath, 'utf8');

			const workspaces = JSON.parse(contents) as IBackupWorkspacesFormat;
			const emptyWorkspaces = workspaces.emptyWorkspaceInfos.map(emptyWorkspace => emptyWorkspace.backupFolder);

			// Read all workspace storage folders that exist & cleanup unused
			const workspaceStorageFolders = await Promises.readdir(this.environmentService.workspaceStorageHome.fsPath);
			await Promise.all(workspaceStorageFolders.map(async workspaceStorageFolder => {
				if (
					workspaceStorageFolder.length === StorageDataCleaner.NON_EMPTY_WORKSPACE_ID_LENGTH || 	// keep non-empty workspaces
					workspaceStorageFolder === StorageDataCleaner.EXTENSION_DEV_EMPTY_WINDOW_ID ||			// keep empty extension dev workspaces
					emptyWorkspaces.indexOf(workspaceStorageFolder) >= 0									// keep empty workspaces that are in use
				) {
					return;
				}

				this.logService.trace(`[storage cleanup]: Deleting workspace storage folder ${workspaceStorageFolder}.`);

				await Promises.rm(join(this.environmentService.workspaceStorageHome.fsPath, workspaceStorageFolder));
			}));
		} catch (error) {
			onUnexpectedError(error);
		}
	}
}
