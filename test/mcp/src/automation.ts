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
		name: 'Forge Automation Server',
		version: '1.0.0',
		title: 'An MCP Server that can interact with a local build of Forge. Used for verifying UI behavior.'
	}, { capabilities: { logging: {} } });

	server.tool(
		'vscode_automation_start',
		'Start Forge. If workspacePath is not provided, Forge will open with the last used workspace or an empty window.',
		{
			recordVideo: z.boolean().optional().describe('Whether to record a video of the session'),
			workspacePath: z.string().optional().describe('Optional path to a workspace or folder to open. If not provided, opens the last used workspace.')
		},
		async ({ recordVideo, workspacePath }) => {
			const app = await appService.getOrCreateApplication({ recordVideo, workspacePath });
			await app.startTracing();
			return {
				content: [{
					type: 'text' as const,
					text: app ? `Forge started successfully${workspacePath ? ` with workspace: ${workspacePath}` : ''}` : `Failed to start Forge`
				}]
			};
		}
	);

	// Apply all Forge automation tools using the modular structure
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
