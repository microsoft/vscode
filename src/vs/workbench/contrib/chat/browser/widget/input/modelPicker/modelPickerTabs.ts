/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../../../../base/common/collections.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { isDefined } from '../../../../../../../base/common/types.js';
import { localize } from '../../../../../../../nls.js';
import { COPILOT_VENDOR_ID, getLanguageModelProviderIcon, ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, IModelControlEntry, isUserProvidedModel, LanguageModelProviderIcon } from '../../../../common/languageModels.js';
import { buildModelToProviderGroupMap, getProviderGroupForModel, getProviderGroupKey, IProviderGroupInfo, isVersionAtLeast } from './modelPickerItemPrimitives.js';
import { isDeprecated } from './modelPickerBadges.js';
import { isEarlyAccessModel, latestOfEachLine } from './modelPickerLineage.js';
import { getProviderIconForIdentity } from './modelProviderIcons.js';
import { isAutoModel } from './modelPickerPresentation.js';
import { buildSpeedVariants, collapseSpeedVariants, IModelSpeedVariants } from './modelPickerVariants.js';

/** The built-in provider's models. */
export const MODEL_PICKER_BUILT_IN_DESTINATION = 'builtIn';
/** The on-device models of the chat's local Agent Host, placed right after the built-in provider. */
export const MODEL_PICKER_ON_DEVICE_DESTINATION = 'onDevice';
/** Prefix for the destination each provider the user added gets. */
const PROVIDER_DESTINATION_PREFIX = 'provider:';

/** A provider the user can add models from but has none from yet, e.g. one that needs signing in. */
export interface IModelPickerProviderPlaceholder {
	readonly vendor: string;
	readonly label: string;
	/** Shown in place of the provider's icon when the reason is not specific to it, e.g. Restricted Mode. */
	readonly icon?: ThemeIcon;
	/** Why there are no models, shown under the provider name. */
	readonly message: string;
	/** Optional call to action, e.g. "Sign in". */
	readonly action?: { readonly label: string; readonly run: () => void };
}

/**
 * One tab of the picker: the built-in provider, or one the user added. Each names a
 * single provider, so a tab's models never need to say where they came from.
 */
export interface IModelPickerDestination {
	readonly id: string;
	/** Names the destination in the tab tooltip and as the list heading. */
	readonly label: string;
	/** The provider's declared icon, or one recognised from its name. */
	readonly icon: LanguageModelProviderIcon;
	readonly models: readonly ILanguageModelChatMetadataAndIdentifier[];
	/** Providers with nothing to list yet, shown as a welcome body when there are no models. */
	readonly placeholders: readonly IModelPickerProviderPlaceholder[];
}

/**
 * A model the picker names but the user cannot select yet: their plan does not
 * include it, their administrator disabled it, or this build is too old.
 */
export interface IModelPickerUnavailableEntry {
	readonly id: string;
	readonly entry: IModelControlEntry;
	/** The model exists for this account but needs a newer VS Code. */
	readonly needsUpdate: boolean;
}

/** The rows of one destination, in the order they are shown. */
export interface IModelPickerSections {
	/** The models the user marked, shown under their own heading. */
	readonly pinned: readonly ILanguageModelChatMetadataAndIdentifier[];
	/** The shortlist the picker leads with, shown unlabelled as the body of the list. */
	readonly suggested: readonly ILanguageModelChatMetadataAndIdentifier[];
	/** Everything not promoted above, which folds away when there is a shortlist. */
	readonly other: readonly ILanguageModelChatMetadataAndIdentifier[];
	/** Curated models the user cannot select yet, shown alongside the recommended ones. */
	readonly unavailable: readonly IModelPickerUnavailableEntry[];
	/** Selectable speed pairs, shared with the model cards. */
	readonly speedVariants: ReadonlyMap<string, IModelSpeedVariants>;
}

/** The provider a model came from, as shown in group headings. */
export function getModelProviderLabel(
	model: ILanguageModelChatMetadataAndIdentifier,
	languageModelsService: ILanguageModelsService,
	modelToGroup = buildModelToProviderGroupMap(languageModelsService),
): string {
	return getProviderGroupForModel(model, modelToGroup, languageModelsService).groupName;
}

/**
 * Splits models into one destination per provider: the built-in one first, then each
 * provider the user added, by name. Models with their own row, Auto by default, are left
 * out, and empty providers are dropped so the common case yields no tab bar.
 *
 * @param keepBuiltIn Keeps the built-in destination even with nothing to select, for a
 * plan whose curated models still need to name the upgrade that would unlock them.
 */
export function buildModelPickerDestinations(
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
	languageModelsService: ILanguageModelsService,
	placeholders: readonly IModelPickerProviderPlaceholder[] = [],
	hasOwnRow: (model: ILanguageModelChatMetadataAndIdentifier) => boolean = isAutoModel,
	keepBuiltIn = false,
): IModelPickerDestination[] {
	const builtInVendor = languageModelsService.getVendors().find(vendor => vendor.isDefault);
	const builtInGroup = {
		vendor: builtInVendor?.vendor ?? COPILOT_VENDOR_ID,
		groupName: builtInVendor?.displayName ?? localize('chat.modelPicker.builtInProvider', "GitHub Copilot"),
		icon: builtInVendor?.icon,
	};
	const modelToGroup = buildModelToProviderGroupMap(languageModelsService);
	// Provider identity keeps same-name providers distinct, with the built-in ID reserved.
	const byProvider = new Map<string, { label: string; icon: LanguageModelProviderIcon | undefined; models: ILanguageModelChatMetadataAndIdentifier[]; placeholders: IModelPickerProviderPlaceholder[] }>();
	const providerEntry = (group: IProviderGroupInfo, isBuiltIn = false) => {
		const key = isBuiltIn ? MODEL_PICKER_BUILT_IN_DESTINATION : `${PROVIDER_DESTINATION_PREFIX}${getProviderGroupKey(group.vendor, group.groupName)}`;
		let entry = byProvider.get(key);
		if (!entry) {
			entry = { label: group.groupName, icon: group.icon, models: [], placeholders: [] };
			byProvider.set(key, entry);
		}
		entry.icon ??= group.icon;
		return entry;
	};
	providerEntry(builtInGroup, true);
	for (const model of models) {
		if (hasOwnRow(model)) {
			continue;
		}
		const isBuiltIn = !isUserProvidedModel(model, languageModelsService);
		const group = isBuiltIn ? builtInGroup : getProviderGroupForModel(model, modelToGroup, languageModelsService);
		providerEntry(group, isBuiltIn).models.push(model);
	}
	// A provider still signing in has no models yet, but it has earned its tab.
	for (const placeholder of placeholders) {
		const isBuiltIn = placeholder.vendor === builtInGroup.vendor;
		const group = isBuiltIn ? builtInGroup : {
			vendor: placeholder.vendor,
			groupName: placeholder.label,
			icon: getLanguageModelProviderIcon(languageModelsService, placeholder.vendor),
		};
		providerEntry(group, isBuiltIn).placeholders.push(placeholder);
	}
	// Auto-only and curated-upgrade plans still need the built-in destination.
	const retainBuiltIn = keepBuiltIn || models.some(hasOwnRow);
	return [...byProvider]
		.filter(([key, entry]) => entry.models.length || entry.placeholders.length || (key === MODEL_PICKER_BUILT_IN_DESTINATION && retainBuiltIn))
		.sort(([leftKey, left], [rightKey, right]) =>
			Number(rightKey === MODEL_PICKER_BUILT_IN_DESTINATION) - Number(leftKey === MODEL_PICKER_BUILT_IN_DESTINATION)
			|| left.label.localeCompare(right.label) || leftKey.localeCompare(rightKey))
		.map(([key, entry]) => ({
			id: key,
			label: entry.label,
			icon: entry.icon ?? getProviderIconForIdentity(key === MODEL_PICKER_BUILT_IN_DESTINATION ? `${entry.label} ${builtInGroup.vendor}` : entry.label),
			models: entry.models,
			placeholders: entry.placeholders,
		}));
}

export interface IModelPickerSectionsOptions {
	/** The full destination catalogue, before collapsing speed variants. */
	readonly models: readonly ILanguageModelChatMetadataAndIdentifier[];
	readonly selectedModelId: string | undefined;
	readonly organizationDefaultModelId?: string;
	readonly recentModelIds: readonly string[];
	readonly pinnedModelIds: readonly string[];
	readonly controlModels: IStringDictionary<IModelControlEntry>;
	readonly preferredSpeedVariants?: ReadonlyMap<string, string>;
	/** Whether the destination has a curated shortlist to lead with. Only the built-in provider curates one. */
	readonly showSuggested: boolean;
	/** Whether to name curated models the user cannot select yet. Off by default. */
	readonly showUnavailable?: boolean;
	readonly alwaysShowUnavailableModelIds?: ReadonlySet<string>;
	/** This build's version, used to spot models gated behind a newer VS Code. */
	readonly currentVSCodeVersion?: string;
}

/**
 * Splits a destination's models into favourites, the shortlist to lead with, and the
 * rest. Each model appears once; the selected and organization-default models stay visible.
 */
export function buildModelPickerSections(options: IModelPickerSectionsOptions): IModelPickerSections {
	// A model this build is too old to run is kept out of every selectable section and
	// surfaced only as the update it needs.
	const unavailable = buildUnavailableEntries(options);
	const gated = new Set(unavailable.filter(entry => entry.needsUpdate).map(entry => entry.id));
	const available = gated.size === 0
		? options.models
		: options.models.filter(model => !gated.has(model.metadata.id) && !gated.has(model.identifier));
	const speedVariants = buildSpeedVariants(available);
	const selectable = collapseSpeedVariants(available, speedVariants, options.selectedModelId, options.preferredSpeedVariants);

	const byIdentifier = new Map<string, ILanguageModelChatMetadataAndIdentifier>();
	const byMetadataId = new Map<string, ILanguageModelChatMetadataAndIdentifier>();
	for (const model of selectable) {
		const pair = speedVariants.get(model.identifier);
		for (const variant of pair ? [pair.standard, pair.fast] : [model]) {
			byIdentifier.set(variant.identifier, model);
			byMetadataId.set(variant.metadata.id, model);
		}
	}
	const placed = new Set<string>();
	const take = (id: string | undefined): ILanguageModelChatMetadataAndIdentifier | undefined => {
		const model = id ? byIdentifier.get(id) ?? byMetadataId.get(id) : undefined;
		if (!model || placed.has(model.identifier)) {
			return undefined;
		}
		placed.add(model.identifier);
		return model;
	};

	const pinned = options.pinnedModelIds.map(take).filter(isDefined);

	const suggested: ILanguageModelChatMetadataAndIdentifier[] = [];
	if (options.showSuggested) {
		for (const model of selectable) {
			if (!model.metadata.promo) {
				continue;
			}
			// Resolved through `take`, which draws only from the selectable models: an
			// offer on a model this build is too old to run is surfaced as the update
			// it needs rather than as a row that cannot be picked.
			const promoted = take(model.identifier);
			if (promoted) {
				suggested.push(promoted);
			}
		}
		// The newest model of each line leads. A line replaced by a different line rather
		// than by a newer version of itself is marked demoted instead.
		for (const model of latestOfEachLine(selectable)) {
			if (isEarlyAccessModel(model.metadata.id) || options.controlModels[model.metadata.id]?.demoted) {
				continue;
			}
			const latest = take(model.identifier);
			if (latest) {
				suggested.push(latest);
			}
		}
		// The model in use is never folded away, however the catalogue rates it.
		const selected = take(options.selectedModelId);
		if (selected) {
			suggested.push(selected);
		}
		const organizationDefault = take(options.organizationDefaultModelId);
		if (organizationDefault) {
			suggested.push(organizationDefault);
		}
	}

	const byName = (left: ILanguageModelChatMetadataAndIdentifier, right: ILanguageModelChatMetadataAndIdentifier) =>
		left.metadata.name.localeCompare(right.metadata.name);
	// A time-limited offer leads the shortlist.
	const byPromoThenName = (left: ILanguageModelChatMetadataAndIdentifier, right: ILanguageModelChatMetadataAndIdentifier) =>
		(hasPromo(right) ? 1 : 0) - (hasPromo(left) ? 1 : 0) || byName(left, right);
	// A retiring model stays pickable but sinks to the end.
	const byRetiringThenName = (left: ILanguageModelChatMetadataAndIdentifier, right: ILanguageModelChatMetadataAndIdentifier) =>
		(isDeprecated(left) ? 1 : 0) - (isDeprecated(right) ? 1 : 0) || byName(left, right);
	const rest = selectable.filter(model => !placed.has(model.identifier)).sort(byRetiringThenName);

	return {
		pinned: pinned.sort(byName),
		suggested: suggested.sort(byPromoThenName),
		other: rest,
		unavailable,
		speedVariants,
	};
}

/** Whether the model carries an offer worth leading with. */
function hasPromo(model: ILanguageModelChatMetadataAndIdentifier): boolean {
	return ILanguageModelChatMetadata.hasPromoDiscount(model.metadata);
}

/**
 * Curated models with no usable entry here, because the account has no access or this
 * build is too old. Named so the path to unlocking them stays visible.
 */
function buildUnavailableEntries(options: IModelPickerSectionsOptions): IModelPickerUnavailableEntry[] {
	const present = new Set(options.models.flatMap(model => [model.identifier, model.metadata.id]));
	const entries: IModelPickerUnavailableEntry[] = [];
	for (const [id, entry] of Object.entries(options.controlModels)) {
		if (!entry.featured || (!options.showUnavailable && !options.alwaysShowUnavailableModelIds?.has(id))) {
			continue;
		}
		const outOfDate = isOutOfDate(entry, options.currentVSCodeVersion);
		// A model that is here but gated needs an update; one that is missing entirely
		// needs whatever its account is short of.
		if (present.has(id) ? outOfDate : !entry.exists) {
			entries.push({ id, entry, needsUpdate: outOfDate });
		}
	}
	return entries.sort((left, right) => left.entry.label.localeCompare(right.entry.label));
}

/** Whether the entry names a minimum VS Code version this build does not meet. */
function isOutOfDate(entry: IModelControlEntry, currentVSCodeVersion: string | undefined): boolean {
	return !!entry.minVSCodeVersion && !!currentVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, entry.minVSCodeVersion);
}

/** Whether the destination leads with a shortlist that the rest can fold away behind. */
export function hasPromotedModels(sections: IModelPickerSections): boolean {
	return sections.suggested.length > 0;
}
