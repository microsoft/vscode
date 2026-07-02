/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { createSchema, schemaProperty } from './agentHostSchema.js';
import type { ModelSelection } from './state/protocol/state.js';

/**
 * Root-config keys owned by the Copilot CLI (Copilot SDK) provider. Kept in
 * their own schema — separate from the provider-agnostic
 * `agentHostCustomizationConfigSchema` — because they are consumed exclusively
 * by the Copilot CLI session path (`CopilotSessionLauncher` / `CopilotAgent`);
 * the Claude and Codex providers never read them.
 */
export const enum CopilotCliConfigKey {
	/** When true, Copilot SDK sessions use Agent Host's custom terminal tool override instead of the SDK's default terminal behavior. Disabled by default. */
	EnableCustomTerminalTool = 'enableCustomTerminalTool',
	/** When true, Copilot SDK sessions enable the rubber duck critic subagent. */
	RubberDuck = 'rubberDuck',
	/**
	 * When true, Copilot SDK sessions running a Claude Opus 4.8 model apply the
	 * Opus 4.8-tuned system-prompt section overrides on top of the SDK
	 * foundation prompt. Opt-in; disabled by default.
	 */
	Opus48Prompt = 'opus48Prompt',
	/**
	 * Overrides the reasoning effort for Copilot SDK sessions regardless of
	 * the per-model picker value. Applied at session create and on
	 * mid-session model changes; an unsupported value is ignored. Mirrors the
	 * Copilot extension's `chat.reasoningEffortOverride` eval/debug setting.
	 */
	ReasoningEffortOverride = 'reasoningEffortOverride',
	/**
	 * Per-model capability overrides keyed by model id, mirroring the Copilot
	 * extension's `chat.modelCapabilityOverrides` eval setting. Aliasing an
	 * unknown/preview model id to a known `family` routes it to that family's
	 * per-model system prompt (see `AgentHostPromptRegistry`); the model id
	 * sent to the runtime is unaffected.
	 */
	ModelCapabilityOverrides = 'modelCapabilityOverrides',
}

/**
 * Per-model capability override, the agent-host equivalent of the Copilot
 * extension's `IModelCapabilityOverride`. Currently only prompt routing
 * consumes the alias; new family-based capability heuristics should honor it
 * too.
 */
interface ICopilotCliModelCapabilityOverride {
	/**
	 * Alias the model's family for prompt/capability routing (e.g. set to
	 * `"claude-opus-4-8"` to make a preview model receive the Opus 4.8-tuned
	 * system prompt).
	 */
	readonly family?: string;
}

/**
 * Map of model id → capability override, as stored in the
 * {@link CopilotCliConfigKey.ModelCapabilityOverrides} root config value.
 */
export type CopilotCliModelCapabilityOverrides = Record<string, ICopilotCliModelCapabilityOverride>;

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
		description: localize('agentHost.config.reasoningEffortOverride.description', "Overrides the reasoning effort for Copilot SDK sessions regardless of the per-model picker value (e.g. `low`, `medium`, `high`, `xhigh`). An unsupported value is ignored. Only affects Copilot SDK sessions; intended for experimentation."),
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

/**
 * Returns the family alias configured for `modelId`, or `undefined` when no
 * usable alias is configured. The values bag is forwarded from user settings,
 * so a malformed entry (missing or non-string `family`) is treated as unset.
 */
function getModelFamilyAlias(overrides: CopilotCliModelCapabilityOverrides | undefined, modelId: string): string | undefined {
	const family = overrides?.[modelId]?.family;
	return typeof family === 'string' && family.length > 0 ? family : undefined;
}

/**
 * Substitutes a configured family alias for the model id, the agent-host
 * equivalent of the Copilot extension aliasing an endpoint's `family`. Prompt
 * contributors match on model-id prefixes as the family stand-in, so an
 * aliased selection flows through both `familyPrefixes` matching and a
 * contributor's own version checks (e.g. `isOpus48`). Picker values in
 * `model.config` are preserved. Returns the input selection unchanged when no
 * usable alias is configured.
 */
export function applyModelFamilyAlias(model: ModelSelection | undefined, overrides: CopilotCliModelCapabilityOverrides | undefined): ModelSelection | undefined {
	if (!model) {
		return undefined;
	}
	const family = getModelFamilyAlias(overrides, model.id);
	return family ? { ...model, id: family } : model;
}
