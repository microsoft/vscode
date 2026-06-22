/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { formatTokenCount } from '../../../../../../base/common/numbers.js';
import { localize } from '../../../../../../nls.js';
import { SessionModelInfo } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { readAgentModelPricingMeta } from '../../../../../../platform/agentHost/common/agentModelPricing.js';
import { nullExtensionDescription } from '../../../../../services/extensions/common/extensions.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelChatProvider, ILanguageModelConfigurationSchema } from '../../../common/languageModels.js';

/**
 * Config key under which the synthesized context-size picker is exposed. The chosen value is a token
 * count carried back via `ModelSelection.maxContextWindow`; the `tokens` group marks it so the chat
 * model picker renders it as the "Context Size" control.
 */
const ContextSizeConfigKey = 'contextSize';

type ConfigurationSchemaProperty = NonNullable<ILanguageModelConfigurationSchema['properties']>[string];


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
				return {
					identifier: `${this._vendor}:${m.id}`,
					metadata: {
						extension: nullExtensionDescription.identifier,
						name: m.name,
						id: m.id,
						vendor: this._vendor,
						version: '1.0',
						family: m.id,
						maxInputTokens: m.maxContextWindow ?? 0,
						maxOutputTokens: 0,
						isDefaultForLocation: {},
						isUserSelectable: true,
						pricing: multiplierNumeric !== undefined ? `${multiplierNumeric}x` : undefined,
						multiplierNumeric,
						inputCost: pricing.inputCost,
						cacheCost: pricing.cacheCost,
						outputCost: pricing.outputCost,
						longContextInputCost: pricing.longContextInputCost,
						longContextCacheCost: pricing.longContextCacheCost,
						longContextOutputCost: pricing.longContextOutputCost,
						priceCategory: pricing.priceCategory,
						targetChatSessionType: this._sessionType,
						capabilities: {
							vision: m.supportsVision ?? false,
							toolCalling: true,
							agentMode: true,
						},
						configurationSchema: this._toLanguageModelConfigurationSchema(m),
					},
				};
			});
	}

	/**
	 * Builds the language-model configuration schema for a model: the agent-provided properties (e.g.
	 * `thinkingLevel`) plus a synthesized numeric context-size picker derived from the model's
	 * {@link SessionModelInfo.recommendedContextWindows}. Keeping the context-size picker out of the
	 * agent-host protocol config (it lives on the models list instead) means the chosen value rides on
	 * the typed `ModelSelection.maxContextWindow` rather than the generic config bag.
	 */
	private _toLanguageModelConfigurationSchema(m: SessionModelInfo): ILanguageModelConfigurationSchema | undefined {
		const properties: Record<string, ConfigurationSchemaProperty> = {};

		if (m.configSchema) {
			for (const [key, property] of Object.entries(m.configSchema.properties)) {
				properties[key] = {
					type: property.type,
					title: property.title,
					description: property.description,
					default: property.default,
					enum: property.enum,
					enumItemLabels: property.enumLabels,
					enumDescriptions: property.enumDescriptions,
					group: AgentHostLanguageModelProvider._groupForConfigKey(key),
				};
			}
		}

		const contextSize = AgentHostLanguageModelProvider._createContextSizeSchemaProperty(m.recommendedContextWindows);
		if (contextSize) {
			properties[ContextSizeConfigKey] = contextSize;
		}

		if (Object.keys(properties).length === 0) {
			return undefined;
		}

		return { type: 'object', required: m.configSchema?.required, properties };
	}

	/**
	 * Synthesizes the numeric "Context Size" picker property from a model's recommended context
	 * windows (smallest first; the first is the default). Returns `undefined` when the model offers
	 * fewer than two windows, so no picker is shown.
	 */
	private static _createContextSizeSchemaProperty(windows: readonly number[] | undefined): ConfigurationSchemaProperty | undefined {
		if (!windows || windows.length < 2) {
			return undefined;
		}
		return {
			type: 'number',
			title: localize('agentHost.contextSize.title', "Context Size"),
			description: localize('agentHost.contextSize.description', "Selects the context window size for this model."),
			default: windows[0],
			enum: [...windows],
			enumItemLabels: windows.map(window => formatTokenCount(window)),
			enumDescriptions: windows.map((_, index) => index === 0
				? localize('agentHost.contextSize.default', "Default")
				: localize('agentHost.contextSize.longer', "Longer sessions")),
			group: 'tokens',
		};
	}

	private static _groupForConfigKey(key: string): string | undefined {
		switch (key) {
			case 'thinkingLevel': return 'navigation';
			default: return undefined;
		}
	}

	async sendChatRequest(): Promise<never> {
		throw new Error('Agent-host models do not support direct chat requests');
	}

	async provideTokenCount(): Promise<number> {
		return 0;
	}
}
