/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { toToolCallMeta } from '../../common/meta/agentToolCallMeta.js';
import {
	MessageKind,
	ResponsePartKind,
	ToolCallConfirmationReason,
	ToolCallStatus,
	ToolResultContentType,
	type ResponsePart,
	type ToolCallResponsePart,
	type ToolResultContent,
	type Turn,
} from '../../common/state/sessionState.js';
import {
	describeFileChange,
	describeWebSearch,
	fileChangeOutput,
	turnStateFromStatus,
} from './codexMapAppServerEvents.js';
import { unwrapShellInvocation } from './codexShellCommand.js';
import type { Thread } from './protocol/generated/v2/Thread.js';
import type { ThreadItem } from './protocol/generated/v2/ThreadItem.js';
import type { Turn as CodexTurn } from './protocol/generated/v2/Turn.js';

/**
 * Reconstruct protocol {@link Turn}s from codex's `thread/read` response.
 *
 * Codex stores each conversation as a stream of {@link CodexTurn}, each
 * with an array of {@link ThreadItem}s. We collapse that into the agent
 * host's turn shape: each user message opens a turn; subsequent assistant
 * items become response parts on that turn until `turn/completed` closes it.
 *
 * Produces:
 *  - `userMessage`      → opens a `Turn` with `userMessage: { text }`
 *  - `agentMessage`     → `MarkdownResponsePart` with the full text
 *  - `commandExecution` → completed terminal `ToolCallResponsePart`
 *  - `webSearch`        → completed web-search `ToolCallResponsePart`
 *  - `fileChange`       → completed file-edit `ToolCallResponsePart`
 *  - everything else    → currently dropped (reasoning/plan/mcp/collab)
 *
 * Mirrors the live mapper's translation kernel — including the sandbox
 * pre-flight coalescing (see {@link codexMapAppServerEvents}) — so restored
 * sessions render identically to active ones.
 */
export function replayThreadToTurns(thread: Thread): Turn[] {
	const turns: Turn[] = [];
	for (const codexTurn of thread.turns ?? []) {
		const turn = replayTurnToTurn(codexTurn);
		if (turn) {
			turns.push(turn);
		}
	}
	return turns;
}

/** A completed `commandExecution` item narrowed to its terminal fields. */
type CommandExecutionItem = Extract<ThreadItem, { type: 'commandExecution' }>;

function replayTurnToTurn(codexTurn: CodexTurn): Turn | undefined {
	let userText = '';
	const parts: ResponsePart[] = [];
	// A successful command that produced no output may be a sandbox pre-flight
	// that codex immediately re-ran under an approval prompt (same command, new
	// item). Defer emitting it so the re-run can coalesce into a single box —
	// mirroring the live mapper's `pendingPreflight` state machine.
	let pendingPreflight: { command: string; item: CommandExecutionItem } | undefined;
	const flushPreflight = () => {
		if (pendingPreflight) {
			parts.push(shellToolCallPart(pendingPreflight.item, pendingPreflight.command));
			pendingPreflight = undefined;
		}
	};

	for (const item of codexTurn.items ?? []) {
		if (item.type === 'commandExecution') {
			const command = unwrapShellInvocation(item.command ?? '');
			if (pendingPreflight && pendingPreflight.command === command) {
				// Escalated re-run of the deferred pre-flight: render only this
				// item (it carries the real output/approval), dropping the
				// output-less pre-flight box.
				pendingPreflight = undefined;
				parts.push(shellToolCallPart(item, command));
				continue;
			}
			flushPreflight();
			const success = item.status === 'completed' && (item.exitCode === 0 || item.exitCode === null);
			const output = item.aggregatedOutput ?? '';
			if (success && !output) {
				pendingPreflight = { command, item };
				continue;
			}
			parts.push(shellToolCallPart(item, command));
			continue;
		}

		// Any other item supersedes a deferred pre-flight: finalize it first so
		// a genuinely output-less command still renders as a single box.
		flushPreflight();

		if (item.type === 'userMessage') {
			const collected: string[] = [];
			for (const c of item.content) {
				if (c.type === 'text') {
					collected.push(c.text);
				}
			}
			if (collected.length > 0) {
				userText = collected.join('\n\n');
			}
		} else if (item.type === 'agentMessage') {
			if (item.text && item.text.length > 0) {
				parts.push({
					kind: ResponsePartKind.Markdown,
					id: generateUuid(),
					content: item.text,
				});
			}
		} else if (item.type === 'webSearch') {
			parts.push(webSearchToolCallPart(item));
		} else if (item.type === 'fileChange') {
			parts.push(fileChangeToolCallPart(item));
		}
		// Other item types (plan/reasoning/mcpToolCall/collabAgentToolCall/…)
		// are not yet reconstructed in replay.
	}
	flushPreflight();

	// If we got nothing recognizable, drop the turn — there's nothing for
	// the UI to render.
	if (!userText && parts.length === 0) {
		return undefined;
	}
	return {
		id: codexTurn.id,
		message: { text: userText, origin: { kind: MessageKind.User } },
		responseParts: parts,
		usage: undefined,
		state: turnStateFromStatus(codexTurn.status),
	};
}

function textContent(output: string): ToolResultContent[] | undefined {
	return output ? [{ type: ToolResultContentType.Text, text: output }] : undefined;
}

function shellToolCallPart(item: CommandExecutionItem, command: string): ToolCallResponsePart {
	const success = item.status === 'completed' && (item.exitCode === 0 || item.exitCode === null);
	const output = item.aggregatedOutput ?? '';
	const exit = item.exitCode;
	const pastTense = success
		? `Ran \`${command}\``
		: exit !== null
			? `Ran \`${command}\` (exit ${exit})`
			: `Ran \`${command}\` (failed)`;
	return {
		kind: ResponsePartKind.ToolCall,
		toolCall: {
			status: ToolCallStatus.Completed,
			toolCallId: generateUuid(),
			toolName: 'shell',
			displayName: 'Run shell command',
			_meta: toToolCallMeta({ toolKind: 'terminal' }),
			invocationMessage: command,
			toolInput: command,
			confirmed: ToolCallConfirmationReason.NotNeeded,
			success,
			pastTenseMessage: pastTense,
			content: textContent(output),
			error: success ? undefined : { message: exit !== null ? `Exit code ${exit}` : 'Command failed' },
		},
	};
}

function webSearchToolCallPart(item: Extract<ThreadItem, { type: 'webSearch' }>): ToolCallResponsePart {
	const query = describeWebSearch(item.query, item.action);
	return {
		kind: ResponsePartKind.ToolCall,
		toolCall: {
			status: ToolCallStatus.Completed,
			toolCallId: generateUuid(),
			toolName: 'web_search',
			displayName: 'Web search',
			_meta: toToolCallMeta({ toolKind: 'search' }),
			invocationMessage: query,
			toolInput: query,
			confirmed: ToolCallConfirmationReason.NotNeeded,
			success: true,
			pastTenseMessage: `Searched ${query}`,
		},
	};
}

function fileChangeToolCallPart(item: Extract<ThreadItem, { type: 'fileChange' }>): ToolCallResponsePart {
	const success = item.status === 'completed';
	const summary = describeFileChange(item.changes) || 'Apply file changes';
	const output = fileChangeOutput(item.changes);
	return {
		kind: ResponsePartKind.ToolCall,
		toolCall: {
			status: ToolCallStatus.Completed,
			toolCallId: generateUuid(),
			toolName: 'file_edit',
			displayName: 'Apply file changes',
			invocationMessage: summary,
			confirmed: ToolCallConfirmationReason.NotNeeded,
			success,
			pastTenseMessage: success ? 'Applied file changes' : 'Failed to apply file changes',
			content: textContent(output),
			error: success ? undefined : { message: `Patch ${item.status}` },
		},
	};
}
