/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { TOOL_SEARCH_SUPPORTED_MODELS } from '../../../platform/endpoint/common/chatModelCapabilities';
import { ILogService } from '../../../platform/log/common/logService';
import { CUSTOM_TOOL_SEARCH_NAME } from '../../../platform/networking/common/anthropic';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { ICopilotModelSpecificTool, ToolRegistry } from '../common/toolsRegistry';
import { IToolsService } from '../common/toolsService';
import { IToolEmbeddingsComputer } from '../common/virtualTools/toolEmbeddingsComputer';

export interface IToolSearchParams {
	query: string;
	limit?: number;
}

const DEFAULT_SEARCH_LIMIT = 5;

export class ToolSearchTool implements ICopilotModelSpecificTool<IToolSearchParams> {
	constructor(
		@IToolEmbeddingsComputer private readonly _toolEmbeddingsComputer: IToolEmbeddingsComputer,
		@IToolsService private readonly _toolsService: IToolsService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IToolSearchParams>, token: vscode.CancellationToken) {
		const { query, limit } = options.input;

		if (!query) {
			return new LanguageModelToolResult([
				new LanguageModelTextPart('Error: query parameter is required'),
			]);
		}

		const availableTools = this._toolsService.tools;
		const matchedToolNames = await this._toolEmbeddingsComputer.searchToolsByQuery(
			query,
			availableTools,
			limit ?? DEFAULT_SEARCH_LIMIT,
			token,
		);

		this._logService.trace(`[custom-tool-search] Query "${query}" matched ${matchedToolNames.length} tools: ${JSON.stringify(matchedToolNames)}`);

		// Return matched tool names as a JSON array. messagesApi.ts identifies results
		// from this tool via the toolCallId→name map and converts them into
		// tool_reference content blocks for the Anthropic API.
		return new LanguageModelToolResult([
			new LanguageModelTextPart(JSON.stringify(matchedToolNames)),
		]);
	}
}

ToolRegistry.registerModelSpecificTool(
	{
		name: CUSTOM_TOOL_SEARCH_NAME,
		displayName: 'Search Tools',
		description: 'Search for relevant tools by describing what you need. Returns tool references for tools matching your query. Use this when you need to find a tool but aren\'t sure of its exact name. Check the availableDeferredTools list in your instructions for the full set of deferred tools, and include relevant tool names from that list in your query for more accurate results. Use broad queries to find all related tools in a single call rather than making multiple narrow searches.',
		tags: [],
		source: undefined,
		inputSchema: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					description: 'Natural language description of what tool capability you are looking for. Use broad queries to cover related tools in one search (e.g., "github" instead of separate searches for issues and PRs).',
				},
			},
			required: ['query'],
		},
		models: TOOL_SEARCH_SUPPORTED_MODELS.map(prefix => ({ id: prefix })),
	},
	ToolSearchTool,
);
