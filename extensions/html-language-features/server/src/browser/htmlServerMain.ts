/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServer, createConnection, createSimpleProjectProvider } from '@volar/language-server/node';
import { create as createCssServicePlugin } from 'volar-service-css';
import { create as createHtmlServicePlugin } from 'volar-service-html';
import { htmlLanguagePlugin } from '../modes/languagePlugin';

const connection = createConnection();
const server = createServer(connection);

connection.onInitialize(params => {
	return server.initialize(params, createSimpleProjectProvider, {
		getLanguagePlugins() {
			return [htmlLanguagePlugin];
		},
		getServicePlugins() {
			return [
				createCssServicePlugin(),
				createHtmlServicePlugin(),
			];
		},
	});
});

connection.onInitialized(server.initialized);

connection.onShutdown(server.shutdown);

connection.listen();
