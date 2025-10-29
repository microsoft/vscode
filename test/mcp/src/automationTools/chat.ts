/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApplicationService } from '../application';
import { z } from 'zod';

/**
 * Chat Tools
 */
export function applyChatTools(server: McpServer, appService: ApplicationService): RegisteredTool[] {
	const tools: RegisteredTool[] = [];

	tools.push(server.tool(
		'vscode_automation_chat_send_message',
		'Send a message to the VS Code chat panel',
		{
			message: z.string().describe('The message to send to the chat')
		},
		async (args) => {
			const { message } = args;
			const app = await appService.getOrCreateApplication();
			try {
				await app.workbench.chat.sendMessage(message);
				return {
					content: [{
						type: 'text' as const,
						text: `Sent chat message: "${message}"`
					}]
				};
			} catch (error) {
				return {
					content: [{
						type: 'text' as const,
						text: `Failed to send chat message: ${error}`
					}]
				};
			}
		}
	));

	return tools;
}
