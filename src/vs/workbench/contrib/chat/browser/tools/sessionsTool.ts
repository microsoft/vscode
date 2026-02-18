/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { IChatSessionEmbeddingsService } from '../../common/chatSessionEmbeddingsService.js';
import { createToolSimpleTextResult } from '../../common/tools/builtinTools/toolHelpers.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../common/tools/languageModelToolsService.js';
import { errorResult } from './toolHelpers.js';

export const SessionsToolId = 'vscode_listPastSessions';

interface ISessionsToolInput {
	query: string;
	maxResults?: number;
}

const BaseModelDescription = `Search prior chat sessions and return relevant snippets about what was discussed.

Use this tool when the user asks things like:
- "what did we discuss earlier?"
- "summarize our previous conversations about X"
- "find past chat where we discussed Y"

Input:
- "query": Natural-language search query for prior discussions.
- "maxResults": Optional max number of matched sessions to return (default 8, max 20).`;

export class SessionsTool extends Disposable implements IToolImpl {

	constructor(
		@IChatService private readonly chatService: IChatService,
		@IChatSessionEmbeddingsService private readonly chatSessionEmbeddingsService: IChatSessionEmbeddingsService,
	) {
		super();
	}

	getToolData(): IToolData {
		return {
			id: SessionsToolId,
			toolReferenceName: 'sessions',
			canBeReferencedInPrompt: true,
			icon: ThemeIcon.fromId(Codicon.history.id),
			displayName: localize('tool.sessions.displayName', 'Search Past Sessions'),
			userDescription: localize('tool.sessions.userDescription', 'Search past conversations and return relevant snippets'),
			modelDescription: BaseModelDescription,
			source: ToolDataSource.Internal,
			when: ContextKeyExpr.has('config.chat.tools.sessionsTool.enabled'),
			inputSchema: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Natural-language search query for prior discussions.'
					},
					maxResults: {
						type: 'number',
						description: 'Optional max number of matched sessions to return (default 8, max 20).'
					}
				},
				required: ['query']
			}
		};
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const input = context.parameters as ISessionsToolInput;
		const query = input.query?.trim();
		if (!query) {
			return undefined;
		}

		return {
			invocationMessage: localize('tool.sessions.invocationMessage', 'Searching past sessions for "{0}"', query),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const input = invocation.parameters as ISessionsToolInput;
		const query = input.query?.trim();
		if (!query) {
			return errorResult('Provide a non-empty "query" describing what to search for in past sessions.');
		}

		const requestedMaxResults = typeof input.maxResults === 'number' ? Math.floor(input.maxResults) : 8;
		const maxResults = Math.min(20, Math.max(1, requestedMaxResults));

		const allResults = await this.chatSessionEmbeddingsService.search(query, maxResults + 1, token);
		const currentSessionResource = invocation.context?.sessionResource?.toString();
		const pastResults = currentSessionResource
			? allResults.filter(result => result.sessionResource.toString() !== currentSessionResource).slice(0, maxResults)
			: allResults.slice(0, maxResults);

		const results = pastResults.length > 0
			? pastResults
			: allResults.slice(0, maxResults);

		if (results.length === 0) {
			const recent = (await this.chatService.getLocalSessionHistory())
				.filter(item => item.sessionResource.toString() !== currentSessionResource)
				.sort((a, b) => b.lastMessageDate - a.lastMessageDate)
				.slice(0, Math.min(5, maxResults));

			if (recent.length === 0) {
				const result = createToolSimpleTextResult(localize('tool.sessions.noResultsText', 'No matching past sessions were found for "{0}".', query));
				result.toolResultMessage = new MarkdownString(localize('tool.sessions.noResultsMessage', 'Searched past sessions for "{0}", no matches', query));
				return result;
			}

			const fallbackLines: string[] = [];
			fallbackLines.push(localize('tool.sessions.fallbackHeader', 'No semantic matches found for "{0}". Here are your most recent sessions:', query));
			fallbackLines.push('');
			for (const item of recent) {
				fallbackLines.push('<session>');
				fallbackLines.push(`title: ${item.title}`);
				fallbackLines.push(`uri: ${item.sessionResource.toString()}`);
				fallbackLines.push(`lastMessageDate: ${new Date(item.lastMessageDate).toISOString()}`);
				fallbackLines.push('</session>');
				fallbackLines.push('');
			}

			const fallbackResult = createToolSimpleTextResult(fallbackLines.join('\n').trimEnd());
			fallbackResult.toolResultMessage = new MarkdownString(localize('tool.sessions.fallbackMessage', 'Searched past sessions for "{0}", returning recent sessions', query));
			return fallbackResult;
		}

		const lines: string[] = [];
		const includesCurrentSession = !!currentSessionResource && pastResults.length === 0 && allResults.length > 0;
		lines.push(includesCurrentSession
			? localize('tool.sessions.headerIncludingCurrent', 'No past-session matches for "{0}"; showing best available session matches (including current):', query)
			: localize('tool.sessions.header', 'Matched {0} past sessions for "{1}":', results.length, query));
		lines.push('');

		for (const result of results) {
			const scorePercent = Math.round(result.score * 100);
			const isoDate = new Date(result.lastMessageDate).toISOString();
			const snippet = result.matchSnippet.replace(/\s+/g, ' ').trim().substring(0, 320);
			lines.push('<session>');
			lines.push(`title: ${result.title}`);
			lines.push(`uri: ${result.sessionResource.toString()}`);
			lines.push(`score: ${scorePercent}%`);
			lines.push(`lastMessageDate: ${isoDate}`);
			lines.push(`snippet: ${snippet}`);
			lines.push('</session>');
			lines.push('');
		}

		const text = lines.join('\n').trimEnd();
		const toolResult = createToolSimpleTextResult(text);
		toolResult.toolResultMessage = new MarkdownString(localize('tool.sessions.resultMessage', 'Searched past sessions for "{0}", {1} matches', query, results.length));
		return toolResult;
	}
}

export class SessionsToolContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.sessionsTool';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const sessionsTool = this._store.add(instantiationService.createInstance(SessionsTool));
		this._store.add(toolsService.registerTool(sessionsTool.getToolData(), sessionsTool));
	}
}
