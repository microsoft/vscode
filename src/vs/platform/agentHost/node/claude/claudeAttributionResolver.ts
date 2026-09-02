/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ClaudeMapperState } from './claudeMapSessionEvents.js';
import type { IClaudeReplayAttribution, IClaudeReplayToolUse } from './claudeReplayMapper.js';
import type { ISubagentSpawnInit, SubagentRegistry } from './claudeSubagentRegistry.js';

/**
 * Replayed tool uses partitioned by what a restored session must do with them.
 * `pending` and `dead` are both unresolved; only `pending` can still receive a result.
 */
export interface IClaudeAttributionSeed {
	readonly pending: readonly IClaudeReplayToolUse[];
	readonly dead: readonly IClaudeReplayToolUse[];
	readonly spawns: readonly IClaudeReplayToolUse[];
}

/**
 * Partition the replay index. An unresolved `tool_use` is only pending in the tail
 * turn; in any earlier turn a later user envelope exists, so its result can never arrive.
 */
export function buildAttributionSeed(attribution: IClaudeReplayAttribution): IClaudeAttributionSeed {
	const pending: IClaudeReplayToolUse[] = [];
	const dead: IClaudeReplayToolUse[] = [];
	const spawns: IClaudeReplayToolUse[] = [];
	for (const entry of attribution.entries.values()) {
		if (entry.isSubagentSpawn) {
			spawns.push(entry);
		}
		if (entry.resultSeen) {
			continue;
		}
		if (entry.turnId === attribution.tailTurnId) {
			pending.push(entry);
		} else {
			dead.push(entry);
		}
	}
	return { pending, dead, spawns };
}

/**
 * Seed a restored session's live attribution state from a replay seed.
 * Dead entries are deliberately not seeded; they only exist to be counted.
 */
export function hydrateAttribution(state: ClaudeMapperState, registry: SubagentRegistry, seed: IClaudeAttributionSeed): void {
	for (const entry of seed.pending) {
		state.toolCalls.hydrate(entry);
	}
	for (const spawn of seed.spawns) {
		registry.recordSpawn(spawn.toolUseId, readSpawnInit(spawn));
	}
}

function readSpawnInit(spawn: IClaudeReplayToolUse): ISubagentSpawnInit {
	const input = spawn.parsedInput;
	return {
		agentId: spawn.agentId,
		subagentType: typeof input?.subagent_type === 'string' ? input.subagent_type : undefined,
		description: typeof input?.description === 'string' ? input.description : undefined,
		prompt: typeof input?.prompt === 'string' ? input.prompt : undefined,
	};
}
