/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKControlGetContextUsageResponse } from '@anthropic-ai/claude-agent-sdk';
import { localize } from '../../../../nls.js';
import type { IContextAttributionData, IContextAttributionEntry } from '../../common/state/sessionState.js';

/**
 * A `getContextUsage` report as the subprocess actually delivers it: the SDK
 * types `mcpTools` / `agents` as required, but a `detail: 'summary'` report
 * can omit them. A full {@link SDKControlGetContextUsageResponse} is assignable.
 */
export type ClaudeContextUsageReport = Omit<SDKControlGetContextUsageResponse, 'mcpTools' | 'agents'> & Partial<Pick<SDKControlGetContextUsageResponse, 'mcpTools' | 'agents'>>;

/**
 * Projects the SDK's `Query.getContextUsage()` report onto the protocol's
 * `_meta.contextAttribution` shape so the Claude harness feeds the same
 * context-usage widget breakdown the Copilot harness does. Entry `kind`s are
 * the vocabulary the workbench adapter already groups and labels; whatever
 * part of `totalTokens` the entries do not cover renders as "Messages".
 *
 * Only tokens that occupy the window are attributed: unloaded deferred tool
 * schemas are skipped, and the SDK's free-space categories are never entries.
 * Returns `undefined` when the report carries no usable total.
 */
export function toClaudeContextAttribution(usage: ClaudeContextUsageReport): IContextAttributionData | undefined {
	if (!isUsableTokenCount(usage.totalTokens)) {
		return undefined;
	}
	const entries: IContextAttributionEntry[] = [];

	const systemPromptTokens = sumTokens(usage.systemPromptSections);
	if (isUsableTokenCount(systemPromptTokens)) {
		entries.push({
			kind: 'system',
			id: 'system-prompt',
			label: localize('claude.contextUsage.systemPrompt', "System Prompt"),
			tokens: systemPromptTokens,
		});
	}

	const memoryFileTokens = sumTokens(usage.memoryFiles);
	if (isUsableTokenCount(memoryFileTokens)) {
		entries.push({
			kind: 'system',
			id: 'memory-files',
			label: localize('claude.contextUsage.memoryFiles', "Memory Files"),
			tokens: memoryFileTokens,
		});
	}

	const slashCommandTokens = usage.slashCommands?.tokens ?? 0;
	if (isUsableTokenCount(slashCommandTokens)) {
		entries.push({
			kind: 'system',
			id: 'slash-commands',
			label: localize('claude.contextUsage.slashCommands', "Slash Commands"),
			tokens: slashCommandTokens,
		});
	}

	for (const tool of usage.systemTools ?? []) {
		if (isUsableTokenCount(tool.tokens)) {
			entries.push({ kind: 'toolDefinition', id: `tool:${tool.name}`, label: tool.name, tokens: tool.tokens });
		}
	}
	// Namespaced apart from `systemTools`: the SDK does not promise the two
	// lists are disjoint by name, and entry ids are expected to be unique.
	for (const tool of usage.deferredBuiltinTools ?? []) {
		if (tool.isLoaded && isUsableTokenCount(tool.tokens)) {
			entries.push({ kind: 'toolDefinition', id: `tool:deferred:${tool.name}`, label: tool.name, tokens: tool.tokens });
		}
	}

	for (const tool of usage.mcpTools ?? []) {
		if (tool.isLoaded !== false && isUsableTokenCount(tool.tokens)) {
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
		if (isUsableTokenCount(agent.tokens)) {
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
	if (isUsableTokenCount(skillTokens)) {
		entries.push({
			kind: 'skill',
			id: 'skills',
			label: localize('claude.contextUsage.skills', "Skills"),
			tokens: skillTokens,
		});
	}

	const toolResultTokens = usage.messageBreakdown?.toolResultTokens ?? 0;
	if (isUsableTokenCount(toolResultTokens)) {
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
		// The SDK report carries no compaction count; `0` satisfies the
		// required field rather than asserting that none happened.
		compactions: { count: 0 },
	};
}

/** Whether a token count from the report can be shown: finite and positive. */
function isUsableTokenCount(tokens: number): boolean {
	return Number.isFinite(tokens) && tokens > 0;
}

/** Sum of `tokens` across `items`, skipping entries without a usable count. */
function sumTokens(items: readonly { readonly tokens: number }[] | undefined): number {
	let total = 0;
	for (const item of items ?? []) {
		if (isUsableTokenCount(item.tokens)) {
			total += item.tokens;
		}
	}
	return total;
}

/**
 * The prompt token count of the API call the report describes:
 * `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` from
 * `apiUsage`, additive with `outputTokens` the way the context-usage widget
 * assumes. `totalTokens` is not used: for `detail: 'summary'` it may already
 * include the response's output tokens. Returns `undefined` when `apiUsage`
 * is absent or unusable, so callers keep the prompt count they already have.
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
