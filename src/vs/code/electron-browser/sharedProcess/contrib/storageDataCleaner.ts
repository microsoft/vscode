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

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		super();

		this.cleanUpStorageSoon();
	}

	private cleanUpStorageSoon(): void {
		let handle = setTimeout(() => {
			handle = void 0;

			// Leverage the backup workspace file to find out
			// which empty workspace is currently in use
			readFile(this.environmentService.backupWorkspacesPath, 'utf8').then(contents => {
				const workspaces = JSON.parse(contents) as IBackupWorkspacesFormat;
				const emptyWorkspaces = workspaces.emptyWorkspaceInfos.map(info => info.backupFolder);

				// Read all workspace storage folders that exist
				return readdir(this.environmentService.workspaceStorageHome).then(folders => {

					const deletes: Promise<void>[] = [];

					folders.forEach(folder => {
						if (folder.length === 32) {
							return; // folders and workspaces are stored with a MD5 ID that has a length of 32
						}

						if (emptyWorkspaces.indexOf(folder) === -1) {
							deletes.push(rimraf(join(this.environmentService.workspaceStorageHome, folder)));
						}
					});

					return Promise.all(deletes);
				});
			}).then(null, onUnexpectedError);
		}, 10 * 1000);

		this._register(toDisposable(() => clearTimeout(handle)));
	}
}
