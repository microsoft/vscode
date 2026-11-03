/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import type { URI } from '../../../../base/common/uri.js';
import { FileService } from '../../../files/common/fileService.js';
import type { IFileService } from '../../../files/common/files.js';
import { DiskFileSystemProvider } from '../../../files/node/diskFileSystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostFileEditCoordinator } from '../../node/agentHostFileEditCoordinator.js';
import type { ISessionDatabase } from '../../common/sessionDataService.js';
import { isFileEditPath } from '../../node/fileEditIdentity.js';
import { getWorkingSetFileNonce } from '../../node/sessionDiffAggregator.js';

/** Provides native host identity for non-I/O tests, or the supplied test filesystem's declared identity. */
export function createTestFileEditCoordinator(disposables: Pick<DisposableStore, 'add'>, fileService?: IFileService): AgentHostFileEditCoordinator {
	if (!fileService) {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(new NullLogService()))));
	}
	return disposables.add(new AgentHostFileEditCoordinator(fileService));
}

export async function getTestWorkingSetNonce(db: ISessionDatabase, resource: URI): Promise<string> {
	return getWorkingSetFileNonce((await db.getAllFileEdits()).filter(record => isFileEditPath(record.filePath, resource, db.fileEditUriIdentity)));
}
