/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { ILogService } from '../../../platform/log/common/logService';
import { CUSTOM_TOOL_SEARCH_NAME } from '../../../platform/networking/common/anthropic';
import { IToolDeferralService } from '../../../platform/networking/common/toolDeferralService';
import { ExtendedLanguageModelToolResult, LanguageModelTextPart, MarkdownString } from '../../../vscodeTypes';
import { appendEscapedMarkdownInlineCode } from '../../../util/vs/base/common/htmlContent';
import { truncate } from '../../../util/vs/base/common/strings';
import { ICopilotModelSpecificTool, ToolRegistry } from '../common/toolsRegistry';
import { IToolsService } from '../common/toolsService';
import { IToolEmbeddingsComputer } from '../common/virtualTools/toolEmbeddingsComputer';

export interface IToolSearchParams {
	query: string;
	limit?: number;
	/** Internal Agent Host corpus; not part of the model-facing schema. */
	candidateTools?: readonly IToolSearchCandidate[];
}

export interface IToolSearchCandidate {
	name: string;
	description: string;
}

const DEFAULT_SEARCH_LIMIT = 5;

function formatToolSearchMessage(message: string, query: string): MarkdownString {
	const text = typeof query === 'string' ? query.replace(/\s+/g, ' ').trim() : '';
	const preview = text.length > 80 ? truncate(text, 77, '...') : text;
	return preview
		? new MarkdownString(l10n.t('{0} for {1}', message, appendEscapedMarkdownInlineCode(preview)))
		: new MarkdownString(message);
}

export class ToolSearchTool implements ICopilotModelSpecificTool<IToolSearchParams> {
	constructor(
		@IToolEmbeddingsComputer private readonly _toolEmbeddingsComputer: IToolEmbeddingsComputer,
		@IToolsService private readonly _toolsService: IToolsService,
		@IToolDeferralService private readonly _toolDeferralService: IToolDeferralService,
		@ILogService private readonly _logService: ILogService,
	) { }

	prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<IToolSearchParams>): vscode.PreparedToolInvocation {
		return {
			invocationMessage: formatToolSearchMessage(l10n.t('Searching tools'), options.input.query),
			pastTenseMessage: formatToolSearchMessage(l10n.t('Searched tools'), options.input.query),
		};
	}

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IToolSearchParams>, token: vscode.CancellationToken) {
		const { query, limit, candidateTools } = options.input;

		if (!query) {
			const result = new ExtendedLanguageModelToolResult([
				new LanguageModelTextPart('Error: query parameter is required'),
			]);
			result.toolResultMessage = new MarkdownString(l10n.t('Tool search failed'));
			return result;
		}

		const availableTools: readonly vscode.LanguageModelToolInformation[] = candidateTools !== undefined
			? candidateTools.map(tool => ({
				name: tool.name,
				description: tool.description,
				inputSchema: undefined,
				tags: [],
				source: undefined,
			}))
			: this._toolsService.tools.filter(
				tool => !this._toolDeferralService.isNonDeferredTool(tool.name),
			);
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
		const result = new ExtendedLanguageModelToolResult([
			new LanguageModelTextPart(JSON.stringify(matchedToolNames)),
		]);
		const message = matchedToolNames.length === 0 ? l10n.t('No matching tools found')
			: matchedToolNames.length === 1 ? l10n.t('Found 1 tool')
				: l10n.t('Found {0} tools', matchedToolNames.length);
		result.toolResultMessage = formatToolSearchMessage(message, query);
		return result;
	}
}

ToolRegistry.registerModelSpecificTool(
	{
		name: CUSTOM_TOOL_SEARCH_NAME,
		displayName: l10n.t('Search Tools'),
		toolReferenceName: 'toolSearch',
		userDescription: l10n.t('Search for relevant tools by describing what you need'),
		description: 'Search for relevant tools by describing what you need. Returns tool references for tools matching your query. Use this when you need to find a tool but aren\'t sure of its exact name. Check the deferred tools list in your instructions for the full set of deferred tools, and include relevant tool names from that list in your query for more accurate results. Use broad queries to find all related tools in a single call rather than making multiple narrow searches.',
		tags: [],
		source: undefined,
		toolSet: 'vscode',
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
		fullReferenceName: `vscode/toolSearch`,
		models: [
			{ family: 'gpt-5.4' },
			{ family: 'gpt-5.5' },
			{ family: 'gpt-5.6-sol' },
			{ family: 'gpt-5.6-terra' },
			{ family: 'gpt-5.6-luna' },
			{ family: 'claude-haiku-4.5' },
			{ family: 'claude-sonnet-4.5' },
			{ family: 'claude-sonnet-4.6' },
			{ family: 'claude-sonnet-5' },
			{ family: 'claude-opus-4.5' },
			{ family: 'claude-opus-4.6' },
			{ family: 'claude-opus-4.7' },
			{ family: 'claude-opus-4.8' },
			{ family: 'claude-opus-5' },
			{ family: 'claude-fable-5' },
			{ family: 'claude-mythos-5' },
		],
	},
	ToolSearchTool,
);
