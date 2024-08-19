/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createConnection, createServer } from '@volar/language-server/browser';
import { startServer } from '../htmlServer';
import { getFileSystemProvider } from '../requests';

const connection = createConnection();
const server = createServer(connection);
const installedFs = new Set<string>();

server.onInitialize(() => {
	for (const folder of server.workspaceFolders.all) {
		if (!installedFs.has(folder.scheme)) {
			installedFs.add(folder.scheme);
			server.fileSystem.install(folder.scheme, getFileSystemProvider(connection));
		}
	}
});

startServer(server, connection);
