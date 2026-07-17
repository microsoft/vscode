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
