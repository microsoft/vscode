/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { PermissionKind, ToolCallStatus, TurnState, getToolOutputText, type ICompletedToolCall, type IPermissionRequest, type IToolCallState, type ITurn } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { getToolKind, getToolLanguage } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { type IChatProgress, type IChatTerminalToolInvocationData, type IChatToolInputInvocationData, type IChatToolInvocationSerialized, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { type IChatSessionHistoryItem } from '../../../common/chatSessionsService.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { type IPreparedToolInvocation, type IToolConfirmationMessages, type IToolData, ToolDataSource, ToolInvocationPresentation } from '../../../common/tools/languageModelToolsService.js';

/**
 * Converts completed turns from the protocol state into session history items.
 */
export function turnsToHistory(turns: readonly ITurn[], participantId: string): IChatSessionHistoryItem[] {
	const history: IChatSessionHistoryItem[] = [];
	for (const turn of turns) {
		// Request
		history.push({ type: 'request', prompt: turn.userMessage.text, participant: participantId });

		// Response parts
		const parts: IChatProgress[] = [];

		// Assistant response text
		if (turn.responseText) {
			parts.push({ kind: 'markdownContent', content: new MarkdownString(turn.responseText) });
		}

		// Completed tool calls
		for (const tc of turn.toolCalls) {
			parts.push(completedToolCallToSerialized(tc));
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
 * Converts a completed tool call from the protocol state into a serialized
 * tool invocation suitable for history replay.
 */
function completedToolCallToSerialized(tc: ICompletedToolCall): IChatToolInvocationSerialized {
	const isTerminal = getToolKind(tc) === 'terminal';
	const isSuccess = tc.status === ToolCallStatus.Completed && tc.success;
	const invocationMsg = stringOrMarkdownToString(tc.invocationMessage) ?? '';

	let toolSpecificData: IChatTerminalToolInvocationData | undefined;
	if (isTerminal && tc.toolInput) {
		const toolOutput = tc.status === ToolCallStatus.Completed ? getToolOutputText(tc) : undefined;
		toolSpecificData = {
			kind: 'terminal',
			commandLine: { original: tc.toolInput },
			language: getToolLanguage(tc) ?? 'shellscript',
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
		toolSpecificData,
	};
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

	const invocation = new ChatToolInvocation(undefined, toolData, tc.toolCallId, undefined, undefined);
	invocation.invocationMessage = stringOrMarkdownToString(tc.invocationMessage) ?? '';

	if (getToolKind(tc) === 'terminal') {
		invocation.toolSpecificData = {
			kind: 'terminal',
			commandLine: { original: tc.status !== ToolCallStatus.Streaming ? (tc.toolInput ?? '') : '' },
			language: getToolLanguage(tc) ?? 'shellscript',
		} satisfies IChatTerminalToolInvocationData;
	}

	return invocation;
}

/**
 * Creates a {@link ChatToolInvocation} with confirmation messages from a
 * protocol permission request. The resulting invocation starts in the
 * waiting-for-confirmation state.
 */
export function permissionToConfirmation(perm: IPermissionRequest): ChatToolInvocation {
	let title: string;
	let toolSpecificData: IChatTerminalToolInvocationData | IChatToolInputInvocationData | undefined;

	switch (perm.permissionKind) {
		case PermissionKind.Shell: {
			title = perm.intention ?? 'Run command';
			toolSpecificData = perm.fullCommandText ? {
				kind: 'terminal',
				commandLine: { original: perm.fullCommandText },
				language: 'shellscript',
			} : undefined;
			break;
		}
		case PermissionKind.Write: {
			title = perm.path ? `Edit ${perm.path}` : 'Edit file';
			let rawInput: unknown;
			try { rawInput = perm.rawRequest ? JSON.parse(perm.rawRequest) : { path: perm.path }; } catch { rawInput = { path: perm.path }; }
			toolSpecificData = { kind: 'input', rawInput };
			break;
		}
		case PermissionKind.Mcp: {
			const toolTitle = perm.toolName ?? 'MCP Tool';
			title = perm.serverName ? `${perm.serverName}: ${toolTitle}` : toolTitle;
			let rawInput: unknown;
			try { rawInput = perm.rawRequest ? JSON.parse(perm.rawRequest) : { serverName: perm.serverName, toolName: perm.toolName }; } catch { rawInput = { serverName: perm.serverName, toolName: perm.toolName }; }
			toolSpecificData = { kind: 'input', rawInput };
			break;
		}
		case PermissionKind.Read: {
			title = perm.intention ?? 'Read file';
			let rawInput: unknown;
			try { rawInput = perm.rawRequest ? JSON.parse(perm.rawRequest) : { path: perm.path, intention: perm.intention }; } catch { rawInput = { path: perm.path, intention: perm.intention }; }
			toolSpecificData = { kind: 'input', rawInput };
			break;
		}
		default: {
			title = 'Permission request';
			let rawInput: unknown;
			try { rawInput = perm.rawRequest ? JSON.parse(perm.rawRequest) : {}; } catch { rawInput = {}; }
			toolSpecificData = { kind: 'input', rawInput };
			break;
		}
	}

	const confirmationMessages: IToolConfirmationMessages = {
		title: new MarkdownString(title),
		message: new MarkdownString(''),
	};

	const toolData: IToolData = {
		id: `permission_${perm.permissionKind}`,
		source: ToolDataSource.Internal,
		displayName: title,
		modelDescription: '',
	};

	const preparedInvocation: IPreparedToolInvocation = {
		invocationMessage: new MarkdownString(title),
		confirmationMessages,
		presentation: ToolInvocationPresentation.HiddenAfterComplete,
		toolSpecificData,
	};

	return new ChatToolInvocation(preparedInvocation, toolData, perm.requestId, undefined, undefined);
}

/**
 * Updates a live {@link ChatToolInvocation} with completion data from the
 * protocol's tool-call state, transitioning it to the completed state.
 */
export function finalizeToolInvocation(invocation: ChatToolInvocation, tc: IToolCallState): void {
	const isCompleted = tc.status === ToolCallStatus.Completed;
	const isCancelled = tc.status === ToolCallStatus.Cancelled;
	const isTerminal = invocation.toolSpecificData?.kind === 'terminal' || getToolKind(tc) === 'terminal';

	if (isTerminal && (isCompleted || isCancelled)) {
		const toolOutput = isCompleted ? getToolOutputText(tc) : undefined;
		const existing = invocation.toolSpecificData as IChatTerminalToolInvocationData | undefined;
		invocation.toolSpecificData = {
			kind: 'terminal',
			commandLine: existing?.commandLine ?? { original: tc.toolInput ?? '' },
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
}
