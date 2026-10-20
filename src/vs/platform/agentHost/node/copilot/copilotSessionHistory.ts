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
import { ResponsePartKind, ToolCallStatus, ToolResultContentType, type ToolResultTerminalContent, type Turn } from '../../common/state/sessionState.js';
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

/** Reattaches retained shell output to the exact restored chat, including history read without a live runtime. */
export async function restoreStoredShellOutputsForChat(turns: readonly Turn[], storage: URI, session: URI, chat: URI, db: ISessionDatabase): Promise<void> {
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
			if (await db.getTerminalOutputSize(part.toolCall.toolCallId) === undefined) {
				continue;
			}
			const text = part.toolCall.content?.find(content => content.type === ToolResultContentType.Text)?.text;
			const terminalContent: ToolResultTerminalContent = {
				type: ToolResultContentType.Terminal,
				title: part.toolCall.displayName,
				isPty: false,
				result: parseSpilledShellCompletion(text) ?? { truncated: true, preview: '' },
				...terminal,
				resource: buildNonPtyShellTerminalUri(storage, session, chat, part.toolCall.toolCallId),
			};
			part.toolCall.content = [...(part.toolCall.content ?? []).filter(content => content.type !== ToolResultContentType.Terminal), terminalContent];
		}
	}
}
