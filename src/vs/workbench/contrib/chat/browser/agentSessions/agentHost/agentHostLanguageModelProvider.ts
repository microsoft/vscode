/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { ConfigSchema, SessionModelInfo } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { readAgentModelPricingMeta } from '../../../../../../platform/agentHost/common/agentModelPricing.js';
import { readAgentModelByokIdentifier } from '../../../../../../platform/agentHost/common/agentModelByokMeta.js';
import { nullExtensionDescription } from '../../../../../services/extensions/common/extensions.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelChatProvider, ILanguageModelConfigurationSchema } from '../../../common/languageModels.js';

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
	) {
		super();
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
				const isAuto = m.id === 'auto';
				const discountPercent = pricing.discountPercent;
				// Guard against a non-finite or out-of-range value from the open `_meta` bag so we never render
				// nonsense like "Infinity% discount"; the documented range is a whole number in (0, 100].
				const hasDiscount = typeof discountPercent === 'number' && discountPercent > 0 && discountPercent <= 100;
				const detail = isAuto && hasDiscount
					? localize('agentHost.auto.discount', "{0}% discount", discountPercent)
					: undefined;
				const tooltip = isAuto
					? ILanguageModelChatMetadata.getAutoModelDescription(hasDiscount ? discountPercent : undefined)
					: undefined;
				const modelGroup = AgentHostLanguageModelProvider._modelGroupFor(m);
				const byokModelIdentifier = readAgentModelByokIdentifier(m);
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
						maxInputTokens: m.maxPromptTokens ?? 0,
						maxOutputTokens: m.maxOutputTokens ?? 0,
						isDefaultForLocation: {},
						isUserSelectable: true,
						pricing: multiplierNumeric !== undefined ? `${multiplierNumeric}x` : undefined,
						multiplierNumeric,
						inputCost: pricing.inputCost,
						cacheCost: pricing.cacheCost,
						cacheWriteCost: pricing.cacheWriteCost,
						outputCost: pricing.outputCost,
						longContextInputCost: pricing.longContextInputCost,
						longContextCacheCost: pricing.longContextCacheCost,
						longContextCacheWriteCost: pricing.longContextCacheWriteCost,
						longContextOutputCost: pricing.longContextOutputCost,
						priceCategory: pricing.priceCategory,
						targetChatSessionType: this._sessionType,
						// Group agent-host models in the picker by their upstream provider
						// (Copilot CLI, OpenAI, a 3p BYOK provider, …). All of a host's
						// models share one vendor, so without this they'd render as a single
						// undifferentiated bucket. Presentation-only; routing stays by vendor.
						...(modelGroup ? { modelGroup } : {}),
						...(byokModelIdentifier !== undefined && { byokModelIdentifier }),
						capabilities: {
							vision: m.supportsVision ?? false,
							toolCalling: true,
							agentMode: true,
						},
						configurationSchema: this._toLanguageModelConfigurationSchema(m.configSchema),
					},
				};
			});
	}

	private _toLanguageModelConfigurationSchema(schema: ConfigSchema | undefined): ILanguageModelConfigurationSchema | undefined {
		if (!schema) {
			return undefined;
		}

		return {
			type: schema.type,
			required: schema.required,
			properties: Object.fromEntries(Object.entries(schema.properties).map(([key, property]) => [key, {
				type: property.type,
				title: property.title,
				description: property.description,
				default: property.default,
				enum: property.enum,
				enumItemLabels: property.enumLabels,
				enumDescriptions: property.enumDescriptions,
				readOnly: property.readOnly,
				group: AgentHostLanguageModelProvider._groupForConfigKey(key),
			}])),
		};
	}

	private static _groupForConfigKey(key: string): string | undefined {
		switch (key) {
			case 'thinkingLevel': return 'navigation';
			case 'contextSize': return 'tokens';
			default: return undefined;
		}
	}

	/**
	 * Derives the picker group id for a model — the vendor its models are bucketed
	 * under. BYOK models are surfaced by the agent host under the `vendor/id` selection
	 * id (see `resolveByokSessionConfig`), so their upstream vendor is the id prefix;
	 * native harness models have no prefix and group under their `provider` (the harness,
	 * e.g. `copilotcli`). The picker resolves the display name from the vendor registry —
	 * no name mapping lives here.
	 */
	private static _modelGroupFor(model: SessionModelInfo): { id: string } | undefined {
		const slash = model.id.indexOf('/');
		const groupVendorId = slash > 0 ? model.id.slice(0, slash) : model.provider;
		return groupVendorId ? { id: groupVendorId } : undefined;
	}

	async sendChatRequest(): Promise<never> {
		throw new Error('Agent-host models do not support direct chat requests');
	}

	async provideTokenCount(): Promise<number> {
		return 0;
	}
}
