/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServer, createConnection } from '@volar/language-server/node';
import { htmlLanguagePlugin } from '../modes/languagePlugin';
import { createHtmlProject } from '../modes/project';
import { getLanguageServicePlugins } from '../modes/servicePlugins';

const connection = createConnection();
const server = createServer(connection);

connection.onInitialize(params => {
	return server.initialize(
		params,
		getLanguageServicePlugins(),
		createHtmlProject([htmlLanguagePlugin]),
		{ pullModelDiagnostics: !!params.capabilities.textDocument?.diagnostic }
	);
});

connection.onInitialized(server.initialized);

connection.onShutdown(server.shutdown);

connection.listen();
