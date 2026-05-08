/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { makeTextResult } from './utils';
import { ILogger } from '../../../../../platform/log/common/logService';

export function registerGetVscodeInfoTool(server: McpServer, logger: ILogger): void {
	server.registerTool('get_vscode_info', { description: 'Get information about the current VS Code instance' }, async () => {
		logger.debug('Getting VS Code info');
		logger.trace(`VS Code version: ${vscode.version}, app: ${vscode.env.appName}`);
		return makeTextResult({
			version: vscode.version,
			appName: vscode.env.appName,
			appRoot: vscode.env.appRoot,
			language: vscode.env.language,
			machineId: vscode.env.machineId,
			sessionId: vscode.env.sessionId,
			uriScheme: vscode.env.uriScheme,
			shell: vscode.env.shell,
		});
	});
}
