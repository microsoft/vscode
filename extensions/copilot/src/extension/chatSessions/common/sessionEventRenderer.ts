/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionEvent, ToolExecutionCompleteEvent, ToolExecutionStartEvent } from '@github/copilot/sdk';
import * as l10n from '@vscode/l10n';
import { ILogger } from '../../../platform/log/common/logService';
import { URI } from '../../../util/vs/base/common/uri';
import { ChatResponseCodeblockUriPart, ChatResponseMarkdownPart, ChatResponsePullRequestPart, ChatResponseTextEditPart, ChatResponseThinkingProgressPart, ChatToolInvocationPart, MarkdownString } from '../../../vscodeTypes';
import type { ExtendedChatResponsePart } from 'vscode';

/**
 * A tool invocation entry tracked between `tool.execution_start` and
 * `tool.execution_complete`. The exact shape of the second element (the
 * provider-specific `ToolCall`) is opaque to the renderer; it is forwarded
 * verbatim to the injected handlers.
 */
export type PendingToolInvocation<TToolCall> = [
	ChatToolInvocationPart | ChatResponseMarkdownPart | ChatResponseThinkingProgressPart,
	toolData: TToolCall,
	parentToolCallId: string | undefined,
];

/**
 * Provider-specific hooks that turn raw tool events into chat parts. The
 * renderer owns event dispatch and ordering; the handlers own per-tool
 * formatting. The handlers receive the renderer's pending-tool map so that
 * `tool.execution_start` can register an entry and `tool.execution_complete`
 * can finalize it.
 */
export interface ToolEventHandlers<TToolCall> {
	processStart: (
		event: ToolExecutionStartEvent,
		pending: Map<string, PendingToolInvocation<TToolCall>>,
		workingDirectory?: URI,
	) => ChatToolInvocationPart | ChatResponseMarkdownPart | ChatResponseThinkingProgressPart | undefined;
	processComplete: (
		event: ToolExecutionCompleteEvent,
		pending: Map<string, PendingToolInvocation<TToolCall>>,
		logger: ILogger,
		workingDirectory?: URI,
	) => PendingToolInvocation<TToolCall> | undefined;
	enrichSubagent: (
		toolCallId: string,
		agentDisplayName: string,
		agentDescription: string | undefined,
		pending: Map<string, PendingToolInvocation<TToolCall>>,
	) => void;
	isEditToolCall: (toolCall: TToolCall) => boolean;
	getEditedUris: (toolCall: TToolCall) => readonly URI[];
}

/**
 * State carried across calls to {@link appendResponsePartsForEvent} for a single
 * response turn. Owners must call {@link flushPendingAssistantMessage} once they
 * are done forwarding events so any trailing streamed text is committed.
 */
export interface ResponseEventRenderContext<TToolCall = unknown> {
	readonly workingDirectory?: URI;
	readonly logger: ILogger;
	readonly handlers: ToolEventHandlers<TToolCall>;
	readonly pendingToolInvocations: Map<string, PendingToolInvocation<TToolCall>>;
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

export function createResponseEventRenderContext<TToolCall>(
	logger: ILogger,
	handlers: ToolEventHandlers<TToolCall>,
	workingDirectory?: URI,
	getEditId?: (toolCallId: string) => string | undefined,
): ResponseEventRenderContext<TToolCall> {
	return {
		workingDirectory,
		logger,
		handlers,
		pendingToolInvocations: new Map(),
		processedMessages: new Set(),
		currentAssistantMessage: { chunks: [] },
		currentResponseParts: [],
		getEditId,
	};
}

/**
 * Subset of {@link ResponseEventRenderContext} that does not reference the
 * provider-specific tool-call shape. The internal text-buffering helpers
 * operate on this view so they don't need to be generic over `TToolCall`.
 */
interface AssistantMessageBufferCtx {
	readonly currentAssistantMessage: { chunks: string[] };
	readonly currentResponseParts: ExtendedChatResponsePart[];
}

export function flushPendingAssistantMessage(ctx: AssistantMessageBufferCtx): void {
	if (ctx.currentAssistantMessage.chunks.length === 0) {
		return;
	}
	const content = ctx.currentAssistantMessage.chunks.join('');
	ctx.currentAssistantMessage.chunks.length = 0;
	appendAssistantMessageContent(ctx, content);
}

function appendAssistantMessageContent(ctx: AssistantMessageBufferCtx, content: string): void {
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
export function appendResponsePartsForEvent<TToolCall>(event: SessionEvent, ctx: ResponseEventRenderContext<TToolCall>): boolean {
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
			const part = ctx.handlers.processStart(event, ctx.pendingToolInvocations, ctx.workingDirectory);
			if (part instanceof ChatResponseThinkingProgressPart) {
				ctx.currentResponseParts.push(part);
			}
			return true;
		}
		case 'subagent.started': {
			ctx.handlers.enrichSubagent(
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
			const [part, toolCall] = ctx.handlers.processComplete(event, ctx.pendingToolInvocations, ctx.logger, ctx.workingDirectory) ?? [undefined, undefined];
			if (!part || !toolCall || part instanceof ChatResponseThinkingProgressPart) {
				return true;
			}
			const editId = ctx.getEditId?.(event.data.toolCallId);
			const editedUris = ctx.handlers.getEditedUris(toolCall);
			if (!(part instanceof ChatResponseMarkdownPart) && ctx.handlers.isEditToolCall(toolCall) && editId && editedUris.length > 0) {
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
