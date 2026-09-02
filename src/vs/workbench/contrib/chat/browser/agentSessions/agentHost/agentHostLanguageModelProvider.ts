/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { formatTokenCount } from '../../../../../../base/common/numbers.js';
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
 * Config key naming the context-window tier a host accepts on a model selection. Its values are
 * tier names (`default` / `long_context`), because a host driving the Copilot SDK has no per-model
 * token counts to offer.
 */
const CONTEXT_TIER_CONFIG_KEY = 'contextTier';

/**
 * Config key naming the numeric context-window picker the workbench's own Copilot catalogue
 * synthesizes from CAPI billing. Read here only as the source of the token counts used to label
 * {@link CONTEXT_TIER_CONFIG_KEY}; it is never surfaced to a host, which would not understand it.
 */
const CONTEXT_SIZE_CONFIG_KEY = 'contextSize';

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
	private _lastCatalogueSignature: string | undefined;

	constructor(
		private readonly _sessionType: string,
		private readonly _vendor: string,
		private readonly _catalogue?: IAgentHostModelCatalogue,
	) {
		super();

		// The catalogue is populated independently of the host — a sandbox can advertise its models
		// before the Copilot vendor has resolved — so re-publish when it arrives to pick up the
		// enrichment. Gated on the catalogue actually changing: this provider's own republish makes
		// the service fire this event again, which would otherwise loop.
		if (this._catalogue) {
			this._register(this._catalogue.onDidChangeLanguageModels(() => {
				const signature = this._catalogueSignature();
				if (signature !== this._lastCatalogueSignature) {
					this._lastCatalogueSignature = signature;
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
						configurationSchema: this._toLanguageModelConfigurationSchema(m.configSchema, known),
					},
				};
			});
	}

	/**
	 * The workbench catalogue entry describing the same model, when one is known.
	 *
	 * A host that derives its model list from the Copilot SDK advertises only what the SDK gave it:
	 * no billing, and no per-tier context windows. The workbench already holds that detail for the
	 * same models — the Copilot vendor's catalogue is CAPI-backed — so the two are matched by model
	 * id and the host's list is enriched from it, which is how the GitHub desktop app renders real
	 * token counts for a sandbox session.
	 *
	 * Restricted to models billed through Copilot (a `copilot` picker group), so a model reached
	 * over a direct third-party transport is never labelled with Copilot's prices.
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
	 * Cheap fingerprint of the catalogue's contribution to what this provider publishes, used to
	 * suppress a re-publish that would otherwise bounce between this provider and the service.
	 */
	private _catalogueSignature(): string {
		if (!this._catalogue) {
			return '';
		}
		const parts: string[] = [];
		for (const identifier of this._catalogue.getLanguageModelIds()) {
			const metadata = this._catalogue.lookupLanguageModel(identifier);
			if (metadata?.vendor !== COPILOT_VENDOR_ID) {
				continue;
			}
			parts.push(`${metadata.id}:${metadata.maxInputTokens}:${metadata.maxOutputTokens}:${metadata.multiplierNumeric ?? ''}:${AgentHostLanguageModelProvider._contextWindowTiers(metadata)?.join('/') ?? ''}`);
		}
		return parts.sort().join(',');
	}

	/**
	 * The distinct context-window sizes a catalogue entry offers, ascending, or `undefined` when it
	 * offers no real choice. Sourced from the numeric `contextSize` picker the Copilot catalogue
	 * synthesizes from CAPI billing, which is the only place these token counts exist.
	 */
	private static _contextWindowTiers(metadata: ILanguageModelChatMetadata | undefined): number[] | undefined {
		const values = metadata?.configurationSchema?.properties?.[CONTEXT_SIZE_CONFIG_KEY]?.enum;
		if (!values?.length) {
			return undefined;
		}
		const sizes = [...new Set(values.filter((value): value is number => typeof value === 'number'))].sort((a, b) => a - b);
		return sizes.length > 1 ? sizes : undefined;
	}

	/**
	 * Labels for a host's `contextTier` enum, as token counts rather than tier names.
	 *
	 * The host names the tiers (`default` / `long_context`) because the SDK exposes no per-model
	 * windows, but the picker is far more useful showing "264K" / "1M" — what the GitHub desktop
	 * app displays for the same session. The wire value stays the tier name the host accepts; only
	 * the label changes.
	 *
	 * Returns `undefined` when the catalogue offers no distinct long-context tier (or does not know
	 * the model), which drops the property and hides the picker rather than offering a choice that
	 * has no effect — matching how the desktop app suppresses it.
	 */
	private static _contextTierLabels(values: readonly unknown[] | undefined, known: ILanguageModelChatMetadata | undefined): string[] | undefined {
		const tiers = AgentHostLanguageModelProvider._contextWindowTiers(known);
		if (!tiers || !values?.length) {
			return undefined;
		}
		// The host orders its tiers from smallest window to largest, so they align with the sorted
		// sizes by position. A tier list of a different length is not one this mapping understands.
		if (values.length !== tiers.length || !values.every(value => typeof value === 'string')) {
			return undefined;
		}
		return tiers.map(formatTokenCount);
	}

	private _toLanguageModelConfigurationSchema(schema: ConfigSchema | undefined, known?: ILanguageModelChatMetadata): ILanguageModelConfigurationSchema | undefined {
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

			let enumItemLabels = property.enumLabels ?? effortDisplay?.labels;
			if (key === CONTEXT_TIER_CONFIG_KEY) {
				const tierLabels = AgentHostLanguageModelProvider._contextTierLabels(property.enum, known);
				if (!tierLabels) {
					// No real choice to offer (or no catalogue entry to size it with): drop the
					// property so the picker hides rather than showing tier names that read as a
					// setting the user cannot evaluate.
					continue;
				}
				enumItemLabels = tierLabels;
			}

			properties[key] = {
				type: property.type,
				title: property.title,
				description: property.description,
				default: property.default,
				enum: property.enum,
				enumItemLabels,
				enumDescriptions: property.enumDescriptions ?? effortDisplay?.descriptions,
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
			case CONTEXT_TIER_CONFIG_KEY: return 'tokens';
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
