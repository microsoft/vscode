/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { shell } from 'electron';
import { DiskFileSystemProvider as NodeDiskFileSystemProvider } from 'vs/workbench/services/files/node/diskFileSystemProvider';
import { FileDeleteOptions, FileSystemProviderCapabilities } from 'vs/platform/files/common/files';
import { isWindows } from 'vs/base/common/platform';
import { localize } from 'vs/nls';
import { basename } from 'vs/base/common/path';
import { ILogService } from 'vs/platform/log/common/log';

export class DiskFileSystemProvider extends NodeDiskFileSystemProvider {

	constructor(logService: ILogService) {
		super(logService);
	}

	get capabilities(): FileSystemProviderCapabilities {
		if (!this._capabilities) {
			this._capabilities = super.capabilities | FileSystemProviderCapabilities.Trash;
		}

		return this._capabilities;
	}

	protected async doDelete(filePath: string, opts: FileDeleteOptions): Promise<void> {
		if (!opts.useTrash) {
			return super.doDelete(filePath, opts);
		}

		const result = shell.moveItemToTrash(filePath);
		if (!result) {
			throw new Error(isWindows ? localize('binFailed', "Failed to move '{0}' to the recycle bin", basename(filePath)) : localize('trashFailed', "Failed to move '{0}' to the trash", basename(filePath)));
		}
	}
}