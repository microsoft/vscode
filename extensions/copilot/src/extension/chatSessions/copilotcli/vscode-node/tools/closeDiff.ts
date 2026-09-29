/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DiffStateManager } from '../diffState';
import { makeTextResult } from './utils';
import { ILogger } from '../../../../../platform/log/common/logService';

export function registerCloseDiffTool(server: McpServer, logger: ILogger, diffState: DiffStateManager): void {
	const schema = {
		tab_name: z.string().describe('The tab name of the diff to close (must match the tab_name used when opening the diff)'),
	};
	server.registerTool(
		'close_diff',
		{
			description: 'Closes a diff tab by its tab name. Use this when the client rejects an edit to close the corresponding diff view.',
			inputSchema: schema,
		},
		// @ts-ignore - TS2589: zod type instantiation too deep for server.tool() generics
		async (args: { tab_name: string }) => {
			const { tab_name } = args;
			logger.debug(`Closing diff: ${tab_name}`);
			const diff = diffState.getByTabName(tab_name);

			if (!diff) {
				logger.debug(`No active diff found with tab name: ${tab_name}`);
				return makeTextResult({
					success: true,
					already_closed: true,
					tab_name: tab_name,
					message: `No active diff found with tab name "${tab_name}" (may already be closed)`,
				});
			}

			// Trigger the rejection flow which will clean up and close the tab
			diff.resolve({ status: 'REJECTED', trigger: 'closed_via_tool' });
			logger.info(`Diff closed via tool: ${tab_name}`);

			return makeTextResult({
				success: true,
				already_closed: false,
				tab_name: tab_name,
				message: `Diff "${tab_name}" closed successfully`,
			});
		}
	);
}
