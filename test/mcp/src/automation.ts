/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getApplication } from './application';
import { applyAllTools } from './automationTools/index.js';
import { Application } from '../../automation';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

export async function getServer(app?: Application): Promise<Server> {
	const server = new McpServer({
		name: 'VS Code Automation Server',
		version: '1.0.0',
		title: 'An MCP Server that can interact with a local build of VS Code. Used for verifying UI behavior.'
	}, { capabilities: { logging: {} } });

	const application = app ?? await getApplication();

	// Apply all VS Code automation tools using the modular structure
	applyAllTools(server, application);

	application.code.driver.browserContext.on('close', async () => {
		await server.close();
	});

	return server.server;
}
