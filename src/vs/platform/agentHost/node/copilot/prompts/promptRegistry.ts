/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SectionOverride, SystemMessageConfig, SystemMessageSection } from '@github/copilot-sdk';
import { agentHostCustomizationConfigSchema } from '../../../common/agentHostCustomizationConfig.js';
import type { SchemaValue } from '../../../common/agentHostSchema.js';
import type { ModelSelection } from '../../../common/state/protocol/state.js';
import { COPILOT_AGENT_HOST_SYSTEM_MESSAGE, fullSystemPrompt, sectionOverrides } from './systemMessage.js';
import { resolveToolInstructionsOverride } from './toolInstructions.js';

type CustomizationConfigDefinition = typeof agentHostCustomizationConfigSchema.definition;

/**
 * Read-time context handed to prompt contributors so they can gate behavior on
 * host configuration — the agent-host equivalent of the Copilot extension
 * injecting `IConfigurationService` into a resolver.
 *
 * Scoped to the host customization schema so contributors (and tests) read
 * settings in a fully-typed way without depending on the whole configuration
 * service.
 */
export interface IAgentHostPromptContext {
	/**
	 * Returns the host-level value for a customization setting, or `undefined`
	 * when unset. Mirrors `IAgentConfigurationService.getRootValue` bound to
	 * {@link agentHostCustomizationConfigSchema}.
	 */
	getSetting<K extends keyof CustomizationConfigDefinition & string>(key: K): SchemaValue<CustomizationConfigDefinition[K]> | undefined;

	/**
	 * Returns whether a *client* tool is available in the session, addressed by
	 * the camelCase `toolReferenceName` the agent sees it under (e.g.
	 * `openBrowserPage`). Used to gate tool-specific instructions on the tool
	 * being present, the agent-host equivalent of the Copilot extension
	 * inspecting its tool set.
	 *
	 * Scope: client tools only (the forwarded workbench tools). It does NOT see
	 * shell tools, server-SDK tools, or MCP-provided tools — those aren't in the
	 * session snapshot at launch (MCP is discovered dynamically). A line that
	 * gates on one of those names silently resolves to `false`; broadening this
	 * is the context-enrichment follow-up.
	 */
	hasClientTool(name: string): boolean;
}

/**
 * Per-model system-prompt contributor for Copilot CLI agent-host sessions.
 *
 * Mirrors the Copilot extension's `IAgentPrompt`, but — because the agent host
 * runs in its own process and cannot use prompt-tsx — a contributor returns
 * plain data the SDK accepts directly rather than prompt-tsx elements.
 *
 * A contributor may provide EITHER a full system-prompt override OR a set of
 * section overrides. When it provides a full prompt that wins (`replace` mode);
 * otherwise the section overrides are applied (`customize` mode).
 */
export interface IAgentHostPrompt {
	/**
	 * Full system-prompt override. Resolved into `{ mode: 'replace' }`, which
	 * drops the SDK foundation prompt and its guardrails.
	 */
	resolveFullSystemPrompt?(model: ModelSelection, context: IAgentHostPromptContext): string | undefined;

	/**
	 * Section-level overrides. Resolved into `{ mode: 'customize' }`, keeping the
	 * SDK foundation prompt and guardrails intact.
	 */
	resolveSectionOverrides?(model: ModelSelection, context: IAgentHostPromptContext): Partial<Record<SystemMessageSection, SectionOverride>> | undefined;
}

/**
 * Constructor/static shape for a registered prompt contributor. Mirrors the
 * Copilot extension's `IAgentPromptCtor`: a contributor matches a model either
 * by a custom {@link matchesModel} predicate or by a model-id family prefix.
 */
export interface IAgentHostPromptCtor {
	/** Model-id prefixes this contributor handles (e.g. `'claude'`, `'gpt-5'`). */
	readonly familyPrefixes: readonly string[];

	/** Optional custom matcher; takes precedence over {@link familyPrefixes}. */
	matchesModel?(model: ModelSelection): boolean;

	new(): IAgentHostPrompt;
}

type PromptWithMatcher = IAgentHostPromptCtor & { matchesModel: (model: ModelSelection) => boolean };

/**
 * Registry of per-model system-prompt contributors for Copilot CLI agent-host
 * sessions. Mirrors the Copilot extension's `PromptRegistry`: contributors
 * register a model match (custom predicate or family prefix) and the session
 * launcher calls {@link resolveSystemMessageConfig} when building a session.
 *
 * Exported as a class for isolated unit testing; a shared singleton
 * ({@link agentHostPromptRegistry}) is what contributors register into and the
 * launcher consumes.
 */
export class AgentHostPromptRegistry {
	private readonly _promptsWithMatcher: PromptWithMatcher[] = [];
	private readonly _familyPrefixList: { readonly prefix: string; readonly ctor: IAgentHostPromptCtor }[] = [];

	registerPrompt(ctor: IAgentHostPromptCtor): void {
		if (ctor.matchesModel) {
			this._promptsWithMatcher.push(ctor as PromptWithMatcher);
		}
		for (const prefix of ctor.familyPrefixes) {
			this._familyPrefixList.push({ prefix, ctor });
		}
	}

	private _getContributor(model: ModelSelection): IAgentHostPromptCtor | undefined {
		for (const ctor of this._promptsWithMatcher) {
			if (ctor.matchesModel(model)) {
				return ctor;
			}
		}
		for (const { prefix, ctor } of this._familyPrefixList) {
			if (model.id.startsWith(prefix)) {
				return ctor;
			}
		}
		return undefined;
	}

	/**
	 * Resolves the {@link SystemMessageConfig} for a session's model: the
	 * per-model (or default) config from {@link _resolveModelConfig}, with the
	 * model-agnostic section overrides from {@link _withUniversalSections}
	 * layered on top.
	 *
	 * Lifetime: the SDK accepts a system message only at session create/resume
	 * (there is no mid-session update), so this is resolved once per (re)launch
	 * and any tool-gated content reflects the tool set at that moment. A change
	 * to the session's tools/plugins is part of the launcher's restart-detection
	 * snapshot, so it re-launches the session and recomputes this; an in-flight
	 * turn keeps the prompt it launched with.
	 */
	resolveSystemMessageConfig(model: ModelSelection | undefined, context: IAgentHostPromptContext): SystemMessageConfig {
		return this._withUniversalSections(this._resolveModelConfig(model, context), context);
	}

	/**
	 * Resolves the per-model config, before universal sections are layered on.
	 *
	 * Falls back to {@link COPILOT_AGENT_HOST_SYSTEM_MESSAGE} when the model is
	 * unknown (e.g. server-side "Auto" selection where no model is chosen at
	 * create time), when no contributor matches, or when the matching
	 * contributor opts out for the current {@link context} (e.g. a setting that
	 * gates it is disabled).
	 */
	private _resolveModelConfig(model: ModelSelection | undefined, context: IAgentHostPromptContext): SystemMessageConfig {
		if (!model) {
			return COPILOT_AGENT_HOST_SYSTEM_MESSAGE;
		}
		const ctor = this._getContributor(model);
		if (!ctor) {
			return COPILOT_AGENT_HOST_SYSTEM_MESSAGE;
		}
		const contributor = new ctor();
		const fullPrompt = contributor.resolveFullSystemPrompt?.(model, context);
		if (fullPrompt !== undefined) {
			return fullSystemPrompt(fullPrompt);
		}
		const sections = contributor.resolveSectionOverrides?.(model, context);
		// An empty overrides object is treated as "no override" so we keep the
		// default identity customization rather than emitting a
		// `{ mode: 'customize', sections: {} }` that drops it.
		if (sections && Object.keys(sections).length > 0) {
			return sectionOverrides(sections);
		}
		return COPILOT_AGENT_HOST_SYSTEM_MESSAGE;
	}

	/**
	 * Layers section overrides that apply to EVERY model on top of the per-model
	 * (or default) config. Currently this is only the `tool_instructions` section
	 * (see {@link resolveToolInstructionsOverride}), which the agent host wants
	 * for all models rather than gating per-model like the Opus prompt.
	 *
	 * Only `customize`-mode configs carry section overrides, so this is a no-op
	 * for a contributor's full `replace` prompt (which owns the entire system
	 * message and intentionally drops the SDK foundation) and for `append` mode.
	 * A `replace` contributor that wants the universal guidance re-includes it
	 * itself by rendering `universalToolInstructions` (in `toolInstructions.ts`)
	 * from its `resolveFullSystemPrompt`, mirroring how the extension's full-prompt
	 * models inline the same lines.
	 *
	 * A per-model `tool_instructions` override is composed with — not overwritten
	 * by — the universal lines (see {@link resolveToolInstructionsOverride}).
	 */
	private _withUniversalSections(config: SystemMessageConfig, context: IAgentHostPromptContext): SystemMessageConfig {
		if (config.mode !== 'customize') {
			return config;
		}
		const toolInstructions = resolveToolInstructionsOverride(name => context.hasClientTool(name), config.sections?.tool_instructions);
		if (!toolInstructions) {
			return config;
		}
		return { ...config, sections: { ...config.sections, tool_instructions: toolInstructions } };
	}
}

/**
 * Shared registry instance. Per-model contributors register here (see
 * `allPrompts.ts`) and the session launcher reads from it.
 */
export const agentHostPromptRegistry = new AgentHostPromptRegistry();
