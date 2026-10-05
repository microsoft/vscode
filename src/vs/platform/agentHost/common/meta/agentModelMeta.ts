/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionModelInfo } from '../state/protocol/state.js';
import type { IAgentModelInfo } from '../agent.js';
import { hasAgentMetadata } from './metadata.js';
import { readCopilotModelCategory } from './copilotd/copilotdMetadataReader.js';
import { readAgentModelPricingMeta as readVSCodeModelPricing, type IAgentModelPricingMeta } from './vscode/agentModelPricing.js';

export { createAgentModelPricingMeta, createPricingMetaFromBilling, hasLongContextSurcharge, normalizeCAPIBilling } from './vscode/agentModelPricing.js';
export type { IAgentModelPricingMeta, ICAPIModelBilling } from './vscode/agentModelPricing.js';

const pricingKeys = ['multiplierNumeric', 'inputCost', 'cacheCost', 'cacheWriteCost', 'outputCost', 'longContextInputCost', 'longContextCacheCost', 'longContextCacheWriteCost', 'longContextOutputCost', 'discountPercent', 'priceCategory', 'category', 'promo'] as const;

export function readAgentModelPricingMeta(model: IAgentModelInfo | SessionModelInfo): IAgentModelPricingMeta {
	if (hasAgentMetadata(model, pricingKeys)) {
		return readVSCodeModelPricing(model);
	}
	const category = readCopilotModelCategory(model);
	return category ? { category } : {};
}
