/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../base/common/types.js';
import { localize } from '../../../nls.js';
import { createSchema, schemaProperty } from './agentHostSchema.js';
import { reasoningEffortLevels } from './reasoningEffort.js';

/**
 * Root-config keys consumed exclusively by the Copilot CLI provider
 * (`CopilotSessionLauncher` / `CopilotAgent`) — kept out of the
 * provider-agnostic `agentHostCustomizationConfigSchema`.
 */
export const enum CopilotCliConfigKey {
	/** Use Agent Host's custom terminal tool instead of the SDK's default. Off by default. */
	EnableCustomTerminalTool = 'enableCustomTerminalTool',
	/** Log level passed to the Copilot SDK client. */
	CopilotSdkLogLevel = 'copilotSdkLogLevel',
	/** Enable the rubber duck critic subagent. */
	RubberDuck = 'rubberDuck',
	/** Apply Opus 4.8-tuned system-prompt overrides on Opus 4.8 models. Off by default. */
	Opus48Prompt = 'opus48Prompt',
	/** Enable runtime tool search (deferred-tool loading) for Copilot SDK sessions. On by default. */
	ToolSearchEnabled = 'toolSearchEnabled',
	/** Minimum tool count before MCP/external tools are deferred behind tool search. 0 = always defer. */
	ToolSearchDeferThreshold = 'toolSearchDeferThreshold',
	/** Override reasoning effort regardless of the picker value; unsupported values are ignored. */
	ReasoningEffortOverride = 'reasoningEffortOverride',
	/** Enable concise reasoning summaries for supported models. Off by default. */
	ReasoningSummary = 'reasoningSummary',
	/** Let the Auto router score prior turns instead of the latest message alone. Off by default. */
	MultiTurnContextRouting = 'multiTurnContextRouting',
	/** Tell the model to keep subagents on their default model unless the user asks otherwise. Off by default. */
	SubagentModelGuidance = 'subagentModelGuidance',
	/** Per-model capability overrides (family aliases) keyed by model id. */
	ModelCapabilityOverrides = 'modelCapabilityOverrides',
}

export const CopilotCliVSCodeAssignmentContextKey = 'copilotCliVSCodeAssignmentContext';

// VS Code `chat.agentHost.*` / `chat.copilot.*` setting IDs that feed the root-config
// keys above, kept beside the keys they forward to. Registered in `chat.shared.contribution.ts`
// and forwarded into the host's root config by `AgentHostCopilotCliSettingsContribution`
// (and, for the terminal-tool toggle, `AgentHostTerminalContribution`).

export const AgentHostCustomTerminalToolEnabledSettingId = 'chat.agentHost.customTerminalTool.enabled';

export const AgentHostCopilotSdkLogLevelSettingId = 'chat.agentHost.copilotSdk.logLevel';

export const AgentHostOpus48PromptEnabledSettingId = 'chat.agentHost.opus48Prompt.enabled';

export const AgentHostToolSearchEnabledSettingId = 'chat.agentHost.copilot.toolSearch.enabled';

export const AgentHostToolSearchDeferThresholdSettingId = 'chat.agentHost.copilot.toolSearch.deferThreshold';

export const AgentHostReasoningEffortOverrideSettingId = 'chat.agentHost.copilot.reasoningEffortOverride';

export const AgentHostReasoningSummaryEnabledSettingId = 'chat.agentHost.copilot.reasoningSummary.enabled';

export const AgentHostMultiTurnContextRoutingEnabledSettingId = 'chat.agentHost.copilot.multiTurnContextRouting.enabled';

export const CopilotSubagentModelGuidanceEnabledSettingId = 'chat.copilot.subagentModelGuidance.enabled';

export const AgentHostModelCapabilityOverridesSettingId = 'chat.agentHost.modelCapabilityOverrides';
export const AgentHostCopilotModelCapabilityOverridesSettingId = 'chat.agentHost.copilot.modelCapabilityOverrides';

export const copilotSdkLogLevelSettingValues = ['info', 'trace'] as const;
export type CopilotSdkLogLevelSetting = typeof copilotSdkLogLevelSettingValues[number];

export const DEFAULT_COPILOT_RUBBER_DUCK_ENABLED = true;

/** Floors valid tool-search thresholds and returns the default for invalid values. */
export function normalizeToolSearchDeferThreshold(value: number | undefined): number {
	return value !== undefined && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 1;
}

/** Per-model capability override; the agent-host equivalent of the extension's `IModelCapabilityOverride`. */
export interface ICopilotCliModelCapabilityOverride {
	/** Family alias (e.g. `"claude-opus-4.8"`) for prompt and tool-capability routing. */
	readonly family?: string;
	/** Wins over the model picker's thinking level; unrecognized values are ignored. */
	readonly reasoningEffort?: string;
	/** SDK tool allowlist (pattern syntax, e.g. `builtin:*`, `mcp:<name>`, or bare names). */
	readonly availableTools?: readonly string[];
	/** SDK tool denylist; takes precedence over {@link availableTools}. */
	readonly excludedTools?: readonly string[];
	/** Deep-merged over the runtime's resolved defaults (e.g. `supports.vision`). */
	readonly modelCapabilities?: Record<string, unknown>;
}

/** Map of model id → capability override. */
export type CopilotCliModelCapabilityOverrides = Record<string, ICopilotCliModelCapabilityOverride>;

/** Wildcard entry key matching every model id; a specific model-id entry wins field-by-field. */
export const MODEL_CAPABILITY_OVERRIDE_WILDCARD = '*';

/**
 * Resolves one field from the specific entry and then the wildcard. Invalid
 * specific values are ignored rather than masking a usable wildcard default.
 */
export function resolveModelCapabilityOverrideField<K extends keyof ICopilotCliModelCapabilityOverride, T>(
	overrides: CopilotCliModelCapabilityOverrides | undefined,
	modelId: string | undefined,
	field: K,
	isUsable: (value: unknown) => value is T,
	onInvalid?: (value: unknown) => void,
): T | undefined {
	const entryKeys = modelId === undefined || modelId === MODEL_CAPABILITY_OVERRIDE_WILDCARD
		? [MODEL_CAPABILITY_OVERRIDE_WILDCARD]
		: [modelId, MODEL_CAPABILITY_OVERRIDE_WILDCARD];
	for (const entryKey of entryKeys) {
		const entry = overrides?.[entryKey];
		const value = isObject(entry) ? entry[field] : undefined;
		if (value === undefined) {
			continue;
		}
		if (isUsable(value)) {
			return value;
		}
		onInvalid?.(value);
	}
	return undefined;
}

export const copilotCliConfigSchema = createSchema({
	[CopilotCliConfigKey.EnableCustomTerminalTool]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentHost.config.enableCustomTerminalTool.title', "Use Agent Host Terminal Tool"),
		description: localize('agentHost.config.enableCustomTerminalTool.description', "When enabled, Copilot SDK sessions use Agent Host's terminal tool override instead of the SDK's default terminal behavior."),
		default: false,
	}),
	[CopilotCliConfigKey.CopilotSdkLogLevel]: schemaProperty<CopilotSdkLogLevelSetting>({
		type: 'string',
		title: localize('agentHost.config.copilotSdkLogLevel.title', "Copilot SDK Log Level"),
		description: localize('agentHost.config.copilotSdkLogLevel.description', "Controls logging from the Copilot SDK runtime. Agent host trace logging always enables trace output."),
		enum: [...copilotSdkLogLevelSettingValues],
		enumLabels: [
			localize('agentHost.config.copilotSdkLogLevel.info', "Info"),
			localize('agentHost.config.copilotSdkLogLevel.trace', "Trace"),
		],
		default: 'info',
	}),
	[CopilotCliConfigKey.RubberDuck]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentHost.config.rubberDuck.title', "Rubber Duck Agent"),
		description: localize('agentHost.config.rubberDuck.description', "When enabled, the coding agent uses a rubber duck critic subagent to review code changes using a complementary model."),
		default: DEFAULT_COPILOT_RUBBER_DUCK_ENABLED,
	}),
	[CopilotCliConfigKey.Opus48Prompt]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentHost.config.opus48Prompt.title', "Opus 4.8 Agent Prompt"),
		description: localize('agentHost.config.opus48Prompt.description', "When enabled, Copilot SDK sessions running a Claude Opus 4.8 model apply Opus 4.8-tuned system-prompt section overrides on top of the default system message."),
		default: false,
	}),
	[CopilotCliConfigKey.ToolSearchEnabled]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentHost.config.toolSearchEnabled.title', "Agent Host Tool Search"),
		description: localize('agentHost.config.toolSearchEnabled.description', "When enabled, Copilot SDK sessions defer MCP and non-core VS Code tools behind a tool-search tool so the model discovers them on demand instead of loading every tool definition up front."),
		default: true,
	}),
	[CopilotCliConfigKey.ToolSearchDeferThreshold]: schemaProperty<number>({
		type: 'number',
		title: localize('agentHost.config.toolSearchDeferThreshold.title', "Tool Search Defer Threshold"),
		description: localize('agentHost.config.toolSearchDeferThreshold.description', "Minimum number of tools before MCP and external tools are deferred behind tool search. Set to 0 to always defer external tools. Only effective when tool search is enabled."),
		default: 1,
	}),
	[CopilotCliConfigKey.ReasoningSummary]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentHost.config.reasoningSummary.title', "Reasoning Summary"),
		description: localize('agentHost.config.reasoningSummary.description', "When enabled, requests concise reasoning summaries for supported Copilot SDK sessions."),
		default: false,
	}),
	[CopilotCliConfigKey.MultiTurnContextRouting]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentHost.config.multiTurnContextRouting.title', "Auto Multi-Turn Context Routing"),
		description: localize('agentHost.config.multiTurnContextRouting.description', "When enabled, Auto model selection sends prior user messages to the router so it scores the conversation so far instead of the latest message alone."),
		default: false,
	}),
	[CopilotCliConfigKey.SubagentModelGuidance]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentHost.config.subagentModelGuidance.title', "Subagent Model Guidance"),
		description: localize('agentHost.config.subagentModelGuidance.description', "When enabled, Copilot SDK sessions instruct the model to keep subagents on their default model unless the user explicitly names another one."),
		default: false,
	}),
	[CopilotCliConfigKey.ModelCapabilityOverrides]: schemaProperty<CopilotCliModelCapabilityOverrides>({
		type: 'object',
		title: localize('agentHost.config.modelCapabilityOverrides.title', "Model Capability Overrides"),
		description: localize('agentHost.config.modelCapabilityOverrides.description', "Per-model capability overrides for Copilot SDK sessions, keyed by model id (`*` matches every model; a specific entry wins field-by-field). Aliasing a model id to a known `family` routes it to that family's tuned system prompt and tool profile without changing the model id sent to the runtime; the remaining fields override reasoning effort, tool enablement, and model capability limits per model. Only affects Copilot SDK sessions; intended for experimentation."),
		additionalProperties: {
			type: 'object',
			title: localize('agentHost.config.modelCapabilityOverrides.entry.title', "Capability Override"),
			description: localize('agentHost.config.modelCapabilityOverrides.entry.description', "A single capability override. The property key is the model id."),
			properties: {
				family: {
					type: 'string',
					title: localize('agentHost.config.modelCapabilityOverrides.family.title', "Family"),
					description: localize('agentHost.config.modelCapabilityOverrides.family.description', "Route the model to another family's tuned system prompt and tool profile (e.g. `claude-opus-4.8`). The model id sent to the runtime is unaffected, so the session still runs on the selected model."),
				},
				reasoningEffort: {
					type: 'string',
					enum: [...reasoningEffortLevels],
					title: localize('agentHost.config.modelCapabilityOverrides.reasoningEffort.title', "Reasoning Effort"),
					description: localize('agentHost.config.modelCapabilityOverrides.reasoningEffort.description', "Reasoning effort for sessions on this model; overrides the model picker's thinking level. Unrecognized values are ignored."),
				},
				availableTools: {
					type: 'array',
					items: { type: 'string', title: localize('agentHost.config.modelCapabilityOverrides.availableTools.item.title', "Tool Name or Pattern") },
					title: localize('agentHost.config.modelCapabilityOverrides.availableTools.title', "Available Tools"),
					description: localize('agentHost.config.modelCapabilityOverrides.availableTools.description', "When set, only matching tools are available to sessions on this model. Patterns: bare tool names, `builtin:*` or `builtin:<name>` (Copilot runtime tools), `mcp:*` or `mcp:<name>` (MCP server tools), and `custom:*` or `custom:<name>` (every tool VS Code registers with the SDK, including the agent host's own terminal tools); a bare `*` expands to all three sources. Applied when the session launches or resumes."),
				},
				excludedTools: {
					type: 'array',
					items: { type: 'string', title: localize('agentHost.config.modelCapabilityOverrides.excludedTools.item.title', "Tool Name or Pattern") },
					title: localize('agentHost.config.modelCapabilityOverrides.excludedTools.title', "Excluded Tools"),
					description: localize('agentHost.config.modelCapabilityOverrides.excludedTools.description', "Tools disabled for sessions on this model; same pattern syntax as `availableTools` and takes precedence over it. Note that `custom:*` and a bare `*` also disable the agent host's own terminal tools registered with the SDK. Applied when the session launches or resumes."),
				},
				modelCapabilities: {
					type: 'object',
					title: localize('agentHost.config.modelCapabilityOverrides.modelCapabilities.title', "Model Capabilities"),
					description: localize('agentHost.config.modelCapabilityOverrides.modelCapabilities.description', "Per-property model capability overrides passed through to the Copilot SDK's `modelCapabilities` session field (e.g. `{ \"supports\": { \"vision\": false }, \"limits\": { \"max_context_window_tokens\": 64000 } }`), deep-merged over the runtime's resolved defaults for this model. Applied when the session launches or resumes."),
				},
			},
		},
		default: {},
	}),
});

// The alias only feeds the host's prompt registry, whose contributors match on
// model-id shapes of their own choosing; an allow-list of id shapes here would
// silently reject valid ones (`vendor/model`). Reject only what cannot be an
// id at all.
const MODEL_FAMILY_MAX_LENGTH = 128;
const MODEL_FAMILY_CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/** Returns a usable model-family alias, or `undefined` for malformed values. */
export function normalizeModelFamilyAlias(value: unknown): string | undefined {
	if (typeof value !== 'string' || value.length === 0 || value.length > MODEL_FAMILY_MAX_LENGTH) {
		return undefined;
	}
	return value.trim() === value && !MODEL_FAMILY_CONTROL_CHARS.test(value) ? value : undefined;
}
