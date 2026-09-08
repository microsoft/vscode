/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { readAgentModelNoticesMeta } from '../../../../../../platform/agentHost/common/agentModelNotices.js';
import { ConfigSchema, SessionModelInfo } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { readAgentModelPricingMeta } from '../../../../../../platform/agentHost/common/agentModelPricing.js';
import { readAgentModelByokIdentifier } from '../../../../../../platform/agentHost/common/agentModelByokMeta.js';
import { readAgentModelGroupId, readAgentModelSourceId } from '../../../../../../platform/agentHost/common/agentModelSource.js';
import { getReasoningEffortDescription, getReasoningEffortLabel } from '../../../../../../platform/agentHost/common/reasoningEffort.js';
import { nullExtensionDescription } from '../../../../../services/extensions/common/extensions.js';
import { AUTO_RAW_MODEL_ID, COPILOT_VENDOR_ID, ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelChatProvider, ILanguageModelConfigurationSchema, ILanguageModelsService } from '../../../common/languageModels.js';

/**
 * Returns whether an agent host provider exposes a synthetic "Auto" model to
 * fall back to.
 *
 * Today only the Copilot CLI harness exposes an Auto selection and can run
 * without an explicit model, so it shows "Auto" rather than a "No models
 * available" state when no models are listed. Other harnesses (Claude,
 * Codex, …) require an explicit model.
 *
 * `provider` is the underlying agent provider id (e.g. `'copilotcli'`,
 * `'claude'`, `'codex'`), not the `agent-host-<provider>` session type.
 *
 * TODO: hoist this capability onto the agent host protocol (e.g. a
 * `supportsAutoModel?: boolean` on `IAgentDescriptor` / `AgentInfo`) so each
 * agent declares its own value instead of this allow-list living in core.
 */
export function agentHostProviderSupportsAutoModel(provider: string): boolean {
	return provider === 'copilotcli';
}

/**
 * Read-only view of the workbench model catalogue an agent host's models are enriched from.
 *
 * Narrowed to the reads {@link AgentHostLanguageModelProvider} performs (all plain lookups into
 * already-registered models, so none of them re-enter a provider) plus the change signal, both so
 * the dependency stays obviously side-effect free and so tests can supply a small fake.
 */
export type IAgentHostModelCatalogue = Pick<ILanguageModelsService, 'getLanguageModelIds' | 'lookupLanguageModel' | 'onDidChangeLanguageModels'>;

/**
 * Exposes models available from the agent host process as selectable
 * language models in the chat model picker. Models are provided from
 * root state (via {@link AgentInfo.models}) rather than via RPC.
 */
export class AgentHostLanguageModelProvider extends Disposable implements ILanguageModelChatProvider {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _models: readonly SessionModelInfo[] = [];

	constructor(
		private readonly _sessionType: string,
		private readonly _vendor: string,
		private readonly _catalogue?: IAgentHostModelCatalogue,
	) {
		super();

		// The catalogue is populated independently of the host — a sandbox can advertise its models
		// before the Copilot vendor has resolved, and CAPI can refresh prices later — so re-publish
		// whenever it changes to pick up the enrichment.
		//
		// Scoped to the enriched-from vendor, which also keeps this from looping: the service fires
		// this event for every provider that publishes, including this one, but a host's vendor is
		// always a session-type id (`agent-host-…`) and never `copilot`.
		if (this._catalogue) {
			this._register(this._catalogue.onDidChangeLanguageModels(vendor => {
				if (vendor === COPILOT_VENDOR_ID) {
					this._onDidChange.fire();
				}
			}));
		}
	}

	/**
	 * Called by {@link AgentHostContribution} when models change in root state.
	 */
	updateModels(models: readonly SessionModelInfo[]): void {
		this._models = models;
		this._onDidChange.fire();
	}

	async provideLanguageModelChatInfo(_options: unknown, _token: CancellationToken): Promise<ILanguageModelChatMetadataAndIdentifier[]> {
		return this._models
			.filter(m => m.policyState !== 'disabled')
			.map(m => {
				const pricing = readAgentModelPricingMeta(m);
				const multiplierNumeric = pricing.multiplierNumeric;
				// "Auto" advertises the auto-mode discount (detail) + description (tooltip). microsoft/vscode#321778, #321659.
				const isAuto = m.id === AUTO_RAW_MODEL_ID;
				const notices = isAuto ? undefined : readAgentModelNoticesMeta(m);
				const discountPercent = pricing.discountPercent;
				// Guard against a non-finite or out-of-range value from the open `_meta` bag so we never render
				// nonsense like "Infinity% discount"; the documented range is a whole number in (0, 100].
				const hasDiscount = typeof discountPercent === 'number' && discountPercent > 0 && discountPercent <= 100;
				const detail = isAuto && hasDiscount
					? localize('agentHost.auto.discount', "{0}% discount", discountPercent)
					: undefined;
				const tooltip = notices?.rowWarning ?? (isAuto
					? ILanguageModelChatMetadata.getAutoModelDescription(hasDiscount ? discountPercent : undefined)
					: undefined);
				const modelGroup = this._modelGroupFor(m);
				const byokModelIdentifier = readAgentModelByokIdentifier(m);
				// A host that derives its list from the Copilot SDK advertises no billing and no
				// token counts, so fall back to the workbench's own catalogue entry for the same
				// model. See `_catalogueEntryFor`.
				const known = this._catalogueEntryFor(m, modelGroup);
				return {
					identifier: `${this._vendor}:${m.id}`,
					metadata: {
						extension: nullExtensionDescription.identifier,
						name: m.name,
						id: m.id,
						vendor: this._vendor,
						version: '1.0',
						family: m.id,
						...(tooltip !== undefined && { tooltip }),
						...(detail !== undefined && { detail }),
						maxInputTokens: m.maxPromptTokens ?? known?.maxInputTokens ?? 0,
						maxOutputTokens: m.maxOutputTokens ?? known?.maxOutputTokens ?? 0,
						isDefaultForLocation: {},
						isUserSelectable: true,
						statusIcon: notices?.rowWarning ? Codicon.warning : undefined,
						warningText: notices?.warningText,
						infoText: notices?.infoText,
						pricing: multiplierNumeric !== undefined ? `${multiplierNumeric}x` : known?.pricing,
						multiplierNumeric: multiplierNumeric ?? known?.multiplierNumeric,
						inputCost: pricing.inputCost ?? known?.inputCost,
						cacheCost: pricing.cacheCost ?? known?.cacheCost,
						cacheWriteCost: pricing.cacheWriteCost ?? known?.cacheWriteCost,
						outputCost: pricing.outputCost ?? known?.outputCost,
						longContextInputCost: pricing.longContextInputCost ?? known?.longContextInputCost,
						longContextCacheCost: pricing.longContextCacheCost ?? known?.longContextCacheCost,
						longContextCacheWriteCost: pricing.longContextCacheWriteCost ?? known?.longContextCacheWriteCost,
						longContextOutputCost: pricing.longContextOutputCost ?? known?.longContextOutputCost,
						priceCategory: pricing.priceCategory ?? known?.priceCategory,
						category: pricing.category ?? known?.category,
						promo: pricing.promo ?? known?.promo,
						targetChatSessionType: this._sessionType,
						// Group agent-host models in the picker by their upstream provider
						// (Copilot CLI, OpenAI, a 3p BYOK provider, …). All of a host's
						// models share one vendor, so without this they'd render as a single
						// undifferentiated bucket. Presentation-only; routing stays by vendor.
						...(modelGroup ? { modelGroup } : {}),
						...(byokModelIdentifier !== undefined && { byokModelIdentifier }),
						capabilities: {
							vision: m.supportsVision ?? known?.capabilities?.vision ?? false,
							toolCalling: true,
							agentMode: true,
						},
						configurationSchema: this._toLanguageModelConfigurationSchema(m.configSchema),
					},
				};
			});
	}

	/**
	 * The workbench catalogue entry describing the same model, when one is known.
	 *
	 * A host driving the Copilot SDK advertises no billing and, where the SDK omits them, no token
	 * limits — so the CAPI-backed Copilot catalogue fills the gaps.
	 *
	 * Matching by raw model id does not prove the two describe the same offering — they can differ
	 * by entitlement, policy, rollout or billing route — so this is restricted to models billed
	 * through Copilot and only ever fills fields the host left absent.
	 *
	 * The token-limit half is a shim: those are native protocol fields, and a host that populates
	 * them makes the fallback dead. The billing half is not. Pricing is deliberately kept off the
	 * agent host protocol as operator-sensitive, so a client that wants to show it has to source it
	 * itself. Removing this join therefore means dropping pricing for these models, which is a
	 * product decision rather than a cleanup.
	 */
	private _catalogueEntryFor(model: SessionModelInfo, group: ILanguageModelChatMetadata['modelGroup']): ILanguageModelChatMetadata | undefined {
		if (!this._catalogue || group?.id !== COPILOT_VENDOR_ID) {
			return undefined;
		}
		for (const identifier of this._catalogue.getLanguageModelIds()) {
			const metadata = this._catalogue.lookupLanguageModel(identifier);
			if (metadata?.vendor === COPILOT_VENDOR_ID && metadata.id === model.id) {
				return metadata;
			}
		}
		return undefined;
	}

	/**
	 * Translate a host's model {@link ConfigSchema} into the picker's schema shape.
	 *
	 * Values and display text belong to the producer; the workbench only picks the group
	 * ({@link _groupForConfigKey}). The one exception is a reasoning-effort enum with no display
	 * text at all, labelled locally rather than rendering raw values like `xhigh`.
	 *
	 * A property is never dropped for want of local enrichment: a host advertises one because it
	 * will honour it, and a new model, a staged rollout and an unresolved catalogue all look
	 * identical from here.
	 */
	private _toLanguageModelConfigurationSchema(schema: ConfigSchema | undefined): ILanguageModelConfigurationSchema | undefined {
		if (!schema) {
			return undefined;
		}

		const properties: ILanguageModelConfigurationSchema['properties'] = {};
		for (const [key, property] of Object.entries(schema.properties)) {
			// Only when the producer supplied no display text at all. Filling in half of it
			// would mix sources and override a producer that deliberately labels its values
			// without describing them.
			const effortDisplay = property.enumLabels === undefined && property.enumDescriptions === undefined
				? AgentHostLanguageModelProvider._reasoningEffortDisplay(key, property.enum)
				: undefined;

			properties[key] = {
				type: property.type,
				title: property.title,
				description: property.description,
				default: property.default,
				enum: property.enum,
				enumItemLabels: property.enumLabels ?? effortDisplay?.labels,
				enumDescriptions: property.enumDescriptions ?? effortDisplay?.descriptions,
				readOnly: property.readOnly,
				group: AgentHostLanguageModelProvider._groupForConfigKey(key),
			};
		}

		return {
			type: schema.type,
			required: schema.required,
			properties,
		};
	}

	/** Config keys whose enum values are reasoning-effort levels, whatever the producer named them. */
	private static readonly _reasoningEffortKeys: ReadonlySet<string> = new Set(['reasoningEffort', 'thinkingLevel']);

	/**
	 * Localized labels and descriptions for a reasoning-effort enum whose producer supplied none.
	 *
	 * A host that derives its schema from an upstream SDK advertises the accepted effort values
	 * without display text, because it has none the SDK did not give it — the Copilot agent host
	 * inside a cloud sandbox does exactly that. Deriving the text here keeps the picker from
	 * rendering raw values like `xhigh`, and matches what the agents that build their schema
	 * locally already emit.
	 *
	 * Only synthesized when every enum value is a string, since labels align with `enum` by index
	 * and a partial list would mislabel the rest.
	 *
	 * No `default` is synthesized: schema defaults are merged into the configuration that is sent
	 * (see `resolveModelConfiguration`), so inventing one would send an explicit effort where the
	 * host expects the value omitted and the backend to choose.
	 */
	private static _reasoningEffortDisplay(key: string, values: readonly unknown[] | undefined): { readonly labels: string[]; readonly descriptions: string[] } | undefined {
		if (!AgentHostLanguageModelProvider._reasoningEffortKeys.has(key) || !values?.length) {
			return undefined;
		}
		const levels = values.filter((value): value is string => typeof value === 'string');
		if (levels.length !== values.length) {
			return undefined;
		}
		return {
			labels: levels.map(getReasoningEffortLabel),
			descriptions: levels.map(level => getReasoningEffortDescription(level) ?? ''),
		};
	}

	private static _groupForConfigKey(key: string): string | undefined {
		switch (key) {
			// The Auto model has no thinking level, so its routing-profile picker takes that slot,
			// matching how the Copilot Chat extension groups it.
			case 'tier':
			case 'thinkingLevel':
			// `reasoningEffort` / `contextTier` are what the Copilot agent host inside a cloud
			// sandbox names the same two knobs. Without them the picker finds no property in
			// either group and hides itself entirely, so a sandbox session offers no way to
			// choose a thinking level or a context window.
			case 'reasoningEffort': return 'navigation';
			case 'contextSize':
			case 'contextTier': return 'tokens';
			default: return undefined;
		}
	}

	/**
	 * Derives the picker group id for a model — the vendor its models are bucketed
	 * under. A producer may pin the group id explicitly in `_meta` (e.g. Claude
	 * stamps its transport vendor — `copilot`/`anthropic` — there while keeping
	 * `provider` as the `claude` routing owner); that wins. Otherwise BYOK models
	 * are surfaced by the agent host under the `vendor/[group/]id` selection id (see
	 * `resolveByokSessionConfig`), so their upstream vendor is the id prefix; native
	 * harness models have no prefix and group under their `provider` (the harness,
	 * e.g. `copilotcli`). The picker resolves the display name from the vendor
	 * registry — no name mapping lives here.
	 */
	private _modelGroupFor(model: SessionModelInfo): ILanguageModelChatMetadata['modelGroup'] {
		const explicitGroupId = readAgentModelGroupId(model);
		const slash = model.id.indexOf('/');
		const groupVendorId = explicitGroupId ?? (slash > 0 ? model.id.slice(0, slash) : model.provider);
		if (!groupVendorId) {
			return undefined;
		}
		const sourceId = readAgentModelSourceId(model);
		return { id: groupVendorId, ...(sourceId !== undefined && { sourceId }) };
	}

	async sendChatRequest(): Promise<never> {
		throw new Error('Agent-host models do not support direct chat requests');
	}

	async provideTokenCount(): Promise<number> {
		return 0;
	}
}
