/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ToolCallStatus, TurnState, ResponsePartKind, getToolFileEdits, getToolOutputText, getToolSubagentContent, type IActiveTurn, type ICompletedToolCall, type IToolCallState, type ITurn, FileEditKind, ToolResultContentType, type IToolResultContent } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { getToolKind, getToolLanguage } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { type IChatProgress, type IChatTerminalToolInvocationData, type IChatToolInputInvocationData, type IChatToolInvocationSerialized, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { type IChatSessionHistoryItem } from '../../../common/chatSessionsService.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { type IToolConfirmationMessages, type IToolData, ToolDataSource, ToolInvocationPresentation } from '../../../common/tools/languageModelToolsService.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { hasKey } from '../../../../../../base/common/types.js';

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
 * fallback when the server hasn't set `_meta.toolKind` or subagent content
 * (e.g. sessions restored by an older server version).
 */
const SUBAGENT_TOOL_NAMES: ReadonlySet<string> = new Set(['task']);

function isSubagentToolName(toolName: string): boolean {
	return SUBAGENT_TOOL_NAMES.has(toolName);
}

function getPtyTerminalData(meta: Record<string, unknown> | undefined): { input?: string; output?: string } | undefined {
	if (!meta) {
		return undefined;
	}
	const value = meta['ptyTerminal'];
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const input = (value as { input?: unknown }).input;
	const output = (value as { output?: unknown }).output;
	return {
		input: typeof input === 'string' ? input : undefined,
		output: typeof output === 'string' ? output : undefined,
	};
}

/**
 * Finds a terminal content block in a tool call's content array.
 * Returns the terminal URI if found.
 */
export function getTerminalContentUri(content: IToolResultContent[] | undefined): string | undefined {
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
 * Converts completed turns from the protocol state into session history items.
 */
export function turnsToHistory(turns: readonly ITurn[], participantId: string, modelId?: string): IChatSessionHistoryItem[] {
	const history: IChatSessionHistoryItem[] = [];
	for (const turn of turns) {
		// Request
		history.push({ id: turn.id, type: 'request', prompt: turn.userMessage.text, participant: participantId, modelId });

		// Response parts — iterate the unified responseParts array
		const parts: IChatProgress[] = [];

		for (const rp of turn.responseParts) {
			switch (rp.kind) {
				case ResponsePartKind.Markdown:
					if (rp.content) {
						parts.push({ kind: 'markdownContent', content: new MarkdownString(rp.content, { supportHtml: true }) });
					}
					break;
				case ResponsePartKind.ToolCall: {
					const tc = rp.toolCall as ICompletedToolCall;
					const fileEditParts = completedToolCallToEditParts(tc);
					const serialized = completedToolCallToSerialized(tc);
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

		history.push({ type: 'response', parts, participant: participantId });
	}
	return history;
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
export function activeTurnToProgress(activeTurn: IActiveTurn): IChatProgress[] {
	const parts: IChatProgress[] = [];

	for (const rp of activeTurn.responseParts) {
		switch (rp.kind) {
			case ResponsePartKind.Markdown:
				if (rp.content) {
					parts.push({ kind: 'markdownContent', content: new MarkdownString(rp.content) });
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
					parts.push(completedToolCallToSerialized(tc as ICompletedToolCall));
				} else if (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Streaming || tc.status === ToolCallStatus.PendingConfirmation) {
					parts.push(toolCallStateToInvocation(tc));
				}
				break;
			}
			case ResponsePartKind.ContentRef:
				break;
		}
	}

	return parts;
}

/**
 * Converts a completed tool call from the protocol state into a serialized
 * tool invocation suitable for history replay.
 */
export function completedToolCallToSerialized(tc: ICompletedToolCall, subAgentInvocationId?: string): IChatToolInvocationSerialized {
	const terminalContentUri = tc.status === ToolCallStatus.Completed ? getTerminalContentUri(tc.content) : undefined;
	const isTerminal = getToolKind(tc) === 'terminal' || !!terminalContentUri;
	const isSuccess = tc.status === ToolCallStatus.Completed && tc.success;
	const invocationMsg = stringOrMarkdownToString(tc.invocationMessage) ?? '';

	// Check for subagent content
	const subagentContent = tc.status === ToolCallStatus.Completed ? getToolSubagentContent(tc) : undefined;
	const isSubagent = subagentContent || getToolKind(tc) === 'subagent' || isSubagentToolName(tc.toolName);
	if (isSubagent && tc.status === ToolCallStatus.Completed) {
		const resultText = getToolOutputText(tc);
		const pastTenseMsg = isSuccess
			? stringOrMarkdownToString(tc.pastTenseMessage) ?? invocationMsg
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

	let toolSpecificData: IChatTerminalToolInvocationData | undefined;
	if (isTerminal) {
		const ptyTerminal = getPtyTerminalData(tc._meta);
		const commandInput = ptyTerminal?.input ?? tc.toolInput;
		const toolOutput = tc.status === ToolCallStatus.Completed ? (ptyTerminal?.output ?? getToolOutputText(tc)) : undefined;
		toolSpecificData = {
			kind: 'terminal',
			commandLine: { original: commandInput ?? '' },
			language: getToolLanguage(tc) ?? 'shellscript',
			terminalToolSessionId: terminalContentUri,
			terminalCommandUri: terminalContentUri ? URI.parse(terminalContentUri) : undefined,
			terminalCommandOutput: toolOutput !== undefined ? { text: toolOutput } : undefined,
			terminalCommandState: { exitCode: isSuccess ? 0 : 1 },
		};
	}

	const pastTenseMsg = isSuccess
		? stringOrMarkdownToString(tc.pastTenseMessage) ?? invocationMsg
		: invocationMsg;

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
	};
}

/**
 * Builds edit-structure progress parts for a completed tool call that
 * produced file edits. Returns an empty array if the tool call has no edits.
 * These parts replay the undo stops and code-block UI when restoring history.
 */
export function completedToolCallToEditParts(tc: ICompletedToolCall): IChatProgress[] {
	if (tc.status !== ToolCallStatus.Completed) {
		return [];
	}
	const fileEdits = getToolFileEdits(tc);
	if (fileEdits.length === 0) {
		return [];
	}
	const parts: IChatProgress[] = [];
	for (const edit of fileEdits) {
		const fileUri = edit.after?.uri ? URI.parse(edit.after.uri) : edit.before?.uri ? URI.parse(edit.before.uri) : undefined;
		if (!fileUri) {
			continue;
		}
		// Emit workspace file edit progress for creates, deletes, and renames
		const isCreate = !edit.before && !!edit.after;
		const isDelete = !!edit.before && !edit.after;
		const isRename = !!edit.before && !!edit.after && !isEqual(URI.parse(edit.before.uri), URI.parse(edit.after.uri));
		if (isCreate || isDelete || isRename) {
			parts.push({
				kind: 'workspaceEdit',
				edits: [{
					oldResource: edit.before?.uri ? URI.parse(edit.before.uri) : undefined,
					newResource: edit.after?.uri ? URI.parse(edit.after.uri) : undefined,
				}],
			});
		}
		// Emit code-block UI for content edits (and renames with content changes)
		if (edit.after?.content) {
			parts.push({ kind: 'markdownContent', content: new MarkdownString('\n````\n') });
			parts.push({ kind: 'codeblockUri', uri: fileUri, isEdit: true, undoStopId: tc.toolCallId });
			parts.push({ kind: 'textEdit', uri: fileUri, edits: [], done: false, isExternalEdit: true });
			parts.push({ kind: 'textEdit', uri: fileUri, edits: [], done: true, isExternalEdit: true });
			parts.push({ kind: 'markdownContent', content: new MarkdownString('\n````\n') });
		}
	}
	return parts;
}

/**
 * Creates a live {@link ChatToolInvocation} from the protocol's tool-call
 * state. Used during active turns to represent running tool calls in the UI.
 */
/**
 * Converts a protocol `StringOrMarkdown` value to a chat-layer `IMarkdownString`.
 */
function stringOrMarkdownToString(value: string | { readonly markdown: string } | undefined): string | IMarkdownString | undefined {
	if (value === undefined) {
		return undefined;
	}
	return typeof value === 'string' ? value : new MarkdownString(value.markdown);
}

/**
 * Creates a live {@link ChatToolInvocation} from the protocol's tool-call
 * state. Used during active turns to represent running tool calls in the UI.
 */
export function toolCallStateToInvocation(tc: IToolCallState, subAgentInvocationId?: string): ChatToolInvocation {
	const toolData: IToolData = {
		id: tc.toolName,
		source: ToolDataSource.Internal,
		displayName: tc.displayName,
		modelDescription: tc.toolName,
	};

	if (tc.status === ToolCallStatus.PendingConfirmation) {
		// Tool needs confirmation — create with confirmation messages
		const titleText = stringOrMarkdownToString(tc.confirmationTitle) ?? stringOrMarkdownToString(tc.invocationMessage) ?? tc.displayName;
		const titleStr = typeof titleText === 'string' ? titleText : titleText?.value ?? '';
		const confirmationMessages: IToolConfirmationMessages = {
			title: typeof titleText === 'string' ? new MarkdownString(titleText) : (titleText ?? new MarkdownString('')),
			message: new MarkdownString(''),
		};

		let toolSpecificData: IChatTerminalToolInvocationData | IChatToolInputInvocationData | undefined;
		if (getToolKind(tc) === 'terminal' && tc.toolInput) {
			toolSpecificData = {
				kind: 'terminal',
				commandLine: { original: tc.toolInput },
				language: getToolLanguage(tc) ?? 'shellscript',
			};
		} else if (tc.toolInput) {
			let rawInput: unknown;
			try { rawInput = JSON.parse(tc.toolInput); } catch { rawInput = { input: tc.toolInput }; }
			toolSpecificData = { kind: 'input', rawInput };
		}

		return new ChatToolInvocation(
			{
				invocationMessage: typeof titleText === 'string' ? new MarkdownString(titleStr) : (titleText ?? new MarkdownString('')),
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
	invocation.invocationMessage = stringOrMarkdownToString(tc.invocationMessage) ?? '';

	const terminalContentUri = (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Completed)
		? getTerminalContentUri(tc.content)
		: undefined;
	if (getToolKind(tc) === 'terminal' || terminalContentUri) {
		const ptyTerminal = getPtyTerminalData(tc._meta);
		const commandInput = ptyTerminal?.input ?? (tc.status !== ToolCallStatus.Streaming ? (tc.toolInput ?? '') : '');
		invocation.toolSpecificData = {
			kind: 'terminal',
			commandLine: { original: commandInput },
			language: getToolLanguage(tc) ?? 'shellscript',
			terminalToolSessionId: terminalContentUri,
			terminalCommandUri: terminalContentUri ? URI.parse(terminalContentUri) : undefined,
			terminalCommandOutput: ptyTerminal?.output !== undefined ? { text: ptyTerminal.output } : undefined,
		} satisfies IChatTerminalToolInvocationData;
	} else if (getToolKind(tc) === 'subagent' || isSubagentToolName(tc.toolName)) {
		// Subagent-spawning tool: set subagent toolSpecificData eagerly so the
		// renderer groups it correctly from the start (before content arrives).
		// Agent metadata is extracted from tool arguments in the event mapper.
		const metaDesc = tc._meta?.subagentDescription;
		const metaAgent = tc._meta?.subagentAgentName;
		invocation.toolSpecificData = {
			kind: 'subagent',
			description: typeof metaDesc === 'string' ? metaDesc : undefined,
			agentName: typeof metaAgent === 'string' ? metaAgent : undefined,
		};
	} else if (tc.status === ToolCallStatus.Running) {
		// Check for subagent content on initial creation (e.g. from snapshot)
		const subagentContent = getToolSubagentContent(tc);
		if (subagentContent) {
			invocation.toolSpecificData = {
				kind: 'subagent',
				description: getSubagentTaskDescription(tc),
				agentName: subagentContent.agentName,
			};
		}
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
export function updateRunningToolSpecificData(existing: ChatToolInvocation, tc: IToolCallState): void {
	if (tc.status !== ToolCallStatus.Running) {
		return;
	}
	existing.invocationMessage = typeof tc.invocationMessage === 'string'
		? tc.invocationMessage
		: new MarkdownString(tc.invocationMessage.markdown);
	if (getToolKind(tc) === 'terminal' && tc.toolInput) {
		existing.toolSpecificData = {
			kind: 'terminal',
			commandLine: { original: tc.toolInput },
			language: getToolLanguage(tc) ?? 'shellscript',
		};
	} else {
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
export function finalizeToolInvocation(invocation: ChatToolInvocation, tc: IToolCallState): IToolCallFileEdit[] {
	const isCompleted = tc.status === ToolCallStatus.Completed;
	const isCancelled = tc.status === ToolCallStatus.Cancelled;
	const terminalContentUri = tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Completed
		? getTerminalContentUri(tc.content)
		: undefined;
	const isTerminal = invocation.toolSpecificData?.kind === 'terminal' || !!terminalContentUri;

	if ((isCompleted || isCancelled) && hasKey(tc, { invocationMessage: true })) {
		invocation.invocationMessage = stringOrMarkdownToString(tc.invocationMessage) ?? invocation.invocationMessage;
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
		}
	}

	if (isTerminal && (isCompleted || isCancelled)) {
		const toolOutput = isCompleted ? getToolOutputText(tc) : undefined;
		const existing = invocation.toolSpecificData as IChatTerminalToolInvocationData | undefined;
		const commandInput = tc.toolInput ?? existing?.commandLine?.original ?? '';
		invocation.presentation = undefined;
		invocation.toolSpecificData = {
			kind: 'terminal',
			commandLine: { original: commandInput },
			language: 'shellscript',
			terminalToolSessionId: terminalContentUri ?? existing?.terminalToolSessionId,
			terminalCommandOutput: toolOutput !== undefined ? { text: toolOutput } : undefined,
			terminalCommandState: { exitCode: isCompleted && tc.success ? 0 : 1 },
			terminalCommandUri: terminalContentUri ? URI.parse(terminalContentUri) : existing?.terminalCommandUri,
		};
	} else if (isCompleted && tc.pastTenseMessage) {
		invocation.pastTenseMessage = stringOrMarkdownToString(tc.pastTenseMessage);
	}

	const isFailure = (isCompleted && !tc.success) || isCancelled;
	const errorMessage = isCompleted ? tc.error?.message : (isCancelled ? tc.reasonMessage : undefined);
	const errorString = typeof errorMessage === 'string' ? errorMessage : errorMessage?.markdown;
	invocation.didExecuteTool(isFailure ? { content: [], toolResultError: errorString } : undefined);

	// Extract file edits for the editing session pipeline
	return isCompleted ? fileEditsToExternalEdits(tc) : [];
}

/**
 * Extracts file edit content entries from a completed tool call and
 * converts them to {@link IToolCallFileEdit} data for routing through
 * the editing session's external edits pipeline.
 */
export function fileEditsToExternalEdits(tc: IToolCallState): IToolCallFileEdit[] {
	if (tc.status !== ToolCallStatus.Completed) {
		return [];
	}
	const edits = getToolFileEdits(tc);
	if (edits.length === 0) {
		return [];
	}
	const result: IToolCallFileEdit[] = [];
	for (const edit of edits) {
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
			undoStopId: tc.toolCallId,
			diff: edit.diff,
		});
	}
	return result;
}
