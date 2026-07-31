/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
	/** Log level passed to the Copilot SDK client. */
	CopilotSdkLogLevel = 'copilotSdkLogLevel',
	/** Enable the rubber duck critic subagent. */
	RubberDuck = 'rubberDuck',
	/** Apply Opus 4.8-tuned system-prompt overrides on Opus 4.8 models. Off by default. */
	Opus48Prompt = 'opus48Prompt',
	/** Enable runtime tool search (deferred-tool loading) for Copilot SDK sessions. Off by default. */
	ToolSearchEnabled = 'toolSearchEnabled',
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

export const AgentHostCopilotSdkLogLevelSettingId = 'chat.agentHost.copilotSdk.logLevel';

export const AgentHostOpus48PromptEnabledSettingId = 'chat.agentHost.opus48Prompt.enabled';

export const AgentHostToolSearchEnabledSettingId = 'chat.agentHost.copilot.toolSearch.enabled';

export const AgentHostReasoningEffortOverrideSettingId = 'chat.agentHost.reasoningEffortOverride';

export const AgentHostModelCapabilityOverridesSettingId = 'chat.agentHost.modelCapabilityOverrides';

export const copilotSdkLogLevelSettingValues = ['info', 'trace'] as const;
export type CopilotSdkLogLevelSetting = typeof copilotSdkLogLevelSettingValues[number];

/** Per-model capability override; the agent-host equivalent of the extension's `IModelCapabilityOverride`. */
interface ICopilotCliModelCapabilityOverride {
	/** Alias the model's family for prompt/capability routing (e.g. `"claude-opus-4-8"`). */
	readonly family?: string;
}

/** Map of model id → capability override. */
export type CopilotCliModelCapabilityOverrides = Record<string, ICopilotCliModelCapabilityOverride>;

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
		default: false,
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
		description: localize('agentHost.config.modelCapabilityOverrides.description', "Per-model capability overrides for Copilot SDK sessions, keyed by model id. Aliasing a model id to a known `family` routes it to that family's tuned system prompt without changing the model id sent to the runtime. Only affects Copilot SDK sessions; intended for experimentation."),
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
			},
		},
		default: {},
	}),
});

/** Returns the configured family alias for `modelId`, or `undefined`. Malformed entries are treated as unset. */
function getModelFamilyAlias(overrides: CopilotCliModelCapabilityOverrides | undefined, modelId: string): string | undefined {
	const family = overrides?.[modelId]?.family;
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
