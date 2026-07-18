/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, toAction } from '../../../../../../../base/common/actions.js';
import { IStringDictionary } from '../../../../../../../base/common/collections.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { ActionListItemKind, IActionListItem } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetDropdownAction } from '../../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { MANAGE_CHAT_COMMAND_ID } from '../../../../common/constants.js';
import { IModelControlEntry, ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, IModelsControlManifest } from '../../../../common/languageModels.js';
import { ChatEntitlement, IChatEntitlementService, isProUser } from '../../../../../../services/chat/common/chatEntitlementService.js';
import * as semver from '../../../../../../../base/common/semver/semver.js';
import { getModelHoverContent } from './modelPickerHover.js';
import { getPriceCategoryLabel, isAutoModel, isMultiplierPricing } from './modelPickerPresentation.js';
import { StateType } from '../../../../../../../platform/update/common/update.js';

function isVersionAtLeast(current: string, required: string): boolean {
	const currentSemver = semver.coerce(current);
	if (!currentSemver) {
		return false;
	}
	return semver.gte(currentSemver, required);
}

function getUpdateHoverContent(updateState: StateType): MarkdownString {
	const hoverContent = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
	switch (updateState) {
		case StateType.AvailableForDownload:
			hoverContent.appendMarkdown(localize('chat.modelPicker.downloadUpdateHover', "This model requires a newer version of VS Code. [Download Update](command:update.downloadUpdate) to access it."));
			break;
		case StateType.Downloaded:
		case StateType.Ready:
			hoverContent.appendMarkdown(localize('chat.modelPicker.restartUpdateHover', "This model requires a newer version of VS Code. [Restart to Update](command:update.restartToUpdate) to access it."));
			break;
		default:
			hoverContent.appendMarkdown(localize('chat.modelPicker.checkUpdateHover', "This model requires a newer version of VS Code. [Update VS Code](command:update.checkForUpdate) to access it."));
			break;
	}
	return hoverContent;
}

export function getControlModelsForEntitlement(manifest: IModelsControlManifest, entitlement: ChatEntitlement): IStringDictionary<IModelControlEntry> {
	return isProUser(entitlement) && entitlement !== ChatEntitlement.EDU ? manifest.paid : manifest.free;
}

/**
 * Section identifiers for collapsible groups in the model picker.
 */
export const ModelPickerSection = {
	Other: 'other',
} as const;

/**
 * Id of the synthetic "Trust Workspace to enable models..." entry shown in Restricted Mode. It is
 * a command (not a selectable model), so the accessibility provider gives it a
 * plain `menuitem` role instead of `menuitemradio`.
 */
const RESTRICTED_MODE_TRUST_ACTION_ID = 'restrictedModeTrust';

/**
 * Id of the synthetic "Sign in to use Copilot..." entry shown when Chat still
 * requires sign-in / setup. Like the Trust entry it is a command, so it gets a
 * plain `menuitem` role.
 */
const SETUP_REQUIRED_SIGN_IN_ACTION_ID = 'setupRequiredSignIn';

/** Synthetic command entries (Trust / Sign in) that are not selectable models. */
const PICKER_COMMAND_ACTION_IDS: ReadonlySet<string> = new Set([RESTRICTED_MODE_TRUST_ACTION_ID, SETUP_REQUIRED_SIGN_IN_ACTION_ID]);

/**
 * Returns a human-readable display name for a model vendor.
 * Uses known product names before falling back to the registered provider
 * descriptor or a capitalized vendor id.
 */
function getVendorDisplayName(languageModelsService: ILanguageModelsService, vendor: string): string {
	if (vendor === 'copilotcli') {
		// @vritant24: This is temporary until we we have 2 distinct vendors for Copilot CLI vs Copilot Chat.
		// For now, we want to show "Copilot" in the model picker for both.
		return localize('chat.modelPicker.copilotGroup', "Copilot");
	}
	const descriptor = languageModelsService.getVendors().find(v => v.vendor === vendor);
	if (descriptor?.displayName) {
		return descriptor.displayName;
	}
	return vendor.charAt(0).toUpperCase() + vendor.slice(1);
}

/**
 * Identifies a provider group bucket in the model picker. A bucket is
 * defined by `(vendor, groupName)` so that BYOK setups with multiple
 * user-configured groups under the same vendor (e.g. two `customoai`
 * entries named "Provider 1" and "Provider 2") are surfaced as
 * distinct sections — matching what the model configuration view shows.
 */
type ProviderGroupKey = string;

function getProviderGroupKey(vendor: string, groupName: string): ProviderGroupKey {
	return `${vendor}\u0000${groupName}`;
}

interface IProviderGroupInfo {
	readonly vendor: string;
	readonly groupName: string;
}

/**
 * Builds a `modelIdentifier -> { vendor, groupName }` lookup by walking
 * `getLanguageModelGroups()` for every registered vendor. Mirrors the
 * grouping used by `chatModelsViewModel.ts` so the picker and the model
 * configuration view stay aligned.
 */
function buildModelToProviderGroupMap(languageModelsService: ILanguageModelsService): Map<string, IProviderGroupInfo> {
	const map = new Map<string, IProviderGroupInfo>();
	for (const vendor of languageModelsService.getVendors()) {
		const groups = languageModelsService.getLanguageModelGroups(vendor.vendor);
		for (const group of groups) {
			// `group.group` is undefined for built-in vendors that have no
			// user configuration; fall back to the vendor display name so
			// the bucket key matches the single-section render path.
			const groupName = group.group?.name ?? vendor.displayName;
			for (const identifier of group.modelIdentifiers) {
				map.set(identifier, { vendor: vendor.vendor, groupName });
			}
		}
	}
	return map;
}

/**
 * Resolves the provider group for a model, falling back to the vendor
 * display name when no group entry is registered (e.g. legacy vendors or
 * tests that stub out `getLanguageModelGroups`).
 */
function getProviderGroupForModel(
	model: ILanguageModelChatMetadataAndIdentifier,
	modelToGroup: Map<string, IProviderGroupInfo>,
	languageModelsService: ILanguageModelsService,
): IProviderGroupInfo {
	// Agent-host models share one vendor but declare their upstream provider (a vendor id)
	// via `modelGroup`; bucket by it, resolving the display name from the vendor registry —
	// the same source used for every other vendor — so they don't collapse into one section.
	if (model.metadata.modelGroup) {
		return { vendor: model.metadata.vendor, groupName: getVendorDisplayName(languageModelsService, model.metadata.modelGroup.id) };
	}

	const info = modelToGroup.get(model.identifier);
	if (info) {
		return info;
	}
	return {
		vendor: model.metadata.vendor,
		groupName: getVendorDisplayName(languageModelsService, model.metadata.vendor),
	};
}

function createModelItem(
	action: IActionWidgetDropdownAction & { section?: string },
	model?: ILanguageModelChatMetadataAndIdentifier,
	openerService?: IOpenerService,
	vendorLabel?: string,
	isUBB?: boolean,
	ariaDescription?: string,
	pinAction?: IAction,
	onConfigure?: (model: ILanguageModelChatMetadataAndIdentifier, group: string) => void,
): IActionListItem<IActionWidgetDropdownAction> {
	const hover = model && openerService
		? getModelHoverContent(model, isUBB, onConfigure ? (group) => onConfigure(model, group) : undefined, openerService)
		: undefined;
	return {
		item: action,
		kind: ActionListItemKind.Action,
		label: action.label,
		description: action.description,
		ariaDescription,
		group: { title: '', icon: action.icon ?? ThemeIcon.fromId(action.checked ? Codicon.check.id : Codicon.blank.id) },
		hideIcon: false,
		section: action.section,
		className: vendorLabel ? 'chat-model-picker-inline-source' : undefined,
		badge: vendorLabel,
		hover: hover ? { content: hover.element, disposable: hover.disposable } : undefined,
		tooltip: action.tooltip,
		toolbarActions: pinAction ? [pinAction] : undefined,
		submenuActions: action.toolbarActions?.length ? action.toolbarActions : undefined,
	};
}

/**
 * Creates a pin/unpin toolbar action for a model item in the picker.
 */
function createPinAction(
	modelIdentifier: string,
	isPinned: boolean,
	onTogglePin: (modelIdentifier: string, pinned: boolean) => void,
): IAction {
	return toAction({
		id: `pin.${modelIdentifier}`,
		label: isPinned
			? localize('chat.modelPicker.unpin', "Unpin Model")
			: localize('chat.modelPicker.pin', "Pin Model"),
		class: ThemeIcon.asClassName(isPinned ? Codicon.pinned : Codicon.pin),
		run: () => onTogglePin(modelIdentifier, !isPinned),
	});
}


function createModelAction(
	model: ILanguageModelChatMetadataAndIdentifier,
	selectedModelId: string | undefined,
	onSelect: (model: ILanguageModelChatMetadataAndIdentifier) => void,
	section?: string,
	suppressVendorInDetail?: boolean,
): { action: IActionWidgetDropdownAction & { section?: string }; ariaDescription?: string } {
	// Only show pricing in the description line if it's a multiplier (e.g. "2x").
	// Detailed AIC/token pricing is shown in the hover instead.
	const pricingForDescription = isMultiplierPricing(model) ? model.metadata.pricing : undefined;
	const priceCategoryLabel = getPriceCategoryLabel(model.metadata.priceCategory);
	// Strip the detail when suppressVendorInDetail is set — the vendor is
	// shown either inline (promoted) or in a section header (Other Models).
	const detail = suppressVendorInDetail ? undefined : model.metadata.detail;
	const promo = ILanguageModelChatMetadata.hasPromoDiscount(model.metadata) ? model.metadata.promo : undefined;
	const promoDetail = promo ? localize('chat.promo.discount', "{0}% discount", promo.discountPercent) : undefined;
	const textParts = [detail, promoDetail, pricingForDescription].filter(Boolean);
	const textDescription = textParts.length > 0 ? textParts.join(' · ') : undefined;

	const action: IActionWidgetDropdownAction & { section?: string } = {
		id: model.identifier,
		enabled: true,
		icon: model.metadata.statusIcon,
		checked: model.identifier === selectedModelId,
		class: undefined,
		description: textDescription,
		tooltip: model.metadata.name,
		label: model.metadata.name,
		section,
		run: () => onSelect(model),
	};
	const ariaDescription = priceCategoryLabel
		? (textDescription ? textDescription + ' · ' + priceCategoryLabel : priceCategoryLabel)
		: undefined;
	return { action, ariaDescription };
}

export function shouldShowManageModelsAction(chatEntitlementService: IChatEntitlementService): boolean {
	return chatEntitlementService.clientByokEnabled ||
		chatEntitlementService.hasByokModels ||
		chatEntitlementService.entitlement === ChatEntitlement.Free ||
		chatEntitlementService.entitlement === ChatEntitlement.EDU ||
		chatEntitlementService.entitlement === ChatEntitlement.Pro ||
		chatEntitlementService.entitlement === ChatEntitlement.ProPlus ||
		chatEntitlementService.entitlement === ChatEntitlement.Max ||
		chatEntitlementService.entitlement === ChatEntitlement.Business ||
		chatEntitlementService.entitlement === ChatEntitlement.Enterprise ||
		chatEntitlementService.isInternal;
}

export function createManageModelsAction(commandService: ICommandService): IActionWidgetDropdownAction {
	return {
		id: 'manageModels',
		enabled: true,
		checked: false,
		class: ThemeIcon.asClassName(Codicon.gear),
		tooltip: localize('chat.manageModels.tooltip', "Manage Language Models"),
		label: localize('chat.manageModels', "Manage Models..."),
		run: () => { commandService.executeCommand(MANAGE_CHAT_COMMAND_ID); }
	};
}

/**
 * Builds the grouped items for the model picker dropdown.
 *
 * Layout:
 * 1. Auto (always first)
 * 2. Promoted section (selected + recently used + featured models from control manifest)
 *    - Available models sorted alphabetically, followed by unavailable models
 *    - Unavailable models show upgrade/update/admin status
 *    - Promoted models show an inline source label (the provider group
 *      name) when more than one group is configured.
 * 3. Other Models (collapsible toggle) - models grouped by provider group
 *    (vendor + user-configured group name) with separator headers
 *    - Each provider group has a titled separator header. This matches
 *      the buckets shown in the model configuration view, so a BYOK setup
 *      with several groups under a single vendor (e.g. an "OpenAI
 *      Compatible" group and an "AWS Bedrock" group both registered to
 *      the `customoai` vendor) renders as distinct sections.
 * 4. Optional "Manage Models..." action shown in Other Models after a separator
 *
 * When `restrictedMode` is set (untrusted workspace), an explanatory "Models
 * unavailable while in Restricted mode" header and a "Trust Workspace to enable
 * models..." action (invoking `onRequestTrust`) replace all of the above.
 * Likewise, when
 * `setupRequired` is set (trusted, but Chat still needs sign-in / setup), a
 * "Sign in to use Copilot" header and a Sign In action (invoking
 * `onRequestSetup`) replace all of the above. `restrictedMode` takes precedence.
 */
export function buildModelPickerItems(
	models: ILanguageModelChatMetadataAndIdentifier[],
	selectedModelId: string | undefined,
	recentModelIds: string[],
	pinnedModelIds: string[],
	controlModels: IStringDictionary<IModelControlEntry>,
	currentVSCodeVersion: string,
	updateStateType: StateType,
	onSelect: (model: ILanguageModelChatMetadataAndIdentifier) => void,
	onTogglePin: ((modelIdentifier: string, pinned: boolean) => void) | undefined,
	manageSettingsUrl: string | undefined,
	useGroupedModelPicker: boolean,
	manageModelsAction: IActionWidgetDropdownAction | undefined,
	chatEntitlementService: IChatEntitlementService,
	showUnavailableFeatured: boolean,
	showFeatured: boolean,
	languageModelsService?: ILanguageModelsService,
	openerService?: IOpenerService,
	showAutoModel: boolean = false,
	onConfigure?: (model: ILanguageModelChatMetadataAndIdentifier, group: string) => void,
	restrictedMode: boolean = false,
	onRequestTrust?: () => void,
	setupRequired: boolean = false,
	onRequestSetup?: () => void,
	isUBB: boolean = false,
): IActionListItem<IActionWidgetDropdownAction>[] {
	const items: IActionListItem<IActionWidgetDropdownAction>[] = [];
	if (restrictedMode) {
		// Untrusted workspace: providers are disabled, so any `models` here are
		// stale machine-cached entries. Surface a Trust action (mirroring the
		// send-message trust prompt) instead of a misleading lone "Auto". Checked
		// before the empty-list branch since cached entries can make `models`
		// non-empty.
		items.push({
			kind: ActionListItemKind.Header,
			label: localize('chat.modelPicker.restrictedMode', "Models unavailable while in Restricted mode"),
		});
		items.push({
			item: {
				id: RESTRICTED_MODE_TRUST_ACTION_ID,
				enabled: !!onRequestTrust,
				checked: false,
				class: undefined,
				tooltip: localize('chat.modelPicker.restrictedMode.trustTooltip', "Trust the workspace to enable models."),
				label: localize('chat.modelPicker.restrictedMode.trust', "Trust Workspace to enable models..."),
				run: () => onRequestTrust?.()
			},
			kind: ActionListItemKind.Action,
			label: localize('chat.modelPicker.restrictedMode.trust', "Trust Workspace to enable models..."),
			group: { title: '', icon: ThemeIcon.fromId(Codicon.workspaceTrusted.id) },
			disabled: !onRequestTrust,
			hideIcon: false,
		});
		return items;
	}
	if (setupRequired) {
		// Trusted, but Chat still needs sign-in / setup before any model is
		// usable. Surface a Sign In action (mirroring the send-message setup
		// prompt) instead of a misleading lone "Auto". Like restricted mode this
		// is checked before the empty-list branch since stale machine-cached
		// entries can make `models` non-empty.
		items.push({
			kind: ActionListItemKind.Header,
			label: localize('chat.modelPicker.setupRequired', "Sign in to use Copilot"),
		});
		items.push({
			item: {
				id: SETUP_REQUIRED_SIGN_IN_ACTION_ID,
				enabled: !!onRequestSetup,
				checked: false,
				class: undefined,
				tooltip: localize('chat.modelPicker.setupRequired.signInTooltip', "Sign in to GitHub Copilot to choose a model."),
				label: localize('chat.modelPicker.setupRequired.signIn', "Sign in to use Copilot..."),
				run: () => onRequestSetup?.()
			},
			kind: ActionListItemKind.Action,
			label: localize('chat.modelPicker.setupRequired.signIn', "Sign in to use Copilot..."),
			group: { title: '', icon: ThemeIcon.fromId(Codicon.signIn.id) },
			disabled: !onRequestSetup,
			hideIcon: false,
		});
		return items;
	}
	if (models.length === 0) {
		if (!showAutoModel) {
			// Auto is not available for this session type (e.g. the Claude agent
			// host), so the empty list cannot fall back to Auto. Surface a single
			// disabled "No models available" entry. For Copilot Free / Student
			// users, attach an inline upgrade link on the right (matching the
			// unavailable-model upgrade affordance elsewhere in the picker).
			const entitlement = chatEntitlementService.entitlement;
			const canUpgrade = entitlement === ChatEntitlement.Free || entitlement === ChatEntitlement.EDU;
			const description = canUpgrade
				? new MarkdownString(localize('chat.modelPicker.upgradeLink', "[Upgrade](command:workbench.action.chat.upgradePlan \" \")"), { isTrusted: true })
				: undefined;
			let hover: MarkdownString | undefined;
			if (canUpgrade) {
				hover = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
				hover.appendMarkdown(localize('chat.modelPicker.upgradeHover', "[Upgrade to GitHub Copilot Pro](command:workbench.action.chat.upgradePlan \" \") to use the best models."));
			}
			items.push({
				item: {
					id: 'noModels',
					enabled: false,
					checked: false,
					class: undefined,
					tooltip: localize('chat.modelPicker.noModels', "No models available"),
					label: localize('chat.modelPicker.noModels', "No models available"),
					run: () => { }
				},
				kind: ActionListItemKind.Action,
				label: localize('chat.modelPicker.noModels', "No models available"),
				description,
				group: { title: '', icon: ThemeIcon.fromId(Codicon.blank.id) },
				disabled: true,
				hideIcon: false,
				hover: hover ? { content: hover } : undefined,
			});
			// Nothing else is selectable in this state, so surface only the
			// single disabled entry. Returning here prevents the grouped-picker
			// logic below from appending an Auto entry, model groups, or a
			// standalone "Manage Models" action.
			return items;
		} else {
			items.push(createModelItem({
				id: 'auto',
				enabled: true,
				checked: true,
				class: undefined,
				tooltip: localize('chat.modelPicker.auto', "Auto"),
				label: localize('chat.modelPicker.auto', "Auto"),
				run: () => { }
			}));
		}
	}

	if (useGroupedModelPicker) {
		let otherModels: ILanguageModelChatMetadataAndIdentifier[] = [];
		// Build a lookup so each model can be assigned to its provider group
		// (vendor + user-configured group name). This must happen before both
		// the promoted-section badge logic and the Other Models grouping so
		// that both surfaces use the same notion of "distinct provider".
		const modelToGroup = languageModelsService
			? buildModelToProviderGroupMap(languageModelsService)
			: new Map<string, IProviderGroupInfo>();
		if (models.length) {
			// Collect all available models into lookup maps
			const allModelsMap = new Map<string, ILanguageModelChatMetadataAndIdentifier>();
			const modelsByMetadataId = new Map<string, ILanguageModelChatMetadataAndIdentifier>();
			for (const model of models) {
				allModelsMap.set(model.identifier, model);
				modelsByMetadataId.set(model.metadata.id, model);
			}

			const placed = new Set<string>();

			const markPlaced = (identifierOrId: string, metadataId?: string) => {
				placed.add(identifierOrId);
				if (metadataId) {
					placed.add(metadataId);
				}
			};

			const resolveModel = (id: string) => allModelsMap.get(id) ?? modelsByMetadataId.get(id);

			const getUnavailableReason = (entry: IModelControlEntry): 'upgrade' | 'update' | 'admin' => {
				const isBusinessOrEnterpriseUser = chatEntitlementService.entitlement === ChatEntitlement.Business || chatEntitlementService.entitlement === ChatEntitlement.Enterprise;
				if (!isBusinessOrEnterpriseUser) {
					return 'upgrade';
				}
				if (entry.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, entry.minVSCodeVersion)) {
					return 'update';
				}
				return 'admin';
			};

			// --- 1. Auto ---
			const autoModel = models.find(m => isAutoModel(m));
			if (autoModel) {
				markPlaced(autoModel.identifier, autoModel.metadata.id);
				const { action: autoAction, ariaDescription: autoAriaDesc } = createModelAction(autoModel, selectedModelId, onSelect);
				items.push(createModelItem(autoAction, autoModel, openerService, undefined, isUBB, autoAriaDesc));
			}

			// --- 1b. Discounted promo models (boosted next to Auto) ---
			for (const model of models) {
				if (placed.has(model.identifier) || placed.has(model.metadata.id)) {
					continue;
				}
				if (ILanguageModelChatMetadata.hasPromoDiscount(model.metadata)) {
					markPlaced(model.identifier, model.metadata.id);
					const { action: promoAction, ariaDescription: promoAriaDesc } = createModelAction(model, selectedModelId, onSelect);
					items.push(createModelItem(promoAction, model, openerService, undefined, isUBB, promoAriaDesc));
				}
			}

			// Precompute group labels needed for inline badges
			const allGroupKeys = new Set(
				models.map(m => {
					const info = getProviderGroupForModel(m, modelToGroup, languageModelsService!);
					return getProviderGroupKey(info.vendor, info.groupName);
				})
			);
			const showGroupLabel = allGroupKeys.size > 1;

			// Helper to create a pin/unpin toolbar action for a model
			const makePinAction = (model: ILanguageModelChatMetadataAndIdentifier) =>
				onTogglePin ? createPinAction(model.identifier, pinnedModelIds.includes(model.identifier), onTogglePin) : undefined;

			// --- 2. Pinned models ---
			const pinnedSet = new Set(pinnedModelIds);
			const pinnedModels: ILanguageModelChatMetadataAndIdentifier[] = [];
			for (const id of pinnedModelIds) {
				if (placed.has(id)) {
					continue;
				}
				const model = resolveModel(id);
				if (model && !placed.has(model.identifier)) {
					markPlaced(model.identifier, model.metadata.id);
					pinnedModels.push(model);
				}
			}
			if (pinnedModels.length > 0) {
				items.push({ kind: ActionListItemKind.Separator, label: localize('chat.modelPicker.pinned', "Pinned") });
				for (const model of pinnedModels) {
					const groupLabel = showGroupLabel
						? getProviderGroupForModel(model, modelToGroup, languageModelsService!).groupName
						: undefined;
					const { action: pinnedAction, ariaDescription: pinnedAriaDesc } = createModelAction(model, selectedModelId, onSelect, undefined, showGroupLabel);
					items.push(createModelItem(pinnedAction, model, openerService, groupLabel, isUBB, pinnedAriaDesc, makePinAction(model), onConfigure));
				}
			}

			// --- 3. Promoted section (selected + recently used + featured) ---
			// MRU excludes pinned models and is limited to 3 entries
			const filteredRecentIds = recentModelIds.filter(id => !pinnedSet.has(id)).slice(0, 3);

			type PromotedItem =
				| { kind: 'available'; model: ILanguageModelChatMetadataAndIdentifier }
				| { kind: 'unavailable'; id: string; entry: IModelControlEntry; reason: 'upgrade' | 'update' | 'admin' };

			const promotedItems: PromotedItem[] = [];

			// Try to place a model by id. Returns true if handled.
			const tryPlaceModel = (id: string): boolean => {
				if (placed.has(id)) {
					return false;
				}
				const model = resolveModel(id);
				if (model && !placed.has(model.identifier)) {
					markPlaced(model.identifier, model.metadata.id);
					const entry = controlModels[model.metadata.id];
					if (entry?.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, entry.minVSCodeVersion)) {
						promotedItems.push({ kind: 'unavailable', id: model.metadata.id, entry, reason: 'update' });
					} else {
						promotedItems.push({ kind: 'available', model });
					}
					return true;
				}
				if (!model) {
					const entry = controlModels[id];
					if (entry && !entry.exists) {
						markPlaced(id);
						promotedItems.push({ kind: 'unavailable', id, entry, reason: getUnavailableReason(entry) });
						return true;
					}
				}
				return false;
			};

			// Selected model
			if (selectedModelId && selectedModelId !== autoModel?.identifier) {
				tryPlaceModel(selectedModelId);
			}

			// Recently used models (filtered to exclude pinned, limited to 3)
			for (const id of filteredRecentIds) {
				tryPlaceModel(id);
			}

			// Non-discount promos are featured without promotional presentation.
			if (showFeatured) {
				for (const model of models) {
					if (model.metadata.promo && !ILanguageModelChatMetadata.hasPromoDiscount(model.metadata)) {
						tryPlaceModel(model.identifier);
					}
				}
			}

			// Featured models from control manifest
			if (showFeatured) {
				for (const [entryId, entry] of Object.entries(controlModels)) {
					if (!entry.featured || placed.has(entryId)) {
						continue;
					}
					const model = resolveModel(entryId);
					if (model && !placed.has(model.identifier)) {
						if (entry.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, entry.minVSCodeVersion)) {
							if (showUnavailableFeatured) {
								markPlaced(model.identifier, model.metadata.id);
								promotedItems.push({ kind: 'unavailable', id: entryId, entry, reason: 'update' });
							}
						} else {
							markPlaced(model.identifier, model.metadata.id);
							promotedItems.push({ kind: 'available', model });
						}
					} else if (!model && !entry.exists) {
						if (showUnavailableFeatured) {
							markPlaced(entryId);
							promotedItems.push({ kind: 'unavailable', id: entryId, entry, reason: getUnavailableReason(entry) });
						}
					}
				}
			}

			// Render promoted section: available first, then sorted alphabetically by name.
			// Promoted models show their provider group name inline only when more
			// than one provider group is configured across all models.
			if (promotedItems.length > 0) {
				if (items.length > 0) {
					items.push({ kind: ActionListItemKind.Separator });
				}
				promotedItems.sort((a, b) => {
					const aAvail = a.kind === 'available' ? 0 : 1;
					const bAvail = b.kind === 'available' ? 0 : 1;
					if (aAvail !== bAvail) {
						return aAvail - bAvail;
					}
					const aName = a.kind === 'available' ? a.model.metadata.name : a.entry.label;
					const bName = b.kind === 'available' ? b.model.metadata.name : b.entry.label;
					return aName.localeCompare(bName);
				});

				for (const item of promotedItems) {
					if (item.kind === 'available') {
						const groupLabel = showGroupLabel
							? getProviderGroupForModel(item.model, modelToGroup, languageModelsService!).groupName
							: undefined;
						const { action: promotedAction, ariaDescription: promotedAriaDesc } = createModelAction(item.model, selectedModelId, onSelect, undefined, showGroupLabel);
						items.push(createModelItem(promotedAction, item.model, openerService, groupLabel, isUBB, promotedAriaDesc, makePinAction(item.model), onConfigure));
					} else {
						items.push(createUnavailableModelItem(item.id, item.entry, item.reason, manageSettingsUrl, updateStateType, chatEntitlementService));
					}
				}
			}

			// --- 3. Other Models (collapsible, grouped by provider group) ---
			otherModels = models.filter(m => !placed.has(m.identifier) && !placed.has(m.metadata.id));

			if (otherModels.length > 0) {
				if (items.length > 0) {
					items.push({ kind: ActionListItemKind.Separator });
				}
				const otherModelsToolbar = manageModelsAction
					? [toAction({ id: manageModelsAction.id, label: manageModelsAction.tooltip ?? manageModelsAction.label, class: ThemeIcon.asClassName(Codicon.gear), run: () => manageModelsAction.run() })]
					: undefined;
				items.push({
					item: {
						id: 'otherModels',
						enabled: true,
						checked: false,
						class: undefined,
						tooltip: localize('chat.modelPicker.otherModels', "Other Models"),
						label: localize('chat.modelPicker.otherModels', "Other Models"),
						run: () => { /* toggle handled by isSectionToggle */ }
					},
					kind: ActionListItemKind.Action,
					label: localize('chat.modelPicker.otherModels', "Other Models"),
					group: { title: '', icon: Codicon.chevronDown },
					hideIcon: false,
					section: ModelPickerSection.Other,
					isSectionToggle: true,
					toolbarActions: otherModelsToolbar,
					className: 'chat-model-picker-section-toggle',
				});

				// Group remaining models by provider group (vendor + user-configured
				// group name). This matches `chatModelsViewModel.getProviderGroupId`,
				// so that BYOK setups with several groups under a single vendor
				// (e.g. multiple `customoai` entries) render as distinct sections.
				interface IProviderGroupBucket {
					vendor: string;
					groupName: string;
					models: ILanguageModelChatMetadataAndIdentifier[];
				}
				const providerGroups = new Map<ProviderGroupKey, IProviderGroupBucket>();
				for (const model of otherModels) {
					const info = getProviderGroupForModel(model, modelToGroup, languageModelsService!);
					const key = getProviderGroupKey(info.vendor, info.groupName);
					let bucket = providerGroups.get(key);
					if (!bucket) {
						bucket = { vendor: info.vendor, groupName: info.groupName, models: [] };
						providerGroups.set(key, bucket);
					}
					bucket.models.push(model);
				}

				// Sort buckets: copilot vendor first, then alphabetically by group name
				const sortedBuckets = [...providerGroups.values()].sort((a, b) => {
					if (a.vendor === 'copilot' && b.vendor !== 'copilot') { return -1; }
					if (b.vendor === 'copilot' && a.vendor !== 'copilot') { return 1; }
					return a.groupName.localeCompare(b.groupName);
				});

				const showGroupHeaders = sortedBuckets.length > 1;

				for (const bucket of sortedBuckets) {
					if (showGroupHeaders) {
						items.push({
							kind: ActionListItemKind.Separator,
							label: bucket.groupName,
							section: ModelPickerSection.Other,
						});
					}

					// Models within a bucket sorted: available first, then alphabetically by name
					const sortedBucketModels = [...bucket.models].sort((a, b) => {
						const aEntry = controlModels[a.metadata.id] ?? controlModels[a.identifier];
						const bEntry = controlModels[b.metadata.id] ?? controlModels[b.identifier];
						const aAvail = aEntry?.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, aEntry.minVSCodeVersion) ? 1 : 0;
						const bAvail = bEntry?.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, bEntry.minVSCodeVersion) ? 1 : 0;
						if (aAvail !== bAvail) { return aAvail - bAvail; }
						return a.metadata.name.localeCompare(b.metadata.name);
					});

					for (const model of sortedBucketModels) {
						const entry = controlModels[model.metadata.id] ?? controlModels[model.identifier];
						if (entry?.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, entry.minVSCodeVersion)) {
							items.push(createUnavailableModelItem(model.metadata.id, entry, 'update', manageSettingsUrl, updateStateType, chatEntitlementService, ModelPickerSection.Other));
						} else {
							const { action: bucketAction, ariaDescription: bucketAriaDesc } = createModelAction(model, selectedModelId, onSelect, ModelPickerSection.Other, showGroupHeaders);
							items.push(createModelItem(bucketAction, model, openerService, undefined, isUBB, bucketAriaDesc, makePinAction(model), onConfigure));
						}
					}
				}
			}
		}

		if (manageModelsAction && !otherModels.length) {
			// No Other Models section: show manage models as standalone
			items.push({ kind: ActionListItemKind.Separator });
			items.push({
				item: manageModelsAction,
				kind: ActionListItemKind.Action,
				label: manageModelsAction.label,
				group: { title: '', icon: Codicon.blank },
				hideIcon: false,
				showAlways: true,
			});
		}
	} else {
		// Flat list: auto first, then all models sorted alphabetically
		const autoModel = models.find(m => isAutoModel(m));
		if (autoModel) {
			const { action: flatAutoAction, ariaDescription: flatAutoAriaDesc } = createModelAction(autoModel, selectedModelId, onSelect);
			items.push(createModelItem(flatAutoAction, autoModel, openerService, undefined, isUBB, flatAutoAriaDesc));
		}
		const sortedModels = models
			.filter(m => m !== autoModel)
			.sort((a, b) => {
				const vendorCmp = a.metadata.vendor.localeCompare(b.metadata.vendor);
				return vendorCmp !== 0 ? vendorCmp : a.metadata.name.localeCompare(b.metadata.name);
			});
		for (const model of sortedModels) {
			const { action: flatAction, ariaDescription: flatAriaDesc } = createModelAction(model, selectedModelId, onSelect);
			items.push(createModelItem(flatAction, model, openerService, undefined, isUBB, flatAriaDesc, undefined, onConfigure));
		}
	}

	return items;
}

export function getModelPickerAccessibilityProvider() {
	return {
		getAriaLabel(element: IActionListItem<IActionWidgetDropdownAction>) {
			if (element.kind !== ActionListItemKind.Action) {
				return null;
			}
			const description = element.ariaDescription ?? (typeof element.description === 'string' ? element.description : element.description?.value);
			return [element.label, element.badge, description].filter((part): part is string => !!part).join(', ');
		},
		isChecked(element: IActionListItem<IActionWidgetDropdownAction>) {
			if (element.isSectionToggle) {
				return undefined;
			}
			// The Trust / Sign in entries are commands, not selectable models, so
			// they expose no checked state.
			if (element.kind === ActionListItemKind.Action && !(element.item?.id && PICKER_COMMAND_ACTION_IDS.has(element.item.id))) {
				return !!element?.item?.checked;
			}
			return undefined;
		},
		getRole: (element: IActionListItem<IActionWidgetDropdownAction>) => {
			if (element.isSectionToggle) {
				return 'menuitem';
			}
			switch (element.kind) {
				// The Trust / Sign in entries are commands, not model choices, so
				// announce them as plain menuitems rather than radios.
				case ActionListItemKind.Action: return element.item?.id && PICKER_COMMAND_ACTION_IDS.has(element.item.id) ? 'menuitem' : 'menuitemradio';
				case ActionListItemKind.Separator: return 'separator';
				default: return 'separator';
			}
		},
		getWidgetRole: () => 'menu',
	} as const;
}

function createUnavailableModelItem(
	id: string,
	entry: IModelControlEntry,
	reason: 'upgrade' | 'update' | 'admin',
	manageSettingsUrl: string | undefined,
	updateStateType: StateType,
	chatEntitlementService: IChatEntitlementService,
	section?: string,
): IActionListItem<IActionWidgetDropdownAction> {
	let description: string | MarkdownString | undefined;

	if (reason === 'upgrade') {
		description = new MarkdownString(localize('chat.modelPicker.upgradeLink', "[Upgrade](command:workbench.action.chat.upgradePlan \" \")"), { isTrusted: true });
	} else if (reason === 'update') {
		description = localize('chat.modelPicker.updateDescription', "Update VS Code");
	} else {
		description = manageSettingsUrl
			? new MarkdownString(localize('chat.modelPicker.adminLink', "[Contact your admin]({0})", manageSettingsUrl), { isTrusted: true })
			: localize('chat.modelPicker.adminDescription', "Contact your admin");
	}

	let hoverContent: MarkdownString;
	if (reason === 'upgrade') {
		hoverContent = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
		if (chatEntitlementService.entitlement === ChatEntitlement.Pro) {
			hoverContent.appendMarkdown(localize('chat.modelPicker.upgradeHoverProPlus', "[Upgrade to GitHub Copilot Pro+](command:workbench.action.chat.upgradePlan \" \") to use the best models."));
		} else {
			hoverContent.appendMarkdown(localize('chat.modelPicker.upgradeHover', "[Upgrade to GitHub Copilot Pro](command:workbench.action.chat.upgradePlan \" \") to use the best models."));
		}
	} else if (reason === 'update') {
		hoverContent = getUpdateHoverContent(updateStateType);
	} else {
		hoverContent = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
		hoverContent.appendMarkdown(localize('chat.modelPicker.adminHover', "This model is not available. Contact your administrator to enable it."));
	}

	return {
		item: {
			id,
			enabled: false,
			checked: false,
			class: undefined,
			tooltip: entry.label,
			label: entry.label,
			description: typeof description === 'string' ? description : undefined,
			run: () => { }
		},
		kind: ActionListItemKind.Action,
		label: entry.label,
		description,
		group: { title: '', icon: ThemeIcon.fromId(Codicon.blank.id) },
		disabled: true,
		hideIcon: false,
		className: 'chat-model-picker-unavailable',
		section,
		hover: { content: hoverContent },
	};
}
