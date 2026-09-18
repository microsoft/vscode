/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { JsonValue, SessionEvent } from '@github/copilot-sdk';
import type { IAgentChatSearchResult } from '../../common/agentHostSessionSearch.js';
import type { IAgentHostSessionSearchIndex } from '../agentHostSessionSearchIndex.js';
import type { ISessionSearchChat, ISessionSearchDocument } from '../sessionSearchDatabase.js';
import { getTaskCompleteMarkdown, isTaskCompleteTool } from './copilotToolDisplay.js';
import { isSyntheticUserMessage, stripPromptScaffolding } from './mapSessionEvents.js';

// EventsReadResult is not exported from the SDK's public entry point.
interface IEventsReadResult {
	readonly events: readonly SessionEvent[];
	readonly cursor: string;
	readonly hasMore: boolean;
	readonly cursorStatus: 'ok' | 'expired';
}

interface IEventsReadOptions {
	readonly cursor?: string;
	readonly direction: 'forward' | 'backward';
	readonly max: number;
}

type ReadPage = (options: IEventsReadOptions) => Promise<IEventsReadResult>;
const pageSize = 500;

/** Adapts persisted Copilot events to the shared search cache without resuming a conversation. */
export function searchCopilotSessionHistory(index: IAgentHostSessionSearchIndex, chat: ISessionSearchChat, query: string, readPage: ReadPage): Promise<IAgentChatSearchResult> {
	return index.searchChat(chat, query, async () => {
		const tail = await readPage({ direction: 'backward', max: 1 });
		if (tail.cursorStatus === 'expired') {
			throw new Error('Persisted conversation changed during search indexing');
		}
		const revision = tail.events.at(-1)?.id ?? '';
		return { revision, documents: readDocuments(revision, readPage) };
	});
}

async function* readDocuments(revision: string, readPage: ReadPage): AsyncIterable<ISessionSearchDocument> {
	if (!revision) {
		return;
	}
	let turnId: string | undefined;
	let cursor: string | undefined;
	const completedTools = new Set<string>();
	const document = (role: ISessionSearchDocument['role'], text: string | undefined, sourceLocator: string): ISessionSearchDocument | undefined =>
		turnId && text?.trim() ? { turnId, role, text, sourceLocator } : undefined;
	const completion = (toolCallId: string, name: string, args: JsonValue | undefined): ISessionSearchDocument | undefined => {
		if (!isTaskCompleteTool(name) || completedTools.has(toolCallId)) {
			return undefined;
		}
		const parameters = args && typeof args === 'object' && !Array.isArray(args) && typeof args.summary === 'string' ? { summary: args.summary } : undefined;
		const result = document('assistant', getTaskCompleteMarkdown(parameters, undefined), `tool:${toolCallId}`);
		if (result) {
			completedTools.add(toolCallId);
		}
		return result;
	};
	while (true) {
		const page = await readPage({ cursor, direction: 'forward', max: pageSize });
		if (page.cursorStatus === 'expired') {
			throw new Error('Persisted conversation changed during search indexing');
		}
		for (const event of page.events) {
			if (!event.agentId && !event.ephemeral) {
				switch (event.type) {
					case 'user.message':
						if (!isSyntheticUserMessage(event)) {
							turnId = event.id ?? event.data.interactionId;
							completedTools.clear();
							const message = document('user', stripPromptScaffolding(event.data.content ?? ''), `message:${event.id}`);
							if (message) {
								yield message;
							}
						}
						break;
					case 'assistant.message':
						if (!event.data.parentToolCallId) {
							turnId ??= event.id ?? event.data.messageId;
							const message = document('assistant', event.data.content, `message:${event.id}`);
							if (message) {
								yield message;
							}
							for (const request of event.data.toolRequests ?? []) {
								const summary = completion(request.toolCallId, request.name, request.arguments);
								if (summary) {
									yield summary;
								}
							}
						}
						break;
					case 'tool.execution_start':
						if (!event.data.parentToolCallId) {
							const summary = completion(event.data.toolCallId, event.data.toolName, event.data.arguments);
							if (summary) {
								yield summary;
							}
						}
						break;
				}
			}
			// Capture a finite snapshot even when new events keep arriving.
			if (event.id === revision) {
				return;
			}
		}
		if (!page.hasMore || !page.cursor || page.cursor === cursor) {
			throw new Error('Persisted conversation tail was not found during search indexing');
		}
		cursor = page.cursor;
	}
}
