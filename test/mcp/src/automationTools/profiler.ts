/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Application } from '../../../automation';

/**
 * Profiler Tools
 * Note: Due to MCP limitations, these tools provide information about profiler methods
 * but cannot execute them directly as they require function parameters
 */
export function applyProfilerTools(server: McpServer, app: Application) {
	server.tool(
		'vscode_automation_profiler_info',
		'Get information about available profiler methods',
		{},
		async () => {
			return {
				content: [{
					type: 'text' as const,
					text: `Profiler methods available:
- checkObjectLeaks(classNames, fn): Check for object leaks during function execution
- checkHeapLeaks(classNames, fn): Check for heap leaks during function execution

Note: These methods require function parameters and cannot be executed directly via MCP.
They are primarily used within VS Code's automation test framework.`
				}]
			};
		}
	);
}
