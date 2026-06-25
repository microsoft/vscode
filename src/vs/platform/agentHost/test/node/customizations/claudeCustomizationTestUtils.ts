/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { FileService } from '../../../../files/common/fileService.js';
import { IFileService } from '../../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../log/common/log.js';

/** The in-memory project (workspace) root the discovery tests scan. */
export const claudeTestWorkspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });

/** The in-memory user-home root the discovery tests scan. */
export const claudeTestUserHome = URI.from({ scheme: Schemas.inMemory, path: '/home' });

/**
 * Creates a {@link FileService} backed by an in-memory provider for the
 * `inmemory` scheme, registering both with `disposables` for cleanup.
 */
export function createInMemoryFileService(disposables: DisposableStore): IFileService {
	const fileService = disposables.add(new FileService(new NullLogService()));
	disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
	return fileService;
}

/** Writes `content` to the in-memory `path` and returns its URI. */
export async function seedFile(fileService: IFileService, path: string, content = ''): Promise<URI> {
	const uri = URI.from({ scheme: Schemas.inMemory, path });
	await fileService.writeFile(uri, VSBuffer.fromString(content));
	return uri;
}
