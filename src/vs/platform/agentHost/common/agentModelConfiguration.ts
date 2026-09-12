/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { formatTokenCount } from '../../../base/common/numbers.js';
import { localize } from '../../../nls.js';
import { hasLongContextSurcharge, type ICAPIModelBilling } from './agentModelPricing.js';
import type { ConfigPropertySchema, ModelSelection } from './state/protocol/state.js';

/** Model-configuration key for the selected context-window size, in tokens. */
export const ContextSizeConfigKey = 'contextSize';

/**
 * Synthesizes the shared context-size picker property for a CAPI model with a
 * distinct long-context tier.
 */
export function createContextSizeConfigSchemaProperty(billing: ICAPIModelBilling | undefined): ConfigPropertySchema | undefined {
	const tokenPrices = billing?.tokenPrices;
	const defaultMax = tokenPrices?.contextMax;
	const longContextMax = tokenPrices?.longContext?.contextMax;
	return createContextSizeConfigSchemaPropertyFromLimits(
		defaultMax,
		longContextMax,
		hasLongContextSurcharge(billing) ? defaultMax : longContextMax,
	);
}

/**
 * Synthesizes the shared context-size picker property from provider-owned limits.
 */
export function createContextSizeConfigSchemaPropertyFromLimits(defaultMax: number | undefined, longContextMax: number | undefined, selectedDefault = defaultMax): ConfigPropertySchema | undefined {
	if (!defaultMax || !longContextMax || defaultMax >= longContextMax) {
		return undefined;
	}

	return {
		type: 'number',
		title: localize('copilot.modelContextSize.title', "Context Size"),
		description: localize('copilot.modelContextSize.description', "Selects the context window size for this model."),
		default: selectedDefault === longContextMax ? longContextMax : defaultMax,
		enum: [defaultMax, longContextMax],
		enumLabels: [formatTokenCount(defaultMax), formatTokenCount(longContextMax)],
		enumDescriptions: [
			localize('copilot.modelContextSize.default', "Default"),
			localize('copilot.modelContextSize.longerSessions', "Longer sessions"),
		],
	};
}

/** Reads a finite, positive context-window selection from a model config. */
export function getModelContextSize(model: ModelSelection | undefined): number | undefined {
	const value = Number(model?.config?.[ContextSizeConfigKey]);
	return Number.isFinite(value) && value > 0 ? value : undefined;
}
