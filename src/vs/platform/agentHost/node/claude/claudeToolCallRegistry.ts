/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ILogService } from '../../../log/common/log.js';
import type { StringOrMarkdown } from '../../common/state/protocol/state.js';
import { getClaudeInvocationMessage, getClaudeToolDisplayName, getClaudeToolInputString } from './claudeToolDisplay.js';

/**
 * Phase 8.5 — per-tool-call info computed at `content_block_stop` and
 * reused at `tool_result` time. Mirrors Copilot's `IToolStartInfo`
 * shape: Copilot stashes it at `tool.execution_start` (where the
 * Copilot SDK hands over complete args); Claude stashes it at the
 * analogous `content_block_stop` (the first point where the
 * `input_json_delta` buffer is complete and parseable).
 */
export interface IClaudeToolStartInfo {
	readonly toolName: string;
	readonly displayName: string;
	readonly parsedInput: Record<string, unknown> | undefined;
	readonly invocationMessage: StringOrMarkdown;
	readonly toolInput: string | undefined;
}

interface IRegistryEntry {
	readonly toolName: string;
	readonly turnId: string;
	inputBuffer: string;
	info: IClaudeToolStartInfo | undefined;
}

/**
 * Phase 8.5 — per-session, cross-message tool-call tracking for the
 * live mapper. Owns:
 *
 * - **Attribution** — `tool_use_id → { toolName, turnId }`. A
 *   `tool_use` lands in one assistant message; the matching
 *   `tool_result` arrives in a later synthetic `user` message. The
 *   registry resolves the originating turn so each Complete action
 *   lands on the correct turn.
 * - **Input accumulation** — `input_json_delta` chunks arrive across
 *   `content_block_start` → `delta*` → `content_block_stop`. The
 *   registry concatenates them and parses once at `finalize`.
 * - **Computed start-info** — `displayName`, rich `invocationMessage`,
 *   `toolInput` string, parsed input. Computed once at `finalize`
 *   and looked up at `tool_result` time so `pastTenseMessage` can
 *   include the original parameters.
 *
 * Mirror of Copilot's `pendingTools: Map<toolCallId, IToolStartInfo>`
 * pattern in
 * [`mapSessionEvents.ts`](../copilot/mapSessionEvents.ts) — only the
 * seam differs (Copilot's SDK hands over complete args at
 * `tool.execution_start`; Claude's SDK streams them in deltas, so the
 * "ready" seam is `content_block_stop`).
 *
 * Encapsulated as a class with named lifecycle methods so the maps'
 * mutators are not part of the public surface — Phase 6.1's lesson.
 * One instance lives per `ClaudeAgentSession` and is composed by
 * `ClaudeMapperState`; the mapper threads `state` (which exposes the
 * registry as `state.toolCalls`) into every invocation.
 */
export class ClaudeToolCallRegistry {
	private readonly _entries = new Map<string, IRegistryEntry>();

	/**
	 * Begin tracking a tool call. Called from `content_block_start`
	 * for a `tool_use` block. Allocates the delta buffer; the
	 * computed info bag is filled in by {@link finalize}.
	 */
	begin(toolUseId: string, toolName: string, turnId: string): void {
		this._entries.set(toolUseId, {
			toolName,
			turnId,
			inputBuffer: '',
			info: undefined,
		});
	}

	/**
	 * Append one `input_json_delta.partial_json` chunk. No-op if the
	 * `tool_use_id` is unknown (the caller already logged a warning
	 * about the index mismatch).
	 */
	appendInputDelta(toolUseId: string, partialJson: string): void {
		const entry = this._entries.get(toolUseId);
		if (!entry) {
			return;
		}
		entry.inputBuffer += partialJson;
	}

	/**
	 * Parse the accumulated buffer and stash the computed
	 * {@link IClaudeToolStartInfo}. Called from `content_block_stop`.
	 * Parse failures fall back to `parsedInput: undefined`; the
	 * past-tense helper handles that by returning a generic message.
	 */
	finalize(toolUseId: string): void {
		const entry = this._entries.get(toolUseId);
		if (!entry) {
			return;
		}
		let parsedInput: Record<string, unknown> | undefined;
		if (entry.inputBuffer.length > 0) {
			try {
				const parsed: unknown = JSON.parse(entry.inputBuffer);
				if (parsed !== null && typeof parsed === 'object') {
					parsedInput = parsed as Record<string, unknown>;
				}
			} catch {
				// Malformed JSON — fall through with `parsedInput: undefined`.
			}
		}
		// Preserve the raw buffer as a fallback `toolInput` so a malformed
		// or non-object payload still surfaces SOMETHING in the UI rather
		// than leaving the input section empty.
		const rawFallback = entry.inputBuffer.length > 0 ? entry.inputBuffer : undefined;
		this._writeInfo(entry, parsedInput, rawFallback);
		// Buffer is no longer needed once parsed.
		entry.inputBuffer = '';
	}

	/**
	 * Seed {@link IClaudeToolStartInfo} directly from a pre-parsed
	 * input object. Used for inner subagent tool uses, which arrive
	 * already-parsed on the synthesized `assistant` message rather
	 * than via streamed `input_json_delta` chunks. Without this the
	 * registry entry's `info` would stay `undefined` and the live
	 * `tool_result` handler would emit the generic
	 * `"{displayName} finished"` past-tense, violating D6 (live/replay
	 * parity).
	 */
	seedParsedInput(toolUseId: string, parsedInput: unknown): void {
		const entry = this._entries.get(toolUseId);
		if (!entry) {
			return;
		}
		const normalized = (parsedInput !== null && typeof parsedInput === 'object')
			? parsedInput as Record<string, unknown>
			: undefined;
		this._writeInfo(entry, normalized);
	}

	private _writeInfo(entry: IRegistryEntry, parsedInput: Record<string, unknown> | undefined, rawFallback?: string): void {
		const displayName = getClaudeToolDisplayName(entry.toolName);
		entry.info = {
			toolName: entry.toolName,
			displayName,
			parsedInput,
			invocationMessage: getClaudeInvocationMessage(entry.toolName, displayName, parsedInput),
			toolInput: getClaudeToolInputString(entry.toolName, parsedInput) ?? rawFallback,
		};
	}

	/**
	 * Cross-message lookup. Returns `undefined` if the
	 * `tool_use_id` is unknown (defense-in-depth against transport
	 * drift / replay). The `info` field may be `undefined` if the
	 * tool block never reached `content_block_stop`.
	 */
	lookup(toolUseId: string): { readonly turnId: string; readonly toolName: string; readonly info: IClaudeToolStartInfo | undefined } | undefined {
		const entry = this._entries.get(toolUseId);
		if (!entry) {
			return undefined;
		}
		return { turnId: entry.turnId, toolName: entry.toolName, info: entry.info };
	}

	/**
	 * Drop the entry once the matching `tool_result` has been
	 * delivered. Bounds the registry's memory across long turns.
	 */
	complete(toolUseId: string): void {
		this._entries.delete(toolUseId);
	}

	/**
	 * Drop any tracking still pending at the end of a turn and warn
	 * once per orphan. A `tool_use` whose `tool_result` never arrives
	 * — model misbehavior, transport drop, future cancellation —
	 * would otherwise survive in the maps for the lifetime of the
	 * session and accumulate across turns. Called from `mapResult`
	 * on every `result` envelope.
	 */
	clearPending(logService: ILogService): void {
		if (this._entries.size === 0) {
			return;
		}
		for (const [toolUseId, entry] of this._entries) {
			logService.warn(`[claudeToolCallRegistry] turn ${entry.turnId} ended with pending tool_use ${toolUseId} (${entry.toolName}); dropping cross-message state`);
		}
		this._entries.clear();
	}
}
