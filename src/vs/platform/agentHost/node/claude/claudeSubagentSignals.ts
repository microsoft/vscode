/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { URI } from '../../../../base/common/uri.js';
import type { AgentSignal, IAgentSubagentStartedSignal } from '../../common/agentService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { ResponsePartKind, ToolCallConfirmationReason } from '../../common/state/sessionState.js';
import type { ClaudeMapperState } from './claudeMapSessionEvents.js';
import { SUBAGENT_TOOL_NAMES, type SubagentRegistry } from './claudeSubagentRegistry.js';
import { getClaudeToolDisplayName } from './claudeToolDisplay.js';

/**
 * Phase 12 — SDK tool names that spawn subagent sessions. Re-exported
 * from the registry's canonical set so callers can keep importing it
 * from this signals module (the live mapper, replay handling, etc.).
 */
export const SUBAGENT_SPAWNING_TOOL_NAMES: ReadonlySet<string> = SUBAGENT_TOOL_NAMES;

/**
 * Phase 12 — post-process the signals produced from a single SDK
 * message envelope. When the envelope's `parent_tool_use_id` is set,
 * every action / pending_confirmation gets tagged with
 * `parentToolCallId` so {@link import('../agentSideEffects.js').AgentSideEffects}
 * can re-route it to the subagent session. The first inner emission
 * for a given parent additionally prepends an `IAgentSubagentStartedSignal`
 * so the child session exists before any of its actions arrive.
 *
 * The Started signal's labels come straight off the parent's
 * {@link SubagentSpawn}: `subagentType` (e.g. `"Explore"`) for both
 * the agent name and display name, and `description` for the
 * description. When the spawn is missing (rare race) or has no
 * metadata yet, falls back to the literal `"subagent"` / `"Subagent"`.
 */
export function tagWithParent(
	signals: AgentSignal[],
	session: URI,
	parentToolUseId: string | null,
	registry: SubagentRegistry,
): AgentSignal[] {
	if (!parentToolUseId) {
		return signals;
	}
	const tagged: AgentSignal[] = signals.map(s => {
		if (s.kind === 'action') {
			return { ...s, parentToolCallId: parentToolUseId };
		}
		if (s.kind === 'pending_confirmation') {
			return { ...s, parentToolCallId: parentToolUseId };
		}
		return s;
	});
	const spawn = registry.getSpawn(parentToolUseId);
	if (!spawn || !spawn.markAnnounced()) {
		return tagged;
	}
	const started: IAgentSubagentStartedSignal = {
		kind: 'subagent_started',
		session,
		toolCallId: parentToolUseId,
		agentName: spawn.subagentType ?? 'subagent',
		agentDisplayName: spawn.subagentType ?? 'Subagent',
		agentDescription: spawn.description,
	};
	return [started, ...tagged];
}

/**
 * Phase 12 step 7 — handle the two `type: 'system'` subtypes that drive
 * background-subagent lifecycle. `task_started` flips the matching
 * spawning entry to background so the foreground `tool_result` path
 * skips its `subagent_completed`. `task_notification` (with a terminal
 * status) is the deferred completion trigger for those background
 * entries.
 *
 * All other system subtypes (`compact_boundary`, `task_progress`,
 * `task_updated`, hooks, etc.) fall through with `[]`; non-subagent
 * system handling stays in the mapper proper.
 */
export function mapSubagentSystemMessage(
	message: Extract<SDKMessage, { type: 'system' }>,
	session: URI,
	registry: SubagentRegistry,
): AgentSignal[] {
	const sub = (message as { subtype?: string }).subtype;
	if (sub === 'task_started') {
		const toolUseId = (message as { tool_use_id?: string }).tool_use_id;
		const spawn = toolUseId ? registry.getSpawn(toolUseId) : undefined;
		if (spawn) {
			spawn.background = true;
		}
		return [];
	}
	if (sub === 'task_notification') {
		const m = message as { tool_use_id?: string; status?: string };
		if (!m.tool_use_id) {
			return [];
		}
		const status = m.status;
		if (status !== 'completed' && status !== 'failed' && status !== 'stopped') {
			return [];
		}
		const spawn = registry.getSpawn(m.tool_use_id);
		if (!spawn || !spawn.markCompleted()) {
			return [];
		}
		const toolUseId = m.tool_use_id;
		registry.removeSpawn(toolUseId);
		return [{ kind: 'subagent_completed', session, toolCallId: toolUseId }];
	}
	return [];
}

/**
 * Phase 12 fix — build the `SessionToolCallReady` signal for a top-level
 * Task/Agent tool_use block AND record the spawn's metadata onto the
 * registry. The workbench's
 * [stateToProgressAdapter.ts](../../../../workbench/contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.ts)
 * reads `_meta.subagentDescription` and `_meta.subagentAgentName` to
 * render the subagent UI before any inner content arrives.
 *
 * The metadata side effect (`spawn.description = ...`,
 * `spawn.subagentType = ...`) is written here because the canonical
 * `assistant` envelope is the first place where `block.input` is
 * complete (the early `content_block_start` carries an empty input bag
 * that gets filled in via `input_json_delta` events).
 *
 * Inputs:
 *   - `block.id` / `block.name` — SDK-supplied tool_use identifiers.
 *   - `block.input.description` → `spawn.description` and
 *     `_meta.subagentDescription` and `action.invocationMessage`.
 *   - `block.input.subagent_type` → `spawn.subagentType` and
 *     `_meta.subagentAgentName`.
 */
export function buildTopLevelSubagentReadyAction(
	block: Extract<import('@anthropic-ai/claude-agent-sdk').SDKAssistantMessage['message']['content'][number], { type: 'tool_use' }>,
	session: URI,
	turnId: string,
	registry: SubagentRegistry,
): AgentSignal {
	const input = block.input as Record<string, unknown> | undefined;
	const description = typeof input?.description === 'string' ? input.description : undefined;
	const agentName = typeof input?.subagent_type === 'string' ? input.subagent_type : undefined;
	const inputJson = block.input !== undefined ? safeStringify(block.input) : undefined;
	registry.recordSpawn(block.id, { subagentType: agentName, description });
	const meta: Record<string, unknown> = { toolKind: 'subagent' };
	if (description) {
		meta.subagentDescription = description;
	}
	if (agentName) {
		meta.subagentAgentName = agentName;
	}
	return {
		kind: 'action',
		session,
		action: {
			type: ActionType.SessionToolCallReady,
			session: session.toString(),
			turnId,
			toolCallId: block.id,
			invocationMessage: description ?? getClaudeToolDisplayName(block.name),
			...(inputJson !== undefined ? { toolInput: inputJson } : {}),
			confirmed: ToolCallConfirmationReason.NotNeeded,
			_meta: meta,
		},
	};
}

/**
 * Phase 12 fix — walk an inner subagent canonical assistant message
 * (`parent_tool_use_id !== null`) and emit one signal per content block.
 *
 * The SDK does NOT deliver inner subagent content via `stream_event`
 * partials, only via canonical `assistant` (and `user` for tool_result)
 * envelopes. So this canonical envelope IS the only signal source for
 * inner content. We emit:
 *
 *   - `text` / `thinking` → `SessionResponsePart` (Markdown / Reasoning)
 *     with the full block content.
 *   - `tool_use` → `SessionToolCallStart` + `SessionToolCallReady`
 *     (`confirmed: NotNeeded`, since the SDK runs inner tools in
 *     `bypassPermissions` and the parent's `canUseTool` is skipped),
 *     plus side effects on `state` (cross-message lookup) and
 *     `registry` (inner→parent edge for the canUseTool bridge).
 *
 * Returns the emitted signals; the caller (`tagWithParent`) is
 * responsible for stamping `parentToolCallId` on every action.
 */
export function emitInnerAssistantSignals(
	message: Extract<SDKMessage, { type: 'assistant' }>,
	session: URI,
	turnId: string,
	state: ClaudeMapperState,
	parentToolUseId: string,
	registry: SubagentRegistry,
): AgentSignal[] {
	const sessionStr = session.toString();
	const messageId = message.message.id;
	const signals: AgentSignal[] = [];
	for (let index = 0; index < message.message.content.length; index++) {
		const block = message.message.content[index];
		if (block.type === 'text') {
			signals.push({
				kind: 'action',
				session,
				action: {
					type: ActionType.SessionResponsePart,
					session: sessionStr,
					turnId,
					part: {
						kind: ResponsePartKind.Markdown,
						id: `${turnId}#${messageId}#${index}`,
						content: block.text,
					},
				},
			});
			continue;
		}
		if (block.type === 'thinking') {
			signals.push({
				kind: 'action',
				session,
				action: {
					type: ActionType.SessionResponsePart,
					session: sessionStr,
					turnId,
					part: {
						kind: ResponsePartKind.Reasoning,
						id: `${turnId}#${messageId}#${index}`,
						content: block.thinking,
					},
				},
			});
			continue;
		}
		if (block.type === 'tool_use') {
			state.startToolBlock(index, block.id, block.name, turnId);
			registry.noteInnerTool(block.id, parentToolUseId);
			const inputJson = block.input !== undefined ? safeStringify(block.input) : undefined;
			const displayName = getClaudeToolDisplayName(block.name);
			signals.push({
				kind: 'action',
				session,
				action: {
					type: ActionType.SessionToolCallStart,
					session: sessionStr,
					turnId,
					toolCallId: block.id,
					toolName: block.name,
					displayName,
				},
			});
			signals.push({
				kind: 'action',
				session,
				action: {
					type: ActionType.SessionToolCallReady,
					session: sessionStr,
					turnId,
					toolCallId: block.id,
					invocationMessage: displayName,
					...(inputJson !== undefined ? { toolInput: inputJson } : {}),
					confirmed: ToolCallConfirmationReason.NotNeeded,
				},
			});
			continue;
		}
		// Unknown inner block kind — skip silently (caller will trace at
		// the mapper level if needed; we don't want to import ILogService
		// here just for one trace).
	}
	return signals;
}

function safeStringify(value: unknown): string | undefined {
	try {
		return JSON.stringify(value);
	} catch {
		return undefined;
	}
}
