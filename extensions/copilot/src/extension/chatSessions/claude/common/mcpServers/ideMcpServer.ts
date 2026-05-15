/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createSdkMcpServer, McpServerConfig, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { ILanguageDiagnosticsService } from '../../../../../platform/languages/common/languageDiagnosticsService';
import { URI } from '../../../../../util/vs/base/common/uri';
import { DiagnosticSeverity } from '../../../../../vscodeTypes';
import { IClaudeMcpServerContributor, registerClaudeMcpServerContributor } from '../claudeMcpServerRegistry';

const severityToString: Record<DiagnosticSeverity, string> = {
	[DiagnosticSeverity.Error]: 'error',
	[DiagnosticSeverity.Warning]: 'warning',
	[DiagnosticSeverity.Information]: 'information',
	[DiagnosticSeverity.Hint]: 'hint',
};

export interface DiagnosticEntry {
	readonly uri: string;
	readonly filePath: string;
	readonly diagnostics: readonly {
		readonly message: string;
		readonly severity: string;
		readonly range: {
			readonly start: { readonly line: number; readonly character: number };
			readonly end: { readonly line: number; readonly character: number };
		};
		readonly source: string | undefined;
		readonly code: string | number | undefined;
	}[];
}

/**
 * Fetches diagnostics from the language diagnostics service and formats them
 * for the MCP tool response.
 */
export function getDiagnosticsHandler(
	diagnosticsService: ILanguageDiagnosticsService,
	args: { uri?: string }
): DiagnosticEntry[] {
	let entries: [URI, readonly { message: string; severity: DiagnosticSeverity; range: { start: { line: number; character: number }; end: { line: number; character: number } }; source?: string; code?: string | number | { value: string | number; target: URI } }[]][];

	if (args.uri) {
		let fileUri: URI;
		try {
			fileUri = URI.parse(args.uri);
		} catch {
			throw new Error(`Invalid URI: "${args.uri}". Expected an absolute path (e.g., /path/to/file.ts) or a URI with a scheme (e.g., file:///path/to/file.ts, untitled:Untitled-1).`);
		}
		entries = [[fileUri, diagnosticsService.getDiagnostics(fileUri)]];
	} else {
		entries = diagnosticsService.getAllDiagnostics();
	}

	return entries
		.map(([fileUri, fileDiagnostics]) => ({
			uri: fileUri.toString(),
			filePath: fileUri.fsPath,
			diagnostics: fileDiagnostics.map(d => ({
				message: d.message,
				severity: severityToString[d.severity] ?? 'unknown',
				range: {
					start: { line: d.range.start.line, character: d.range.start.character },
					end: { line: d.range.end.line, character: d.range.end.character },
				},
				source: d.source,
				code: typeof d.code === 'object' ? d.code.value : d.code,
			})),
		}))
		.filter(item => item.diagnostics.length > 0);
}

class IdeMcpServerContributor implements IClaudeMcpServerContributor {

	constructor(
		@ILanguageDiagnosticsService private readonly diagnosticsService: ILanguageDiagnosticsService,
	) { }

	async getMcpServers(): Promise<Record<string, McpServerConfig>> {
		const diagnosticsService = this.diagnosticsService;

		const getDiagnosticsTool = tool(
			'getDiagnostics',
			'Get language diagnostics from VS Code. Returns errors, warnings, information, and hints for files in the workspace.',
			{
				uri: z.string().optional().describe('Optional file URI to get diagnostics for. If not provided, gets diagnostics for all files.'),
			},
			async (args: { uri?: string }) => {
				const result = getDiagnosticsHandler(diagnosticsService, args);
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify(result, null, 2),
					}],
				};
			}
		);

		const server = createSdkMcpServer({
			name: 'ide',
			version: '0.0.1',
			tools: [getDiagnosticsTool],
		});

		return { ide: server };
	}
}

registerClaudeMcpServerContributor(IdeMcpServerContributor);
