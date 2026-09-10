/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../../../../base/common/collections.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { isDefined } from '../../../../../../../base/common/types.js';
import { localize } from '../../../../../../../nls.js';
import { COPILOT_VENDOR_ID, ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, IModelControlEntry } from '../../../../common/languageModels.js';
import { buildModelToProviderGroupMap, getProviderGroupForModel, getProviderGroupKey, isVersionAtLeast } from './modelPickerItemPrimitives.js';
import { isDeprecated } from './modelPickerBadges.js';
import { isEarlyAccessModel, latestOfEachLine } from './modelPickerLineage.js';
import { getProviderIconForIdentity } from './modelProviderIcons.js';
import { isAutoModel } from './modelPickerPresentation.js';

/** The built-in provider's models. */
export const MODEL_PICKER_BUILT_IN_DESTINATION = 'builtIn';
/** Prefix for the destination each provider the user added gets. */
const PROVIDER_DESTINATION_PREFIX = 'provider:';

/** A provider the user can add models from but has none from yet, e.g. one that needs signing in. */
export interface IModelPickerProviderPlaceholder {
	readonly vendor: string;
	readonly label: string;
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
	readonly icon: ThemeIcon;
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
}

/**
 * Vendor ids that are the built-in provider under another name. Its models reach the
 * picker from the extension, from the CLI harness, and as agent-host copies, and each
 * of those names a different vendor.
 */
const BUILT_IN_GROUP_IDS: ReadonlySet<string> = new Set([COPILOT_VENDOR_ID, 'copilotcli']);

/**
 * Whether the user brought this model themselves rather than getting it from the
 * built-in provider.
 *
 * This follows the provider group, the same thing the picker names a model's source by,
 * rather than the BYOK flags: a host that forwards the built-in provider's models sets
 * those flags on every model it relays, which would file the whole catalogue under the
 * user's own models.
 */
export function isUserProvidedModel(
	model: ILanguageModelChatMetadataAndIdentifier,
	languageModelsService: ILanguageModelsService,
): boolean {
	const groupId = model.metadata.modelGroup?.id ?? model.metadata.vendor;
	if (BUILT_IN_GROUP_IDS.has(groupId)) {
		return false;
	}
	return groupId !== languageModelsService.getVendors().find(vendor => vendor.isDefault)?.vendor;
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
 * provider the user added, by name. Auto is left out because it has its own row, and
 * empty providers are dropped so the common case yields no tab bar.
 */
export function buildModelPickerDestinations(
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
	languageModelsService: ILanguageModelsService,
	placeholders: readonly IModelPickerProviderPlaceholder[] = [],
): IModelPickerDestination[] {
	const builtInModels: ILanguageModelChatMetadataAndIdentifier[] = [];
	const userModels: ILanguageModelChatMetadataAndIdentifier[] = [];
	for (const model of models) {
		if (isAutoModel(model)) {
			continue;
		}
		(isUserProvidedModel(model, languageModelsService) ? userModels : builtInModels).push(model);
	}

	const builtInVendor = languageModelsService.getVendors().find(vendor => vendor.isDefault);
	const builtInVendorId = builtInVendor?.vendor ?? COPILOT_VENDOR_ID;
	const builtInLabel = builtInVendor?.displayName ?? localize('chat.modelPicker.builtInProvider', "GitHub Copilot");
	const builtInPlaceholders = placeholders.filter(placeholder => placeholder.vendor === builtInVendorId);
	const userPlaceholders = placeholders.filter(placeholder => placeholder.vendor !== builtInVendorId);

	// The built-in destination stands even with nothing to list: a plan that only grants
	// Auto still needs somewhere to show it, and its curated models still need to name
	// the upgrade that would unlock them.
	const hasAutoModel = models.some(isAutoModel);
	const destinations: IModelPickerDestination[] = [];
	if (builtInModels.length || builtInPlaceholders.length || hasAutoModel) {
		destinations.push({
			id: MODEL_PICKER_BUILT_IN_DESTINATION,
			label: builtInLabel,
			icon: getProviderIconForIdentity(`${builtInLabel} ${builtInVendorId}`),
			models: builtInModels,
			placeholders: builtInPlaceholders,
		});
	}

	const modelToGroup = buildModelToProviderGroupMap(languageModelsService);
	// Keyed by provider identity rather than by display name, so two providers that
	// happen to share a name each keep their own tab instead of being merged.
	const byProvider = new Map<string, { label: string; models: ILanguageModelChatMetadataAndIdentifier[]; placeholders: IModelPickerProviderPlaceholder[] }>();
	const providerEntry = (key: string, label: string) => {
		let entry = byProvider.get(key);
		if (!entry) {
			entry = { label, models: [], placeholders: [] };
			byProvider.set(key, entry);
		}
		return entry;
	};
	for (const model of userModels) {
		const { vendor, groupName } = getProviderGroupForModel(model, modelToGroup, languageModelsService);
		providerEntry(getProviderGroupKey(vendor, groupName), groupName).models.push(model);
	}
	// A provider still signing in has no models yet, but it has earned its tab.
	for (const placeholder of userPlaceholders) {
		providerEntry(getProviderGroupKey(placeholder.vendor, placeholder.label), placeholder.label).placeholders.push(placeholder);
	}
	// Ordered by the name the user reads, with the key breaking ties so that providers
	// sharing a name keep a stable order.
	const sortedProviders = [...byProvider].sort(([leftKey, left], [rightKey, right]) =>
		left.label.localeCompare(right.label) || leftKey.localeCompare(rightKey));
	for (const [key, entry] of sortedProviders) {
		destinations.push({
			id: `${PROVIDER_DESTINATION_PREFIX}${key}`,
			label: entry.label,
			icon: getProviderIconForIdentity(entry.label),
			models: entry.models,
			placeholders: entry.placeholders,
		});
	}
	return destinations;
}

export interface IModelPickerSectionsOptions {
	readonly models: readonly ILanguageModelChatMetadataAndIdentifier[];
	readonly selectedModelId: string | undefined;
	readonly recentModelIds: readonly string[];
	readonly pinnedModelIds: readonly string[];
	readonly controlModels: IStringDictionary<IModelControlEntry>;
	/** Whether the destination has a curated shortlist to lead with. Only the built-in provider curates one. */
	readonly showSuggested: boolean;
	/** Whether to name curated models the user cannot select yet. Off by default. */
	readonly showUnavailable?: boolean;
	/** This build's version, used to spot models gated behind a newer VS Code. */
	readonly currentVSCodeVersion?: string;
}

/**
 * Splits a destination's models into favourites, the shortlist to lead with, and the
 * rest. Each model appears once, and the selected model is never folded into the rest.
 */
export function buildModelPickerSections(options: IModelPickerSectionsOptions): IModelPickerSections {
	// A model this build is too old to run is kept out of every selectable section and
	// surfaced only as the update it needs.
	const unavailable = buildUnavailableEntries(options);
	const gated = new Set(unavailable.filter(entry => entry.needsUpdate).map(entry => entry.id));
	const selectable = gated.size === 0
		? options.models
		: options.models.filter(model => !gated.has(model.metadata.id) && !gated.has(model.identifier));

	const byIdentifier = new Map(selectable.map(model => [model.identifier, model]));
	const byMetadataId = new Map(selectable.map(model => [model.metadata.id, model]));
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
		for (const model of options.models) {
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
	if (!options.showUnavailable) {
		return [];
	}
	const present = new Set(options.models.flatMap(model => [model.identifier, model.metadata.id]));
	const entries: IModelPickerUnavailableEntry[] = [];
	for (const [id, entry] of Object.entries(options.controlModels)) {
		if (!entry.featured) {
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
