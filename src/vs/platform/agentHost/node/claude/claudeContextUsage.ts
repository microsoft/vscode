/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKControlGetContextUsageResponse } from '@anthropic-ai/claude-agent-sdk';
import { localize } from '../../../../nls.js';
import type { IContextAttributionData, IContextAttributionEntry } from '../../common/state/sessionState.js';

/**
 * A `getContextUsage` report as the subprocess actually delivers it. The
 * SDK's `.d.ts` types `mcpTools` / `agents` as required, but its own
 * `detail: 'summary'` JSDoc says it skips per-category calls, so the runtime
 * report can omit them. A full {@link SDKControlGetContextUsageResponse} is
 * assignable to this type, so production code can keep passing it straight
 * through.
 */
export type ClaudeContextUsageReport = Omit<SDKControlGetContextUsageResponse, 'mcpTools' | 'agents'> & Partial<Pick<SDKControlGetContextUsageResponse, 'mcpTools' | 'agents'>>;

/**
 * Projects the SDK's `Query.getContextUsage()` report onto the protocol's
 * `_meta.contextAttribution` shape so the Claude harness feeds the same
 * context-usage widget breakdown the Copilot harness does.
 *
 * Entry `kind`s are the vocabulary the workbench adapter already groups and
 * labels (`system`, `toolDefinition`, `tool`, `mcpServer`, `subagent`,
 * `skill`). Entries of kind `system` render individually under their own
 * label; every other kind is summed into one row per kind. Whatever part of
 * {@link IContextAttributionData.totalTokens} the entries do not cover is
 * rendered by the adapter as "Messages".
 *
 * Only tokens that occupy the window are attributed: deferred tool schemas
 * (`isLoaded === false`) sit outside the window and are skipped, and the
 * SDK's free-space / autocompact-buffer categories are never entries because
 * `totalTokens` is the *used* total, not the window size.
 *
 * Returns `undefined` when the report carries no usable total, so callers can
 * leave the base usage untouched rather than emit an empty breakdown.
 */
export function toClaudeContextAttribution(usage: ClaudeContextUsageReport): IContextAttributionData | undefined {
	if (!Number.isFinite(usage.totalTokens) || usage.totalTokens <= 0) {
		return undefined;
	}
	const entries: IContextAttributionEntry[] = [];

	const systemPromptTokens = sumTokens(usage.systemPromptSections);
	if (systemPromptTokens > 0) {
		entries.push({
			kind: 'system',
			id: 'system-prompt',
			label: localize('claude.contextUsage.systemPrompt', "System Prompt"),
			tokens: systemPromptTokens,
		});
	}

	const memoryFileTokens = sumTokens(usage.memoryFiles);
	if (memoryFileTokens > 0) {
		entries.push({
			kind: 'system',
			id: 'memory-files',
			label: localize('claude.contextUsage.memoryFiles', "Memory Files"),
			tokens: memoryFileTokens,
		});
	}

	const slashCommandTokens = usage.slashCommands?.tokens ?? 0;
	if (slashCommandTokens > 0) {
		entries.push({
			kind: 'system',
			id: 'slash-commands',
			label: localize('claude.contextUsage.slashCommands', "Slash Commands"),
			tokens: slashCommandTokens,
		});
	}

	for (const tool of usage.systemTools ?? []) {
		if (tool.tokens > 0) {
			entries.push({ kind: 'toolDefinition', id: `tool:${tool.name}`, label: tool.name, tokens: tool.tokens });
		}
	}
	// Namespaced apart from `systemTools`: the SDK does not promise the two
	// lists are disjoint by name, and entry ids are expected to be unique.
	for (const tool of usage.deferredBuiltinTools ?? []) {
		if (tool.isLoaded && tool.tokens > 0) {
			entries.push({ kind: 'toolDefinition', id: `tool:deferred:${tool.name}`, label: tool.name, tokens: tool.tokens });
		}
	}

	for (const tool of usage.mcpTools ?? []) {
		if (tool.isLoaded !== false && tool.tokens > 0) {
			entries.push({
				kind: 'mcpServer',
				id: `mcp:${tool.serverName}:${tool.name}`,
				label: tool.name,
				tokens: tool.tokens,
				attributes: { serverName: tool.serverName },
			});
		}
	}

	for (const agent of usage.agents ?? []) {
		if (agent.tokens > 0) {
			entries.push({
				kind: 'subagent',
				id: `agent:${agent.source}:${agent.agentType}`,
				label: agent.agentType,
				tokens: agent.tokens,
				attributes: { source: agent.source },
			});
		}
	}

	// `skills.tokens` is the authoritative total for the skill descriptions
	// in the window; the per-skill frontmatter list may not sum to it, so
	// emit a single aggregate entry rather than one per skill.
	const skillTokens = usage.skills?.tokens ?? 0;
	if (skillTokens > 0) {
		entries.push({
			kind: 'skill',
			id: 'skills',
			label: localize('claude.contextUsage.skills', "Skills"),
			tokens: skillTokens,
		});
	}

	const toolResultTokens = usage.messageBreakdown?.toolResultTokens ?? 0;
	if (toolResultTokens > 0) {
		entries.push({
			kind: 'tool',
			id: 'tool-results',
			label: localize('claude.contextUsage.toolResults', "Tool Results"),
			tokens: toolResultTokens,
		});
	}

	return {
		totalTokens: usage.totalTokens,
		entries,
		// `0` is a placeholder to satisfy `IContextAttributionData.compactions`,
		// not an observed "no compactions": the SDK report carries no
		// compaction count at all, and the harness currently ignores the
		// `compact_boundary` system message rather than counting it.
		compactions: { count: 0 },
	};
}

/** Sum of `tokens` across `items`, skipping entries with a non-finite or non-positive count. */
function sumTokens(items: readonly { readonly tokens: number }[] | undefined): number {
	let total = 0;
	for (const item of items ?? []) {
		if (Number.isFinite(item.tokens) && item.tokens > 0) {
			total += item.tokens;
		}
	}
	return total;
}

/**
 * The Anthropic API's prompt token count for the API call the SDK attributes
 * to the report — `input_tokens + cache_creation_input_tokens +
 * cache_read_input_tokens` from `apiUsage` — additive with `outputTokens` the
 * way the context-usage widget and the Codex harness
 * (`codexMapAppServerEvents.ts`'s `mapTokenUsageUpdated`) assume a turn's
 * `inputTokens` + `outputTokens` to be.
 *
 * `usage.totalTokens` is not used for this: for `detail: 'summary'` it is
 * derived from the last response's usage and may already include that same
 * response's output tokens, which would double-count them once summed with
 * `outputTokens`. Callers fall back to `totalTokens` whenever this returns
 * `undefined`: a `null` `apiUsage`, a non-finite field, or a non-positive sum.
 */
export function contextPromptTokens(usage: ClaudeContextUsageReport): number | undefined {
	const apiUsage = usage.apiUsage;
	if (!apiUsage) {
		return undefined;
	}
	const { input_tokens, cache_creation_input_tokens, cache_read_input_tokens } = apiUsage;
	if (!Number.isFinite(input_tokens) || !Number.isFinite(cache_creation_input_tokens) || !Number.isFinite(cache_read_input_tokens)) {
		return undefined;
	}
	const total = input_tokens + cache_creation_input_tokens + cache_read_input_tokens;
	return total > 0 ? total : undefined;
}
