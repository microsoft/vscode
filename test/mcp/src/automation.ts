/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApplicationService } from './application';
import { applyAllTools } from './automationTools/index.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';

export async function getServer(appService: ApplicationService): Promise<Server> {
	const server = new McpServer({
		name: 'VS Code Automation Server',
		version: '1.0.0',
		title: 'An MCP Server that can interact with a local build of VS Code. Used for verifying UI behavior.'
	}, { capabilities: { logging: {} } });

	server.tool(
		'vscode_automation_start',
		'Start VS Code Build',
		{
			recordVideo: z.boolean().optional()
		},
		async ({ recordVideo }) => {
			const app = await appService.getOrCreateApplication({ recordVideo });
			await app.startTracing();
			return {
				content: [{
					type: 'text' as const,
					text: app ? `VS Code started successfully` : `Failed to start VS Code`
				}]
			};
		}
	);

	// Apply all VS Code automation tools using the modular structure
	const registeredTools = applyAllTools(server, appService);
	const app = appService.application;
	if (app) {
		registeredTools.forEach(t => t.enable());
	} else {
		registeredTools.forEach(t => t.disable());
	}

	appService.onApplicationChange(app => {
		if (app) {
			registeredTools.forEach(t => t.enable());
		} else {
			registeredTools.forEach(t => t.disable());
		}
	});

	return server.server;
}
