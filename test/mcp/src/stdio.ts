/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getServer } from './multiplex';

const transport: StdioServerTransport = new StdioServerTransport();
(async () => {
	const server = await getServer();
	await server.connect(transport);
})().catch(err => {
	transport.close();
	console.error('Error occurred while connecting to server:', err);
	process.exit(1);
});
