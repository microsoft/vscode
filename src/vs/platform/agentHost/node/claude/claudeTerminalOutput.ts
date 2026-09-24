/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { buildNonPtyShellTerminalUri } from '../../common/nonPtyShellTerminalUri.js';
import { ISessionDataService, MAX_TERMINAL_OUTPUT_BYTES, type ISessionDatabase } from '../../common/sessionDataService.js';
import { parseChatUri, ResponsePartKind, ToolCallStatus, ToolResultContentType, type ToolResultTerminalContent, type Turn } from '../../common/state/sessionState.js';
import type { ClaudeMapperState } from './claudeMapSessionEvents.js';
import { getClaudeToolDisplayName } from './claudeToolDisplay.js';

// The SDK uses one generic command tool name for Bash, PowerShell, and other
// executable invocations. BashOutput and KillBash are separate lifecycle tools.
const CLAUDE_SHELL_TOOL_NAME = 'Bash';

/**
 * The notice Claude returns to the model in place of shell output that is too
 * large to send inline. It names the file with the complete output and includes
 * a preview of its beginning.
 */
const PERSISTED_OUTPUT_NOTICE = /^<persisted-output>\n[^\n]*\n\nPreview \(first [^)\n]*\):\n(?<preview>[\s\S]*?)\n(?:\.\.\.\n)?<\/persisted-output>/;

type ToolResultParts = string | readonly { readonly type: string; readonly text?: unknown }[] | undefined;

/**
 * Retains the complete output Claude saves for large shell results in the
 * owning chat's session database and exposes it as a non-PTY terminal resource.
 * The SDK names its shell tool `Bash`, including commands that invoke
 * PowerShell. Subscribers receive exited terminal state rebuilt from the
 * database, so no terminal is kept alive for completed output.
 */
export class ClaudeTerminalOutputs {

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
	) { }

	/**
	 * Stores the output Claude saved for a top-level shell result and stages its
	 * terminal content on `state`, so the mapper publishes the content with the
	 * completion. Callers must await this before mapping `message`; the returned
	 * id lets them discard cancellation that races the final abort check.
	 */
	async capture(storage: URI, chat: URI, turnId: string, message: Extract<SDKMessage, { type: 'user' }>, state: ClaudeMapperState, signal?: AbortSignal): Promise<string | undefined> {
		const outputPath = getPersistedOutputPath(message.tool_use_result);
		const blocks = message.message.content;
		if (!outputPath || message.parent_tool_use_id !== null || !Array.isArray(blocks)) {
			return;
		}
		// `tool_use_result` is the structured output of the message's only tool result.
		const results = blocks.flatMap(block => block.type === 'tool_result' ? [block] : []);
		const result = results.length === 1 ? results[0] : undefined;
		const toolCall = result && state.toolCalls.lookup(result.tool_use_id);
		if (!result || toolCall?.toolName !== CLAUDE_SHELL_TOOL_NAME) {
			return;
		}
		const title = toolCall.info?.displayName ?? getClaudeToolDisplayName(toolCall.toolName);
		const terminal = buildTerminalContent(storage, chat, result.tool_use_id, title, getText(result.content), result.is_error !== true);
		if (!terminal) {
			return;
		}
		let database: IReference<ISessionDatabase> | undefined;
		try {
			const output = await this._fileService.readFile(URI.file(outputPath), { limits: { size: MAX_TERMINAL_OUTPUT_BYTES } });
			if (signal?.aborted) {
				return;
			}
			database = this._sessionDataService.openDatabase(storage);
			// The output belongs to its turn so truncation removes it. Claude creates
			// turn rows lazily, as it does for file edits.
			await database.object.createTurn(turnId);
			await database.object.storeTerminalOutput(turnId, result.tool_use_id, output.value.buffer);
			if (signal?.aborted) {
				await database.object.deleteTerminalOutput(result.tool_use_id);
				return;
			}
			state.cacheTerminalOutput(result.tool_use_id, terminal);
			return result.tool_use_id;
		} catch (error) {
			this._logService.warn(`[Claude] Failed to retain shell output for ${result.tool_use_id}`, error);
		} finally {
			database?.dispose();
		}
	}

	async discard(storage: URI, toolCallId: string, state: ClaudeMapperState): Promise<void> {
		state.takeTerminalOutput(toolCallId);
		state.completeToolCall(toolCallId);
		let database: IReference<ISessionDatabase> | undefined;
		try {
			database = this._sessionDataService.openDatabase(storage);
			await database.object.deleteTerminalOutput(toolCallId);
		} catch (error) {
			this._logService.warn(`[Claude] Failed to discard retained shell output for ${toolCallId}`, error);
		} finally {
			database?.dispose();
		}
	}

	/**
	 * Attaches retained output to completed shell calls restored from Claude's
	 * transcript, which records only the model-facing result.
	 */
	async restore(storage: URI, chat: URI, turns: readonly Turn[]): Promise<void> {
		const toolCalls = turns.flatMap(turn => turn.responseParts.flatMap(part =>
			part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed && part.toolCall.toolName === CLAUDE_SHELL_TOOL_NAME ? [part.toolCall] : []));
		if (toolCalls.length === 0) {
			return;
		}
		try {
			const database = await this._sessionDataService.tryOpenDatabase(storage);
			if (!database) {
				return;
			}
			try {
				for (const toolCall of toolCalls) {
					if (await database.object.getTerminalOutputSize(toolCall.toolCallId) === undefined) {
						continue;
					}
					const terminal = buildTerminalContent(storage, chat, toolCall.toolCallId, toolCall.displayName, getText(toolCall.content), toolCall.success);
					if (terminal) {
						toolCall.content = [...(toolCall.content ?? []), terminal];
					}
				}
			} finally {
				database.dispose();
			}
		} catch (error) {
			this._logService.warn(`[Claude] Failed to restore retained shell output for ${chat.toString()}`, error);
		}
	}
}

/**
 * Returns the file with the complete output of a shell result. A backgrounded
 * command saves a snapshot while it keeps running, which is not its complete
 * output.
 */
function getPersistedOutputPath(result: unknown): string | undefined {
	if (typeof result !== 'object' || result === null) {
		return undefined;
	}
	const output = result as { readonly persistedOutputPath?: unknown; readonly backgroundTaskId?: unknown };
	return typeof output.persistedOutputPath === 'string' && output.backgroundTaskId === undefined ? output.persistedOutputPath : undefined;
}

function getText(content: ToolResultParts): string | undefined {
	if (typeof content === 'string') {
		return content;
	}
	const text = content?.find(part => part.type === ToolResultContentType.Text)?.text;
	return typeof text === 'string' ? text : undefined;
}

function buildTerminalContent(storage: URI, chat: URI, toolCallId: string, title: string, text: string | undefined, success: boolean): ToolResultTerminalContent | undefined {
	const session = parseChatUri(chat)?.session;
	if (!session) {
		return undefined;
	}
	const preview = text === undefined ? undefined : PERSISTED_OUTPUT_NOTICE.exec(text)?.groups?.preview;
	return {
		type: ToolResultContentType.Terminal,
		resource: buildNonPtyShellTerminalUri(storage, session, chat, toolCallId),
		title,
		isPty: false,
		result: {
			// Claude reports whether a command failed instead of its exit code. A
			// successful result renders as exit code 0, as it does without retained output.
			...(success ? { exitCode: 0 } : {}),
			...(preview !== undefined ? { preview } : {}),
			truncated: true,
		},
	};
}
