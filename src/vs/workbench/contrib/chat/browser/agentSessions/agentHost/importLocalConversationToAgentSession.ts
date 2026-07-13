/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../../../base/common/uuid.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../base/common/uri.js';
import { basename } from '../../../../../../base/common/resources.js';
import { localize } from '../../../../../../nls.js';
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, type ErrorInfo, type ResponsePart, type ToolCallCompletedState, type ToolResultContent, type Turn } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IChatToolInvocation, type IChatContentInlineReference, type IChatToolInvocationSerialized } from '../../../common/chatService/chatService.js';
import type { IChatModel, IChatRequestModel } from '../../../common/model/chatModel.js';
import { isToolResultInputOutputDetails } from '../../../common/tools/languageModelToolsService.js';

/** Renders a chat message (plain string or markdown) as plain text. */
function stringifyChatMessage(message: string | IMarkdownString | undefined): string {
	if (message === undefined) {
		return '';
	}
	return typeof message === 'string' ? message : message.value;
}

/** Serializes a tool's raw input to a JSON string, tolerating non-serializable values. */
function stringifyToolInput(rawInput: unknown): string {
	if (typeof rawInput === 'string') {
		return rawInput;
	}
	try {
		return JSON.stringify(rawInput) ?? '';
	} catch {
		return '';
	}
}

/**
 * Renders an inline reference (a file/symbol chip interleaved with the response
 * text) as a markdown link so it survives migration instead of leaving a gap
 * where the chip used to be. Falls back to plain label text when no URI is
 * available.
 *
 * The source chip shows a short label — a file's basename or a symbol's name —
 * never a workspace-relative path. Some inline references carry that path in
 * their `name`, so a path-like label is collapsed to the URI's basename to
 * avoid leaking the tree into the imported transcript.
 */
function inlineReferenceToMarkdown(reference: IChatContentInlineReference['inlineReference'], name: string | undefined): string {
	let uri: URI | undefined;
	let label = name;
	let isSymbol = false;
	if (URI.isUri(reference)) {
		uri = reference;
	} else {
		// `Location` carries the URI directly; `IWorkspaceSymbol` nests it under
		// `location` and supplies its own display name.
		const location = reference as { uri?: URI; location?: { uri?: URI }; name?: string };
		if (URI.isUri(location.uri)) {
			uri = location.uri;
		} else if (URI.isUri(location.location?.uri)) {
			uri = location.location.uri;
			label = label ?? location.name;
			isSymbol = true;
		}
	}
	if (!uri) {
		return label ?? '';
	}
	// A file reference with a missing or path-like label (some carry the
	// workspace-relative path as their name) collapses to the basename, matching
	// the source chip. A symbol's name is preserved verbatim — it may legitimately
	// contain a separator (e.g. C++ `operator/`) and must not be treated as a path.
	if (!label || (!isSymbol && /[\\/]/.test(label))) {
		label = basename(uri);
	}
	return `[${label}](${uri.toString()})`;
}

/**
 * Maps a local chat tool invocation (live or serialized) to a completed
 * agent-host tool call, carrying its name, invocation messages, raw input and
 * textual result output. Failure is inferred from the result's `isError` flag.
 *
 * Sub-agent invocations (`toolSpecificData.kind === 'subagent'`) keep their
 * summary inline: the delegated prompt seeds the tool input and the sub-agent's
 * result text seeds the output when the generic result details carry neither.
 * The sub-agent's own turn-by-turn transcript lives in a separate worker chat
 * that has no backend counterpart after import, so only the summary is carried.
 */
function toolCallResponsePart(part: IChatToolInvocation | IChatToolInvocationSerialized): ResponsePart {
	const invocationMessage = stringifyChatMessage(part.invocationMessage);
	const resultDetails = IChatToolInvocation.resultDetails(part);
	const subagentData = part.toolSpecificData?.kind === 'subagent' ? part.toolSpecificData : undefined;

	let outputText = '';
	let isError = false;
	let resultInput: string | undefined;
	if (resultDetails && isToolResultInputOutputDetails(resultDetails)) {
		if (Array.isArray(resultDetails.output)) {
			for (const item of resultDetails.output) {
				if (item.type === 'embed' && item.isText) {
					outputText += item.value;
				}
			}
		}
		isError = !!resultDetails.isError;
		resultInput = resultDetails.input;
	}
	// Fall back to the sub-agent summary when the generic result details are empty.
	if (!outputText && subagentData?.result) {
		outputText = subagentData.result;
	}

	const toolInput = part.toolSpecificData?.kind === 'input'
		? stringifyToolInput(part.toolSpecificData.rawInput)
		: (resultInput ?? subagentData?.prompt ?? '');
	const toolCallId = part.toolCallId || generateUuid();
	const content: ToolResultContent[] = [];
	if (outputText) {
		content.push({ type: ToolResultContentType.Text, text: outputText });
	}
	if (subagentData) {
		// Preserve the sub-agent identity as structured content so it renders as a
		// sub-agent tool call (matching native sessions) and survives the events
		// round-trip — `buildSessionEventsFromTurns` emits a matching
		// `subagent.started` so a reload reconstructs the same name/description.
		content.push({
			type: ToolResultContentType.Subagent,
			resource: subagentData.chatResource ?? `agent-host-subagent:/${toolCallId}`,
			title: subagentData.agentName ?? localize('chat.importConversation.subagent', "Subagent"),
			...(subagentData.agentName ? { agentName: subagentData.agentName } : {}),
			...(subagentData.description ? { description: subagentData.description } : {}),
		});
	}
	const displayName = subagentData?.agentName || part.toolId;

	return {
		kind: ResponsePartKind.ToolCall,
		toolCall: {
			status: ToolCallStatus.Completed,
			toolCallId,
			toolName: part.toolId,
			displayName,
			invocationMessage: invocationMessage || stringifyChatMessage(subagentData?.description),
			toolInput,
			success: !isError,
			pastTenseMessage: stringifyChatMessage(part.pastTenseMessage) || invocationMessage,
			confirmed: ToolCallConfirmationReason.NotNeeded,
			...(content.length ? { content } : {}),
			...(isError ? { error: { message: outputText || localize('chat.importConversation.toolFailed', "Tool failed.") } } : {}),
		} satisfies ToolCallCompletedState,
	};
}

/**
 * Collects a request's response stream into agent-host {@link ResponsePart}s:
 * markdown parts become {@link ResponsePartKind.Markdown}, reasoning parts
 * become {@link ResponsePartKind.Reasoning}, and tool invocations become
 * completed {@link ResponsePartKind.ToolCall} parts, all in stream order. Other
 * progress kinds are skipped.
 */
function responsePartsFromRequest(request: IChatRequestModel): ResponsePart[] {
	const responseParts: ResponsePart[] = [];
	const response = request.response;
	if (response) {
		for (const part of response.entireResponse.value) {
			if (part.kind === 'markdownContent') {
				const content = part.content.value;
				if (content) {
					responseParts.push({ kind: ResponsePartKind.Markdown, id: generateUuid(), content });
				}
			} else if (part.kind === 'thinking') {
				const content = Array.isArray(part.value) ? part.value.join('') : (part.value ?? '');
				if (content) {
					responseParts.push({ kind: ResponsePartKind.Reasoning, id: generateUuid(), content });
				}
			} else if (part.kind === 'inlineReference') {
				// A file/symbol chip interleaved with the response text; render it
				// as a markdown link so it survives instead of leaving a gap.
				const content = inlineReferenceToMarkdown(part.inlineReference, part.name);
				if (content) {
					responseParts.push({ kind: ResponsePartKind.Markdown, id: generateUuid(), content });
				}
			} else if (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') {
				responseParts.push(toolCallResponsePart(part));
			}
			// Other progress kinds are not yet imported.
		}
	}
	return responseParts;
}

/**
 * Derives how a turn ended from its source response: a cancelled response maps
 * to {@link TurnState.Cancelled}, a response carrying error details maps to
 * {@link TurnState.Error} (with the message/code surfaced as {@link ErrorInfo}),
 * and anything else is {@link TurnState.Complete}.
 */
function turnOutcomeFromRequest(request: IChatRequestModel): { state: TurnState; error?: ErrorInfo } {
	const response = request.response;
	if (!response) {
		return { state: TurnState.Complete };
	}
	if (response.isCanceled) {
		return { state: TurnState.Cancelled };
	}
	const errorDetails = response.result?.errorDetails;
	if (errorDetails) {
		return {
			state: TurnState.Error,
			error: { errorType: errorDetails.code ?? 'error', message: errorDetails.message },
		};
	}
	return { state: TurnState.Complete };
}

/**
 * Translates a local {@link IChatModel} into agent-host {@link Turn}s suitable
 * for {@link IAgentHostService.createSession}'s `importConversation` option.
 *
 * Each user request becomes a user turn whose response stream is mapped by
 * {@link responsePartsFromRequest} and whose end state is mapped by
 * {@link turnOutcomeFromRequest}. System-initiated requests (e.g. background
 * terminal-completion notifications that were auto-sent back to the agent) are
 * not real user turns, so their synthetic message is dropped and their response
 * (and end state) is folded into the preceding turn as a continuation.
 */
export function importedTurnsFromChatModel(model: IChatModel): Turn[] {
	const turns: Turn[] = [];
	for (const request of model.getRequests()) {
		const responseParts = responsePartsFromRequest(request);
		const outcome = turnOutcomeFromRequest(request);
		if (request.isSystemInitiated) {
			// Not a genuine user message; append its output to the previous
			// turn so the agent's continued work is preserved without surfacing
			// the injected notification as an editable user turn. The
			// continuation is what actually ended the exchange, so its outcome
			// supersedes the previous turn's.
			const previous = turns[turns.length - 1];
			if (previous) {
				previous.responseParts.push(...responseParts);
				previous.state = outcome.state;
				previous.error = outcome.error;
			}
			continue;
		}
		turns.push({
			id: generateUuid(),
			message: { text: request.message.text, origin: { kind: MessageKind.User } },
			responseParts,
			usage: undefined,
			state: outcome.state,
			...(outcome.error ? { error: outcome.error } : {}),
		} satisfies Turn);
	}
	return turns;
}

