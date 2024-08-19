/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { provider as nodeFsProvider } from '@volar/language-server/lib/fileSystemProviders/node';
import { createServerBase } from '@volar/language-server/lib/server';
import { createConnection } from '@volar/language-server/node';
import { startServer } from '../htmlServer';
import { getFileSystemProvider } from '../requests';

const connection = createConnection();
const workspaceFsProvider = getFileSystemProvider(connection);
const server = createServerBase(connection);
const installedFs = new Set<string>();

server.onInitialize(() => {
	if (server.initializeParams.initializationOptions?.handledSchemas?.indexOf('file') !== -1) {
		server.fileSystem.install('file', nodeFsProvider);
		installedFs.add('file');
	}
	for (const folder of server.workspaceFolders.all) {
		if (!installedFs.has(folder.scheme)) {
			installedFs.add(folder.scheme);
			server.fileSystem.install(folder.scheme, workspaceFsProvider);
		}
	}
});

startServer(server, connection);
