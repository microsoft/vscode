/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../nls.js';
import { IStringDictionary } from '../../../../../../../base/common/collections.js';
import { COPILOT_HYDRA_FUSION_MAX_MODEL_ID, COPILOT_HYDRA_FUSION_MODEL_ID, isCopilotHydraFusionModelId } from '../../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { COPILOT_CLI_AGENT_PROVIDER_ID } from '../../../../../../../platform/agentHost/common/agent.js';
import { getFusionAutoModeTierLabel } from '../../../../../../../platform/agentHost/common/autoModeTiers.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, IModelControlEntry, isAutoLanguageModel, isUserProvidedModel } from '../../../../common/languageModels.js';
import { ChatEntitlement } from '../../../../../../services/chat/common/chatEntitlementService.js';

export function isAutoModel(model: ILanguageModelChatMetadataAndIdentifier): boolean {
	return isAutoLanguageModel(model);
}

/**
 * Whether the model is a Copilot CLI HydraFusion research preview (HydraFusion or HydraFusion Max).
 * Fusion offers them among its tiers; otherwise HydraFusion is a model of its own, with
 * HydraFusion Max as its Max tier.
 */
export function isHydraFusionModel(model: ILanguageModelChatMetadataAndIdentifier): boolean {
	return model.metadata.modelGroup?.id === COPILOT_CLI_AGENT_PROVIDER_ID && isCopilotHydraFusionModelId(model.metadata.id);
}

/** The label of a HydraFusion model as one of HydraFusion's own tiers, outside Fusion. */
export function getHydraFusionTierLabel(hydraFusionModelId: string): string {
	return hydraFusionModelId === COPILOT_HYDRA_FUSION_MAX_MODEL_ID
		? localize('chat.modelPicker.hydraFusionMaxTier', "Max")
		: localize('chat.modelPicker.hydraFusionDefaultTier', "Default");
}

export function getFusionTierLabel(auto: ILanguageModelChatMetadata | undefined, hydraFusionModelId: string): string | undefined {
	if (!auto?.autoModelFusion || !isCopilotHydraFusionModelId(hydraFusionModelId)) {
		return undefined;
	}
	const properties = Object.values(auto.configurationSchema?.properties ?? {});
	// Provider tiers (`DYNAMIC_AUTO_TIERS`) offer the HydraFusion model as a tier of its own.
	const providerTier = properties.find(property => property.enum?.includes(hydraFusionModelId));
	if (providerTier) {
		return providerTier.enumItemLabels?.[providerTier.enum!.indexOf(hydraFusionModelId)] ?? getFusionAutoModeTierLabel(hydraFusionModelId);
	}
	return hydraFusionModelId === COPILOT_HYDRA_FUSION_MAX_MODEL_ID ? localize('chat.modelPicker.fusionMax', "Max") : undefined;
}

/**
 * The badge of a routing model at the given effort level. Copilot Fusion's names that
 * level's discount, else "Research preview", so it shows which levels a promotion covers.
 * Other routing models keep their own detail.
 */
export function getRoutingModelBadge(metadata: ILanguageModelChatMetadata, tier: unknown): string | undefined {
	if (!metadata.autoModelFusion) {
		return metadata.detail;
	}
	const discountPercent = ILanguageModelChatMetadata.getAutoTierDiscountPercent(metadata, tier);
	return discountPercent !== undefined
		? localize('chat.modelPicker.fusionTierDiscountBadge', "{0}% discount", discountPercent)
		: localize('chat.modelPicker.fusionResearchPreviewBadge', "Research preview");
}

/** Whether the plan offers built-in HydraFusion only as an upgrade, never as a choice. */
export function isHydraFusionUpgradeOnly(entitlement: ChatEntitlement): boolean {
	return entitlement === ChatEntitlement.Free || entitlement === ChatEntitlement.EDU;
}

export function filterModelPickerModelsForEntitlement(models: ILanguageModelChatMetadataAndIdentifier[], entitlement: ChatEntitlement, languageModelsService: ILanguageModelsService): ILanguageModelChatMetadataAndIdentifier[];
export function filterModelPickerModelsForEntitlement(models: readonly ILanguageModelChatMetadataAndIdentifier[], entitlement: ChatEntitlement, languageModelsService: ILanguageModelsService): readonly ILanguageModelChatMetadataAndIdentifier[];
export function filterModelPickerModelsForEntitlement(models: readonly ILanguageModelChatMetadataAndIdentifier[], entitlement: ChatEntitlement, languageModelsService: ILanguageModelsService): readonly ILanguageModelChatMetadataAndIdentifier[] {
	return isHydraFusionUpgradeOnly(entitlement)
		? models.filter(model => !isHydraFusionModel(model) || isUserProvidedModel(model, languageModelsService))
		: models;
}

export function filterModelPickerControlModelsForEntitlement(
	controlModels: IStringDictionary<IModelControlEntry>,
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
	entitlement: ChatEntitlement,
	languageModelsService: ILanguageModelsService,
): IStringDictionary<IModelControlEntry> {
	if (!isHydraFusionUpgradeOnly(entitlement)) {
		return controlModels;
	}
	const hydraFusion = controlModels[COPILOT_HYDRA_FUSION_MODEL_ID];
	// One upsell stands for every HydraFusion model, so it takes the base model's name.
	const liveHydraFusion = models.find(model => model.metadata.id === COPILOT_HYDRA_FUSION_MODEL_ID && isHydraFusionModel(model) && !isUserProvidedModel(model, languageModelsService));
	// Fusion presents HydraFusion as its tiers, so there is no model of its own to upsell.
	const fusion = models.some(model => model.metadata.autoModelFusion && !isUserProvidedModel(model, languageModelsService));
	if (!liveHydraFusion || fusion) {
		if (!hydraFusion) {
			return controlModels;
		}
		const modelsWithoutHydraFusion = { ...controlModels };
		delete modelsWithoutHydraFusion[COPILOT_HYDRA_FUSION_MODEL_ID];
		return modelsWithoutHydraFusion;
	}
	return {
		...controlModels,
		[COPILOT_HYDRA_FUSION_MODEL_ID]: {
			...hydraFusion,
			label: hydraFusion?.label ?? liveHydraFusion.metadata.name,
			featured: true,
			exists: false,
			minVSCodeVersion: undefined,
		},
	};
}

export function isMultiplierPricing(model: ILanguageModelChatMetadataAndIdentifier): boolean {
	return model.metadata.multiplierNumeric !== undefined;
}

export function getPriceCategoryLabel(priceCategory: string | undefined): string | undefined {
	// The value originates from extension provided metadata, so it may not be a string at runtime
	if (typeof priceCategory !== 'string' || priceCategory.length === 0) {
		return undefined;
	}
	switch (priceCategory) {
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

export function isHighCostCategory(priceCategory: string | undefined): boolean {
	return priceCategory === 'high' || priceCategory === 'very_high';
}

export function getCategoryLabel(category: string | undefined): string | undefined {
	switch (category) {
		case undefined:
		case '':
			return undefined;
		case 'lightweight':
			return localize('chat.category.lightweight', "Lightweight");
		case 'versatile':
			return localize('chat.category.versatile', "Versatile");
		case 'powerful':
			return localize('chat.category.powerful', "Powerful");
		default:
			return typeof category === 'string'
				? category.charAt(0).toUpperCase() + category.slice(1)
				: undefined;
	}
}

export const enum ModelPickerUnavailableReason {
	Restricted = 'restricted',
	SetupRequired = 'setupRequired',
}

export function modelPickerRequiresSetup(context: {
	readonly entitlement: ChatEntitlement;
	readonly anonymous: boolean;
	readonly hasByokModels: boolean;
}): boolean {
	return context.entitlement === ChatEntitlement.Available
		|| (context.entitlement === ChatEntitlement.Unknown
			&& !context.anonymous
			&& !context.hasByokModels);
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
