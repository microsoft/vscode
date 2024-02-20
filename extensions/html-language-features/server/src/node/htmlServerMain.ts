/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServer, createConnection } from '@volar/language-server/node';
import { htmlLanguagePlugin } from '../modes/languagePlugin';
import { serverProjectProviderFactory } from '../modes/projectProvider';
import { getLanguageServices } from '../modes/servicePlugins';

const connection = createConnection();
const server = createServer(connection);

connection.onInitialize(params => {
	return server.initialize(params, serverProjectProviderFactory, {
		getLanguagePlugins() {
			return [htmlLanguagePlugin];
		},
		getServicePlugins() {
			return getLanguageServices(server.modules.typescript!);
		},
	});
});

connection.onInitialized(server.initialized);

connection.onShutdown(server.shutdown);

connection.listen();
