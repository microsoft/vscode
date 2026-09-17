/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { makeTextResult } from './utils';
import { ILogger } from '../../../../../platform/log/common/logService';

export function registerGetDiagnosticsTool(server: McpServer, logger: ILogger): void {
	const schema = {
		uri: z.string().optional().describe('File URI to get diagnostics for. Optional. If not provided, returns diagnostics for all files.'),
	};
	server.registerTool(
		'get_diagnostics',
		{
			description: 'Gets language diagnostics (errors, warnings, hints) from VS Code',
			inputSchema: schema,
		},
		// @ts-ignore - TS2589: zod type instantiation too deep for server.tool() generics
		async (args: { uri?: string }) => {
			const { uri } = args;
			logger.debug(`Getting diagnostics${uri ? ` for: ${uri}` : ' for all files'}`);
			let diagnostics: [vscode.Uri, readonly vscode.Diagnostic[]][];

			if (uri) {
				const fileUri = vscode.Uri.parse(uri);
				const fileDiagnostics = vscode.languages.getDiagnostics(fileUri);
				diagnostics = [[fileUri, fileDiagnostics]];
			} else {
				diagnostics = vscode.languages.getDiagnostics();
			}

			const result = diagnostics.map(([fileUri, fileDiagnostics]) => ({
				uri: fileUri.toString(),
				filePath: fileUri.fsPath,
				diagnostics: fileDiagnostics.map(d => ({
					message: d.message,
					severity: vscode.DiagnosticSeverity[d.severity].toLowerCase(),
					range: {
						start: { line: d.range.start.line, character: d.range.start.character },
						end: { line: d.range.end.line, character: d.range.end.character },
					},
					source: d.source,
					code: typeof d.code === 'object' ? d.code.value : d.code,
				})),
			})).filter(item => item.diagnostics.length > 0);

			logger.trace(`Returning ${result.length} file(s) with diagnostics`);
			return makeTextResult(result);
		}
	);
}
