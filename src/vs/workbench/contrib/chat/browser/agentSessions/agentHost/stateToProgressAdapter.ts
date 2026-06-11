/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64 } from '../../../../../../base/common/buffer.js';
import { escapeMarkdownLinkLabel, IMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { marked, type Token, type Tokens, type TokensList } from '../../../../../../base/common/marked/marked.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { MessageKind, ToolCallStatus, TurnState, ResponsePartKind, getToolFileEdits, getToolOutputText, getToolSubagentContent, type ActiveTurn, type ICompletedToolCall, type Message, type ToolCallState, type Turn, FileEditKind, ToolResultContentType, type ToolResultContent, type UsageInfo } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { getToolKind } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { AGENT_HOST_SCHEME, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { getAgentFeedbackAttachmentMetadata, isAgentFeedbackAttachment } from '../../../../../../platform/agentHost/common/agentFeedbackAttachments.js';
import { MessageAttachmentKind, type FileEdit, type MessageAttachment, type StringOrMarkdown, type TextRange } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { type ChatExternalEditKind, type IChatExternalEdit, type IChatModifiedFilesConfirmationData, type IChatProgress, type IChatSearchToolInvocationData, type IChatTerminalToolInvocationData, type IChatToolInputInvocationData, type IChatToolInvocationSerialized, type IChatUsage, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { type IChatSessionHistoryItem } from '../../../common/chatSessionsService.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { type IChatRequestVariableData } from '../../../common/model/chatModel.js';
import { AgentHostCompletionReferenceKind, toAgentHostCompletionVariableEntryFromMetadata, type IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { type IToolConfirmationMessages, type IToolData, type IToolResult, type IToolResultInputOutputDetails, ToolDataSource, ToolInvocationPresentation } from '../../../common/tools/languageModelToolsService.js';
import { basename, isEqual } from '../../../../../../base/common/resources.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { localize } from '../../../../../../nls.js';
import type { IRange } from '../../../../../../editor/common/core/range.js';

/**
 * Constructs a terminal tool session ID from a terminal URI and backend session.
 * The ID is a JSON string containing both so consumers can parse out either.
 */
export function makeAhpTerminalToolSessionId(terminalUri: string, session: URI): string {
	return JSON.stringify({ terminal: terminalUri, session: session.toString() });
}

/**
 * Parses a terminal tool session ID back into its terminal and session URIs.
 */
export function parseAhpTerminalToolSessionId(id: string): { terminal: string; session: string } | undefined {
	try {
		const parsed = JSON.parse(id);
		if (typeof parsed?.terminal === 'string' && typeof parsed?.session === 'string') {
			return parsed;
		}
	} catch { /* not an AHP terminal session ID */ }
	return undefined;
}

/**
 * Extracts the task description from `_meta.subagentDescription`, which is
 * populated from the tool's arguments at `tool_start` time by the event
 * mapper. This is the short task description (e.g., "Find related files"),
 * NOT the agent's own description.
 */
function getSubagentTaskDescription(tc: { _meta?: Record<string, unknown> }): string | undefined {
	const v = tc._meta?.subagentDescription;
	return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Extracts the agent name from `_meta.subagentAgentName`.
 */
function getSubagentAgentName(tc: { _meta?: Record<string, unknown> }): string | undefined {
	const v = tc._meta?.subagentAgentName;
	return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Known tool names that spawn subagent sessions. Used as a client-side
 * fallback when the server hasn't set `_meta.toolKind` (e.g. sessions
 * restored by an older server version that didn't carry `_meta`).
 */
const SUBAGENT_TOOL_NAMES: ReadonlySet<string> = new Set(['task']);

export function isSubagentToolName(toolName: string): boolean {
	return SUBAGENT_TOOL_NAMES.has(toolName);
}

function systemNotificationToProgress(content: StringOrMarkdown | undefined, connectionAuthority: string | undefined): IChatProgress | undefined {
	if (!content) {
		return undefined;
	}
	const value = stringOrMarkdownToString(content, connectionAuthority);
	return { kind: 'progressMessage', content: typeof value === 'string' ? new MarkdownString(value) : value };
}

/**
 * Returns true if this tool call spawns a subagent session, either because
 * the server reported `_meta.toolKind === 'subagent'` or because the tool
 * name is in the known fallback set (older snapshots without `_meta`).
 */
export function isSubagentTool(tc: ToolCallState): boolean {
	return getToolKind(tc) === 'subagent' || isSubagentToolName(tc.toolName);
}

/**
 * Finds a terminal content block in a tool call's content array.
 * Returns the terminal URI if found.
 */
export function getTerminalContentUri(content: ToolResultContent[] | undefined): string | undefined {
	if (!content) {
		return undefined;
	}
	for (const block of content) {
		if (block.type === ToolResultContentType.Terminal) {
			return block.resource;
		}
	}
	return undefined;
}

/**
 * Resolves a raw per-turn model id (as it appears on `UsageInfo.model`) into
 * the chat layer's namespaced language-model id and a human-readable display
 * details. Both halves are independent: the id flows onto request history
 * items (so the input picker shows the model that ran), while the details
 * flow onto response history items (so the response footer shows the model
 * and any usage metadata).
 */
export interface TurnModelLookup {
	/** Returns the chat-layer namespaced model id for a raw AHP model id. */
	toLanguageModelId(rawModelId: string | undefined): string | undefined;
	/** Returns the human-readable response details, or undefined if unknown. */
	toResponseDetails(rawModelId: string | undefined, usage: UsageInfo | undefined): string | undefined;
}

export function usageInfoToChatUsage(usage: UsageInfo | undefined): IChatUsage | undefined {
	if (typeof usage?.inputTokens !== 'number' && typeof usage?.outputTokens !== 'number') {
		return undefined;
	}
	return {
		kind: 'usage',
		promptTokens: usage.inputTokens ?? 0,
		completionTokens: usage.outputTokens ?? 0,
	};
}

/**
 * Converts completed turns from the protocol state into session history items.
 *
 * Per turn, prefers `turn.usage?.model` so each request/response pair shows
 * the model that actually ran, even if the user changed models mid-session.
 * The `lookup` callback is responsible for any session-level fallback (e.g.
 * `summary.model?.id` when usage hasn't reported a model yet).
 */
export function turnsToHistory(backendSession: URI, turns: readonly Turn[], participantId: string, connectionAuthority: string, lookup?: TurnModelLookup): IChatSessionHistoryItem[] {
	const history: IChatSessionHistoryItem[] = [];
	for (const turn of turns) {
		const rawModelId = turn.usage?.model;
		const modelId = lookup?.toLanguageModelId(rawModelId);
		const details = lookup?.toResponseDetails(rawModelId, turn.usage);

		// Request
		const variableData = messageToVariableData(turn.message, connectionAuthority);
		const isSystemInitiated = turn.message.origin.kind === MessageKind.SystemNotification;
		history.push({
			id: turn.id,
			type: 'request',
			prompt: turn.message.text,
			participant: participantId,
			modelId,
			variableData,
			...(isSystemInitiated ? {
				isSystemInitiated: true,
			} : {}),
		});

		// Response parts — iterate the unified responseParts array
		const parts: IChatProgress[] = [];
		const usage = usageInfoToChatUsage(turn.usage);
		if (usage) {
			parts.push(usage);
		}

		for (const rp of turn.responseParts) {
			switch (rp.kind) {
				case ResponsePartKind.Markdown:
					if (rp.content) {
						parts.push({ kind: 'markdownContent', content: rawMarkdownToString(rp.content, connectionAuthority) });
					}
					break;
				case ResponsePartKind.ToolCall: {
					const tc = rp.toolCall as ICompletedToolCall;
					const fileEditParts = completedToolCallToEditParts(tc, connectionAuthority);
					const serialized = completedToolCallToSerialized(tc, undefined, backendSession, connectionAuthority);
					if (fileEditParts.length > 0) {
						serialized.presentation = ToolInvocationPresentation.Hidden;
					}
					parts.push(serialized);
					parts.push(...fileEditParts);
					break;
				}
				case ResponsePartKind.Reasoning:
					if (rp.content) {
						parts.push({ kind: 'thinking', value: rp.content });
					}
					break;
				case ResponsePartKind.SystemNotification:
					{
						const progress = systemNotificationToProgress(rp.content, connectionAuthority);
						if (progress) {
							parts.push(progress);
						}
					}
					break;
				case ResponsePartKind.ContentRef:
					// Content references are not restored into history;
					// they are handled separately by the content provider.
					break;
			}
		}

		// Error message for failed turns
		if (turn.state === TurnState.Error && turn.error) {
			parts.push({ kind: 'markdownContent', content: new MarkdownString(`\n\nError: (${turn.error.errorType}) ${turn.error.message}`) });
		}

		history.push({ type: 'response', parts, participant: participantId, details });
	}
	return history;
}

/**
 * Converts a turn's persisted {@link Message} into the chat-layer
 * {@link IChatRequestVariableData} shape so attachments survive a
 * history replay (and pending/server-initiated turn synthesis). Returns
 * `undefined` when the message has no convertible attachments.
 */
export function messageToVariableData(message: Message, connectionAuthority: string): IChatRequestVariableData | undefined {
	return messageAttachmentsToVariableData(message.attachments, connectionAuthority);
}

export function messageAttachmentsToVariableData(attachments: readonly MessageAttachment[] | undefined, connectionAuthority: string): IChatRequestVariableData | undefined {
	if (!attachments?.length) {
		return undefined;
	}
	const variables: IChatRequestVariableEntry[] = [];
	for (const a of attachments) {
		const v = messageAttachmentToVariableEntry(a, connectionAuthority);
		if (v) {
			variables.push(v);
		}
	}
	return variables.length > 0 ? { variables } : undefined;
}

function messageAttachmentToVariableEntry(attachment: MessageAttachment, connectionAuthority: string): IChatRequestVariableEntry | undefined {
	if (isAgentFeedbackAttachment(attachment)) {
		const metadata = getAgentFeedbackAttachmentMetadata(attachment);
		if (metadata) {
			return {
				kind: 'agentFeedback',
				id: generateUuid(),
				name: attachment.label,
				value: attachment.modelRepresentation || attachment.label,
				sessionResource: URI.parse(metadata.sessionResource),
				feedbackItems: metadata.feedbackItems.map(item => ({
					id: item.id,
					text: item.text,
					resourceUri: toAgentHostUri(URI.parse(item.resourceUri), connectionAuthority),
					range: textRangeToIRange(item.range),
				})),
				_meta: attachment._meta,
			};
		}
	}

	if (attachment.type === MessageAttachmentKind.Resource) {
		const uri = toAgentHostUri(URI.parse(attachment.uri), connectionAuthority);
		const name = attachment.label;
		const id = uri.toString() + (attachment.selection
			? `:${attachment.selection.range.start.line}-${attachment.selection.range.end.line}`
			: '');
		const _meta = attachment._meta;

		if (attachment.displayKind === 'directory') {
			return { kind: 'directory', id, name, value: uri, _meta };
		}
		if (attachment.displayKind === 'image') {
			return {
				kind: 'image',
				id,
				name,
				value: uri,
				isURL: true,
				references: [{ kind: 'reference', reference: uri }],
				_meta,
			};
		}
		if (attachment.selection) {
			return {
				kind: 'file',
				id,
				name,
				value: { uri, range: textRangeToIRange(attachment.selection.range) },
				_meta,
			};
		}
		return { kind: 'file', id, name, value: uri, _meta };
	}

	if (attachment.type === MessageAttachmentKind.EmbeddedResource) {
		if (!attachment.contentType.startsWith('image/')) {
			return {
				kind: 'generic',
				id: generateUuid(),
				name: attachment.label,
				value: decodeBase64(attachment.data).buffer,
				_meta: attachment._meta,
			};
		}

		return {
			kind: 'image',
			id: generateUuid(),
			name: attachment.label || 'image',
			value: decodeBase64(attachment.data).buffer,
			mimeType: attachment.contentType,
			isURL: false,
			_meta: attachment._meta,
		};
	}

	const agentHostCompletionKind = getAgentHostCompletionKind(attachment);
	if (agentHostCompletionKind !== undefined) {
		return toAgentHostCompletionVariableEntryFromMetadata(agentHostCompletionKind, attachment.label, attachment._meta);
	}

	const modelRepresentation = attachment.type === MessageAttachmentKind.Simple ? attachment.modelRepresentation : undefined;
	return {
		kind: 'generic',
		id: generateUuid(),
		name: attachment.label,
		value: modelRepresentation || attachment.label,
		_meta: attachment._meta,
	};
}

function getAgentHostCompletionKind(attachment: MessageAttachment): AgentHostCompletionReferenceKind | undefined {
	if (attachment.type !== MessageAttachmentKind.Simple) {
		return undefined;
	}
	switch (attachment.displayKind) {
		case 'command':
			return AgentHostCompletionReferenceKind.Command;
		case 'skill':
			return AgentHostCompletionReferenceKind.Skill;
	}
	return undefined;
}

function textRangeToIRange(range: TextRange): IRange {
	return {
		startLineNumber: range.start.line + 1,
		startColumn: range.start.character + 1,
		endLineNumber: range.end.line + 1,
		endColumn: range.end.character + 1,
	};
}

/**
 * Converts an active (in-progress) turn's accumulated state into progress
 * items suitable for replaying into the chat UI when reconnecting to a
 * session that is mid-turn.
 *
 * Returns serialized progress items for content already received (text,
 * reasoning, completed tool calls) and live {@link ChatToolInvocation}
 * objects for running tool calls and pending confirmations.
 */
export function activeTurnToProgress(sessionResource: URI, activeTurn: ActiveTurn, connectionAuthority: string | undefined): IChatProgress[] {
	const parts: IChatProgress[] = [];
	const usage = usageInfoToChatUsage(activeTurn.usage);
	if (usage) {
		parts.push(usage);
	}

	for (const rp of activeTurn.responseParts) {
		switch (rp.kind) {
			case ResponsePartKind.Markdown:
				if (rp.content) {
					parts.push({ kind: 'markdownContent', content: rawMarkdownToString(rp.content, connectionAuthority) });
				}
				break;
			case ResponsePartKind.Reasoning:
				if (rp.content) {
					parts.push({ kind: 'thinking', value: rp.content });
				}
				break;
			case ResponsePartKind.ToolCall: {
				const tc = rp.toolCall;
				if (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) {
					parts.push(completedToolCallToSerialized(tc as ICompletedToolCall, undefined, sessionResource, connectionAuthority));
				} else if (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Streaming || tc.status === ToolCallStatus.PendingConfirmation) {
					parts.push(toolCallStateToInvocation(tc, undefined, sessionResource, connectionAuthority));
				}
				break;
			}
			case ResponsePartKind.SystemNotification:
				{
					const progress = systemNotificationToProgress(rp.content, connectionAuthority);
					if (progress) {
						parts.push(progress);
					}
				}
				break;
			case ResponsePartKind.ContentRef:
				break;
		}
	}

	return parts;
}

function getTerminalInput(tc: ToolCallState): string | undefined {
	if (tc.status !== ToolCallStatus.Streaming && tc.toolInput) {
		try {
			return JSON.parse(tc.toolInput).command || tc.toolInput;
		} catch {
			return tc.toolInput;
		}
	}

	return undefined;
}
function getTerminalOutput(tc: ToolCallState) {
	const text = tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Running ? tc.content?.find(c => c.type === 'text')?.text : undefined;
	if (!text) {
		return undefined;
	}
	// The detached xterm used to render this output treats input as a raw TTY stream,
	// so a lone `\n` only advances the row without resetting the column (producing a
	// staircase). SDK terminal tools return plain text with `\n` line endings, so
	// normalize to `\r\n` here. The replace is idempotent on already-CRLF input.
	return { text: text.replace(/\r?\n/g, '\r\n') };
}

function getTerminalLanguage(tc: ToolCallState) {
	return tc.toolName === 'powershell' ? 'powershell' : 'shellscript';
}

/**
 * True if this tool call should render as a terminal pill in the chat UI.
 *
 * Combines three signals so the workbench renders consistently across every
 * stage of the tool lifecycle:
 *
 * 1. `existingKind === 'terminal'` — preserve the prior render decision so a
 *    tool already set up as terminal stays terminal across snapshots.
 * 2. `getToolKind(tc) === 'terminal'` with a command available — the
 *    always-available `_meta.toolKind` flag set by the event mapper for
 *    built-in `bash`/`powershell` SDK tools that never emit a
 *    {@link ToolResultContentType.Terminal} content block. We only render the
 *    terminal pill once we actually have the command (`getTerminalInput`):
 *    rendering a terminal pill with an empty command line looks broken, so
 *    until the command arrives we fall back to the generic tool widget
 *    (the `invocationMessage`).
 * 3. A `Terminal` content block in `tc.content` (Running/Completed only) —
 *    the AHP-side signal for the custom terminal tool (`agenthost-terminal:`
 *    URIs).
 *
 * Without (1) the live invocation would race against the async arrival of the
 * Terminal block via `onDidAssociateTerminal`.
 */
function isTerminalToolCall(tc: ToolCallState, existingKind?: string): boolean {
	if (existingKind === 'terminal') {
		return true;
	}
	if (getToolKind(tc) === 'terminal' && getTerminalInput(tc) !== undefined) {
		return true;
	}
	if (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Completed) {
		return !!getTerminalContentUri(tc.content);
	}
	return false;
}

/**
 * Build an {@link IChatTerminalToolInvocationData} payload from a tool-call
 * state. Single source of truth for the five places that need to (re)compute
 * the terminal payload: pending confirmation, live create, streaming refresh,
 * finalize, and history replay.
 *
 * Each field falls back to `existing` so callers can re-call on later
 * snapshots without losing values that arrived earlier. This is critical for
 * the AHP fields `terminalToolSessionId` / `terminalCommandUri`, which
 * `_reviveTerminalIfNeeded` populates asynchronously once a Terminal content
 * block arrives — refreshing from `tc` alone would clobber them whenever the
 * block hasn't landed yet.
 *
 * Completion-only fields (e.g. `terminalCommandState` from `tc.success`)
 * are layered on top by the caller; the helper is status-agnostic.
 */
function buildTerminalToolSpecificData(
	tc: ToolCallState,
	sessionResource: URI,
	existing?: IChatTerminalToolInvocationData,
): IChatTerminalToolInvocationData {
	const terminalContentUri = (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Completed)
		? getTerminalContentUri(tc.content)
		: undefined;
	const nextCommand = getTerminalInput(tc);
	const commandLine = nextCommand
		? { ...existing?.commandLine, original: nextCommand }
		: existing?.commandLine ?? { original: '' };
	const nextOutput = getTerminalOutput(tc);
	// Spread `existing` so any field set by a prior pass (notably the
	// async-populated AHP fields and anything we don't explicitly handle)
	// is preserved unless we have a fresh value to override it with.
	return {
		...existing,
		kind: 'terminal',
		commandLine,
		language: existing?.language ?? getTerminalLanguage(tc),
		terminalToolSessionId: terminalContentUri
			? makeAhpTerminalToolSessionId(terminalContentUri, sessionResource)
			: existing?.terminalToolSessionId,
		terminalCommandUri: terminalContentUri ? URI.parse(terminalContentUri) : existing?.terminalCommandUri,
		terminalCommandOutput: nextOutput ?? existing?.terminalCommandOutput,
	};
}

function getToolInputOutputDetails(tc: ToolCallState, isError: boolean, errorString: string | undefined): IToolResultInputOutputDetails | undefined {
	const toolInput = tc.status === ToolCallStatus.Streaming ? undefined : tc.toolInput;
	if (!toolInput) {
		return undefined;
	}

	const output: IToolResultInputOutputDetails['output'] = [];
	if (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Running) {
		for (const block of tc.content ?? []) {
			switch (block.type) {
				case ToolResultContentType.Text:
					output.push({ type: 'embed', value: block.text, isText: true, mimeType: 'text/plain' });
					break;
				case ToolResultContentType.EmbeddedResource:
					output.push({ type: 'embed', value: block.data, mimeType: block.contentType });
					break;
				case ToolResultContentType.Resource:
					output.push({ type: 'ref', uri: URI.parse(block.uri), mimeType: block.contentType });
					break;
			}
		}
	}

	if (output.length === 0 && errorString) {
		output.push({ type: 'embed', value: errorString, isText: true, mimeType: 'text/plain' });
	}

	return {
		input: toolInput,
		inputLanguage: 'json',
		output,
		isError,
	};
}

function getToolErrorString(tc: ToolCallState): string | undefined {
	if (tc.status === ToolCallStatus.Completed) {
		return tc.error?.message;
	}
	if (tc.status === ToolCallStatus.Cancelled) {
		return typeof tc.reasonMessage === 'string' ? tc.reasonMessage : tc.reasonMessage?.markdown;
	}
	return undefined;
}

/**
 * Converts a completed tool call from the protocol state into a serialized
 * tool invocation suitable for history replay.
 */
export function completedToolCallToSerialized(tc: ICompletedToolCall, subAgentInvocationId: string | undefined, sessionResource: URI, connectionAuthority: string | undefined): IChatToolInvocationSerialized {
	const isTerminal = isTerminalToolCall(tc);
	const isSuccess = tc.status === ToolCallStatus.Completed && tc.success;
	const invocationMsg = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority) ?? localize('ahp.running', "Running {0}...", tc.displayName);

	// Check for subagent content
	const subagentContent = tc.status === ToolCallStatus.Completed ? getToolSubagentContent(tc) : undefined;
	const isSubagent = subagentContent || isSubagentTool(tc);
	if (isSubagent && tc.status === ToolCallStatus.Completed) {
		const resultText = getToolOutputText(tc);
		const pastTenseMsg = isSuccess
			? stringOrMarkdownToString(tc.pastTenseMessage, connectionAuthority) ?? invocationMsg
			: invocationMsg;
		return {
			kind: 'toolInvocationSerialized',
			toolCallId: tc.toolCallId,
			toolId: tc.toolName,
			source: ToolDataSource.Internal,
			invocationMessage: invocationMsg,
			originMessage: undefined,
			pastTenseMessage: pastTenseMsg,
			isConfirmed: isSuccess
				? { type: ToolConfirmKind.ConfirmationNotNeeded }
				: { type: ToolConfirmKind.Denied },
			isComplete: true,
			presentation: undefined,
			subAgentInvocationId: subAgentInvocationId,
			toolSpecificData: {
				kind: 'subagent',
				description: getSubagentTaskDescription(tc) ?? tc.displayName,
				agentName: subagentContent?.agentName ?? getSubagentAgentName(tc),
				result: resultText,
			},
		};
	}

	let toolSpecificData: IChatTerminalToolInvocationData | IChatSearchToolInvocationData | undefined;
	if (isTerminal) {
		toolSpecificData = {
			...buildTerminalToolSpecificData(tc, sessionResource),
			terminalCommandState: { exitCode: isSuccess ? 0 : 1 },
		};
	} else if (getToolKind(tc) === 'search') {
		toolSpecificData = { kind: 'search' };
	}

	const pastTenseMsg = isSuccess
		? stringOrMarkdownToString(tc.pastTenseMessage, connectionAuthority) ?? invocationMsg
		: invocationMsg;
	const resultDetails = !toolSpecificData && (tc.status !== ToolCallStatus.Completed || getToolFileEdits(tc).length === 0)
		? getToolInputOutputDetails(tc, !isSuccess, getToolErrorString(tc))
		: undefined;

	return {
		kind: 'toolInvocationSerialized',
		toolCallId: tc.toolCallId,
		toolId: tc.toolName,
		source: ToolDataSource.Internal,
		invocationMessage: invocationMsg,
		originMessage: undefined,
		pastTenseMessage: isTerminal ? undefined : pastTenseMsg,
		isConfirmed: isSuccess
			? { type: ToolConfirmKind.ConfirmationNotNeeded }
			: { type: ToolConfirmKind.Denied },
		isComplete: true,
		presentation: undefined,
		subAgentInvocationId: subAgentInvocationId,
		toolSpecificData,
		resultDetails,
	};
}

/**
 * Builds {@link IChatExternalEdit} progress parts for a completed tool call
 * that produced file edits. Returns an empty array if the tool call has no
 * edits. Each emitted part carries the URI, edit kind, before/after content
 * URIs, and the diff stats already known from the agent host protocol —
 * downstream rendering can produce a static "edit pill" without re-deriving
 * any of this from an editing session.
 *
 * `connectionAuthority` is required so all emitted URIs are wrapped via
 * {@link toAgentHostUri}; otherwise the chat session would receive raw
 * remote URIs that its file system providers cannot resolve.
 */
export function completedToolCallToEditParts(tc: ICompletedToolCall, connectionAuthority: string): IChatProgress[] {
	if (tc.status !== ToolCallStatus.Completed) {
		return [];
	}
	const fileEdits = getToolFileEdits(tc);
	if (fileEdits.length === 0) {
		return [];
	}
	const parts: IChatProgress[] = [];
	for (const edit of fileEdits) {
		const part = fileEditToExternalEdit(edit, tc.toolCallId, connectionAuthority);
		if (part) {
			parts.push(part);
		}
	}
	return parts;
}

/**
 * Translates a single protocol {@link FileEdit} record into the
 * {@link IChatExternalEdit} progress part rendered as an edit pill. All
 * URIs are wrapped through {@link toAgentHostUri} so that remote-resource
 * lookups resolve through the agent host file system provider.
 */
function fileEditToExternalEdit(edit: FileEdit, undoStopId: string, connectionAuthority: string): IChatExternalEdit | undefined {
	const rawFileUri = edit.after?.uri ? URI.parse(edit.after.uri) : edit.before?.uri ? URI.parse(edit.before.uri) : undefined;
	if (!rawFileUri) {
		return undefined;
	}
	const isCreate = !edit.before && !!edit.after;
	const isDelete = !!edit.before && !edit.after;
	const isRename = !!edit.before && !!edit.after && !isEqual(URI.parse(edit.before.uri), URI.parse(edit.after.uri));
	let editKind: ChatExternalEditKind;
	if (isCreate) {
		editKind = 'create';
	} else if (isDelete) {
		editKind = 'delete';
	} else if (isRename) {
		editKind = 'rename';
	} else {
		editKind = 'edit';
	}
	const diff = edit.diff && (edit.diff.added !== undefined || edit.diff.removed !== undefined)
		? { added: edit.diff.added ?? 0, removed: edit.diff.removed ?? 0 }
		: undefined;
	return {
		kind: 'externalEdit',
		uri: toAgentHostUri(rawFileUri, connectionAuthority),
		editKind,
		originalUri: isRename && edit.before ? toAgentHostUri(URI.parse(edit.before.uri), connectionAuthority) : undefined,
		beforeContentUri: edit.before?.content.uri ? toAgentHostUri(URI.parse(edit.before.content.uri), connectionAuthority) : undefined,
		afterContentUri: edit.after?.content.uri ? toAgentHostUri(URI.parse(edit.after.content.uri), connectionAuthority) : undefined,
		diff,
		undoStopId,
	};
}

/**
 * Creates a live {@link ChatToolInvocation} from the protocol's tool-call
 * state. Used during active turns to represent running tool calls in the UI.
 */
/**
 * URI schemes that should NOT be rewritten when they appear inside markdown
 * links received from a remote agent host. These are links that are
 * meaningful outside the agent host's workspace (e.g. web links, VS Code
 * commands) or are already wrapped in the agent-host scheme.
 */
const EXTERNAL_LINK_SCHEMES: ReadonlySet<string> = new Set([
	'http',
	'https',
	'mailto',
	'ws',
	'wss',
	'ftp',
	'ftps',
	'data',
	'blob',
	'javascript',
	'command',
	'vscode',
	'vscode-insiders',
	AGENT_HOST_SCHEME,
]);

/**
 * Rewrites inline markdown link URIs so that non-external schemes are wrapped
 * in the `vscode-agent-host://` scheme, mirroring {@link toAgentHostUri}.
 * This allows links in markdown content streamed from a remote agent host
 * (e.g. `file:///...` or `agenthost-content:///...`) to resolve correctly on
 * the client through the agent host filesystem provider.
 *
 * Links with external schemes (http, https, mailto, command, etc.) and
 * relative/anchor-only links without a scheme are preserved as-is. The
 * markdown is parsed with marked and each `link` / `image` token is
 * rewritten individually, so link-looking text inside code spans or fenced
 * code blocks is untouched (marked emits those as `code`/`codespan` tokens
 * with no nested link tokens).
 */
export function rewriteMarkdownLinks(markdown: string, connectionAuthority: string): string {
	let tokens: TokensList;
	try {
		tokens = marked.lexer(markdown);
	} catch {
		return markdown;
	}

	const edits: { raw: string; replacement: string }[] = [];
	marked.walkTokens(tokens, token => {
		if (token.type !== 'link' && token.type !== 'image') {
			return;
		}
		const replacement = rewriteLinkTokenRaw(token as Tokens.Link | Tokens.Image, connectionAuthority);
		if (replacement !== undefined) {
			edits.push({ raw: (token as Token & { raw: string }).raw, replacement });
		}
	});

	if (edits.length === 0) {
		return markdown;
	}

	// Apply edits sequentially against the original markdown. walkTokens
	// visits tokens in document order so a forward scan is sufficient.
	let out = '';
	let pos = 0;
	for (const { raw, replacement } of edits) {
		const idx = markdown.indexOf(raw, pos);
		if (idx < 0) {
			continue;
		}
		out += markdown.substring(pos, idx) + replacement;
		pos = idx + raw.length;
	}
	return out + markdown.substring(pos);
}

/**
 * Computes the rewritten `raw` string for a single link or image token,
 * or returns `undefined` if the token should be left alone (external
 * scheme or unparseable URI).
 *
 * The output collapses to the canonical inline form `[](newHref)` (or
 * `![](newHref)` for images) — the chat renderer has richer handling for
 * empty-text agent-host links (rendering them as a file widget), so
 * preserving the original label isn't useful for most links. The one
 * exception is skill links (URIs whose basename is `SKILL.md`), where the
 * skill name is preserved as the label so the skill pill renderer can
 * display it instead of the always-identical `SKILL.md` basename. This
 * also means autolinks (`<url>`) and reference-style links
 * (`[text][ref]`) are normalized into the inline form.
 */
function rewriteLinkTokenRaw(token: Tokens.Link | Tokens.Image, connectionAuthority: string): string | undefined {
	let parsed: URI;
	try {
		parsed = URI.parse(token.href, true);
	} catch {
		return undefined;
	}
	const scheme = parsed.scheme.toLowerCase();
	if (!scheme || EXTERNAL_LINK_SCHEMES.has(scheme)) {
		return undefined;
	}
	let agentHostUri = toAgentHostUri(parsed, connectionAuthority);
	const isSkill = isSkillFileUri(parsed);
	// VS-Code-specific: links pointing at a `SKILL.md` file are rendered as a
	// rich skill pill rather than a plain markdown link. The chat renderer's
	// inline anchor widget keys off the `vscodeLinkType` query parameter (see
	// `chatInlineAnchorWidget.ts`), so we tag the URI here on the client side
	// rather than at the agent host. We do this whether or not the link came
	// in pre-tagged so older sessions and other agent providers also benefit.
	if (isSkill && !agentHostUri.query.includes('vscodeLinkType=')) {
		const existing = agentHostUri.query;
		agentHostUri = agentHostUri.with({ query: existing ? `${existing}&vscodeLinkType=skill` : 'vscodeLinkType=skill' });
	}
	const prefix = token.type === 'image' ? '![' : '[';
	// Preserve the label for skill links (so the skill pill renderer can show
	// the skill name) and for image alt text (accessibility — the inline
	// anchor widget only applies to links, not images). For all other
	// agent-host links, leave the text empty so the chat renderer's inline
	// anchor widget takes over with its rich file-widget rendering.
	// Escape only the characters that would break out of markdown link text
	// syntax (`\` and `]`); a full markdown escape would leave visible
	// backslashes in the skill pill which extracts text without re-parsing.
	const text = isSkill || token.type === 'image' ? escapeMarkdownLinkLabel(token.text ?? '') : '';
	return `${prefix}${text}](${agentHostUri.toString()})`;
}

/**
 * Returns true when the URI's basename is `SKILL.md` (case-insensitive).
 * Used to tag skill links so the chat renderer shows the rich skill pill
 * instead of a plain markdown anchor.
 */
function isSkillFileUri(uri: URI): boolean {
	const name = basename(uri);
	return name.toLowerCase() === 'skill.md';
}

/**
 * Wraps a raw markdown string into an {@link IMarkdownString}, rewriting
 * link URIs through {@link rewriteMarkdownLinks} when a connection authority
 * is provided.
 */
export function rawMarkdownToString(content: string, connectionAuthority: string | undefined): MarkdownString {
	const rewritten = connectionAuthority ? rewriteMarkdownLinks(content, connectionAuthority) : content;
	return new MarkdownString(rewritten);
}

/**
 * Converts a protocol `StringOrMarkdown` value to a chat-layer `IMarkdownString`.
 *
 * When `connectionAuthority` is provided, markdown link URIs are rewritten
 * through {@link rewriteMarkdownLinks} so that remote resources resolve
 * through the agent host filesystem provider.
 */
export function stringOrMarkdownToString(value: StringOrMarkdown, connectionAuthority: string | undefined): string | IMarkdownString;
export function stringOrMarkdownToString(value: StringOrMarkdown | undefined, connectionAuthority: string | undefined): string | IMarkdownString | undefined;
export function stringOrMarkdownToString(value: StringOrMarkdown | undefined, connectionAuthority: string | undefined): string | IMarkdownString | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value === 'string') {
		return value;
	}
	return rawMarkdownToString(value.markdown, connectionAuthority);
}

/**
 * Creates a live {@link ChatToolInvocation} from the protocol's tool-call
 * state. Used during active turns to represent running tool calls in the UI.
 *
 * @param connectionAuthority Sanitized connection identifier used when
 *   wrapping remote file URIs into `vscode-agent-host:` URIs. Omit to skip
 *   URI wrapping (e.g. in tests that don't exercise the confirmation UI).
 */
export function toolCallStateToInvocation(tc: ToolCallState, subAgentInvocationId: string | undefined, sessionResource: URI, connectionAuthority: string | undefined): ChatToolInvocation {
	const toolData: IToolData = {
		id: tc.toolName,
		source: ToolDataSource.Internal,
		displayName: tc.displayName,
		modelDescription: tc.toolName,
	};

	if (tc.status === ToolCallStatus.PendingConfirmation) {
		// Tool needs confirmation — create with confirmation messages.
		// (Subagent-spawning tools never reach this state in production: the
		// Copilot SDK's `task` tool doesn't request permission, and the event
		// mapper auto-emits `tool_ready` with `confirmed: NotNeeded` paired
		// with `tool_start`. So no special-case for subagents is needed here.)
		const confirmationMessages: IToolConfirmationMessages = {
			title: stringOrMarkdownToString(tc.confirmationTitle, connectionAuthority) ?? tc.displayName,
			message: stringOrMarkdownToString(tc.invocationMessage, connectionAuthority),
		};
		if (tc.options) {
			confirmationMessages.customOptions = tc.options;
		}

		let toolSpecificData: IChatTerminalToolInvocationData | IChatToolInputInvocationData | IChatModifiedFilesConfirmationData | undefined;
		const pendingEdits = tc.edits?.items;
		if (pendingEdits?.length) {
			const wrap = (uri: URI) => connectionAuthority ? toAgentHostUri(uri, connectionAuthority) : uri;
			const mapped = mapFileEdits(pendingEdits, tc.toolCallId);
			toolSpecificData = {
				kind: 'modifiedFilesConfirmation',
				options: ['Allow'],
				modifiedFiles: mapped.map(edit => {
					const resource = wrap(edit.resource);
					const originalResource = edit.originalResource ? wrap(edit.originalResource) : undefined;
					const modifiedContent = edit.afterContentUri ? wrap(edit.afterContentUri) : undefined;
					const originalContent = edit.beforeContentUri ? wrap(edit.beforeContentUri) : undefined;
					return {
						uri: resource,
						originalUri: originalResource,
						modifiedContentUri: modifiedContent,
						originalContentUri: originalContent,
						insertions: edit.diff?.added,
						deletions: edit.diff?.removed,
						title: basename(edit.resource),
						description: edit.resource.path,
					};
				}),
			};
		} else if (getToolKind(tc) === 'terminal' && tc.toolInput) {
			toolSpecificData = buildTerminalToolSpecificData(tc, sessionResource);
		} else if (tc.toolInput) {
			let rawInput: unknown;
			try { rawInput = JSON.parse(tc.toolInput); } catch { rawInput = { input: tc.toolInput }; }
			toolSpecificData = { kind: 'input', rawInput };
		}

		return new ChatToolInvocation(
			{
				invocationMessage: stringOrMarkdownToString(tc.invocationMessage, connectionAuthority),
				confirmationMessages,
				presentation: ToolInvocationPresentation.HiddenAfterComplete,
				toolSpecificData,
			},
			toolData,
			tc.toolCallId,
			subAgentInvocationId,
			undefined,
		);
	}

	const invocation = new ChatToolInvocation(undefined, toolData, tc.toolCallId, subAgentInvocationId, undefined);
	invocation.invocationMessage = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority) ?? localize('ahp.running', "Running {0}...", tc.displayName);

	if (isTerminalToolCall(tc)) {
		// Set terminal toolSpecificData eagerly so the renderer shows a
		// terminal pill (expandable command + output area) from the start,
		// instead of falling back to the generic tool widget that only
		// surfaces the first line of the command via the invocation message.
		// For the SDK's built-in `bash`/`powershell` tools there's no
		// Terminal content block (they run outside AHP's terminal infra),
		// so the AHP-terminal fields (`terminalToolSessionId`,
		// `terminalCommandUri`) stay undefined — the renderer treats this
		// as a display-only terminal that still surfaces command + output.
		invocation.toolSpecificData = buildTerminalToolSpecificData(tc, sessionResource);
	} else if (isSubagentTool(tc)) {
		// Subagent-spawning tool: set subagent toolSpecificData eagerly so the
		// renderer groups it correctly from the start (before child content
		// arrives). Agent metadata comes from `_meta` (set by the event
		// mapper from the tool's arguments) and is later refined by the
		// Subagent content block via `updateRunningToolSpecificData`.
		const subagentContent = (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Completed)
			? getToolSubagentContent(tc)
			: undefined;
		invocation.toolSpecificData = {
			kind: 'subagent',
			description: getSubagentTaskDescription(tc),
			agentName: subagentContent?.agentName ?? getSubagentAgentName(tc),
		};
	} else if (getToolKind(tc) === 'search') {
		invocation.toolSpecificData = { kind: 'search' };
	}

	return invocation;
}

/**
 * Updates a running tool invocation's `toolSpecificData` based on the
 * protocol tool call state. Handles terminal and subagent content detection.
 *
 * Called from the session handler when a tool transitions to Running state
 * to set the initial `toolSpecificData`, or when content changes arrive.
 */
export function updateRunningToolSpecificData(existing: ChatToolInvocation, tc: ToolCallState, sessionResource: URI, connectionAuthority: string | undefined): void {
	if (tc.status !== ToolCallStatus.Running) {
		return;
	}
	existing.invocationMessage = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority) ?? existing.invocationMessage;


	const subagentContent = getToolSubagentContent(tc);
	if (subagentContent) {
		existing.toolSpecificData = {
			kind: 'subagent',
			description: getSubagentTaskDescription(tc),
			agentName: subagentContent.agentName,
		};
		// toolSpecificData is a plain property — notify state observers
		// so ChatSubagentContentPart re-reads the updated metadata.
		existing.notifyToolSpecificDataChanged();
		return;
	}

	// Refresh subagent metadata from `_meta` (set by the event mapper from
	// the tool's arguments) in case it arrived after invocation creation.
	if (existing.toolSpecificData?.kind === 'subagent') {
		const description = getSubagentTaskDescription(tc) ?? existing.toolSpecificData.description;
		const agentName = getSubagentAgentName(tc) ?? existing.toolSpecificData.agentName;
		if (description !== existing.toolSpecificData.description || agentName !== existing.toolSpecificData.agentName) {
			existing.toolSpecificData = { kind: 'subagent', description, agentName };
			existing.notifyToolSpecificDataChanged();
		}
		return;
	}

	// Refresh terminal toolSpecificData as streaming text content arrives
	// (or when terminal toolSpecificData was not set up-front because the
	// tool transitioned through the Streaming state before reaching
	// Running). Preserves AHP-terminal fields (`terminalToolSessionId`,
	// `terminalCommandUri`, `terminalCommandId`) that `_reviveTerminalIfNeeded`
	// in the session handler populates asynchronously when a Terminal
	// content block is present.
	const existingTerminal = existing.toolSpecificData?.kind === 'terminal'
		? existing.toolSpecificData
		: undefined;
	if (isTerminalToolCall(tc, existing.toolSpecificData?.kind)) {
		const next = buildTerminalToolSpecificData(tc, sessionResource, existingTerminal);
		const outputChanged = next.terminalCommandOutput?.text !== existingTerminal?.terminalCommandOutput?.text;
		const commandChanged = next.commandLine.original !== existingTerminal?.commandLine.original;
		if (!existingTerminal || outputChanged || commandChanged) {
			existing.toolSpecificData = next;
			existing.notifyToolSpecificDataChanged();
		}
	}
}

/**
 * Data returned by {@link finalizeToolInvocation} describing file edits
 * that should be routed through the editing session's external edits pipeline.
 */
export interface IToolCallFileEdit {
	/** The kind of file operation. */
	readonly kind: FileEditKind;
	/** The primary file URI (after-URI for edits/creates/renames, before-URI for deletes). */
	readonly resource: URI;
	/** For renames, the original file URI before the move. */
	readonly originalResource?: URI;
	/** URI to read the before-snapshot content from. Absent for creates. */
	readonly beforeContentUri?: URI;
	/** URI to read the after-content from. Absent for deletes. */
	readonly afterContentUri?: URI;
	/** Undo stop ID for grouping edits. */
	readonly undoStopId: string;
	/** Optional diff display metadata. */
	readonly diff?: { added?: number; removed?: number };
}

/**
 * Updates a live {@link ChatToolInvocation} with completion data from the
 * protocol's tool-call state, transitioning it to the completed state.
 *
 * Returns file edits that the caller should route through the editing
 * session's external edits pipeline.
 */
export function finalizeToolInvocation(invocation: ChatToolInvocation, tc: ToolCallState, backendSession: URI, connectionAuthority: string | undefined): IToolCallFileEdit[] {
	const isCompleted = tc.status === ToolCallStatus.Completed;
	const isCancelled = tc.status === ToolCallStatus.Cancelled;
	const isTerminal = isTerminalToolCall(tc, invocation.toolSpecificData?.kind);

	if ((isCompleted || isCancelled) && hasKey(tc, { invocationMessage: true })) {
		invocation.invocationMessage = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority) ?? invocation.invocationMessage;
	}

	// Check for subagent content — set toolSpecificData so the UI renders a subagent widget
	if (isCompleted) {
		const subagentContent = getToolSubagentContent(tc);
		if (subagentContent) {
			const resultText = getToolOutputText(tc);
			invocation.toolSpecificData = {
				kind: 'subagent',
				description: getSubagentTaskDescription(tc),
				agentName: subagentContent.agentName,
				result: resultText,
			};
		} else if (invocation.toolSpecificData?.kind === 'subagent') {
			// Subagent-spawning tool that completed without a Subagent content
			// block. Refresh metadata + carry the tool's output as the result.
			invocation.toolSpecificData = {
				kind: 'subagent',
				description: getSubagentTaskDescription(tc) ?? invocation.toolSpecificData.description,
				agentName: getSubagentAgentName(tc) ?? invocation.toolSpecificData.agentName,
				result: getToolOutputText(tc),
			};
		}
	}

	if (isTerminal && (isCompleted || isCancelled)) {
		const existing = invocation.toolSpecificData?.kind === 'terminal' ? invocation.toolSpecificData : undefined;
		invocation.presentation = undefined;
		invocation.toolSpecificData = {
			...buildTerminalToolSpecificData(tc, backendSession, existing),
			terminalCommandState: { exitCode: isCompleted && tc.success ? 0 : 1 },
		};
	} else if (isCompleted && tc.pastTenseMessage) {
		invocation.pastTenseMessage = stringOrMarkdownToString(tc.pastTenseMessage, connectionAuthority);
	}

	const isFailure = (isCompleted && !tc.success) || isCancelled;
	const errorMessage = isCompleted ? tc.error?.message : (isCancelled ? tc.reasonMessage : undefined);
	const errorString = typeof errorMessage === 'string' ? errorMessage : errorMessage?.markdown;
	const fileEdits = isCompleted ? fileEditsToExternalEdits(tc) : [];

	// Hide the tool widget when file edits are shown separately via onFileEdits
	if (fileEdits.length > 0 && !isFailure) {
		invocation.presentation = ToolInvocationPresentation.Hidden;
	}

	const resultDetails = !isTerminal
		&& invocation.toolSpecificData?.kind !== 'subagent'
		&& getToolKind(tc) !== 'search'
		&& fileEdits.length === 0
		? getToolInputOutputDetails(tc, isFailure, errorString)
		: undefined;
	const result: IToolResult | undefined = isFailure || resultDetails
		? { content: [], toolResultError: isFailure ? errorString : undefined, toolResultDetails: resultDetails }
		: undefined;
	invocation.didExecuteTool(result);

	return fileEdits;
}

/**
 * Extracts file edit content entries from a completed tool call and
 * converts them to {@link IToolCallFileEdit} data for routing through
 * the editing session's external edits pipeline.
 */
export function fileEditsToExternalEdits(tc: ToolCallState): IToolCallFileEdit[] {
	if (tc.status !== ToolCallStatus.Completed) {
		return [];
	}
	const edits = getToolFileEdits(tc);
	if (edits.length === 0) {
		return [];
	}
	return mapFileEdits(edits, tc.toolCallId);
}

/**
 * Translates a list of {@link FileEdit} records into {@link IToolCallFileEdit}
 * entries suitable for the external edits pipeline or the chat modified-files
 * confirmation UI. Shared between completed tool edits and pending write
 * confirmations.
 */
function mapFileEdits(items: readonly FileEdit[], undoStopId: string): IToolCallFileEdit[] {
	const result: IToolCallFileEdit[] = [];
	for (const edit of items) {
		const isCreate = !edit.before && !!edit.after;
		const isDelete = !!edit.before && !edit.after;
		const isRename = !!edit.before && !!edit.after && !isEqual(URI.parse(edit.before.uri), URI.parse(edit.after.uri));

		let kind: FileEditKind;
		if (isCreate) {
			kind = FileEditKind.Create;
		} else if (isDelete) {
			kind = FileEditKind.Delete;
		} else if (isRename) {
			kind = FileEditKind.Rename;
		} else {
			kind = FileEditKind.Edit;
		}

		const resource = edit.after?.uri ? URI.parse(edit.after.uri) : edit.before?.uri ? URI.parse(edit.before.uri) : undefined;
		if (!resource) {
			continue;
		}

		result.push({
			kind,
			resource,
			originalResource: isRename ? URI.parse(edit.before!.uri) : undefined,
			beforeContentUri: edit.before?.content.uri ? URI.parse(edit.before.content.uri) : undefined,
			afterContentUri: edit.after?.content.uri ? URI.parse(edit.after.content.uri) : undefined,
			undoStopId,
			diff: edit.diff,
		});
	}
	return result;
}
