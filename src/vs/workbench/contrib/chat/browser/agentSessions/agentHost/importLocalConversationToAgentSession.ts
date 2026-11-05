/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../../../base/common/uuid.js';
import { encodeBase64, VSBuffer } from '../../../../../../base/common/buffer.js';
import { detectImageMimeType } from '../../../../../../base/common/image.js';
import { escapeMarkdownLinkLabel, escapeMarkdownSyntaxTokens, IMarkdownString, resolveWithBaseUri } from '../../../../../../base/common/htmlContent.js';
import { renderAsPlaintext } from '../../../../../../base/browser/markdownRenderer.js';
import { rewriteMarkdownLinks } from '../../../../../../base/common/markdownLinks.js';
import { Mimes } from '../../../../../../base/common/mime.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { basename } from '../../../../../../base/common/resources.js';
import { ResourceMap, ResourceSet } from '../../../../../../base/common/map.js';
import { IRange } from '../../../../../../editor/common/core/range.js';
import { isLocation, type Location } from '../../../../../../editor/common/languages.js';
import { localize } from '../../../../../../nls.js';
import { identityAgentHostResourceUriMapper, type IAgentHostResourceUriMapper } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { MessageAttachmentKind, MessageKind, readUsageInfoMeta, ResponsePartKind, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, type AgentSelection, type ErrorInfo, type ITurnTokenTotal, type MessageAttachment, type ModelSelection, type ResponsePart, type StringOrMarkdown, type ToolCallCancelledState, type ToolCallCompletedState, type ToolResultContent, type Turn, type UsageInfo } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ElicitationState, IChatToolInvocation, ToolConfirmKind, type IChatCodeCitation, type IChatConfirmation, type IChatContentInlineReference, type IChatContentReference, type IChatElicitationRequest, type IChatElicitationRequestSerialized, type IChatQuestion, type IChatQuestionAnswerValue, type IChatQuestionCarousel, type IChatToolInvocationSerialized, type IToolResultOutputDetailsSerialized, type ToolDeniedReason } from '../../../common/chatService/chatService.js';
import { isImageVariableEntry, type IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { coerceImageBuffer } from '../../../common/chatImageExtraction.js';
import { LanguageModelPartAudience, type ILanguageModelsService } from '../../../common/languageModels.js';
import { getDisplayedQuestionText } from '../../../common/chatService/chatQuestionCarouselHelpers.js';
import { getCodeCitationsMessage, type IChatModel, type IChatRequestModel } from '../../../common/model/chatModel.js';
import { isToolResultInputOutputDetails, isToolResultOutputDetails, type IToolResultOutputDetails, type ToolInputOutputEmbedded, type ToolInputOutputReference } from '../../../common/tools/languageModelToolsService.js';

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
function inlineReferenceToMarkdown(reference: IChatContentInlineReference['inlineReference'], name: string | undefined, resourceUris: IAgentHostResourceUriMapper): string {
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
	return markdownResourceLink(label, uri, resourceUris);
}

/**
 * Link schemes that address the web rather than a resource, so they are
 * written as-is instead of being mapped to the host.
 */
const externalLinkSchemes: ReadonlySet<string> = new Set([Schemas.http, Schemas.https, Schemas.mailto]);

/** Maps a client resource to the host's, leaving web links and unmappable resources as they are. */
function toHostResource(uri: URI, resourceUris: IAgentHostResourceUriMapper): URI {
	if (externalLinkSchemes.has(uri.scheme)) {
		return uri;
	}
	try {
		return resourceUris.toAgentHost(uri);
	} catch {
		return uri;
	}
}

/**
 * Renders a link to a client resource for an imported turn. The label is
 * escaped so names containing `]` or `\` keep the link intact, and the target
 * is written as the host's resource, which is how link targets in agent-host
 * history are read back (e.g. a `vscode-remote:` resource becomes the host's
 * `file:` resource).
 */
function markdownResourceLink(label: string, uri: URI, resourceUris: IAgentHostResourceUriMapper): string {
	return `[${escapeMarkdownLinkLabel(label)}](${toHostResource(uri, resourceUris).toString()})`;
}

/**
 * Sets imported text apart as its own paragraph. Adjacent markdown parts are
 * concatenated when the history is written, so text added by the import
 * could otherwise join the end of surrounding text, such as a closing code fence.
 */
function markdownParagraph(text: string): string {
	return `\n\n${text}\n\n`;
}

/**
 * Rewrites the link targets in Local markdown to the host's resources, as
 * agent-host history expects. The imported markdown keeps no base URI, so
 * relative targets are first resolved against the source's.
 */
function toHostMarkdown(markdown: string, resourceUris: IAgentHostResourceUriMapper, baseUri?: URI): string {
	return rewriteMarkdownLinks(markdown, {
		rewriteLink: token => {
			const href = baseUri && !token.href.startsWith('#') ? resolveWithBaseUri(baseUri, token.href) : token.href;
			let uri: URI;
			try {
				uri = URI.parse(href, true);
			} catch {
				return undefined;
			}
			if (!uri.scheme) {
				return undefined;
			}
			const target = toHostResource(uri, resourceUris).toString();
			return target === token.href ? undefined : `${token.type === 'image' ? '!' : ''}[${token.text}](${target})`;
		},
	});
}

/** Converts Local markdown to the host's, see {@link toHostMarkdown}. */
function toHostMarkdownString(markdown: IMarkdownString, resourceUris: IAgentHostResourceUriMapper): string {
	return toHostMarkdown(markdown.value, resourceUris, markdown.baseUri ? URI.revive(markdown.baseUri) : undefined);
}

/** Converts a Local tool message, keeping markdown (with its links mapped to the host) as markdown. */
function toolMessage(message: string | IMarkdownString | undefined, resourceUris: IAgentHostResourceUriMapper): StringOrMarkdown | undefined {
	if (message === undefined || typeof message === 'string') {
		return message || undefined;
	}
	return message.value ? { markdown: toHostMarkdownString(message, resourceUris) } : undefined;
}

/**
 * Converts a Local tool result item that is not text: embedded data (e.g. an
 * image) is carried inline, and a referenced file as a reference to the
 * host's file. Two kinds are left out:
 * - Output meant only for the user, which Local never gave the model: every
 *   tool output imported becomes part of the history the agent continues from.
 * - References the host cannot read, such as Local's references to MCP
 *   resources (`mcp-resource:`), which only Local's own MCP connection serves.
 */
function toolOutputContent(item: ToolInputOutputEmbedded | ToolInputOutputReference, resourceUris: IAgentHostResourceUriMapper): ToolResultContent | undefined {
	if (item.audience && !item.audience.includes(LanguageModelPartAudience.Assistant)) {
		return undefined;
	}
	if (item.type === 'embed') {
		return item.value ? { type: ToolResultContentType.EmbeddedResource, data: item.value, contentType: item.mimeType ?? Mimes.binary } : undefined;
	}
	const uri = URI.isUri(item.uri) ? item.uri : URI.revive(item.uri);
	const target = uri && toHostResource(uri, resourceUris);
	return target?.scheme === Schemas.file ? { type: ToolResultContentType.Resource, uri: target.toString(), ...(item.mimeType ? { contentType: item.mimeType } : {}) } : undefined;
}

/** Converts a Local tool result that is a single data item, live (bytes) or saved (base64). */
function toolDataOutputContent(details: IToolResultOutputDetails | IToolResultOutputDetailsSerialized): ToolResultContent | undefined {
	const data = hasKey(details.output, { base64Data: true }) ? details.output.base64Data : encodeBase64(details.output.value);
	return data ? { type: ToolResultContentType.EmbeddedResource, data, contentType: details.output.mimeType } : undefined;
}

/**
 * Says who denied or skipped a tool call, when Local recorded it. Without a
 * recorded source no one is named.
 */
function toolCallCancellationMessage(reason: ToolDeniedReason): string | undefined {
	const denied = reason.type === ToolConfirmKind.Denied;
	switch (reason.source) {
		case 'user':
			return denied ? localize('chat.importConversation.deniedByUser', "Denied by the user.") : localize('chat.importConversation.skippedByUser', "Skipped by the user.");
		case 'hook':
			return denied ? localize('chat.importConversation.deniedByHook', "Denied by a hook.") : localize('chat.importConversation.skippedByHook', "Skipped by a hook.");
		case 'riskAssessment':
			return denied ? localize('chat.importConversation.deniedByRiskAssessment', "Denied by a risk assessment.") : localize('chat.importConversation.skippedByRiskAssessment', "Skipped by a risk assessment.");
		default:
			return undefined;
	}
}

/**
 * How a Local tool call was let run, or why it was cancelled. Chats saved
 * before the reason was recorded only kept whether the call was confirmed; a
 * call with no record at all is treated as not needing confirmation.
 *
 * Local records a call denied or skipped before it ran the same way as one
 * whose result was rejected after it ran (and saves one still awaiting result
 * approval as skipped), so neither is mapped to a rejected result: the
 * cancellation is kept without claiming whether the call ran.
 */
function toolCallConfirmation(part: IChatToolInvocation | IChatToolInvocationSerialized): { readonly confirmed: ToolCallConfirmationReason; readonly cancelled?: undefined } | { readonly cancelled: ToolCallCancellationReason; readonly reasonMessage: string | undefined } {
	const reason = part.kind === 'toolInvocationSerialized' && part.isConfirmed === undefined
		? undefined
		: IChatToolInvocation.executionConfirmedOrDenied(part);
	switch (reason?.type) {
		case ToolConfirmKind.Denied:
			return { cancelled: ToolCallCancellationReason.Denied, reasonMessage: toolCallCancellationMessage(reason) };
		case ToolConfirmKind.Skipped:
			return { cancelled: ToolCallCancellationReason.Skipped, reasonMessage: toolCallCancellationMessage(reason) };
		case ToolConfirmKind.UserAction:
			return { confirmed: ToolCallConfirmationReason.UserAction };
		case ToolConfirmKind.Setting:
		case ToolConfirmKind.LmServicePerTool:
			return { confirmed: ToolCallConfirmationReason.Setting };
		default:
			return { confirmed: ToolCallConfirmationReason.NotNeeded };
	}
}

/**
 * Maps a local chat tool invocation (live or serialized) to an agent-host
 * tool call, carrying its name, invocation messages, raw input, result output
 * and how it was confirmed. A call that was denied or skipped becomes a
 * cancelled call. Failure is inferred from result details or a
 * phase's terminal status.
 *
 * Sub-agent invocations (`toolSpecificData.kind === 'subagent'`) keep their
 * summary inline: the delegated prompt seeds the tool input and the sub-agent's
 * result text seeds the output when the generic result details carry neither.
 * The sub-agent's own turn-by-turn transcript lives in a separate worker chat
 * that has no backend counterpart after import, so only the summary is carried.
 * Phase presentations retain their textual output without a child-chat identity.
 */
function toolCallResponsePart(part: IChatToolInvocation | IChatToolInvocationSerialized, resourceUris: IAgentHostResourceUriMapper, stats: IImportedConversationStats | undefined): ResponsePart {
	const invocationMessage = toolMessage(part.invocationMessage, resourceUris);
	const resultDetails = IChatToolInvocation.resultDetails(part);
	const subagentData = part.toolSpecificData?.kind === 'subagent' ? part.toolSpecificData : undefined;
	const phaseStatus = subagentData?.presentation === 'phase' ? subagentData.phaseStatus : undefined;

	let outputText = '';
	const outputContent: ToolResultContent[] = [];
	let isError = false;
	let resultInput: string | undefined;
	if (resultDetails && isToolResultInputOutputDetails(resultDetails)) {
		if (Array.isArray(resultDetails.output)) {
			for (const item of resultDetails.output) {
				if (item.type === 'embed' && item.isText) {
					outputText += item.value;
					continue;
				}
				const content = toolOutputContent(item, resourceUris);
				if (content) {
					outputContent.push(content);
				} else if (stats) {
					stats.droppedToolOutputs++;
				}
			}
		}
		isError = !!resultDetails.isError;
		resultInput = resultDetails.input;
	} else if (resultDetails && isToolResultOutputDetails(resultDetails)) {
		const content = toolDataOutputContent(resultDetails);
		if (content) {
			outputContent.push(content);
		} else if (stats) {
			stats.droppedToolOutputs++;
		}
	}
	isError ||= phaseStatus === 'failed' || phaseStatus === 'cancelled';
	// Fall back to the sub-agent summary when the generic result details are empty.
	if (!outputText && subagentData?.result) {
		outputText = subagentData.result;
	}

	const recordedInput = part.toolSpecificData?.kind === 'input'
		? stringifyToolInput(part.toolSpecificData.rawInput)
		: (resultInput ?? subagentData?.prompt ?? '');
	// A tool's input and output are shown together, and only when it has input.
	// A data result (e.g. an image) records no input, so it gets an empty input
	// object; otherwise its output would not be shown.
	const toolInput = recordedInput || (outputContent.length ? '{}' : '');
	const toolCallId = part.toolCallId || generateUuid();
	const displayName = subagentData?.agentName || part.toolId;
	const shownInvocationMessage = invocationMessage ?? stringifyChatMessage(subagentData?.description);
	const confirmation = toolCallConfirmation(part);
	if (confirmation.cancelled) {
		return {
			kind: ResponsePartKind.ToolCall,
			toolCall: {
				status: ToolCallStatus.Cancelled,
				toolCallId,
				toolName: part.toolId,
				displayName,
				invocationMessage: shownInvocationMessage,
				toolInput,
				reason: confirmation.cancelled,
				...(confirmation.reasonMessage ? { reasonMessage: confirmation.reasonMessage } : {}),
			} satisfies ToolCallCancelledState,
		};
	}

	const content: ToolResultContent[] = [];
	if (outputText) {
		content.push({ type: ToolResultContentType.Text, text: outputText });
	}
	content.push(...outputContent);
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

	return {
		kind: ResponsePartKind.ToolCall,
		toolCall: {
			status: ToolCallStatus.Completed,
			toolCallId,
			toolName: part.toolId,
			displayName,
			invocationMessage: shownInvocationMessage,
			toolInput,
			success: !isError,
			pastTenseMessage: toolMessage(part.pastTenseMessage, resourceUris) ?? shownInvocationMessage,
			confirmed: confirmation.confirmed,
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
 * Response parts that carry no content of their own: control markers and
 * transient UI state. They are not imported and not reported as skipped.
 */
const nonContentResponsePartKinds: ReadonlySet<string> = new Set(['undoStop', 'codeblockUri', 'voiceProgress', 'clearToPreviousToolInvocation']);

/**
 * Renders the files a run of edit groups changed as one line of links, each
 * file once, so the moved turn still shows what was edited. The edits
 * themselves cannot move: an agent-host turn records file edits only for its
 * own tool calls. The line is set apart as its own paragraph because adjacent
 * markdown parts are concatenated when the history is written; otherwise it
 * could join the end of surrounding text, such as a closing code fence.
 */
function editedFilesToMarkdown(files: readonly URI[], resourceUris: IAgentHostResourceUriMapper): string {
	const links = files.map(uri => markdownResourceLink(basename(uri), uri, resourceUris));
	return markdownParagraph(localize('chat.importConversation.editedFiles', "Edited {0}", links.join(', ')));
}

/**
 * The question as it was shown, as one line of plain text. The built-in
 * `askQuestions` tool keeps the question in its message and only a short
 * header in its title.
 */
function questionText(question: IChatQuestion): string {
	const text = getDisplayedQuestionText(question);
	return (typeof text === 'string' ? text : renderAsPlaintext(text)).replace(/\s*\n\s*/g, ' ').trim() || question.title;
}

/** The text of one answer to a question, using its options' labels. */
function questionAnswerText(question: IChatQuestion, answer: IChatQuestionAnswerValue): string {
	const label = (value: string) => question.options?.find(option => option.value === value || option.id === value)?.label ?? value;
	if (typeof answer === 'string') {
		return label(answer);
	}
	if (hasKey(answer, { selectedValues: true })) {
		return [...answer.selectedValues.map(label), ...(answer.freeformValue ? [answer.freeformValue] : [])].join(', ');
	}
	return answer.freeformValue || (answer.selectedValue !== undefined ? label(answer.selectedValue) : '');
}

/**
 * Renders the questions the agent asked and how each was answered, so the
 * agent's later turns, which relied on the answers, still make sense. An
 * answer given outside the chat (e.g. by voice) or automatically may not have
 * been saved, but it still was answered rather than skipped.
 */
function questionCarouselToMarkdown(part: IChatQuestionCarousel): string | undefined {
	if (!part.questions.length) {
		return undefined;
	}
	const lines = part.questions.map(question => {
		const answer = part.data?.[question.id];
		const answerText = answer !== undefined ? questionAnswerText(question, answer) : '';
		const text = answerText
			|| (part.autoReply ? localize('chat.importConversation.questionAutoAnswered', "Answered automatically")
				: part.answeredExternally ? localize('chat.importConversation.questionAnsweredExternally', "Answered outside the chat")
					: part.isUsed ? localize('chat.importConversation.questionSkipped', "Skipped")
						: localize('chat.importConversation.questionUnanswered', "Not answered"));
		return `- ${localize('chat.importConversation.questionAnswer', "{0}: {1}", escapeMarkdownSyntaxTokens(questionText(question)), escapeMarkdownSyntaxTokens(text))}`;
	});
	return markdownParagraph(localize('chat.importConversation.questions', "Questions:\n{0}", lines.join('\n')));
}

/**
 * Renders a request for input (e.g. from an MCP server) with how the user
 * responded. One still pending when the chat was moved can no longer be
 * answered, so it is left out.
 */
function elicitationToMarkdown(part: IChatElicitationRequest | IChatElicitationRequestSerialized): string | undefined {
	const state = part.kind === 'elicitation2' ? part.state.get() : part.state;
	if (state === ElicitationState.Pending) {
		return undefined;
	}
	const title = escapeMarkdownSyntaxTokens(stringifyChatMessage(part.title));
	return markdownParagraph(state === ElicitationState.Accepted
		? localize('chat.importConversation.elicitationAccepted', "{0}: Accepted", title)
		: localize('chat.importConversation.elicitationDeclined', "{0}: Declined", title));
}

/** Renders a confirmation the agent asked for with its message. */
function confirmationToMarkdown(part: IChatConfirmation, resourceUris: IAgentHostResourceUriMapper): string {
	const message = typeof part.message === 'string' ? escapeMarkdownSyntaxTokens(part.message) : toHostMarkdownString(part.message, resourceUris);
	return markdownParagraph(`**${escapeMarkdownSyntaxTokens(part.title)}**${message ? `\n\n${message}` : ''}`);
}

/**
 * Renders the references a response used as one line of links, as Local
 * lists them above the response. Each resource is listed once.
 */
function referencesToMarkdown(references: readonly IChatContentReference[], resourceUris: IAgentHostResourceUriMapper): string | undefined {
	const seen = new ResourceSet();
	const items: string[] = [];
	for (const { reference } of references) {
		const value = typeof reference === 'object' && !URI.isUri(reference) && !isLocation(reference) ? reference.value : reference;
		const uri = URI.isUri(value) ? value : isLocation(value) ? value.uri : undefined;
		if (uri) {
			if (!seen.has(uri)) {
				seen.add(uri);
				items.push(markdownResourceLink(basename(uri) || uri.toString(), uri, resourceUris));
			}
		} else {
			const label = typeof reference === 'string' ? reference : hasKey(reference, { variableName: true }) ? `#${reference.variableName}` : undefined;
			if (label) {
				items.push(escapeMarkdownSyntaxTokens(label));
			}
		}
	}
	if (!items.length) {
		return undefined;
	}
	return markdownParagraph(items.length === 1
		? localize('chat.importConversation.reference', "Used 1 reference: {0}", items[0])
		: localize('chat.importConversation.references', "Used {0} references: {1}", items.length, items.join(', ')));
}

/** Renders the code citations of a response, with each source and its license, as Local lists them below the response. */
function codeCitationsToMarkdown(citations: readonly IChatCodeCitation[], resourceUris: IAgentHostResourceUriMapper): string | undefined {
	if (!citations.length) {
		return undefined;
	}
	const sources = citations.map(citation => localize('chat.importConversation.codeCitation', "{0} ({1})", markdownResourceLink(basename(citation.value) || citation.value.toString(), citation.value, resourceUris), escapeMarkdownSyntaxTokens(citation.license)));
	return markdownParagraph(localize('chat.importConversation.codeCitations', "{0}: {1}", getCodeCitationsMessage(citations), sources.join(', ')));
}

/**
 * Collects a request's response stream into agent-host {@link ResponsePart}s:
 * markdown parts become {@link ResponsePartKind.Markdown}, reasoning parts
 * become {@link ResponsePartKind.Reasoning}, tool invocations become
 * {@link ResponsePartKind.ToolCall} parts, and each run of file edits, the
 * agent's questions with their answers, requests for input and confirmations
 * become markdown, all in stream order. The references the response used come
 * first and its code citations last, where Local shows them. Other progress
 * kinds are skipped and counted in `stats`.
 *
 * `turnEditedFiles` holds the files already edited in the turn this response
 * belongs to (a continuation shares its turn's), so a file edited again in a
 * later run is counted in `stats` once per turn.
 */
function responsePartsFromRequest(request: IChatRequestModel, resourceUris: IAgentHostResourceUriMapper, stats: IImportedConversationStats | undefined, turnEditedFiles: ResourceSet): ResponsePart[] {
	const responseParts: ResponsePart[] = [];
	const response = request.response;
	const editedFiles = new ResourceMap<URI>();
	const flushEditedFiles = () => {
		if (editedFiles.size) {
			responseParts.push({ kind: ResponsePartKind.Markdown, id: generateUuid(), content: editedFilesToMarkdown([...editedFiles.values()], resourceUris) });
			editedFiles.clear();
		}
	};
	if (response) {
		const references = referencesToMarkdown(response.contentReferences, resourceUris);
		if (references) {
			responseParts.push({ kind: ResponsePartKind.Markdown, id: generateUuid(), content: references });
		}
		for (const part of response.entireResponse.value) {
			if (part.kind === 'textEditGroup' || part.kind === 'notebookEditGroup') {
				editedFiles.set(part.uri, part.uri);
				if (!turnEditedFiles.has(part.uri)) {
					turnEditedFiles.add(part.uri);
					if (stats) {
						stats.editedFiles++;
					}
				}
				continue;
			}
			if (nonContentResponsePartKinds.has(part.kind)) {
				continue;
			}
			flushEditedFiles();
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
				const content = inlineReferenceToMarkdown(part.inlineReference, part.name, resourceUris);
				if (content) {
					responseParts.push({ kind: ResponsePartKind.Markdown, id: generateUuid(), content });
				}
			} else if (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') {
				responseParts.push(toolCallResponsePart(part, resourceUris, stats));
			} else if (part.kind === 'questionCarousel' || part.kind === 'elicitation2' || part.kind === 'elicitationSerialized' || part.kind === 'confirmation') {
				const content = part.kind === 'questionCarousel' ? questionCarouselToMarkdown(part)
					: part.kind === 'confirmation' ? confirmationToMarkdown(part, resourceUris)
						: elicitationToMarkdown(part);
				if (content) {
					responseParts.push({ kind: ResponsePartKind.Markdown, id: generateUuid(), content });
				}
			} else if (stats) {
				stats.skippedResponseParts++;
				stats.skippedResponsePartKinds.add(part.kind);
			}
		}
		flushEditedFiles();
		const citations = codeCitationsToMarkdown(response.codeCitations, resourceUris);
		if (citations) {
			responseParts.push({ kind: ResponsePartKind.Markdown, id: generateUuid(), content: citations });
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
 * What a conversation import carried over in summarized form or could not
 * carry over at all, collected while converting so the move can report it.
 */
export interface IImportedConversationStats {
	turns: number;
	/** Files whose edits were summarized as links, counted once per turn. */
	editedFiles: number;
	skippedResponseParts: number;
	/** Kinds of the skipped response parts. These are code-defined progress kinds. */
	readonly skippedResponsePartKinds: Set<string>;
	skippedAttachments: number;
	/** Kinds of the skipped attachments. These are code-defined variable kinds. */
	readonly skippedAttachmentKinds: Set<string>;
	/** Tool result items other than text, which a moved tool call cannot keep. */
	droppedToolOutputs: number;
}

export function createImportedConversationStats(): IImportedConversationStats {
	return { turns: 0, editedFiles: 0, skippedResponseParts: 0, skippedResponsePartKinds: new Set(), skippedAttachments: 0, skippedAttachmentKinds: new Set(), droppedToolOutputs: 0 };
}

/**
 * Options for {@link importedTurnsFromChatModel}.
 */
export interface IImportedTurnsOptions {
	/** Maps attachment URIs into the target agent host's URI space. Defaults to identity (local host). */
	readonly resourceUris?: IAgentHostResourceUriMapper;
	/** Resolves the language model identifier a request was sent with to the target's model selection. */
	readonly resolveModel?: (languageModelIdentifier: string) => ModelSelection | undefined;
	/** Collects what the import summarized or skipped. */
	readonly stats?: IImportedConversationStats;
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

function attachmentsFromRequest(request: IChatRequestModel, resourceUris: IAgentHostResourceUriMapper, stats: IImportedConversationStats | undefined): MessageAttachment[] | undefined {
	const attachments: MessageAttachment[] = [];
	for (const variable of request.variableData?.variables ?? []) {
		let attachment: MessageAttachment | undefined;
		try {
			attachment = variableToAttachment(variable, resourceUris);
		} catch {
			// A resource this host cannot address is left out rather than failing the import.
		}
		if (attachment) {
			attachments.push(attachment);
		} else if (stats) {
			stats.skippedAttachments++;
			stats.skippedAttachmentKinds.add(variable.kind);
		}
	}
	return attachments.length ? attachments : undefined;
}

/** When a request was sent and, when known, how long its response spent generating. */
function timingFromRequest(request: IChatRequestModel): { startedAt?: string; duration?: number } {
	if (!Number.isFinite(request.timestamp) || request.timestamp <= 0) {
		return {};
	}
	const startedAt = new Date(request.timestamp).toISOString();
	const duration = generationDuration(request);
	return duration !== undefined ? { startedAt, duration } : { startedAt };
}

/**
 * How long a request's response spent generating, excluding time spent waiting
 * for confirmations. Only known for a response with a recorded completion:
 * legacy responses get a completion time synthesized on restore, which would
 * yield a bogus duration.
 */
function generationDuration(request: IChatRequestModel): number | undefined {
	const response = request.response;
	if (response?.completionTimestamp === undefined) {
		return undefined;
	}
	const duration = response.elapsedMs ?? response.completionTimestamp - request.timestamp;
	return Number.isFinite(duration) && duration >= 0 ? duration : undefined;
}

/**
 * The custom agent a request was sent with, by the URI of its agent file. Built-in
 * modes (Agent, Ask, Edit, Plan) have no agent file; the target's own default applies.
 */
function agentFromRequest(request: IChatRequestModel, resourceUris: IAgentHostResourceUriMapper): AgentSelection | undefined {
	const uri = request.modeInfo && !request.modeInfo.isBuiltin ? request.modeInfo.modeInstructions?.uri : undefined;
	if (!uri) {
		return undefined;
	}
	try {
		return { uri: resourceUris.toAgentHost(uri).toString() };
	} catch {
		return undefined;
	}
}

/**
 * The tokens and Copilot credits a response consumed, in the shape a natively
 * reported agent-host turn carries: the input/output counters describe the
 * latest model call (the context the response ended on), while the credits and
 * per-model token totals describe the whole response. Session-wide totals are
 * left out: they describe the source session, not this turn. A response
 * without per-model totals (most Local responses) only records its whole
 * output total (`completionTokenCount`); an agent-host turn has no field for
 * an output total without the matching input totals, so it is not carried
 * rather than presented with invented input figures. A response restored from
 * an older save kept only that total, so its latest call's output is omitted.
 */
function usageFromRequest(request: IChatRequestModel): UsageInfo | undefined {
	const usage = request.response?.usage;
	if (!usage) {
		return undefined;
	}
	const credits = usage.copilotCredits;
	const nanoAiu = credits !== undefined && Number.isFinite(credits) && credits >= 0 ? Math.round(credits * 1_000_000_000) : undefined;
	const turnTokenTotals = usage.modelTotals?.length ? usage.modelTotals.map(({ model, inputTokens, cachedTokens, outputTokens }) => ({ model, inputTokens, cachedTokens, outputTokens })) : undefined;
	// A response restored from an older save only kept the whole-response output total, so its latest call's output is unknown.
	const counters: UsageInfo = request.response.lastCallCompletionTokensKnown
		? { inputTokens: usage.promptTokens, outputTokens: usage.completionTokens }
		: { inputTokens: usage.promptTokens };
	return withWholeTurnUsage(counters, nanoAiu, turnTokenTotals);
}

function withWholeTurnUsage(usage: UsageInfo, nanoAiu: number | undefined, turnTokenTotals: readonly ITurnTokenTotal[] | undefined): UsageInfo {
	const meta = {
		...(nanoAiu !== undefined ? { copilotUsage: { totalNanoAiu: nanoAiu } } : {}),
		...(turnTokenTotals?.length ? { turnTokenTotals } : {}),
	};
	return Object.keys(meta).length ? { ...usage, _meta: meta } : usage;
}

/**
 * Combines the usage of a turn's responses (its own, then any continuations
 * folded into it, in order). The last response ran last, so its latest-call
 * counters describe the context the turn ended on; when it reported none,
 * that context is unknown. Credits and per-model totals are whole-turn
 * consumption: they are summed only when every response reported them, since
 * a sum missing any response would understate the turn.
 */
function combineTurnUsage(usages: readonly (UsageInfo | undefined)[]): UsageInfo | undefined {
	const last = usages.at(-1);
	const metas = usages.map(usage => usage && readUsageInfoMeta(usage));
	let nanoAiu: number | undefined = 0;
	let turnTokenTotals: Map<string, ITurnTokenTotal> | undefined = new Map();
	for (const meta of metas) {
		const responseNanoAiu = meta?.copilotUsage?.totalNanoAiu;
		nanoAiu = nanoAiu !== undefined && responseNanoAiu !== undefined ? nanoAiu + responseNanoAiu : undefined;
		if (!turnTokenTotals || !meta?.turnTokenTotals) {
			turnTokenTotals = undefined;
			continue;
		}
		for (const total of meta.turnTokenTotals) {
			const current = turnTokenTotals.get(total.model);
			turnTokenTotals.set(total.model, current ? {
				model: total.model,
				inputTokens: current.inputTokens + total.inputTokens,
				cachedTokens: current.cachedTokens + total.cachedTokens,
				outputTokens: current.outputTokens + total.outputTokens,
			} : total);
		}
	}
	const counters: UsageInfo = {
		...(last?.inputTokens !== undefined ? { inputTokens: last.inputTokens } : {}),
		...(last?.outputTokens !== undefined ? { outputTokens: last.outputTokens } : {}),
	};
	const usage = withWholeTurnUsage(counters, usages.length ? nanoAiu : undefined, turnTokenTotals?.size ? [...turnTokenTotals.values()] : undefined);
	return Object.keys(usage).length ? usage : undefined;
}

/**
 * Translates a local {@link IChatModel} into agent-host {@link Turn}s suitable
 * for {@link IAgentHostService.createSession}'s `importConversation` option.
 *
 * Each user request becomes a user turn carrying its attachments, the model
 * and custom agent it was sent with, when it was sent, how long it took and
 * what it consumed; its response stream is mapped by
 * {@link responsePartsFromRequest} and its end state by
 * {@link turnOutcomeFromRequest}. System-initiated requests (e.g. background
 * terminal-completion notifications that were auto-sent back to the agent) are
 * not real user turns, so their synthetic message is dropped and their response
 * (and end state) is folded into the preceding turn as a continuation, adding
 * its generation time and whole-turn consumption (see
 * {@link combineTurnUsage}).
 */
export function importedTurnsFromChatModel(model: IChatModel, options?: IImportedTurnsOptions): Turn[] {
	const resourceUris = options?.resourceUris ?? identityAgentHostResourceUriMapper;
	const stats = options?.stats;
	const turns: Turn[] = [];
	let turnEditedFiles = new ResourceSet();
	// Every response's usage per turn, its own first, combined once the turn is complete.
	const turnUsages = new Map<Turn, (UsageInfo | undefined)[]>();
	for (const request of model.getRequests()) {
		if (!request.isSystemInitiated) {
			turnEditedFiles = new ResourceSet();
		}
		const responseParts = responsePartsFromRequest(request, resourceUris, stats, turnEditedFiles);
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
				// Generation time: idle and confirmation waits between the two are not part of it.
				const continuationDuration = generationDuration(request);
				previous.duration = previous.duration !== undefined && continuationDuration !== undefined
					? previous.duration + continuationDuration
					: undefined;
				turnUsages.get(previous)?.push(usageFromRequest(request));
			}
			continue;
		}
		const attachments = attachmentsFromRequest(request, resourceUris, stats);
		const messageModel = request.modelId ? options?.resolveModel?.(request.modelId) : undefined;
		if (stats) {
			stats.turns++;
		}
		const agent = agentFromRequest(request, resourceUris);
		const turn: Turn = {
			id: generateUuid(),
			...timingFromRequest(request),
			message: {
				text: request.message.text,
				origin: { kind: MessageKind.User },
				...(attachments ? { attachments } : {}),
				...(messageModel ? { model: messageModel } : {}),
				...(agent ? { agent } : {}),
			},
			responseParts,
			usage: undefined,
			state: outcome.state,
		};
		turns.push(turn);
		turnUsages.set(turn, [usageFromRequest(request)]);
	}
	for (const [turn, usages] of turnUsages) {
		turn.usage = combineTurnUsage(usages);
	}
	return turns;
}
