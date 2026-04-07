/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ILogger } from '../../../../../platform/log/common/logService';
import { ICopilotCLISessionTracker } from '../copilotCLISessionTracker';
import { makeTextResult } from './utils';

export function registerUpdateSessionNameTool(server: McpServer, logger: ILogger, sessionTracker: ICopilotCLISessionTracker, sessionId: string): void {
	const schema = {
		name: z.string().describe('The new session name'),
	};
	server.registerTool(
		'update_session_name',
		{
			description: 'Update the display name for the current CLI session',
			inputSchema: schema,
		},
		// @ts-ignore - TS2589: zod type instantiation too deep for server.tool() generics
		async (args: { name: string }) => {
			const { name } = args;
			logger.debug(`Updating session name for ${sessionId} to "${name}"`);
			sessionTracker.setSessionName(sessionId, name);
			return makeTextResult({ success: true });
		}
	);
}
