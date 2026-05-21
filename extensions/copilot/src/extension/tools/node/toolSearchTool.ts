/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { ILogService } from '../../../platform/log/common/logService';
import { CUSTOM_TOOL_SEARCH_NAME } from '../../../platform/networking/common/anthropic';
import { IToolDeferralService } from '../../../platform/networking/common/toolDeferralService';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { createRequestToolManifest } from '../common/requestToolManifest';
import { CopilotToolMode, ICopilotModelSpecificTool, ToolRegistry } from '../common/toolsRegistry';
import { IToolEmbeddingsComputer } from '../common/virtualTools/toolEmbeddingsComputer';

export interface IToolSearchParams {
	query: string;
	limit?: number;
}

const DEFAULT_SEARCH_LIMIT = 5;
const requestScopedDeferredToolsContextIdKey = '__toolSearchRequestContextId';
const REQUEST_SCOPED_DEFERRED_TOOLS_CONTEXT_TTL_MS = 5 * 60 * 1000;
const MAX_REQUEST_SCOPED_DEFERRED_TOOLS_CONTEXTS = 128;

let nextRequestScopedDeferredToolsContextId = 0;

type ResolvedToolSearchParams = IToolSearchParams & {
	[requestScopedDeferredToolsContextIdKey]?: string;
};

interface IRequestScopedDeferredToolsContextEntry {
	readonly createdAt: number;
	readonly tools: readonly vscode.LanguageModelToolInformation[];
}

export class ToolSearchTool implements ICopilotModelSpecificTool<IToolSearchParams> {
	private readonly _requestScopedDeferredToolsContexts = new Map<string, IRequestScopedDeferredToolsContextEntry>();

	constructor(
		@IToolEmbeddingsComputer private readonly _toolEmbeddingsComputer: IToolEmbeddingsComputer,
		@IToolDeferralService private readonly _toolDeferralService: IToolDeferralService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IToolSearchParams>, token: vscode.CancellationToken) {
		const { query, limit } = options.input;

		if (!query) {
			return new LanguageModelToolResult([
				new LanguageModelTextPart('Error: query parameter is required'),
			]);
		}

		this.cleanupRequestScopedDeferredToolsContexts();

		const requestScopedDeferredToolsContextId = (options.input as ResolvedToolSearchParams)[requestScopedDeferredToolsContextIdKey];
		const requestScopedDeferredToolsContext = requestScopedDeferredToolsContextId
			? this._requestScopedDeferredToolsContexts.get(requestScopedDeferredToolsContextId)
			: undefined;
		if (requestScopedDeferredToolsContextId && requestScopedDeferredToolsContext) {
			this._requestScopedDeferredToolsContexts.delete(requestScopedDeferredToolsContextId);
		}
		const requestScopedDeferredTools = requestScopedDeferredToolsContext?.tools;

		if (!requestScopedDeferredTools) {
			throw new Error('ToolSearchTool: request-scoped deferred tools are unavailable. Ensure resolveInput is called before invoke.');
		}

		const matchedToolNames = await this._toolEmbeddingsComputer.searchToolsByQuery(
			query,
			requestScopedDeferredTools,
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

	async resolveInput(input: IToolSearchParams, promptContext: IBuildPromptContext, _mode: CopilotToolMode): Promise<IToolSearchParams> {
		const manifest = createRequestToolManifest(promptContext.tools?.availableTools ?? [], this._toolDeferralService);
		this.cleanupRequestScopedDeferredToolsContexts();
		const requestScopedDeferredToolsContextId = `tool-search-${nextRequestScopedDeferredToolsContextId++}`;
		this._requestScopedDeferredToolsContexts.set(requestScopedDeferredToolsContextId, {
			createdAt: Date.now(),
			tools: Object.freeze([...manifest.deferredTools]),
		});
		this.trimRequestScopedDeferredToolsContexts();
		const resolvedInput: ResolvedToolSearchParams = {
			...input,
			[requestScopedDeferredToolsContextIdKey]: requestScopedDeferredToolsContextId,
		};
		return resolvedInput;
	}

	private cleanupRequestScopedDeferredToolsContexts(now = Date.now()): void {
		for (const [contextId, context] of this._requestScopedDeferredToolsContexts) {
			if (now - context.createdAt > REQUEST_SCOPED_DEFERRED_TOOLS_CONTEXT_TTL_MS) {
				this._requestScopedDeferredToolsContexts.delete(contextId);
			}
		}
	}

	private trimRequestScopedDeferredToolsContexts(): void {
		while (this._requestScopedDeferredToolsContexts.size > MAX_REQUEST_SCOPED_DEFERRED_TOOLS_CONTEXTS) {
			const oldestContextId = this._requestScopedDeferredToolsContexts.keys().next().value;
			if (!oldestContextId) {
				return;
			}
			this._requestScopedDeferredToolsContexts.delete(oldestContextId);
		}
	}
}

ToolRegistry.registerModelSpecificTool(
	{
		name: CUSTOM_TOOL_SEARCH_NAME,
		displayName: l10n.t('Search Tools'),
		toolReferenceName: 'toolSearch',
		userDescription: l10n.t('Search for relevant tools by describing what you need'),
		description: 'Search for relevant tools by describing what you need. Returns tool references for tools matching your query. Use this when you need to find a tool but aren\'t sure of its exact name. Check the availableDeferredTools list in your instructions for the full set of deferred tools, and include relevant tool names from that list in your query for more accurate results. Use broad queries to find all related tools in a single call rather than making multiple narrow searches.',
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
		models: [
			{ family: 'gpt-5.4' },
			{ family: 'gpt-5.5' },
			{ family: 'claude-sonnet-4.5' },
			{ family: 'claude-sonnet-4.6' },
			{ family: 'claude-opus-4.5' },
			{ family: 'claude-opus-4.6' },
			{ family: 'claude-opus-4.6-1m' },
			{ family: 'claude-opus-4.7' },
			{ family: 'claude-opus-4.7-1m' },
			{ family: 'claude-opus-4.7-1m-internal' },
			{ family: 'claude-opus-4.7-high' },
			{ family: 'claude-opus-4.7-xhigh' },
		],
	},
	ToolSearchTool,
);
