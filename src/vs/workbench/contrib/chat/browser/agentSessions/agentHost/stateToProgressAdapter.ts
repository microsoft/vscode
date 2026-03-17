/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { ToolCallStatus, TurnState, type ICompletedToolCall, type IPermissionRequest, type IToolCallState, type ITurn } from '../../../../../../platform/agentHost/common/state/sessionState.js';
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
	const isTerminal = tc.toolKind === 'terminal';

	let toolSpecificData: IChatTerminalToolInvocationData | undefined;
	if (isTerminal && tc.toolInput) {
		toolSpecificData = {
			kind: 'terminal',
			commandLine: { original: tc.toolInput },
			language: tc.language ?? 'shellscript',
			terminalCommandOutput: tc.toolOutput !== undefined ? { text: tc.toolOutput } : undefined,
			terminalCommandState: { exitCode: tc.success ? 0 : 1 },
		};
	}

	return {
		kind: 'toolInvocationSerialized',
		toolCallId: tc.toolCallId,
		toolId: tc.toolName,
		source: ToolDataSource.Internal,
		invocationMessage: new MarkdownString(tc.invocationMessage),
		originMessage: undefined,
		pastTenseMessage: isTerminal ? undefined : new MarkdownString(tc.pastTenseMessage),
		isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
		isComplete: true,
		presentation: undefined,
		toolSpecificData,
	};
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

	let parameters: unknown;
	if (tc.toolArguments) {
		try { parameters = JSON.parse(tc.toolArguments); } catch { /* malformed JSON */ }
	}

	const invocation = new ChatToolInvocation(undefined, toolData, tc.toolCallId, undefined, parameters);
	invocation.invocationMessage = new MarkdownString(tc.invocationMessage);

	if (tc.toolKind === 'terminal' && tc.toolInput) {
		invocation.toolSpecificData = {
			kind: 'terminal',
			commandLine: { original: tc.toolInput },
			language: tc.language ?? 'shellscript',
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
		case 'shell': {
			title = perm.intention ?? 'Run command';
			toolSpecificData = perm.fullCommandText ? {
				kind: 'terminal',
				commandLine: { original: perm.fullCommandText },
				language: 'shellscript',
			} : undefined;
			break;
		}
		case 'write': {
			title = perm.path ? `Edit ${perm.path}` : 'Edit file';
			let rawInput: unknown;
			try { rawInput = perm.rawRequest ? JSON.parse(perm.rawRequest) : { path: perm.path }; } catch { rawInput = { path: perm.path }; }
			toolSpecificData = { kind: 'input', rawInput };
			break;
		}
		case 'mcp': {
			const toolTitle = perm.toolName ?? 'MCP Tool';
			title = perm.serverName ? `${perm.serverName}: ${toolTitle}` : toolTitle;
			let rawInput: unknown;
			try { rawInput = perm.rawRequest ? JSON.parse(perm.rawRequest) : { serverName: perm.serverName, toolName: perm.toolName }; } catch { rawInput = { serverName: perm.serverName, toolName: perm.toolName }; }
			toolSpecificData = { kind: 'input', rawInput };
			break;
		}
		case 'read': {
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
	if (invocation.toolSpecificData?.kind === 'terminal') {
		const terminalData = invocation.toolSpecificData as IChatTerminalToolInvocationData;
		invocation.toolSpecificData = {
			...terminalData,
			terminalCommandOutput: tc.toolOutput !== undefined ? { text: tc.toolOutput } : undefined,
			terminalCommandState: { exitCode: tc.status === ToolCallStatus.Completed ? 0 : 1 },
		};
	} else if (tc.pastTenseMessage) {
		invocation.pastTenseMessage = new MarkdownString(tc.pastTenseMessage);
	}

	const isFailure = tc.status === ToolCallStatus.Failed;
	invocation.didExecuteTool(isFailure ? { content: [], toolResultError: tc.error?.message } : undefined);
}
