/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, type IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { buildNonPtyShellTerminalUri } from '../../common/nonPtyShellTerminalUri.js';
import { ISessionDataService, MAX_TERMINAL_OUTPUT_BYTES, type ISessionDatabase } from '../../common/sessionDataService.js';
import { parseChatUri, ResponsePartKind, ToolCallStatus, ToolResultContentType, type ToolResultTerminalContent, type Turn } from '../../common/state/sessionState.js';
import type { ClaudeMapperState } from './claudeMapSessionEvents.js';
import { getClaudeToolDisplayName } from './claudeToolDisplay.js';

// Bash can invoke pwsh; Claude's separate native PowerShell tool is not handled here.
const CLAUDE_SHELL_TOOL_NAME = 'Bash';

/**
 * The notice Claude returns to the model in place of shell output that is too
 * large to send inline. It names the file with the complete output and includes
 * a preview of its beginning.
 */
const PERSISTED_OUTPUT_NOTICE = /^<persisted-output>\n[^\n]*\n\nPreview \(first [^)\n]*\):\n(?<preview>[\s\S]*?)\n(?:\.\.\.\n)?<\/persisted-output>/;

type ToolResultParts = string | readonly { readonly type: string; readonly text?: unknown }[] | undefined;

/**
 * Retains Claude's large Bash results in the owning chat's database and exposes
 * them as exited non-PTY terminal resources without keeping a terminal alive.
 */
export class ClaudeTerminalOutputs {

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
	) { }

	/**
	 * Stages retained output before mapping the completion. Returns the tool ID
	 * on success or cancellation so the caller can discard even a failed capture.
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
		const terminal = buildTerminalContent(storage, chat, result.tool_use_id, title, getText(result.content), result.is_error !== true, this._logService);
		if (!terminal) {
			return;
		}
		if (signal?.aborted) {
			return result.tool_use_id;
		}
		const lifetime = new DisposableStore();
		const cancellation = lifetime.add(new CancellationTokenSource());
		if (signal) {
			lifetime.add(Event.once(Event.fromDOMEventEmitter(signal, 'abort'))(() => cancellation.cancel()));
		}
		let database: IReference<ISessionDatabase> | undefined;
		try {
			const output = await this._fileService.readFile(URI.file(outputPath), { limits: { size: MAX_TERMINAL_OUTPUT_BYTES } }, cancellation.token);
			if (signal?.aborted) {
				return result.tool_use_id;
			}
			database = this._sessionDataService.openDatabase(storage);
			// The output belongs to its turn so truncation removes it. Claude creates
			// turn rows lazily, as it does for file edits.
			await database.object.createTurn(turnId);
			await database.object.storeTerminalOutput(turnId, result.tool_use_id, output.value.buffer);
			if (signal?.aborted) {
				await database.object.deleteTerminalOutput(result.tool_use_id);
				return result.tool_use_id;
			}
			state.cacheTerminalOutput(result.tool_use_id, terminal);
			return result.tool_use_id;
		} catch (error) {
			this._logService.warn(`[Claude] Failed to retain shell output for ${result.tool_use_id}`, error);
			return signal?.aborted ? result.tool_use_id : undefined;
		} finally {
			database?.dispose();
			lifetime.dispose();
		}
	}

	async discard(storage: URI, toolCallId: string, state: ClaudeMapperState): Promise<void> {
		state.takeTerminalOutput(toolCallId);
		state.completeToolCall(toolCallId);
		let database: IReference<ISessionDatabase> | undefined;
		try {
			database = await this._sessionDataService.tryOpenDatabase(storage);
			if (!database) {
				return;
			}
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
					const terminal = buildTerminalContent(storage, chat, toolCall.toolCallId, toolCall.displayName, getText(toolCall.content), toolCall.success, this._logService);
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

function buildTerminalContent(storage: URI, chat: URI, toolCallId: string, title: string, text: string | undefined, success: boolean, logService: ILogService): ToolResultTerminalContent | undefined {
	const session = parseChatUri(chat)?.session;
	if (!session) {
		return undefined;
	}
	const preview = text === undefined ? undefined : PERSISTED_OUTPUT_NOTICE.exec(text)?.groups?.preview;
	if (preview === undefined) {
		logService.trace(`[Claude] Unrecognized persisted shell output preview for ${toolCallId}`);
	}
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
