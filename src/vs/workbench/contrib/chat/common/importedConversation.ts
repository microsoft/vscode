/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { IChatSessionHistoryItem } from './chatSessionsService.js';

/**
 * A single user/assistant exchange captured from a prior conversation so it can
 * be shown inline (for context only) in a session it was continued into. The
 * shape is intentionally plain and JSON-serializable so it can be persisted and
 * re-hydrated across window reloads without carrying the full chat model.
 */
export interface IImportedConversationTurn {
	/** The originating request id, if known. Informational only. */
	readonly requestId?: string;
	/** The user prompt text. */
	readonly prompt: string;
	/** The assistant response rendered as markdown. Empty when there was no response. */
	readonly response: string;
}

/**
 * Minimal structural shape of a chat request needed to build an imported
 * conversation. Kept structural so {@link buildImportedConversation} can be
 * unit-tested without constructing a full chat model.
 */
export interface IImportedConversationSourceRequest {
	readonly id?: string;
	readonly message: { readonly text: string };
	readonly response?: { readonly response?: { getMarkdown(): string } };
}

/**
 * Builds a serializable imported-conversation snapshot from a source session's
 * requests. Unlike a flat transcript, each turn is preserved separately so it
 * can be rendered as distinct inline messages. Empty prompts are skipped.
 */
export function buildImportedConversation(requests: readonly IImportedConversationSourceRequest[]): IImportedConversationTurn[] {
	const turns: IImportedConversationTurn[] = [];
	for (const req of requests) {
		const prompt = req.message.text;
		if (!prompt) {
			continue;
		}
		const response = req.response?.response ? req.response.response.getMarkdown() : '';
		turns.push({
			...(req.id ? { requestId: req.id } : {}),
			prompt,
			response,
		});
	}
	return turns;
}

/**
 * Reconstructs read-only {@link IChatSessionHistoryItem}s from an imported
 * conversation snapshot so it renders inline as prior messages. Each turn
 * yields a request item and (when a response exists) a response item, both
 * flagged `isReadonly` so the chat UI suppresses edit/rerun/fork/restore
 * affordances for them.
 */
export function importedConversationToHistory(turns: readonly IImportedConversationTurn[], participant: string): IChatSessionHistoryItem[] {
	const history: IChatSessionHistoryItem[] = [];
	for (const turn of turns) {
		history.push({
			type: 'request',
			prompt: turn.prompt,
			participant,
			isReadonly: true,
			...(turn.requestId ? { id: turn.requestId } : {}),
		});
		if (turn.response) {
			history.push({
				type: 'response',
				parts: [{ kind: 'markdownContent', content: new MarkdownString(turn.response) }],
				participant,
			});
		}
	}
	return history;
}
