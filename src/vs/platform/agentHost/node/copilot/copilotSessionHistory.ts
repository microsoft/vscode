/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, SessionEvent } from '@github/copilot-sdk';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { buildNonPtyShellTerminalUri } from '../../common/nonPtyShellTerminalUri.js';
import type { ISessionDatabase } from '../../common/sessionDataService.js';
import { ResponsePartKind, ToolCallStatus, ToolResultContentType, type ToolCallCompletedState, type ToolResultTerminalContent, type Turn } from '../../common/state/sessionState.js';
import { parseSpilledShellCompletion } from './copilotNonPtyShellTerminals.js';
import { isShellTool } from './copilotToolDisplay.js';

/** Reads a complete backward-paged snapshot from either the live or persisted SDK event log. */
export async function readCopilotSessionEvents(readPage: (cursor: string | undefined) => ReturnType<CopilotClient['rpc']['sessions']['readPersistedEvents']>, token: CancellationToken): Promise<SessionEvent[]> {
	const pages: SessionEvent[][] = [];
	const seenCursors = new Set<string>();
	let cursor: string | undefined;
	while (true) {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const page = await readPage(cursor);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (page.cursorStatus !== 'ok') {
			throw new Error(localize('copilot.historyChanged', "Session history changed while it was loading. Reopen the session to try again."));
		}
		if (page.hasMore && (!page.cursor || seenCursors.has(page.cursor))) {
			throw new Error(localize('copilot.invalidHistoryCursor', "The Copilot runtime returned an invalid history cursor. Reopen the session to try again."));
		}
		pages.push(page.events.filter(event => event.type !== 'system.message').map(event => {
			if (event.type !== 'assistant.message') {
				return event;
			}
			const data = { ...event.data };
			delete data.encryptedContent;
			delete data.reasoningOpaque;
			delete data.reasoningBlocks;
			return { ...event, data };
		}));
		if (!page.hasMore) {
			break;
		}
		seenCursors.add(page.cursor);
		cursor = page.cursor;
	}
	return pages.reverse().flat();
}

/** The restored turns of one chat, either the parent chat or one of its subagent chats. */
export interface IRestoredChatTurns {
	readonly turns: readonly Turn[];
	/** The chat that owns the turns, used to address each terminal resource. */
	readonly chat: URI;
}

/** A restored non-PTY shell call whose full output may be stored in the session database. */
interface IStoredShellOutputCandidate {
	readonly toolCall: ToolCallCompletedState;
	readonly terminal: ToolResultTerminalContent | undefined;
	/** The chat that owns the tool call, used to address its terminal resource. */
	readonly chat: URI;
}

/** Reattaches retained shell output to the exact restored chats, including history read without a live runtime. */
export async function restoreStoredShellOutputs(chats: readonly IRestoredChatTurns[], storage: URI, session: URI, db: ISessionDatabase): Promise<void> {
	const candidates: IStoredShellOutputCandidate[] = [];
	for (const { turns, chat } of chats) {
		collectStoredShellOutputCandidates(turns, chat, candidates);
	}
	if (candidates.length === 0) {
		return;
	}
	// Look up every candidate at once; long sessions have thousands of shell calls.
	const storedSizes = await db.getTerminalOutputSizes(candidates.map(({ toolCall }) => toolCall.toolCallId));
	for (const { toolCall, terminal, chat } of candidates) {
		if (!storedSizes.has(toolCall.toolCallId)) {
			continue;
		}
		const text = toolCall.content?.find(content => content.type === ToolResultContentType.Text)?.text;
		const terminalContent: ToolResultTerminalContent = {
			type: ToolResultContentType.Terminal,
			title: toolCall.displayName,
			isPty: false,
			result: parseSpilledShellCompletion(text) ?? { truncated: true, preview: '' },
			...terminal,
			resource: buildNonPtyShellTerminalUri(storage, session, chat, toolCall.toolCallId),
		};
		toolCall.content = [...(toolCall.content ?? []).filter(content => content.type !== ToolResultContentType.Terminal), terminalContent];
	}
}

function collectStoredShellOutputCandidates(turns: readonly Turn[], chat: URI, candidates: IStoredShellOutputCandidate[]): void {
	for (const turn of turns) {
		for (const part of turn.responseParts) {
			if (part.kind !== ResponsePartKind.ToolCall
				|| part.toolCall.status !== ToolCallStatus.Completed
				|| !isShellTool(part.toolCall.toolName)) {
				continue;
			}
			const terminal = part.toolCall.content?.find((content): content is ToolResultTerminalContent => content.type === ToolResultContentType.Terminal);
			if (terminal && terminal.isPty !== false) {
				continue;
			}
			candidates.push({ toolCall: part.toolCall, terminal, chat });
		}
	}
}
