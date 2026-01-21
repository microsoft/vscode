/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILanguageModelsService, ILanguageModelChatMetadata } from '../../chat/common/languageModels.js';

/**
 * Result from attempting to resolve a preferred inline chat model.
 */
export interface IPreferredModelResult {
	readonly metadata: ILanguageModelChatMetadata;
	readonly identifier: string;
}

/**
 * Configuration for a preferred model that inline chat should prioritize.
 */
interface IPreferredModelConfig {
	/**
	 * Primary model identifier to check first.
	 */
	readonly primaryModelId?: string;
	/**
	 * Vendor name for fallback lookup.
	 */
	readonly vendor: string;
	/**
	 * Family name for fallback lookup (optional).
	 */
	readonly family?: string;
	/**
	 * Substring that must appear in the model ID for a match.
	 */
	readonly modelIdSubstring?: string;
}

/**
 * Constants for preferred inline chat models.
 *
 * These models are checked in priority order when selecting the default
 * model for inline chat sessions. The first available and user-selectable
 * model will be used.
 */
export const PreferredInlineChatModels = {


} as const;

/**
 * Ordered list of preferred model configurations.
 * Models are checked in order and the first available one is selected.
 */
const PREFERRED_MODEL_CONFIGS: readonly IPreferredModelConfig[] = [

];

/**
 * Helper class for selecting preferred language models for inline chat.
 *
 * This class encapsulates the logic for finding and selecting preferred
 * models in a prioritized order, falling back to vendor defaults when
 * no preferred model is available.
 */
export class InlineChatModelSelector {

	constructor(
		private readonly _languageModelsService: ILanguageModelsService,
	) { }

	/**
	 * Attempts to find a preferred model from the configured list.
	 * Models are checked in priority order and the first available,
	 * user-selectable model is returned.
	 *
	 * @returns The preferred model result, or undefined if none found.
	 */
	findPreferredModel(): IPreferredModelResult | undefined {
		for (const config of PREFERRED_MODEL_CONFIGS) {
			const result = this._findModelByConfig(config);
			if (result) {
				return result;
			}
		}
		return undefined;
	}

	private _findModelByConfig(config: IPreferredModelConfig): IPreferredModelResult | undefined {
		// Try primary model ID first
		if (config.primaryModelId) {
			const metadata = this._languageModelsService.lookupLanguageModel(config.primaryModelId);
			if (metadata?.isUserSelectable) {
				return { metadata, identifier: config.primaryModelId };
			}
		}

		// Fallback: search by vendor, family, and/or model ID substring
		for (const modelId of this._languageModelsService.getLanguageModelIds()) {
			const metadata = this._languageModelsService.lookupLanguageModel(modelId);
			if (!metadata?.isUserSelectable) {
				continue;
			}

			const vendorMatches = metadata.vendor === config.vendor;
			const familyMatches = !config.family || metadata.family === config.family;
			const substringMatches = !config.modelIdSubstring || modelId.includes(config.modelIdSubstring);

			if (vendorMatches && familyMatches && substringMatches) {
				return { metadata, identifier: modelId };
			}
		}

		return undefined;
	}
}
