/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { isObject } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { ChatAIDisabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../common/constants.js';
import { IChatRequestHistoryEntry, IChatRequestHistoryService } from '../../common/requestHistory/chatRequestHistory.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, ToolDataSource, ToolProgress } from '../../common/tools/languageModelToolsService.js';

export const SearchRequestHistoryToolId = 'vscode_searchRequestHistory';
export const SearchRequestHistoryToolReferenceName = 'search_request_history';

const DEFAULT_RESULT_LIMIT = 20;
const MAX_RESULT_LIMIT = 50;
/** The longest request text a result carries; the history may keep more. */
export const MAX_SEARCH_RESULT_REQUEST_LENGTH = 2000;

export const chatRequestHistoryWhen = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	ContextKeyExpr.equals(`config.${ChatConfiguration.RequestHistoryEnabled}`, true),
	ContextKeyExpr.notEquals(`config.${ChatAIDisabledSettingId}`, true),
);

interface ISearchRequestHistoryInput {
	readonly query: string;
	readonly limit: number;
	readonly since: number | undefined;
}

interface ISearchRequestHistoryResult {
	readonly request: string;
	readonly truncated?: true;
	readonly sentAt: string;
	readonly chat?: string;
	readonly host?: string;
	readonly openLink: string;
}

export function parseSearchRequestHistoryInput(value: unknown): ISearchRequestHistoryInput {
	const input = isObject(value) ? value as { readonly query?: unknown; readonly limit?: unknown; readonly since?: unknown } : {};
	if (input.query !== undefined && typeof input.query !== 'string') {
		throw new Error('query must be a string.');
	}
	if (input.limit !== undefined && (typeof input.limit !== 'number' || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_RESULT_LIMIT)) {
		throw new Error(`limit must be an integer from 1 to ${MAX_RESULT_LIMIT}.`);
	}
	let since: number | undefined;
	if (input.since !== undefined) {
		since = typeof input.since === 'string' ? Date.parse(input.since) : NaN;
		if (!Number.isFinite(since)) {
			throw new Error('since must be an ISO 8601 date or date-time.');
		}
	}
	return { query: input.query ?? '', limit: input.limit ?? DEFAULT_RESULT_LIMIT, since };
}

export function toSearchRequestHistoryResult(entry: IChatRequestHistoryEntry): ISearchRequestHistoryResult {
	return {
		request: entry.prompt.slice(0, MAX_SEARCH_RESULT_REQUEST_LENGTH),
		...(entry.prompt.length > MAX_SEARCH_RESULT_REQUEST_LENGTH ? { truncated: true as const } : {}),
		sentAt: new Date(entry.timestamp).toISOString(),
		...(entry.title ? { chat: entry.title } : {}),
		...(entry.host ? { host: entry.host } : {}),
		openLink: entry.link,
	};
}

export class SearchRequestHistoryTool implements IToolImpl {

	constructor(
		@IChatRequestHistoryService private readonly _history: IChatRequestHistoryService,
	) { }

	getToolData(): IToolData {
		return {
			id: SearchRequestHistoryToolId,
			toolReferenceName: SearchRequestHistoryToolReferenceName,
			canBeReferencedInPrompt: false,
			icon: Codicon.history,
			displayName: localize('requestHistory.tool.displayName', "Search Request History"),
			userDescription: localize('requestHistory.tool.userDescription', "Search the chat requests you sent from this machine to any agent host"),
			modelDescription: `Search the chat requests the user sent from this machine to any agent host, local or remote, including chats whose host is offline. Use it when the user refers to something they asked before, in another chat, session, or host, or wants to find or reopen an earlier request. Not for reading responses: pass a result's openLink to get_session_context or get_remote_session for that. Every whitespace-separated query term must appear in the request text, chat title, or host label, ignoring case; an empty query lists the most recent requests. Returns results newest first, each with the request text (truncated after ${MAX_SEARCH_RESULT_REQUEST_LENGTH} characters), when it was sent, the chat title and host, and an openLink that opens the chat at that request. Results hold only the user's own request text, never responses or attachments. Read-only.`,
			source: ToolDataSource.Internal,
			when: chatRequestHistoryWhen,
			runsInWorkspace: false,
			agentHostPreferences: { defer: 'auto' },
			inputSchema: {
				type: 'object',
				additionalProperties: false,
				properties: {
					query: { type: 'string', description: 'Words to find in the request text, chat title, or host label. Omit to list the most recent requests.' },
					limit: { type: 'integer', minimum: 1, maximum: MAX_RESULT_LIMIT, description: `The most results to return. Defaults to ${DEFAULT_RESULT_LIMIT}.` },
					since: { type: 'string', description: 'Only requests sent at or after this ISO 8601 date or date-time.' },
				},
			},
		};
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation> {
		const { query } = parseSearchRequestHistoryInput(context.parameters);
		return {
			invocationMessage: query
				? localize('requestHistory.tool.invocation.query', "Searching request history for \"{0}\"", query)
				: localize('requestHistory.tool.invocation', "Reading recent requests"),
			pastTenseMessage: query
				? localize('requestHistory.tool.past.query', "Searched request history for \"{0}\"", query)
				: localize('requestHistory.tool.past', "Read recent requests"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		let input: ISearchRequestHistoryInput;
		try {
			input = parseSearchRequestHistoryInput(invocation.parameters);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { content: [{ kind: 'text', value: `Error: ${message}` }], toolResultError: message };
		}
		if (!this._history.enabled.get()) {
			const message = 'Request history is turned off.';
			return { content: [{ kind: 'text', value: `Error: ${message}` }], toolResultError: message };
		}
		const results = this._history.search(input.query, { limit: input.limit, since: input.since }).map(toSearchRequestHistoryResult);
		return {
			content: [{ kind: 'text', value: JSON.stringify({ results }) }],
			toolResultMessage: new MarkdownString(results.length === 1
				? localize('requestHistory.tool.result.one', "Found 1 request")
				: localize('requestHistory.tool.result', "Found {0} requests", results.length)),
		};
	}
}

export class ChatRequestHistoryToolContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatRequestHistoryTool';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const tool = instantiationService.createInstance(SearchRequestHistoryTool);
		this._register(toolsService.registerTool(tool.getToolData(), tool));
	}
}
