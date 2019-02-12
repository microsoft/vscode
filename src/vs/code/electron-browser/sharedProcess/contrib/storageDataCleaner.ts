/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { join } from 'path';
import { readdir, readFile, rimraf } from 'vs/base/node/pfs';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IBackupWorkspacesFormat } from 'vs/platform/backup/common/backup';

export class StorageDataCleaner extends Disposable {

	// Workspace/Folder storage names are MD5 hashes (128bits / 4 due to hex presentation)
	private static NON_EMPTY_WORKSPACE_ID_LENGTH = 128 / 4;

	constructor(
		@IEnvironmentService private readonly environmentService: IEnvironmentService
	) {
		super();

		this.cleanUpStorageSoon();
	}

	private cleanUpStorageSoon(): void {
		let handle: any = setTimeout(() => {
			handle = undefined;

			// Leverage the backup workspace file to find out which empty workspace is currently in use to
			// determine which empty workspace storage can safely be deleted
			readFile(this.environmentService.backupWorkspacesPath, 'utf8').then(contents => {
				const workspaces = JSON.parse(contents) as IBackupWorkspacesFormat;
				const emptyWorkspaces = workspaces.emptyWorkspaceInfos.map(info => info.backupFolder);

				// Read all workspace storage folders that exist
				return readdir(this.environmentService.workspaceStorageHome).then(storageFolders => {
					const deletes: Promise<void>[] = [];

					storageFolders.forEach(storageFolder => {
						if (storageFolder.length === StorageDataCleaner.NON_EMPTY_WORKSPACE_ID_LENGTH) {
							return;
						}

						if (emptyWorkspaces.indexOf(storageFolder) === -1) {
							deletes.push(rimraf(join(this.environmentService.workspaceStorageHome, storageFolder)));
						}
					});

					return Promise.all(deletes);
				});
			}).then(null, onUnexpectedError);
		}, 30 * 1000);

		this._register(toDisposable(() => clearTimeout(handle)));
	}
}
