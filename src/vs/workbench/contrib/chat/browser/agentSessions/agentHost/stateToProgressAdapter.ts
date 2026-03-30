/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ToolCallStatus, TurnState, ResponsePartKind, getToolFileEdits, getToolOutputText, type IActiveTurn, type ICompletedToolCall, type IToolCallState, type ITurn } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { getToolKind, getToolLanguage } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { type IChatProgress, type IChatTerminalToolInvocationData, type IChatToolInputInvocationData, type IChatToolInvocationSerialized, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { type IChatSessionHistoryItem } from '../../../common/chatSessionsService.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { type IToolConfirmationMessages, type IToolData, ToolDataSource, ToolInvocationPresentation } from '../../../common/tools/languageModelToolsService.js';
import { hasKey } from '../../../../../../base/common/types.js';

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
 * Converts completed turns from the protocol state into session history items.
 */
export function turnsToHistory(turns: readonly ITurn[], participantId: string): IChatSessionHistoryItem[] {
	const history: IChatSessionHistoryItem[] = [];
	for (const turn of turns) {
		// Request
		history.push({ id: turn.id, type: 'request', prompt: turn.userMessage.text, participant: participantId });

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
function completedToolCallToSerialized(tc: ICompletedToolCall): IChatToolInvocationSerialized {
	const isTerminal = getToolKind(tc) === 'terminal';
	const isSuccess = tc.status === ToolCallStatus.Completed && tc.success;
	const invocationMsg = stringOrMarkdownToString(tc.invocationMessage) ?? '';

	let toolSpecificData: IChatTerminalToolInvocationData | undefined;
	if (isTerminal) {
		const ptyTerminal = getPtyTerminalData(tc._meta);
		const commandInput = ptyTerminal?.input ?? tc.toolInput;
		const toolOutput = tc.status === ToolCallStatus.Completed ? (ptyTerminal?.output ?? getToolOutputText(tc)) : undefined;
		if (!commandInput && toolOutput === undefined) {
			toolSpecificData = undefined;
		} else {
			toolSpecificData = {
				kind: 'terminal',
				commandLine: { original: commandInput ?? '' },
				language: getToolLanguage(tc) ?? 'shellscript',
				terminalCommandOutput: toolOutput !== undefined ? { text: toolOutput } : undefined,
				terminalCommandState: { exitCode: isSuccess ? 0 : 1 },
			};
		}
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
		toolSpecificData,
	};
}

/**
 * Builds edit-structure progress parts for a completed tool call that
 * produced file edits. Returns an empty array if the tool call has no edits.
 * These parts replay the undo stops and code-block UI when restoring history.
 */
function completedToolCallToEditParts(tc: ICompletedToolCall): IChatProgress[] {
	if (tc.status !== ToolCallStatus.Completed) {
		return [];
	}
	const fileEdits = getToolFileEdits(tc);
	if (fileEdits.length === 0) {
		return [];
	}
	const filePath = getFilePathFromToolInput(tc);
	if (!filePath) {
		return [];
	}
	const fileUri = URI.file(filePath);
	const parts: IChatProgress[] = [];
	for (const _edit of fileEdits) {
		parts.push({ kind: 'markdownContent', content: new MarkdownString('\n````\n') });
		parts.push({ kind: 'codeblockUri', uri: fileUri, isEdit: true, undoStopId: tc.toolCallId });
		parts.push({ kind: 'textEdit', uri: fileUri, edits: [], done: false, isExternalEdit: true });
		parts.push({ kind: 'textEdit', uri: fileUri, edits: [], done: true, isExternalEdit: true });
		parts.push({ kind: 'markdownContent', content: new MarkdownString('\n````\n') });
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
export function toolCallStateToInvocation(tc: IToolCallState): ChatToolInvocation {
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
			undefined,
			undefined,
		);
	}

	const invocation = new ChatToolInvocation(undefined, toolData, tc.toolCallId, undefined, undefined);
	invocation.invocationMessage = stringOrMarkdownToString(tc.invocationMessage) ?? '';

	if (getToolKind(tc) === 'terminal') {
		const ptyTerminal = getPtyTerminalData(tc._meta);
		const commandInput = ptyTerminal?.input ?? (tc.status !== ToolCallStatus.Streaming ? (tc.toolInput ?? '') : '');
		invocation.toolSpecificData = {
			kind: 'terminal',
			commandLine: { original: commandInput },
			language: getToolLanguage(tc) ?? 'shellscript',
			terminalCommandOutput: ptyTerminal?.output !== undefined ? { text: ptyTerminal.output } : undefined,
		} satisfies IChatTerminalToolInvocationData;
	}

	return invocation;
}

/**
 * Data returned by {@link finalizeToolInvocation} describing file edits
 * that should be routed through the editing session's external edits pipeline.
 */
export interface IToolCallFileEdit {
	/** The real file URI on the remote (e.g., `file:///path/to/file`). */
	readonly resource: URI;
	/** URI to read the before-snapshot content from. */
	readonly beforeContentUri: URI;
	/** URI to read the after-content from (real file on remote via agenthost:// scheme). */
	readonly afterContentUri: URI;
	/** Undo stop ID for grouping edits. */
	readonly undoStopId: string;
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
	const isTerminal = invocation.toolSpecificData?.kind === 'terminal' || getToolKind(tc) === 'terminal';

	if ((isCompleted || isCancelled) && hasKey(tc, { invocationMessage: true })) {
		invocation.invocationMessage = stringOrMarkdownToString(tc.invocationMessage) ?? invocation.invocationMessage;
	}

	if (isTerminal && (isCompleted || isCancelled)) {
		const ptyTerminal = getPtyTerminalData(tc._meta);
		const toolOutput = isCompleted ? (ptyTerminal?.output ?? getToolOutputText(tc)) : undefined;
		const existing = invocation.toolSpecificData as IChatTerminalToolInvocationData | undefined;
		const commandInput = ptyTerminal?.input ?? tc.toolInput ?? existing?.commandLine?.original ?? '';
		invocation.toolSpecificData = {
			kind: 'terminal',
			commandLine: { original: commandInput },
			language: existing?.language ?? getToolLanguage(tc) ?? 'shellscript',
			terminalCommandOutput: toolOutput !== undefined ? { text: toolOutput } : undefined,
			terminalCommandState: { exitCode: isCompleted && tc.success ? 0 : 1 },
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
		const filePath = getFilePathFromToolInput(tc);
		if (filePath) {
			result.push({
				resource: URI.file(filePath),
				beforeContentUri: URI.parse(edit.beforeURI),
				afterContentUri: URI.parse(edit.afterURI),
				undoStopId: tc.toolCallId,
			});
		}
	}
	return result;
}

/**
 * Extracts the file path from a tool call's input parameters.
 * Edit tools store the file path in JSON parameters as `path`.
 */
export function getFilePathFromToolInput(tc: IToolCallState): string | undefined {
	if (tc.status !== ToolCallStatus.Completed || !tc.toolInput) {
		return undefined;
	}
	try {
		const params = JSON.parse(tc.toolInput);
		return typeof params.path === 'string' ? params.path : undefined;
	} catch {
		return undefined;
	}
}
