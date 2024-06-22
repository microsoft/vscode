/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createConnection, fs } from '@volar/language-server/node';
import { createServerBase } from '@volar/language-server/lib/server';
import { startServer } from '../htmlServer';

const connection = createConnection();
const server = createServerBase(connection, {
	readFile(uri, encoding) {
		if (uri.scheme === 'file' && !handledFileSchema()) {
			return;
		}
		return fs.readFile(uri, encoding);
	},
	readDirectory(uri) {
		if (uri.scheme === 'file' && !handledFileSchema()) {
			return [];
		}
		return fs.readDirectory(uri);
	},
	stat(uri) {
		if (uri.scheme === 'file' && !handledFileSchema()) {
			return;
		}
		return fs.stat(uri);
	},
});

startServer(server, connection);

function handledFileSchema() {
	return server.initializeParams.initializationOptions?.handledSchemas?.indexOf('file') !== -1;
}
