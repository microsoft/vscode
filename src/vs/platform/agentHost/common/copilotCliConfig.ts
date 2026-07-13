/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../base/common/types.js';
import { localize } from '../../../nls.js';
import { createSchema, schemaProperty } from './agentHostSchema.js';
import type { ModelSelection } from './state/protocol/state.js';

/**
 * Root-config keys consumed exclusively by the Copilot CLI provider
 * (`CopilotSessionLauncher` / `CopilotAgent`) — kept out of the
 * provider-agnostic `agentHostCustomizationConfigSchema`.
 */
export const enum CopilotCliConfigKey {
	/** Use Agent Host's custom terminal tool instead of the SDK's default. Off by default. */
	EnableCustomTerminalTool = 'enableCustomTerminalTool',
	/** Enable the rubber duck critic subagent. */
	RubberDuck = 'rubberDuck',
	/** Apply Opus 4.8-tuned system-prompt overrides on Opus 4.8 models. Off by default. */
	Opus48Prompt = 'opus48Prompt',
	/** Override reasoning effort regardless of the picker value; unsupported values are ignored. */
	ReasoningEffortOverride = 'reasoningEffortOverride',
	/** Per-model capability overrides (family aliases) keyed by model id. */
	ModelCapabilityOverrides = 'modelCapabilityOverrides',
}

// VS Code `chat.agentHost.*` setting IDs that feed the root-config keys above,
// kept beside the keys they forward to. Registered in `chat.shared.contribution.ts`
// and forwarded into the host's root config by `AgentHostCopilotCliSettingsContribution`
// (and, for the terminal-tool toggle, `AgentHostTerminalContribution`).

export const AgentHostCustomTerminalToolEnabledSettingId = 'chat.agentHost.customTerminalTool.enabled';

export const AgentHostOpus48PromptEnabledSettingId = 'chat.agentHost.opus48Prompt.enabled';

export const AgentHostReasoningEffortOverrideSettingId = 'chat.agentHost.reasoningEffortOverride';

export const AgentHostCopilotModelCapabilityOverridesSettingId = 'chat.agentHost.copilot.modelCapabilityOverrides';

/** Per-model capability override; the agent-host equivalent of the extension's `IModelCapabilityOverride`. */
export interface ICopilotCliModelCapabilityOverride {
	/** Alias the model's family for prompt/capability routing (e.g. `"claude-opus-4-8"`). */
	readonly family?: string;
	/** Reasoning effort for sessions on this model; wins over the global {@link CopilotCliConfigKey.ReasoningEffortOverride}. Unrecognized values are ignored. */
	readonly reasoningEffort?: string;
	/** SDK tool allowlist, passed through as the session's `availableTools` (pattern syntax, e.g. `builtin:*`, `mcp:<name>`, or bare names). */
	readonly availableTools?: readonly string[];
	/** SDK tool denylist, passed through as the session's `excludedTools`; takes precedence over {@link availableTools}. */
	readonly excludedTools?: readonly string[];
}

/** Map of model id → capability override. */
export type CopilotCliModelCapabilityOverrides = Record<string, ICopilotCliModelCapabilityOverride>;

/** Wildcard entry key matching every model id; a specific model-id entry wins field-by-field. */
export const MODEL_CAPABILITY_OVERRIDE_WILDCARD = '*';

/**
 * Resolves the effective capability override for `modelId`: the wildcard
 * ({@link MODEL_CAPABILITY_OVERRIDE_WILDCARD}) entry merged field-by-field
 * under the model's own entry, so a specific entry's fields win and the
 * wildcard fills the gaps. Returns `undefined` when neither entry exists.
 *
 * Field values are NOT validated here: the root-config validator only checks
 * that the setting is an object (it does not descend into
 * `additionalProperties`), so use sites validate each field defensively —
 * mirroring {@link getModelFamilyAlias}.
 */
export function resolveModelCapabilityOverride(overrides: CopilotCliModelCapabilityOverrides | undefined, modelId: string): ICopilotCliModelCapabilityOverride | undefined {
	const wildcard = overrides?.[MODEL_CAPABILITY_OVERRIDE_WILDCARD];
	const entry = overrides?.[modelId];
	if (!isObject(wildcard) && !isObject(entry)) {
		return undefined;
	}
	return { ...(isObject(wildcard) ? wildcard : undefined), ...(isObject(entry) ? entry : undefined) };
}

export const copilotCliConfigSchema = createSchema({
	[CopilotCliConfigKey.EnableCustomTerminalTool]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentHost.config.enableCustomTerminalTool.title', "Use Agent Host Terminal Tool"),
		description: localize('agentHost.config.enableCustomTerminalTool.description', "When enabled, Copilot SDK sessions use Agent Host's terminal tool override instead of the SDK's default terminal behavior."),
		default: false,
	}),
	[CopilotCliConfigKey.RubberDuck]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentHost.config.rubberDuck.title', "Rubber Duck Agent"),
		description: localize('agentHost.config.rubberDuck.description', "When enabled, the coding agent uses a rubber duck critic subagent to review code changes using a complementary model."),
		default: false,
	}),
	[CopilotCliConfigKey.Opus48Prompt]: schemaProperty<boolean>({
		type: 'boolean',
		title: localize('agentHost.config.opus48Prompt.title', "Opus 4.8 Agent Prompt"),
		description: localize('agentHost.config.opus48Prompt.description', "When enabled, Copilot SDK sessions running a Claude Opus 4.8 model apply Opus 4.8-tuned system-prompt section overrides on top of the default system message."),
		default: false,
	}),
	[CopilotCliConfigKey.ReasoningEffortOverride]: schemaProperty<string>({
		type: 'string',
		title: localize('agentHost.config.reasoningEffortOverride.title', "Reasoning Effort Override"),
		description: localize('agentHost.config.reasoningEffortOverride.description', "Overrides the reasoning effort for Copilot SDK sessions regardless of the per-model picker value. Set it to a level the selected model supports (e.g. `low`, `medium`, `high`, `xhigh`); a value that isn't a recognized effort level is ignored and the session falls back to the picker value. Only affects Copilot SDK sessions; intended for experimentation."),
		default: '',
	}),
	[CopilotCliConfigKey.ModelCapabilityOverrides]: schemaProperty<CopilotCliModelCapabilityOverrides>({
		type: 'object',
		title: localize('agentHost.config.modelCapabilityOverrides.title', "Model Capability Overrides"),
		description: localize('agentHost.config.modelCapabilityOverrides.description', "Per-model capability overrides for Copilot SDK sessions, keyed by model id (`*` matches every model; a specific entry wins field-by-field). Aliasing a model id to a known `family` routes it to that family's tuned system prompt without changing the model id sent to the runtime; the remaining fields override reasoning effort and tool enablement per model. Only affects Copilot SDK sessions; intended for experimentation."),
		additionalProperties: {
			type: 'object',
			title: localize('agentHost.config.modelCapabilityOverrides.entry.title', "Capability Override"),
			description: localize('agentHost.config.modelCapabilityOverrides.entry.description', "A single capability override. The property key is the model id."),
			properties: {
				family: {
					type: 'string',
					title: localize('agentHost.config.modelCapabilityOverrides.family.title', "Family"),
					description: localize('agentHost.config.modelCapabilityOverrides.family.description', "Alias the model's family for prompt/capability routing (e.g. `claude-opus-4-8`)."),
				},
				reasoningEffort: {
					type: 'string',
					enum: ['low', 'medium', 'high', 'xhigh'],
					title: localize('agentHost.config.modelCapabilityOverrides.reasoningEffort.title', "Reasoning Effort"),
					description: localize('agentHost.config.modelCapabilityOverrides.reasoningEffort.description', "Reasoning effort for sessions on this model; wins over the global reasoning-effort override. Unrecognized values are ignored."),
				},
				availableTools: {
					type: 'array',
					items: { type: 'string', title: localize('agentHost.config.modelCapabilityOverrides.availableTools.item.title', "Tool Name or Pattern") },
					title: localize('agentHost.config.modelCapabilityOverrides.availableTools.title', "Available Tools"),
					description: localize('agentHost.config.modelCapabilityOverrides.availableTools.description', "When set, only matching tools are available to sessions on this model. Supports the Copilot SDK filter patterns (`builtin:*`, `mcp:<name>`, `custom:<name>`) and bare tool names. Applied when the session launches."),
				},
				excludedTools: {
					type: 'array',
					items: { type: 'string', title: localize('agentHost.config.modelCapabilityOverrides.excludedTools.item.title', "Tool Name or Pattern") },
					title: localize('agentHost.config.modelCapabilityOverrides.excludedTools.title', "Excluded Tools"),
					description: localize('agentHost.config.modelCapabilityOverrides.excludedTools.description', "Tools disabled for sessions on this model; same pattern syntax as `availableTools` and takes precedence over it. Applied when the session launches."),
				},
			},
		},
		default: {},
	}),
});

/** Returns the configured family alias for `modelId`, or `undefined`. Malformed entries are treated as unset. */
function getModelFamilyAlias(overrides: CopilotCliModelCapabilityOverrides | undefined, modelId: string): string | undefined {
	const family = resolveModelCapabilityOverride(overrides, modelId)?.family;
	return typeof family === 'string' && family.length > 0 ? family : undefined;
}

/**
 * Substitutes a configured family alias for the model id so an aliased preview model
 * routes to a known family's prompt contributor. `model.config` picker values are
 * preserved; returns the input unchanged when no alias applies.
 */
export function applyModelFamilyAlias(model: ModelSelection | undefined, overrides: CopilotCliModelCapabilityOverrides | undefined): ModelSelection | undefined {
	if (!model) {
		return undefined;
	}
	const family = getModelFamilyAlias(overrides, model.id);
	return family ? { ...model, id: family } : model;
}
