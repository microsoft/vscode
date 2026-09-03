/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../nls.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';
import { IModelConfigurationAccess } from './modelPickerActionItem.js';
import { getModelConfigSummary } from './modelPickerModelConfig.js';

/**
 * How a row badge reads. Each tone maps to one colour so a row never has to be
 * read twice: neutral states stay quiet, problems and offers carry real colour.
 */
export const enum ModelBadgeTone {
	/** Plain text, no fill. The default for descriptive labels like a provider name. */
	Neutral = 'neutral',
	/** A quiet tint, for a state the user chose, e.g. the current configuration. */
	Selected = 'selected',
	/** Warm, for an offer the user gains from. */
	Promo = 'promo',
	/** Warning, for a model going away or carrying a caveat. */
	Warning = 'warning',
}

export interface IModelBadge {
	readonly text: string;
	readonly tone: ModelBadgeTone;
}

/** Warning categories that mean the model itself is going away. */
const DEPRECATION_WARNING_CODES: ReadonlySet<string> = new Set(['model_pending_deprecation', 'model_deprecated']);

export interface IModelBadgeContext {
	readonly configurationAccess: IModelConfigurationAccess;
	/** The provider a model came from, when the list does not already group by it. */
	readonly providerLabel?: string;
}

/**
 * The single badge a model row shows. A row has one badge slot, so the states are
 * ranked by how much the user needs to know before picking: a model that is going
 * away outranks an offer, which outranks a description of what is already set.
 */
export function getModelBadge(
	model: ILanguageModelChatMetadataAndIdentifier,
	context: IModelBadgeContext,
): IModelBadge | undefined {
	if (isDeprecated(model)) {
		return { text: localize('chat.modelPicker.badge.deprecated', "Retiring"), tone: ModelBadgeTone.Warning };
	}
	const promo = ILanguageModelChatMetadata.hasPromoDiscount(model.metadata) ? model.metadata.promo : undefined;
	if (promo) {
		return { text: localize('chat.modelPicker.badge.promo', "{0}% off", promo.discountPercent), tone: ModelBadgeTone.Promo };
	}
	// Any model the user tuned says so, not just the selected one, so a row that will
	// behave differently from its defaults is recognisable before it is picked.
	const summary = getModelConfigSummary(model, context.configurationAccess);
	if (summary) {
		return { text: summary, tone: ModelBadgeTone.Selected };
	}
	return context.providerLabel ? { text: context.providerLabel, tone: ModelBadgeTone.Neutral } : undefined;
}

/** Whether the model is retiring, which its provider reports as a warning category. */
export function isDeprecated(model: ILanguageModelChatMetadataAndIdentifier): boolean {
	return Object.keys(model.metadata.warningText ?? {}).some(code => DEPRECATION_WARNING_CODES.has(code));
}
