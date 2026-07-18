/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../nls.js';
import { ILanguageModelChatMetadataAndIdentifier, isAutoLanguageModel } from '../../../../common/languageModels.js';

export function isAutoModel(model: ILanguageModelChatMetadataAndIdentifier): boolean {
	return isAutoLanguageModel(model);
}

export function isMultiplierPricing(model: ILanguageModelChatMetadataAndIdentifier): boolean {
	return model.metadata.multiplierNumeric !== undefined;
}

export function getPriceCategoryLabel(priceCategory: string | undefined): string | undefined {
	switch (priceCategory) {
		case undefined:
		case '':
			return undefined;
		case 'low':
			return localize('chat.priceCategory.low', "Low cost");
		case 'medium':
			return localize('chat.priceCategory.medium', "Medium cost");
		case 'high':
			return localize('chat.priceCategory.high', "High cost");
		case 'very_high':
			return localize('chat.priceCategory.veryHigh', "Very high cost");
		default:
			return localize('chat.priceCategory.unknown', "{0} cost", priceCategory.charAt(0).toUpperCase() + priceCategory.slice(1));
	}
}

export const enum ModelPickerUnavailableReason {
	Restricted = 'restricted',
	SetupRequired = 'setupRequired',
}

export function getModelPickerUnavailableReason(context: {
	readonly trustInitialized: boolean;
	readonly trusted: boolean;
	readonly pickerModels: readonly ILanguageModelChatMetadataAndIdentifier[];
	readonly liveModelIds: Iterable<string>;
	readonly requiresSetup: boolean;
}): ModelPickerUnavailableReason | undefined {
	if (!context.trustInitialized) {
		return undefined;
	}
	if (!context.trusted) {
		return ModelPickerUnavailableReason.Restricted;
	}
	const live = context.liveModelIds instanceof Set ? context.liveModelIds : new Set(context.liveModelIds);
	if (context.pickerModels.some(model => live.has(model.identifier))) {
		return undefined;
	}
	return context.requiresSetup ? ModelPickerUnavailableReason.SetupRequired : undefined;
}

export function shouldShowCacheBreakHint(context: {
	readonly dismissed: boolean;
	readonly cacheWarm: boolean;
	readonly noModelsAvailable: boolean;
	readonly excludeAutoModel: boolean;
	readonly selectedModelIsAuto: boolean;
}): boolean {
	if (context.dismissed || !context.cacheWarm || context.noModelsAvailable) {
		return false;
	}
	return !(context.excludeAutoModel && context.selectedModelIsAuto);
}
