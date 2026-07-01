/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { FileType } from '../../../platform/filesystem/common/fileTypes';
import { Uri } from '../../../vscodeTypes';

export interface IStatCache {
	stat(uri: Uri): Promise<{ type: FileType } | undefined>;
}

export class StatCache implements IStatCache {
	private readonly cache = new Map<string, Promise<{ type: FileType } | undefined>>();

	constructor(
		private readonly fileSystem: IFileSystemService,
	) { }

	stat(uri: Uri): Promise<{ type: FileType } | undefined> {
		const key = uri.toString();
		const existing = this.cache.get(key);
		if (existing) {
			return existing;
		}
		const result = this.fileSystem.stat(uri).then(s => s, () => undefined);
		this.cache.set(key, result);
		return result;
	}
}
