/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionEvent } from '@github/copilot/sdk';
import * as l10n from '@vscode/l10n';
import { ILogger } from '../../../platform/log/common/logService';
import { URI } from '../../../util/vs/base/common/uri';
import { ChatResponseCodeblockUriPart, ChatResponseMarkdownPart, ChatResponsePullRequestPart, ChatResponseTextEditPart, ChatResponseThinkingProgressPart, ChatToolInvocationPart, MarkdownString } from '../../../vscodeTypes';
import type { ExtendedChatResponsePart } from 'vscode';
import { enrichToolInvocationWithSubagentMetadata, getAffectedUrisForEditTool, isCopilotCliEditToolCall, processToolExecutionComplete, processToolExecutionStart, ToolCall } from '../copilotcli/common/copilotCLITools';

/**
 * Map of in-flight tool invocations keyed by `toolCallId`. Populated by
 * `processToolExecutionStart` and drained by `processToolExecutionComplete`.
 */
export type PendingToolInvocations = Map<string, [ChatToolInvocationPart | ChatResponseMarkdownPart | ChatResponseThinkingProgressPart, toolData: ToolCall, parentToolCallId: string | undefined]>;

/**
 * State carried across calls to {@link appendResponsePartsForEvent} for a single
 * response turn. Owners must call {@link flushPendingAssistantMessage} once they
 * are done forwarding events so any trailing streamed text is committed.
 */
export interface ResponseEventRenderContext {
	readonly workingDirectory?: URI;
	readonly logger: ILogger;
	readonly pendingToolInvocations: PendingToolInvocations;
	/** Message ids that have already been streamed via deltas; the final
	 * `assistant.message` for the same id is skipped to avoid duplicate text. */
	readonly processedMessages: Set<string>;
	/** Buffered streamed assistant text; flushed when a non-message/-delta event arrives. */
	readonly currentAssistantMessage: { chunks: string[] };
	readonly currentResponseParts: ExtendedChatResponsePart[];
	/**
	 * Resolves the edit id for a completed tool call so that
	 * `create`/`edit`/`str_replace_editor` results render as inline diffs.
	 * Return `undefined` (or omit) to fall back to the regular tool card.
	 */
	readonly getEditId?: (toolCallId: string) => string | undefined;
}

export function createResponseEventRenderContext(
	logger: ILogger,
	workingDirectory?: URI,
	getEditId?: (toolCallId: string) => string | undefined,
): ResponseEventRenderContext {
	return {
		workingDirectory,
		logger,
		pendingToolInvocations: new Map(),
		processedMessages: new Set(),
		currentAssistantMessage: { chunks: [] },
		currentResponseParts: [],
		getEditId,
	};
}

export function flushPendingAssistantMessage(ctx: ResponseEventRenderContext): void {
	if (ctx.currentAssistantMessage.chunks.length === 0) {
		return;
	}
	const content = ctx.currentAssistantMessage.chunks.join('');
	ctx.currentAssistantMessage.chunks.length = 0;
	appendAssistantMessageContent(ctx, content);
}

function appendAssistantMessageContent(ctx: ResponseEventRenderContext, content: string): void {
	const { cleanedContent, prPart } = extractPRMetadata(content);
	if (prPart) {
		ctx.currentResponseParts.push(prPart);
	}
	if (cleanedContent) {
		ctx.currentResponseParts.push(new ChatResponseMarkdownPart(new MarkdownString(cleanedContent)));
	}
}

/**
 * Extract PR metadata from assistant message content.
 */
function extractPRMetadata(content: string): { cleanedContent: string; prPart?: ChatResponsePullRequestPart } {
	const prMetadataRegex = /<pr_metadata\s+uri="(?<uri>[^"]+)"\s+title="(?<title>[^"]+)"\s+description="(?<description>[^"]+)"\s+author="(?<author>[^"]+)"\s+linkTag="(?<linkTag>[^"]+)"\s*\/?>/;
	const match = content.match(prMetadataRegex);

	if (match?.groups) {
		const { title, description, author, linkTag } = match.groups;
		const unescapeXml = (text: string) => text
			.replace(/&apos;/g, `'`)
			.replace(/&quot;/g, '"')
			.replace(/&gt;/g, '>')
			.replace(/&lt;/g, '<')
			.replace(/&amp;/g, '&');

		const prPart = new ChatResponsePullRequestPart(
			{ command: 'github.copilot.chat.openPullRequestReroute', title: l10n.t('View Pull Request {0}', linkTag), arguments: [Number(linkTag.substring(1))] },
			unescapeXml(title),
			unescapeXml(description),
			unescapeXml(author),
			unescapeXml(linkTag)
		);

		const cleanedContent = content.replace(match[0], '').trim();
		return { cleanedContent, prPart };
	}

	return { cleanedContent: content };
}

/**
 * Drive one session event into chat response parts. Returns `true` when the event
 * was recognised as a response-level event (assistant text/deltas, tool calls,
 * subagent enrichment, errors, abort); returns `false` for lifecycle events
 * (e.g. `user.message`, `session.start`, `assistant.usage`) that callers handle
 * themselves to manage turn boundaries.
 *
 * Callers driving CMC Task API events (`custom_agent.*`) should remap them to
 * the equivalent `subagent.*` SDK types before invoking — both follow the same
 * CMC OpenAPI schema, only the event-type names differ.
 */
export function appendResponsePartsForEvent(event: SessionEvent, ctx: ResponseEventRenderContext): boolean {
	if (event.type !== 'assistant.message') {
		flushPendingAssistantMessage(ctx);
	}

	switch (event.type) {
		case 'session.error': {
			ctx.currentResponseParts.push(new ChatResponseMarkdownPart(`\n\n❌ Error: (${event.data.errorType}) ${event.data.message}`));
			return true;
		}
		case 'assistant.message_delta': {
			if (typeof event.data.deltaContent === 'string' && !event.data.parentToolCallId) {
				ctx.processedMessages.add(event.data.messageId);
				ctx.currentAssistantMessage.chunks.push(event.data.deltaContent);
			}
			return true;
		}
		case 'assistant.message': {
			if (event.data.content && !ctx.processedMessages.has(event.data.messageId) && !event.data.parentToolCallId) {
				appendAssistantMessageContent(ctx, event.data.content);
			}
			return true;
		}
		case 'tool.execution_start': {
			const part = processToolExecutionStart(event, ctx.pendingToolInvocations, ctx.workingDirectory);
			if (part instanceof ChatResponseThinkingProgressPart) {
				ctx.currentResponseParts.push(part);
			}
			return true;
		}
		case 'subagent.started': {
			enrichToolInvocationWithSubagentMetadata(
				event.data.toolCallId,
				event.data.agentDisplayName,
				event.data.agentDescription,
				ctx.pendingToolInvocations,
			);
			return true;
		}
		case 'subagent.completed':
		case 'subagent.failed':
			// Completion is already handled by `tool.execution_complete` for the task tool.
			return true;
		case 'tool.execution_complete': {
			const [part, toolCall] = processToolExecutionComplete(event, ctx.pendingToolInvocations, ctx.logger, ctx.workingDirectory) ?? [undefined, undefined];
			if (!part || !toolCall || part instanceof ChatResponseThinkingProgressPart) {
				return true;
			}
			const editId = ctx.getEditId?.(toolCall.toolCallId);
			const editedUris = getAffectedUrisForEditTool(toolCall);
			if (!(part instanceof ChatResponseMarkdownPart) && isCopilotCliEditToolCall(toolCall) && editId && editedUris.length > 0) {
				part.presentation = 'hidden';
				ctx.currentResponseParts.push(part);
				for (const uri of editedUris) {
					ctx.currentResponseParts.push(new ChatResponseMarkdownPart('\n````\n'));
					ctx.currentResponseParts.push(new ChatResponseCodeblockUriPart(uri, true, editId));
					ctx.currentResponseParts.push(new ChatResponseTextEditPart(uri, []));
					ctx.currentResponseParts.push(new ChatResponseTextEditPart(uri, true));
					ctx.currentResponseParts.push(new ChatResponseMarkdownPart('\n````\n'));
				}
			} else {
				ctx.currentResponseParts.push(part);
			}
			return true;
		}
		case 'abort': {
			ctx.currentResponseParts.push(new ChatResponseMarkdownPart(new MarkdownString(`_Aborted: ${event.data.reason}_`)));
			return true;
		}
	}
	return false;
}
