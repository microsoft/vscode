/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../nls.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';

export const organizationDefaultLabel = localize('chat.modelPicker.organizationDefault', "Org default");

export function getOrganizationDefaultDescription(modelName: string): string {
	return localize('chat.modelPicker.organizationDefaultDescription', "Your organization sets {0} as the default for new chats. You can choose another model for this chat.", modelName);
}

/** Color treatment for a model-row badge. */
export const enum ModelBadgeTone {
	/** Plain text, no fill. The default for descriptive labels like a provider name. */
	Neutral = 'neutral',
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
	/** The provider a model came from, when the list does not already group by it. */
	readonly providerLabel?: string;
}

/**
 * The primary model badge, ranked by how much the user needs to know before picking.
 * An organization-default badge can appear alongside it.
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
	return context.providerLabel ? { text: context.providerLabel, tone: ModelBadgeTone.Neutral } : undefined;
}

/** Whether the model is retiring, which its provider reports as a warning category. */
export function isDeprecated(model: ILanguageModelChatMetadataAndIdentifier): boolean {
	return Object.keys(model.metadata.warningText ?? {}).some(code => DEPRECATION_WARNING_CODES.has(code));
}
