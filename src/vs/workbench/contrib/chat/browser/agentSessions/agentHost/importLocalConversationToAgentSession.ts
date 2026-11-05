/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../../../base/common/uuid.js';
import { encodeBase64, VSBuffer } from '../../../../../../base/common/buffer.js';
import { detectImageMimeType } from '../../../../../../base/common/image.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../base/common/uri.js';
import { basename } from '../../../../../../base/common/resources.js';
import { IRange } from '../../../../../../editor/common/core/range.js';
import { isLocation, type Location } from '../../../../../../editor/common/languages.js';
import { localize } from '../../../../../../nls.js';
import { identityAgentHostResourceUriMapper, type IAgentHostResourceUriMapper } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { MessageAttachmentKind, MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, type ErrorInfo, type MessageAttachment, type ModelSelection, type ResponsePart, type ToolCallCompletedState, type ToolResultContent, type Turn } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IChatToolInvocation, type IChatContentInlineReference, type IChatToolInvocationSerialized } from '../../../common/chatService/chatService.js';
import { isImageVariableEntry, type IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { coerceImageBuffer } from '../../../common/chatImageExtraction.js';
import type { ILanguageModelsService } from '../../../common/languageModels.js';
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
 * textual result output. Failure is inferred from result details or a phase's terminal status.
 *
 * Sub-agent invocations (`toolSpecificData.kind === 'subagent'`) keep their
 * summary inline: the delegated prompt seeds the tool input and the sub-agent's
 * result text seeds the output when the generic result details carry neither.
 * The sub-agent's own turn-by-turn transcript lives in a separate worker chat
 * that has no backend counterpart after import, so only the summary is carried.
 * Phase presentations retain their textual output without a child-chat identity.
 */
function toolCallResponsePart(part: IChatToolInvocation | IChatToolInvocationSerialized): ResponsePart {
	const invocationMessage = stringifyChatMessage(part.invocationMessage);
	const resultDetails = IChatToolInvocation.resultDetails(part);
	const subagentData = part.toolSpecificData?.kind === 'subagent' ? part.toolSpecificData : undefined;
	const phaseStatus = subagentData?.presentation === 'phase' ? subagentData.phaseStatus : undefined;

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
	isError ||= phaseStatus === 'failed' || phaseStatus === 'cancelled';
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
	if (subagentData && subagentData.presentation !== 'phase') {
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
			...(isError ? {
				error: {
					message: outputText || localize('chat.importConversation.toolFailed', "Tool failed."),
					...(phaseStatus === 'cancelled' ? { code: 'cancelled' } : {}),
				}
			} : {}),
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
					const startedAt = part.reasoningStartedAt === undefined ? undefined : new Date(part.reasoningStartedAt);
					responseParts.push({
						kind: ResponsePartKind.Reasoning,
						id: generateUuid(),
						content,
						...(startedAt && Number.isFinite(startedAt.getTime()) ? { startedAt: startedAt.toISOString() } : {}),
						...(part.reasoningDurationMs !== undefined && Number.isFinite(part.reasoningDurationMs) && part.reasoningDurationMs >= 0 ? { duration: part.reasoningDurationMs } : {}),
					});
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
 * Options for {@link importedTurnsFromChatModel}.
 */
export interface IImportedTurnsOptions {
	/** Maps attachment URIs into the target agent host's URI space. Defaults to identity (local host). */
	readonly resourceUris?: IAgentHostResourceUriMapper;
	/** Resolves the language model identifier a request was sent with to the target's model selection. */
	readonly resolveModel?: (languageModelIdentifier: string) => ModelSelection | undefined;
}

/**
 * Resolves a local language model identifier (e.g. `copilot/gpt-5`) to the raw
 * Copilot catalog id that Copilot agent-host sessions use. Models from other
 * vendors are not in that catalog and resolve to `undefined`, so the session's
 * model applies.
 */
export function resolveImportedCopilotModel(languageModelsService: ILanguageModelsService, languageModelIdentifier: string): ModelSelection | undefined {
	const metadata = languageModelsService.lookupLanguageModel(languageModelIdentifier);
	if (metadata) {
		return metadata.vendor === 'copilot' ? { id: metadata.id } : undefined;
	}
	const prefix = 'copilot/';
	return languageModelIdentifier.startsWith(prefix) && languageModelIdentifier.length > prefix.length
		? { id: languageModelIdentifier.substring(prefix.length) }
		: undefined;
}

function toTextRange(range: IRange) {
	return {
		start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
		end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
	};
}

function resourceAttachment(uri: URI, label: string, displayKind: string, resourceUris: IAgentHostResourceUriMapper, location?: Location): MessageAttachment {
	return {
		type: MessageAttachmentKind.Resource,
		uri: resourceUris.toAgentHost(uri).toString(),
		label,
		displayKind,
		...(location ? { selection: { range: toTextRange(location.range) } } : {}),
	};
}

function simpleAttachment(label: string, modelRepresentation: string, displayKind?: string): MessageAttachment {
	return { type: MessageAttachmentKind.Simple, label, modelRepresentation, ...(displayKind ? { displayKind } : {}) };
}

/**
 * Maps a persisted request variable to an agent-host attachment. Covers the
 * context a user attaches (files, selections, folders, symbols, prompt files,
 * images and text); live-only context (browser pages, elements, tool sets)
 * has no meaningful replay and is omitted.
 */
function variableToAttachment(variable: IChatRequestVariableEntry, resourceUris: IAgentHostResourceUriMapper): MessageAttachment | undefined {
	const value = variable.value;
	switch (variable.kind) {
		case 'file':
		case 'implicit':
			if (isLocation(value)) {
				return variable.kind === 'file' || variable.isSelection
					? resourceAttachment(value.uri, variable.name, 'selection', resourceUris, value)
					: resourceAttachment(value.uri, variable.name, 'document', resourceUris);
			}
			return URI.isUri(value) ? resourceAttachment(value, variable.name, 'document', resourceUris) : undefined;
		case 'directory':
			return URI.isUri(value) ? resourceAttachment(value, variable.name, 'directory', resourceUris) : undefined;
		case 'symbol':
			return isLocation(value) ? resourceAttachment(value.uri, variable.name, 'symbol', resourceUris, value) : undefined;
		case 'promptFile':
			return URI.isUri(value) ? resourceAttachment(value, variable.name, 'document', resourceUris) : undefined;
		case 'paste':
			return simpleAttachment(variable.name, variable.code);
		case 'promptText':
		case 'string':
			return typeof value === 'string' ? simpleAttachment(variable.name, value) : undefined;
		case 'workspace':
			return simpleAttachment(variable.name, variable.value, 'workspace');
	}
	if (isImageVariableEntry(variable)) {
		const bytes = coerceImageBuffer(variable.value);
		if (bytes) {
			return {
				type: MessageAttachmentKind.EmbeddedResource,
				label: variable.name,
				displayKind: 'image',
				data: encodeBase64(VSBuffer.wrap(bytes)),
				// The bytes are authoritative: older entries omit `mimeType`, and unresized images keep their original encoding.
				contentType: detectImageMimeType(bytes) ?? variable.mimeType ?? 'image/png',
			};
		}
		const reference = variable.references?.find(r => URI.isUri(r.reference))?.reference;
		return URI.isUri(reference) ? resourceAttachment(reference, variable.name, 'image', resourceUris) : undefined;
	}
	return undefined;
}

function attachmentsFromRequest(request: IChatRequestModel, resourceUris: IAgentHostResourceUriMapper): MessageAttachment[] | undefined {
	const attachments: MessageAttachment[] = [];
	for (const variable of request.variableData?.variables ?? []) {
		try {
			const attachment = variableToAttachment(variable, resourceUris);
			if (attachment) {
				attachments.push(attachment);
			}
		} catch {
			// A resource this host cannot address is left out rather than failing the import.
		}
	}
	return attachments.length ? attachments : undefined;
}

/**
 * Translates a local {@link IChatModel} into agent-host {@link Turn}s suitable
 * for {@link IAgentHostService.createSession}'s `importConversation` option.
 *
 * Each user request becomes a user turn carrying its attachments and the model
 * it was sent with; its response stream is mapped by
 * {@link responsePartsFromRequest} and its end state by
 * {@link turnOutcomeFromRequest}. System-initiated requests (e.g. background
 * terminal-completion notifications that were auto-sent back to the agent) are
 * not real user turns, so their synthetic message is dropped and their response
 * (and end state) is folded into the preceding turn as a continuation.
 */
export function importedTurnsFromChatModel(model: IChatModel, options?: IImportedTurnsOptions): Turn[] {
	const resourceUris = options?.resourceUris ?? identityAgentHostResourceUriMapper;
	const turns: Turn[] = [];
	for (const request of model.getRequests()) {
		const responseParts = responsePartsFromRequest(request);
		const outcome = turnOutcomeFromRequest(request);
		if (outcome.error) {
			responseParts.push({ kind: ResponsePartKind.Error, error: outcome.error });
		}
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
			}
			continue;
		}
		const attachments = attachmentsFromRequest(request, resourceUris);
		const messageModel = request.modelId ? options?.resolveModel?.(request.modelId) : undefined;
		turns.push({
			id: generateUuid(),
			message: {
				text: request.message.text,
				origin: { kind: MessageKind.User },
				...(attachments ? { attachments } : {}),
				...(messageModel ? { model: messageModel } : {}),
			},
			responseParts,
			usage: undefined,
			state: outcome.state,
		} satisfies Turn);
	}
	return turns;
}
