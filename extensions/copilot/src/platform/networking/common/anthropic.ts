/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { modelSupportsContextEditing } from '../../endpoint/common/chatModelCapabilities';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { ChatLocation } from '../../chat/common/commonTypes';
import { IChatEndpoint } from './networking';

/**
 * Types for Anthropic Messages API
 * Based on https://platform.claude.com/docs/en/api/messages
 *
 * This interface supports both regular tools and server tools (web search, tool search):
 * - Regular tools: require name, description, and input_schema
 * - Tool search tools: require only type and name
 */
export interface AnthropicMessagesTool {
	name: string;
	type?: string;
	description?: string;
	input_schema?: {
		type: 'object';
		properties?: Record<string, unknown>;
		required?: string[];
	};
	defer_loading?: boolean;
	cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' };
}

/** Name for the custom client-side embeddings-based tool search tool. Must not use copilot_/vscode_ prefix — those are reserved for static package.json declarations and will be rejected by vscode.lm.registerToolDefinition. */
export const CUSTOM_TOOL_SEARCH_NAME = 'tool_search';

/**
 * Context management types for Anthropic Messages API
 * Based on https://platform.claude.com/docs/en/build-with-claude/context-editing
 */
export type ContextManagementTrigger =
	| { type: 'input_tokens'; value: number }
	| { type: 'tool_uses'; value: number };

export type ContextManagementKeep =
	| { type: 'tool_uses'; value: number }
	| { type: 'thinking_turns'; value: number }
	| 'all';

export type ContextManagementClearAtLeast = {
	type: 'input_tokens';
	value: number;
};

export interface ClearToolUsesEdit {
	type: 'clear_tool_uses_20250919';
	trigger?: ContextManagementTrigger;
	keep?: ContextManagementKeep;
	clear_at_least?: ContextManagementClearAtLeast;
	exclude_tools?: string[];
	clear_tool_inputs?: boolean;
}

export interface ClearThinkingEdit {
	type: 'clear_thinking_20251015';
	keep?: ContextManagementKeep;
}

export type ContextManagementEdit = ClearToolUsesEdit | ClearThinkingEdit;

export interface ContextManagement {
	edits: ContextManagementEdit[];
}

export interface AppliedContextEdit {
	type: 'clear_thinking_20251015' | 'clear_tool_uses_20250919';
	cleared_thinking_turns?: number;
	cleared_tool_uses?: number;
	cleared_input_tokens?: number;
}

export interface ContextManagementResponse {
	applied_edits: AppliedContextEdit[];
}

/**
 * Interleaved thinking is supported by:
 * - Claude Sonnet 4.5 (claude-sonnet-4-5-* or claude-sonnet-4.5-*)
 * - Claude Sonnet 4 (claude-sonnet-4-*)
 * - Claude Haiku 4.5 (claude-haiku-4-5-* or claude-haiku-4.5-*)
 * - Claude Opus 4.5 (claude-opus-4-5-* or claude-opus-4.5-*)
 * @param modelId The model ID to check
 * @returns true if the model supports interleaved thinking
 */
export function modelSupportsInterleavedThinking(modelId: string): boolean {
	// Normalize: lowercase and replace dots with dashes so "4.5" matches "4-5"
	const normalized = modelId.toLowerCase().replace(/\./g, '-');
	return normalized.startsWith('claude-sonnet-4-5') ||
		normalized.startsWith('claude-sonnet-4') ||
		normalized.startsWith('claude-haiku-4-5') ||
		normalized.startsWith('claude-opus-4-5');
}

/**
 * Memory is supported by:
 * - Claude Haiku 4.5 (claude-haiku-4-5-* or claude-haiku-4.5-*)
 * - Claude Sonnet 4.6 (claude-sonnet-4-6-* or claude-sonnet-4.6-*)
 * - Claude Sonnet 4.5 (claude-sonnet-4-5-* or claude-sonnet-4.5-*)
 * - Claude Sonnet 4 (claude-sonnet-4-*)
 * - Claude Opus 4.6 (claude-opus-4-6-* or claude-opus-4.6-*)
 * - Claude Opus 4.5 (claude-opus-4-5-* or claude-opus-4.5-*)
 * - Claude Opus 4.1 (claude-opus-4-1-* or claude-opus-4.1-*)
 * - Claude Opus 4 (claude-opus-4-*)
 * @param modelId The model ID to check
 * @returns true if the model supports memory
 */
export function modelSupportsMemory(modelId: string): boolean {
	const normalized = modelId.toLowerCase().replace(/\./g, '-');
	return normalized.startsWith('claude-haiku-4-5') ||
		normalized.startsWith('claude-sonnet-4-6') ||
		normalized.startsWith('claude-sonnet-4-5') ||
		normalized.startsWith('claude-sonnet-4') ||
		normalized.startsWith('claude-opus-4-6') ||
		normalized.startsWith('claude-opus-4-5') ||
		normalized.startsWith('claude-opus-4-1') ||
		normalized.startsWith('claude-opus-4');
}

export function isAnthropicContextEditingEnabled(
	endpoint: IChatEndpoint | string,
	configurationService: IConfigurationService,
	experimentationService: IExperimentationService,
): boolean {
	const supportsIt = typeof endpoint === 'string'
		? modelSupportsContextEditing(endpoint)
		: endpoint.supportsContextEditing ?? modelSupportsContextEditing(endpoint.model);
	if (!supportsIt) {
		return false;
	}
	const mode = configurationService.getExperimentBasedConfig(ConfigKey.AnthropicContextEditingMode, experimentationService);
	return mode !== 'off';
}

/**
 * The extended (1 hour) prompt cache TTL is available on all active Claude
 * models via `cache_control: { type: 'ephemeral', ttl: '1h' }`
 * - Claude Opus 4.7 (incl. `claude-opus-4.7-1m-internal` and similar variants)
 * - Claude Opus 4.6 (incl. `claude-opus-4.6-1m`)
 * - Claude Opus 4.5
 * - Claude Sonnet 4.6
 * - Claude Sonnet 4.5
 */
export function modelSupportsExtendedCacheTtl(modelId: string): boolean {
	const normalized = modelId.toLowerCase().replace(/\./g, '-');
	return normalized.startsWith('claude-opus-4-7') ||
		normalized.startsWith('claude-opus-4-6') ||
		normalized.startsWith('claude-opus-4-5') ||
		normalized.startsWith('claude-sonnet-4-6') ||
		normalized.startsWith('claude-sonnet-4-5');
}

/**
 * Returns true when the Anthropic Messages API request should use the extended
 * (1 hour) prompt cache TTL on its tools and system breakpoints. Gated on the
 * model (see {@link modelSupportsExtendedCacheTtl}), the experiment-based setting, the chat
 * location (must be exactly {@link ChatLocation.Agent}), and the subagent flag.
 *
 * {@link ChatLocation.MessagesProxy} is intentionally out of scope — extended
 * TTL is only meant for the main agent conversation, not for the Claude CLI
 * passthrough.
 *
 * @param location Must be {@link ChatLocation.Agent}; any other value (including
 * `undefined`) fails the gate. Callers that route through subclass overrides
 * which drop the `location` argument (e.g. `super.getExtraHeaders()`) are
 * correctly excluded by this strict check.
 * @param isSubagent Subagent requests are short-lived and would not benefit
 * from the 1h TTL.
 */
export function isExtendedCacheTtlEnabled(
	endpoint: IChatEndpoint | string,
	configurationService: IConfigurationService,
	experimentationService: IExperimentationService,
	location: ChatLocation | undefined,
	isSubagent: boolean | undefined,
): boolean {
	const modelId = typeof endpoint === 'string' ? endpoint : endpoint.model;
	if (!modelSupportsExtendedCacheTtl(modelId)) {
		return false;
	}
	if (location !== ChatLocation.Agent) {
		return false;
	}
	if (isSubagent) {
		return false;
	}
	return configurationService.getExperimentBasedConfig(ConfigKey.Advanced.AnthropicExtendedCacheTtl, experimentationService);
}

/**
 * Sub-toggle of {@link isExtendedCacheTtlEnabled}. When BOTH the parent gate
 * passes (caller supplies its result as {@link parentEnabled}) and this
 * `extendedTtlMessages` setting is on, the rolling message-level breakpoints
 * (the ones {@link addMessagesApiCacheControl} places on the last cacheable
 * user/tool-result blocks) also use the 1h TTL instead of the default 5m.
 *
 * Takes the resolved parent result rather than re-running the parent gate so
 * callers that need both flags don't pay for the experiment-service lookup
 * twice. The signature makes the "sub-toggle of" relationship explicit.
 *
 * Nested rather than orthogonal because:
 * - Anthropic requires longer-TTL breakpoints to appear before shorter ones
 *   in the `tools → system → messages` prefix order, so `messages=1h` while
 *   `tools/system=5m` would be invalid.
 * - The interesting experiment is "does extending 1h to messages help *on
 *   top of* tools+system?", not in isolation.
 *
 * Message breakpoints rotate every turn, so a 1h write that gets superseded
 * within minutes wastes the 2x write premium. Only worthwhile when
 * conversations span large idle gaps (>5m) between turns.
 */
export function isExtendedCacheTtlMessagesEnabled(
	parentEnabled: boolean,
	configurationService: IConfigurationService,
	experimentationService: IExperimentationService,
): boolean {
	if (!parentEnabled) {
		return false;
	}
	return configurationService.getExperimentBasedConfig(ConfigKey.Advanced.AnthropicExtendedCacheTtlMessages, experimentationService);
}

export type ContextEditingMode = 'off' | 'clear-thinking' | 'clear-tooluse' | 'clear-both';

/**
 * Builds the context_management configuration object for the Messages API request.
 * @param mode The context editing mode
 * @param thinkingEnabled Whether extended thinking is enabled
 * @returns The context_management object to include in the request, or undefined if off or no edits
 */
export function buildContextManagement(
	mode: ContextEditingMode,
	thinkingEnabled: boolean
): ContextManagement | undefined {
	if (mode === 'off') {
		return undefined;
	}

	const edits: ContextManagementEdit[] = [];

	// Add thinking block clearing for clear-thinking and clear-both modes
	if ((mode === 'clear-thinking' || mode === 'clear-both') && thinkingEnabled) {
		edits.push({
			type: 'clear_thinking_20251015',
			keep: { type: 'thinking_turns', value: 1 },
		});
	}

	// Add tool result clearing for clear-tooluse and clear-both modes
	if (mode === 'clear-tooluse' || mode === 'clear-both') {
		edits.push({
			type: 'clear_tool_uses_20250919',
			trigger: { type: 'input_tokens', value: 100000 },
			keep: { type: 'tool_uses', value: 3 },
		});
	}

	return edits.length > 0 ? { edits } : undefined;
}

/**
 * Reads context editing mode from settings and builds the context_management object.
 * @param configurationService The configuration service to read settings from
 * @param experimentationService The experimentation service
 * @param thinkingEnabled Whether extended thinking is enabled
 * @returns The context_management object to include in the request, or undefined if disabled
 */
export function getContextManagementFromConfig(
	configurationService: IConfigurationService,
	experimentationService: IExperimentationService,
	thinkingEnabled: boolean,
): ContextManagement | undefined {
	const mode = configurationService.getExperimentBasedConfig(ConfigKey.AnthropicContextEditingMode, experimentationService);
	return buildContextManagement(mode, thinkingEnabled);
}
