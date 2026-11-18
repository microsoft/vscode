/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { NullLogService } from '../../../log/common/log.js';
import { FileSystemProviderCapabilities } from '../../common/files.js';
import { FileService } from '../../common/fileService.js';
import { InMemoryFileSystemProvider } from '../../common/inMemoryFilesystemProvider.js';

export class AtomicRenameFileSystemProvider extends InMemoryFileSystemProvider {
	override get capabilities(): FileSystemProviderCapabilities {
		return super.capabilities | FileSystemProviderCapabilities.FileAtomicRename;
	}

	async renameFileAtomic(from: URI, to: URI, options: { overwrite: boolean }): Promise<void> {
		return super.rename(from, to, options);
	}
}

/** Creates an isolated in-memory filesystem and registers its resources with `disposables`. */
export function createInMemoryFileService(disposables: Pick<DisposableStore, 'add'>, scheme: string = Schemas.inMemory): FileService {
	const fileService = disposables.add(new FileService(new NullLogService()));
	disposables.add(fileService.registerProvider(scheme, disposables.add(new InMemoryFileSystemProvider())));
	return fileService;
}
