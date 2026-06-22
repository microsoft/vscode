/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SectionOverride, SystemMessageConfig, SystemMessageSection } from '@github/copilot-sdk';
import { agentHostCustomizationConfigSchema } from '../../../common/agentHostCustomizationConfig.js';
import type { SchemaValue } from '../../../common/agentHostSchema.js';
import type { ModelSelection } from '../../../common/state/protocol/state.js';
import { COPILOT_AGENT_HOST_SYSTEM_MESSAGE, fullSystemPrompt, sectionOverrides } from './systemMessage.js';

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
	 * Resolves the {@link SystemMessageConfig} for a session's model.
	 *
	 * Falls back to {@link COPILOT_AGENT_HOST_SYSTEM_MESSAGE} when the model is
	 * unknown (e.g. server-side "Auto" selection where no model is chosen at
	 * create time), when no contributor matches, or when the matching
	 * contributor opts out for the current {@link context} (e.g. a setting that
	 * gates it is disabled).
	 */
	resolveSystemMessageConfig(model: ModelSelection | undefined, context: IAgentHostPromptContext): SystemMessageConfig {
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
}

/**
 * Shared registry instance. Per-model contributors register here (see
 * `allPrompts.ts`) and the session launcher reads from it.
 */
export const agentHostPromptRegistry = new AgentHostPromptRegistry();
