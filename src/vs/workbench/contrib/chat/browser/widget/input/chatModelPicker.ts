/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { getBaseLayerHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { defaultButtonStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { IAction, toAction } from '../../../../../../base/common/actions.js';
import { IStringDictionary } from '../../../../../../base/common/collections.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { renderMarkdown } from '../../../../../../base/browser/markdownRenderer.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { disposableTimeout } from '../../../../../../base/common/async.js';
import { autorun, IObservable } from '../../../../../../base/common/observable.js';
import { formatTokenCount } from '../../../../../../base/common/numbers.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { ActionListItemKind, IActionListHeaderLink, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { TelemetryTrustedValue } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { MANAGE_CHAT_COMMAND_ID } from '../../../common/constants.js';
import { IModelControlEntry, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, IModelsControlManifest } from '../../../common/languageModels.js';
import { ChatEntitlement, chatRequiresSetup, IChatEntitlementService, isProUser } from '../../../../../services/chat/common/chatEntitlementService.js';
import * as semver from '../../../../../../base/common/semver/semver.js';
import { IModelConfigurationAccess, IModelPickerDelegate } from './modelPickerActionItem.js';
import { getModelProviderIcon } from './modelProviderIcons.js';
import { getModelPickerUnavailableReason, ModelPickerUnavailableReason } from './chatModelSelectionLogic.js';
import { CHAT_SETUP_ACTION_ID } from '../../actions/chatActions.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { GitHubPaths, IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IUpdateService, StateType } from '../../../../../../platform/update/common/update.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { withChatInputPickerMotion } from './chatInputPickerActionItem.js';

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
const ModelPickerSection = {
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

/** Storage key remembering that the user dismissed the cache-break hint. */
const CACHE_BREAK_HINT_DISMISSED_STORAGE_KEY = 'chat.cacheBreakHintDismissed';

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

type ChatModelChangeClassification = {
	owner: 'lramos15';
	comment: 'Reporting when the model picker is switched';
	fromModel?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous chat model' };
	toModel: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new chat model' };
	chatSessionId?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The id of the current chat session, used to correlate the model switch with the session.' };
};

type ChatModelChangeEvent = {
	fromModel: string | TelemetryTrustedValue<string> | undefined;
	toModel: string | TelemetryTrustedValue<string>;
	chatSessionId?: string;
};

type ChatModelPickerInteraction = 'disabledModelContactAdminClicked' | 'premiumModelUpgradePlanClicked' | 'otherModelsExpanded' | 'otherModelsCollapsed';

type ChatModelPickerInteractionClassification = {
	owner: 'sandy081';
	comment: 'Reporting interactions in the chat model picker';
	interaction: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model picker interaction that occurred' };
};

type ChatModelPickerInteractionEvent = {
	interaction: ChatModelPickerInteraction;
};

type ChatThinkingEffortChangeClassification = {
	owner: 'lramos15';
	comment: 'Reporting when the thinking effort is changed';
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model the thinking effort was changed for' };
	fromValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous thinking effort value' };
	toValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new thinking effort value' };
};

type ChatThinkingEffortChangeEvent = {
	model: string | TelemetryTrustedValue<string>;
	fromValue: string;
	toValue: string;
};

type ChatContextSizeChangeClassification = {
	owner: 'lramos15';
	comment: 'Reporting when the context window size is changed';
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model the context size was changed for' };
	fromValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous context size value' };
	toValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new context size value' };
};

type ChatContextSizeChangeEvent = {
	model: string | TelemetryTrustedValue<string>;
	fromValue: string;
	toValue: string;
};

/**
 * Returns true if the model uses multiplier-based pricing (e.g. "2x").
 * The copilot extension always sets multiplierNumeric alongside multiplier pricing strings.
 */
function isMultiplierPricing(model: ILanguageModelChatMetadataAndIdentifier): boolean {
	return model.metadata.multiplierNumeric !== undefined;
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

/**
 * Resolves a configuration property from a model's configurationSchema by group.
 * Returns the key, current value (with default fallback), and schema metadata.
 */
function resolveConfigProperty(
	model: ILanguageModelChatMetadataAndIdentifier,
	group: string,
	configAccess: IModelConfigurationAccess,
): { key: string; value: unknown; schema: { enum?: unknown[]; enumItemLabels?: string[]; enumDescriptions?: string[]; default?: unknown } } | undefined {
	const schema = model.metadata.configurationSchema;
	if (!schema?.properties) {
		return undefined;
	}
	const currentConfig = configAccess.getModelConfiguration(model.identifier) ?? {};
	for (const [key, propSchema] of Object.entries(schema.properties)) {
		if (propSchema.group !== group) {
			continue;
		}
		if (!propSchema.enum || propSchema.enum.length < 1) {
			continue;
		}
		const value = currentConfig[key] ?? propSchema.default;
		return { key, value, schema: propSchema };
	}
	return undefined;
}

/**
 * Returns a screen-reader-friendly label for the price category.
 */
function getPriceCategoryLabel(priceCategory: string | undefined): string | undefined {
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

/**
 * Returns true for price categories that should be highlighted with a warning color.
 */
function isHighCostCategory(priceCategory: string | undefined): boolean {
	return priceCategory === 'high' || priceCategory === 'very_high';
}

/**
 * Returns a display label for the model category tag (e.g. "Versatile", "Powerful").
 */
function getCategoryLabel(category: string | undefined): string | undefined {
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
			// Defensive: the metadata `category` is typed as a string, but a
			// provider may supply an unexpected shape (e.g. a grouping object).
			// Never let a bad value crash the entire model picker.
			return typeof category === 'string'
				? category.charAt(0).toUpperCase() + category.slice(1)
				: undefined;
	}
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
	const promoDetail = model.metadata.promo ? localize('chat.promo.discount', "{0}% discount", model.metadata.promo.discountPercent) : undefined;
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

function shouldShowManageModelsAction(chatEntitlementService: IChatEntitlementService): boolean {
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

function createManageModelsAction(commandService: ICommandService): IActionWidgetDropdownAction {
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

			// --- 1b. Promo models (boosted next to Auto) ---
			for (const model of models) {
				if (placed.has(model.identifier) || placed.has(model.metadata.id)) {
					continue;
				}
				if (model.metadata.promo) {
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

type ModelPickerBadge = 'info' | 'warning';

/**
 * A model selection dropdown widget.
 *
 * Renders a button showing the currently selected model name.
 * On click, opens a grouped picker popup with:
 * Auto → Promoted (recently used + curated) → Other Models (collapsed with search).
 *
 * The widget owns its state - set models, selection, and curated IDs via setters.
 * Listen for selection changes via `onDidChangeSelection`.
 */
export class ModelPickerWidget extends Disposable {

	private readonly _onDidChangeSelection = this._register(new Emitter<ILanguageModelChatMetadataAndIdentifier>());
	readonly onDidChangeSelection: Event<ILanguageModelChatMetadataAndIdentifier> = this._onDidChangeSelection.event;

	private _selectedModel: ILanguageModelChatMetadataAndIdentifier | undefined;
	private _badge: ModelPickerBadge | undefined;
	private _compact: IObservable<boolean> | undefined;
	private _workspaceTrustInitialized = false;
	private _activatingAfterTrust = false;
	private readonly _activatingTimer = this._register(new MutableDisposable());

	private _domNode: HTMLElement | undefined;
	private _badgeIcon: HTMLElement | undefined;
	private _nameButton: HTMLElement | undefined;
	private _configButton: HTMLElement | undefined;

	get selectedModel(): ILanguageModelChatMetadataAndIdentifier | undefined {
		return this._selectedModel;
	}

	get domNode(): HTMLElement | undefined {
		return this._domNode;
	}

	get nameButton(): HTMLElement | undefined {
		return this._nameButton;
	}

	constructor(
		private readonly _delegate: IModelPickerDelegate,
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@ICommandService private readonly _commandService: ICommandService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IProductService private readonly _productService: IProductService,
		@IChatEntitlementService private readonly _entitlementService: IChatEntitlementService,
		@IUpdateService private readonly _updateService: IUpdateService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkspaceTrustRequestService private readonly _workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._register(this._languageModelsService.onDidChangeLanguageModels(() => {
			if (this._activatingAfterTrust && this._delegate.getModels().length > 0) {
				this._clearActivating();
			}
			this._renderLabel();
		}));

		// Reflect Restricted Mode immediately when trust changes. When trust is
		// granted but no models are available yet, briefly show an "Activating..."
		// state while the chat extension comes up and loads them, rather than a
		// misleading "Auto" fallback.
		this._register(this._workspaceTrustManagementService.onDidChangeTrust(trusted => {
			if (trusted && (this._delegate.showAutoModel?.() ?? false) && this._delegate.getModels().length === 0) {
				this._activatingAfterTrust = true;
				this._activatingTimer.value = disposableTimeout(() => {
					this._activatingAfterTrust = false;
					this._renderLabel();
				}, 15000);
			} else {
				this._clearActivating();
			}
			this._renderLabel();
		}));

		// Trust reads as untrusted until initialization resolves; gate on it so a
		// trusted workspace doesn't briefly render as restricted at startup.
		this._workspaceTrustManagementService.workspaceTrustInitialized.then(() => {
			if (this._store.isDisposed) {
				return;
			}
			this._workspaceTrustInitialized = true;
			this._renderLabel();
		});

		this._register(this._entitlementService.onDidChangeUsageBasedBilling(() => {
			this._renderLabel();
		}));

		// The setup-required state derives from entitlement / sentiment / anonymous
		// access, so refresh the label when any of those change (e.g. after sign-in).
		this._register(this._entitlementService.onDidChangeEntitlement(() => this._renderLabel()));
		this._register(this._entitlementService.onDidChangeSentiment(() => this._renderLabel()));
		this._register(this._entitlementService.onDidChangeAnonymous(() => this._renderLabel()));

		// Also refresh the label when the per-editor config layer (if any) reports
		// a change. The global service path is already covered above via
		// `onDidChangeLanguageModels` which fires from `setModelConfiguration`.
		if (this._delegate.modelConfiguration?.onDidChange) {
			this._register(this._delegate.modelConfiguration.onDidChange(() => {
				this._renderLabel();
			}));
		}
	}

	setCompact(compact: IObservable<boolean>): void {
		this._compact = compact;
		this._register(autorun(reader => {
			const isCompact = compact.read(reader);
			if (this._domNode) {
				this._domNode.classList.toggle('compact', isCompact);
			}
			this._renderLabel();
		}));
	}

	setSelectedModel(model: ILanguageModelChatMetadataAndIdentifier | undefined): void {
		this._selectedModel = model;
		this._renderLabel();
	}

	setEnabled(enabled: boolean): void {
		if (this._domNode) {
			this._domNode.classList.toggle('disabled', !enabled);
			this._domNode.setAttribute('aria-disabled', String(!enabled));
		}
	}

	setBadge(badge: ModelPickerBadge | undefined): void {
		this._badge = badge;
		this._updateBadge();
	}

	/**
	 * Why the picker currently has no model to offer (untrusted vs. needs
	 * sign-in/setup), or `undefined` when a model is available. See
	 * {@link getModelPickerUnavailableReason}.
	 */
	private _unavailableReason(): ModelPickerUnavailableReason | undefined {
		return getModelPickerUnavailableReason({
			trustInitialized: this._workspaceTrustInitialized,
			trusted: this._workspaceTrustManagementService.isWorkspaceTrusted(),
			pickerModels: this._delegate.getModels(),
			liveModelIds: this._languageModelsService.getLanguageModelIds(),
			requiresSetup: this._requiresSetup(),
		});
	}

	private _requiresSetup(): boolean {
		const sentiment = this._entitlementService.sentiment;
		return chatRequiresSetup({
			completed: !!sentiment.completed,
			disabled: !!sentiment.disabled,
			// Don't derive `untrusted` from sentiment (it lags after a Trust grant): trust is handled
			// authoritatively by the Restricted branch, which runs first, so it's false here.
			untrusted: false,
			entitlement: this._entitlementService.entitlement,
			anonymous: this._entitlementService.anonymous,
			hasByokModels: this._entitlementService.hasByokModels,
		});
	}

	/**
	 * Whether the picker has no usable model specifically because the workspace
	 * is untrusted (Restricted Mode disables the chat model providers).
	 */
	isRestrictedMode(): boolean {
		return this._unavailableReason() === ModelPickerUnavailableReason.Restricted;
	}

	/**
	 * Whether the picker has no usable model because Chat still needs sign-in /
	 * setup (and the workspace is trusted, so it is not Restricted Mode). BYOK
	 * and anonymous access never report this state.
	 */
	isSetupRequired(): boolean {
		return this._unavailableReason() === ModelPickerUnavailableReason.SetupRequired;
	}

	private _clearActivating(): void {
		this._activatingAfterTrust = false;
		this._activatingTimer.clear();
	}

	/**
	 * Prompts the user to trust the workspace. On grant, providers register their
	 * models and `onDidChangeLanguageModels` refreshes the picker.
	 */
	private async _requestWorkspaceTrust(): Promise<void> {
		await this._workspaceTrustRequestService.requestWorkspaceTrust({
			message: localize('chat.modelPicker.trustMessage', "Trusting this workspace enables AI models and chat features.")
		});
	}

	/**
	 * Starts the Chat setup / sign-in flow (same command as the title-bar Sign In
	 * affordance). On completion the entitlement and model registry change, which
	 * refreshes the picker.
	 */
	private _requestSetup(): void {
		this._commandService.executeCommand(CHAT_SETUP_ACTION_ID);
	}

	render(container: HTMLElement): void {
		this._domNode = dom.append(container, dom.$('div.action-label.model-picker-split'));
		this._domNode.setAttribute('role', 'group');
		// The container groups the individual buttons; only the buttons should be
		// tab stops, not the container itself.
		this._domNode.tabIndex = -1;

		// Apply initial collapsed state now that _domNode exists
		if (this._compact?.get()) {
			this._domNode.classList.toggle('compact', true);
		}

		// Model name button
		this._nameButton = dom.append(this._domNode, dom.$('a.model-picker-section.model-picker-name'));
		this._nameButton.tabIndex = 0;
		this._nameButton.setAttribute('role', 'button');
		this._nameButton.setAttribute('aria-haspopup', 'true');
		this._nameButton.setAttribute('aria-expanded', 'false');

		// Combined configuration button (conditionally visible): opens a single
		// dropdown with Thinking Effort and Context Size sections.
		this._configButton = dom.append(this._domNode, dom.$('a.model-picker-section.model-picker-config'));
		this._configButton.tabIndex = 0;
		this._configButton.setAttribute('role', 'button');
		this._configButton.setAttribute('aria-haspopup', 'true');
		this._configButton.setAttribute('aria-expanded', 'false');
		this._configButton.style.display = 'none';

		this._badgeIcon = dom.$('span.model-picker-badge');
		this._updateBadge();

		this._renderLabel();

		this._registerButtonAction(this._nameButton, () => this.show());
		this._registerButtonAction(this._configButton, () => this._showConfigPicker());

		// Managed hover for the combined configuration button
		this._register(getBaseLayerHoverDelegate().setupManagedHover(
			getDefaultHoverDelegate('mouse'),
			this._configButton,
			localize('chat.modelPicker.configTooltip', "Configure Model")
		));
	}

	/**
	 * Registers mouse-down and Enter/Space key handlers on a button element.
	 */
	private _registerButtonAction(element: HTMLElement, action: () => void): void {
		this._register(dom.addDisposableGenericMouseDownListener(element, e => {
			if (e.button !== 0) {
				return;
			}
			dom.EventHelper.stop(e, true);
			action();
		}));
		this._register(dom.addDisposableListener(element, dom.EventType.KEY_DOWN, (e) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				dom.EventHelper.stop(e, true);
				action();
			}
		}));
	}

	/** The "Learn more" header link for cache-break hints; `undefined` when the product has no URL. */
	private getCacheBreakLearnMoreLink(): IActionListHeaderLink | undefined {
		const url = this._productService.defaultChatAgent?.optimizeUsageDocumentationUrl;
		return url ? { label: localize('chat.cacheBreak.learnMore', "Learn more"), uri: URI.parse(url) } : undefined;
	}

	private isCacheBreakHintDismissed(): boolean {
		return this._storageService.getBoolean(CACHE_BREAK_HINT_DISMISSED_STORAGE_KEY, StorageScope.APPLICATION, false);
	}

	private dismissCacheBreakHint(): void {
		this._storageService.store(CACHE_BREAK_HINT_DISMISSED_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
	}

	/**
	 * Whether a picker should show the cache-break hint: the hint has not been
	 * dismissed and the session's cache is warm. When `excludeAutoModel` is
	 * set (the model picker), the hint is suppressed for the Auto model, since
	 * Auto routes each request dynamically so "switching models" does not apply.
	 * The options picker passes `false`: changing reasoning effort / context size
	 * resets the cache even under Auto, which only routes the model.
	 */
	private shouldShowCacheBreakHint(excludeAutoModel: boolean): boolean {
		if (this.isCacheBreakHintDismissed()) {
			return false;
		}
		if (!(this._delegate.isCacheWarm?.() ?? false)) {
			return false;
		}
		if (excludeAutoModel && !!this._selectedModel && isAutoModel(this._selectedModel)) {
			return false;
		}
		return true;
	}

	show(anchor?: HTMLElement): void {
		const anchorElement = anchor ?? this._domNode;
		if (!anchorElement || this._domNode?.classList.contains('disabled')) {
			return;
		}
		if (this._nameButton?.getAttribute('aria-expanded') === 'true') {
			this._actionWidgetService.hide(true);
			return;
		}

		const previousModel = this._selectedModel;

		const onSelect = (model: ILanguageModelChatMetadataAndIdentifier) => {
			this._telemetryService.publicLog2<ChatModelChangeEvent, ChatModelChangeClassification>('chat.modelChange', {
				fromModel: previousModel?.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(previousModel.identifier) : 'unknown',
				toModel: model.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(model.identifier) : 'unknown',
				chatSessionId: this._delegate.getChatSessionId?.()
			});
			this._selectedModel = model;
			this._renderLabel();
			this._onDidChangeSelection.fire(model);
		};

		// Selecting a model from a hover's config button: apply the selection,
		// close the model picker, then open the config picker focused on the
		// requested section (Thinking Effort or Context Size).
		const onConfigure = (model: ILanguageModelChatMetadataAndIdentifier, group: string) => {
			onSelect(model);
			this._actionWidgetService.hide();
			this._showConfigPicker(group);
		};

		const models = this._delegate.getModels();
		const isSignedOut = this._entitlementService.entitlement === ChatEntitlement.Unknown;
		const manifest = this._languageModelsService.getModelsControlManifest();
		// Signed-out users (e.g. offline-BYOK) should not see Copilot control-manifest entries
		const controlModelsForTier: IStringDictionary<IModelControlEntry> = isSignedOut ? {} : getControlModelsForEntitlement(manifest, this._entitlementService.entitlement);
		const canShowManageModelsAction = this._delegate.showManageModelsAction() && shouldShowManageModelsAction(this._entitlementService);
		const manageModelsAction = canShowManageModelsAction ? createManageModelsAction(this._commandService) : undefined;
		const logModelPickerInteraction = (interaction: ChatModelPickerInteraction) => {
			this._telemetryService.publicLog2<ChatModelPickerInteractionEvent, ChatModelPickerInteractionClassification>('chat.modelPickerInteraction', { interaction });
		};
		const manageSettingsUrl = this._defaultAccountService.resolveGitHubUrl(GitHubPaths.copilotSettings);
		const onTogglePin = (modelIdentifier: string, pinned: boolean) => {
			if (pinned) {
				this._languageModelsService.pinModel(modelIdentifier);
			} else {
				this._languageModelsService.unpinModel(modelIdentifier);
			}
			// Re-show the picker to reflect the updated pin state
			this._actionWidgetService.hide();
			this.show(anchorElement);
		};

		const items = buildModelPickerItems(
			models,
			this._selectedModel?.identifier,
			this._languageModelsService.getRecentlyUsedModelIds().filter(id => !this._languageModelsService.isModelHidden(id)),
			this._languageModelsService.getPinnedModelIds().filter(id => !this._languageModelsService.isModelHidden(id)),
			controlModelsForTier,
			this._productService.version,
			this._updateService.state.type,
			onSelect,
			onTogglePin,
			manageSettingsUrl,
			this._delegate.useGroupedModelPicker(),
			manageModelsAction,
			this._entitlementService,
			this._delegate.showUnavailableFeatured(),
			this._delegate.showFeatured(),
			this._languageModelsService,
			this._openerService,
			this._delegate.showAutoModel?.() ?? false,
			onConfigure,
			this.isRestrictedMode(),
			() => { void this._requestWorkspaceTrust(); },
			this.isSetupRequired(),
			() => { this._requestSetup(); },
			!!this._entitlementService.quotas.usageBasedBilling,
		);

		// Collect all hover disposables so they are properly cleaned up when the
		// picker is hidden. The ActionListWidget only tracks the disposable for the
		// currently-shown hover; all other items' hover disposables would leak.
		const hoverDisposables = new DisposableStore();
		for (const item of items) {
			if (item.hover?.disposable) {
				hoverDisposables.add(item.hover.disposable);
			}
		}

		// Hide the filter in the unavailable states (Restricted Mode / setup
		// required): the only entries are the explanatory header and the Trust /
		// Sign In action, so a search field would just let users filter through
		// stale, unusable models. Shown otherwise (it also hosts the secondary
		// heading).
		const unavailable = this.isRestrictedMode() || this.isSetupRequired();
		const showCacheBreakHint = this.shouldShowCacheBreakHint(/* excludeAutoModel */ true);
		const listOptions = withChatInputPickerMotion({
			headerText: showCacheBreakHint ? localize('chat.modelPicker.cacheBreakHint', "Switching models mid-session resets the prompt cache and may increase cost.") : undefined,
			headerIcon: showCacheBreakHint ? Codicon.info : undefined,
			headerLink: showCacheBreakHint ? this.getCacheBreakLearnMoreLink() : undefined,
			headerDismiss: showCacheBreakHint ? () => this.dismissCacheBreakHint() : undefined,
			showFilter: !unavailable,
			filterPlaceholder: localize('chat.modelPicker.search', "Search models"),
			focusFilterOnOpen: true,
			collapsedByDefault: new Set([ModelPickerSection.Other]),
			onDidToggleSection: (section: string, collapsed: boolean) => {
				if (section === ModelPickerSection.Other) {
					logModelPickerInteraction(collapsed ? 'otherModelsCollapsed' : 'otherModelsExpanded');
				}
			},
			linkHandler: (uri: URI) => {
				if (uri.scheme === 'command' && uri.path === 'workbench.action.chat.upgradePlan') {
					logModelPickerInteraction('premiumModelUpgradePlanClicked');
				} else if (manageSettingsUrl && this._uriIdentityService.extUri.isEqual(uri, URI.parse(manageSettingsUrl))) {
					logModelPickerInteraction('disabledModelContactAdminClicked');
				}
				void this._openerService.open(uri, { allowCommands: true });
			},
			minWidth: 200,
		});
		const previouslyFocusedElement = dom.getActiveElement();

		const delegate = {
			onSelect: (action: IActionWidgetDropdownAction) => {
				this._actionWidgetService.hide();
				action.run();
			},
			onHide: () => {
				hoverDisposables.dispose();
				this._nameButton?.setAttribute('aria-expanded', 'false');
				if (dom.isHTMLElement(previouslyFocusedElement)) {
					previouslyFocusedElement.focus();
				}
			}
		};

		this._nameButton?.setAttribute('aria-expanded', 'true');

		this._actionWidgetService.show(
			'ChatModelPicker',
			false,
			items,
			delegate,
			anchorElement,
			undefined,
			[],
			getModelPickerAccessibilityProvider(),
			listOptions
		);

		const activeElement = dom.getActiveElement();
		if (dom.isHTMLInputElement(activeElement) && activeElement.classList.contains('action-list-filter-input')) {
			activeElement.classList.add('chat-model-picker-filter-input');
		}
	}

	private _updateBadge(): void {
		if (this._badgeIcon) {
			if (this._badge) {
				const icon = this._badge === 'info' ? Codicon.info : Codicon.warning;
				dom.reset(this._badgeIcon, renderIcon(icon));
				this._badgeIcon.style.display = '';
				this._badgeIcon.classList.toggle('info', this._badge === 'info');
				this._badgeIcon.classList.toggle('warning', this._badge === 'warning');
			} else {
				this._badgeIcon.style.display = 'none';
			}
		}
	}

	private _renderLabel(): void {
		if (!this._domNode || !this._nameButton) {
			return;
		}

		const { name, statusIcon } = this._selectedModel?.metadata || {};

		// Untrusted workspace: present a normal "Models" placeholder (no badge)
		// rather than a dead-end label; the hover and dropdown carry the Restricted
		// Mode explanation and the Trust Workspace action.
		const restrictedMode = this.isRestrictedMode();

		// Trusted, but Chat still needs sign-in / setup before any model is
		// usable: present the same "Models" placeholder, with the dropdown
		// carrying a Sign In action instead of a misleading "Auto".
		const setupRequired = this.isSetupRequired();
		const unavailable = restrictedMode || setupRequired;

		// Just after Trust, models load asynchronously while the chat extension
		// activates. Show a transient "Activating..." state — only when there is
		// nothing else to display — instead of a misleading "Auto" fallback.
		const activating = !unavailable && this._activatingAfterTrust && this._delegate.getModels().length === 0;

		// Generic empty state (e.g. an agent-host session with no Auto fallback);
		// not evaluated while unavailable/activating, which take precedence.
		const genericNoModels = !unavailable && !activating
			&& !(this._delegate.showAutoModel?.() ?? false)
			&& this._delegate.getModels().length === 0;
		const noModelsAvailable = unavailable || activating || genericNoModels;

		// --- Name section ---
		const nameChildren: (HTMLElement | string)[] = [];
		const modelIcon = this._selectedModel ? getModelProviderIcon(this._selectedModel, this._delegate.useGenericModelIcon?.()) : undefined;
		const compact = this._compact?.get() ?? false;
		if (modelIcon && !noModelsAvailable) {
			nameChildren.push(renderIcon(modelIcon));
		}
		if (statusIcon && !noModelsAvailable) {
			nameChildren.push(renderIcon(statusIcon));
		}
		const modelLabel = unavailable
			? localize('chat.modelPicker.modelsLabel', "Models")
			: activating
				? localize('chat.modelPicker.activating', "Activating...")
				: genericNoModels
					? localize('chat.modelPicker.noModels', "No models available")
					: (name ?? localize('chat.modelPicker.auto', "Auto"));
		if (!compact || !modelIcon || noModelsAvailable) {
			nameChildren.push(dom.$('span.chat-input-picker-label', undefined, modelLabel));
		}
		if (this._badgeIcon) {
			nameChildren.push(this._badgeIcon);
		}
		dom.reset(this._nameButton, ...nameChildren);

		// --- Combined config section (Thinking Effort + Context Size) ---
		const effortConfig = this._getConfigProperty('navigation');
		const tokensConfig = this._getConfigProperty('tokens');
		if (this._configButton) {
			if (!compact && this._selectedModel && !noModelsAvailable && (effortConfig || tokensConfig)) {
				const labelParts: string[] = [];
				const ariaParts: string[] = [];
				if (effortConfig) {
					const enumIndex = effortConfig.schema.enum?.indexOf(effortConfig.value) ?? -1;
					const effortLabel = enumIndex >= 0 && effortConfig.schema.enumItemLabels?.[enumIndex]
						? effortConfig.schema.enumItemLabels[enumIndex]
						: String(effortConfig.value);
					labelParts.push(effortLabel);
					ariaParts.push(localize('chat.modelPicker.effortAriaLabel', "Thinking Effort: {0}", effortLabel));
				}
				if (tokensConfig) {
					const idx = tokensConfig.schema.enum?.indexOf(tokensConfig.value) ?? -1;
					const tokensLabel = idx >= 0 && tokensConfig.schema.enumItemLabels?.[idx]
						? tokensConfig.schema.enumItemLabels[idx]
						: formatTokenCount(Number(tokensConfig.value));
					labelParts.push(tokensLabel);
					ariaParts.push(localize('chat.modelPicker.tokensAriaLabel', "Context Size: {0}", tokensLabel));
				}
				dom.reset(this._configButton, dom.$('span.chat-input-picker-label', undefined, labelParts.join(' ')));
				this._configButton.style.display = '';
				this._configButton.ariaLabel = ariaParts.join(', ');
			} else {
				this._configButton.style.display = 'none';
			}
		}

		// Aria — name the control "Models" to match the visible label; the comma
		// separates the control name from its current value / state.
		const ariaLabel = restrictedMode
			? localize('chat.modelPicker.ariaLabelRestricted', "Models, unavailable while in Restricted mode")
			: setupRequired
				? localize('chat.modelPicker.ariaLabelSetupRequired', "Models, sign in to use Copilot")
				: localize('chat.modelPicker.ariaLabel', "Models, {0}", modelLabel);
		this._domNode.ariaLabel = ariaLabel;
		this._nameButton.ariaLabel = ariaLabel;
	}

	/**
	 * Per-editor model configuration access when the delegate provides it,
	 * otherwise the global service. Routing through this keeps configuration
	 * (e.g. context size) scoped to this editor so changes do not sync to other
	 * already-open editors. See issue #320393.
	 */
	private get _modelConfiguration(): IModelConfigurationAccess {
		return this._delegate.modelConfiguration ?? this._languageModelsService;
	}

	private _getConfigProperty(group: string) {
		if (!this._selectedModel) {
			return undefined;
		}
		return resolveConfigProperty(this._selectedModel, group, this._modelConfiguration);
	}

	/**
	 * Builds the combined configuration items containing the model's Thinking
	 * Effort and Context Size options (when available).
	 */
	private _buildConfigItems(): IActionListItem<IActionWidgetDropdownAction>[] {
		if (!this._selectedModel) {
			return [];
		}

		const modelIdentifier = this._selectedModel.identifier;
		const items: IActionListItem<IActionWidgetDropdownAction>[] = [];
		const defaultLabel = localize('models.configDefault', "Default");

		// Builds a header + radio options for one configurable group (effort or context size).
		const appendConfigSection = (
			group: string,
			headerLabel: string,
			formatValueLabel: (value: unknown, enumLabel: string | undefined) => string,
			logChange: (value: unknown, previousValue: string) => void,
		): void => {
			const config = this._getConfigProperty(group);
			if (!config) {
				return;
			}
			const previousValue = String(config.value ?? '');
			const enumValues = config.schema.enum ?? [];
			const enumItemLabels = config.schema.enumItemLabels;
			if (items.length) {
				items.push({ kind: ActionListItemKind.Separator });
			}
			items.push({ kind: ActionListItemKind.Header, label: headerLabel });
			for (let index = 0; index < enumValues.length; index++) {
				const value = enumValues[index];
				const isDefault = value === config.schema.default;
				const displayLabel = formatValueLabel(value, enumItemLabels?.[index]);
				const enumDescription = config.schema.enumDescriptions?.[index];
				// Only the default value shows a right-aligned "Default" label. The
				// per-option descriptions are surfaced on hover (tooltip) instead of
				// being shown inline in the picker.
				const description = isDefault ? defaultLabel : undefined;
				// The visual description is hover-only, so build a separate accessible
				// description so screen reader users still hear the default marker and
				// the per-option explanation.
				const ariaDescriptionParts: string[] = [];
				if (isDefault) {
					ariaDescriptionParts.push(defaultLabel);
				}
				if (enumDescription) {
					ariaDescriptionParts.push(enumDescription);
				}
				const ariaDescription = ariaDescriptionParts.length ? ariaDescriptionParts.join(', ') : undefined;
				const checked = config.value === value;
				items.push({
					item: {
						id: `${group}.${value}`,
						enabled: true,
						checked,
						class: undefined,
						tooltip: enumDescription ?? '',
						label: displayLabel,
						run: () => {
							logChange(value, previousValue);
							// Write through the same (possibly per-editor) access used for
							// reading so the change is reflected back in the UI. See #320393.
							// Return the promise so callers can await the write before
							// refreshing the checked state.
							return this._modelConfiguration.setModelConfiguration(modelIdentifier, { [config.key]: value });
						}
					},
					kind: ActionListItemKind.Action,
					label: displayLabel,
					description,
					ariaDescription,
					hover: enumDescription ? { content: enumDescription } : undefined,
					group: { title: '', icon: ThemeIcon.fromId(checked ? Codicon.check.id : Codicon.blank.id) },
					hideIcon: false,
				});
			}
		};

		// --- Thinking Effort ---
		appendConfigSection(
			'navigation',
			localize('chat.effort.header', "Thinking Effort"),
			(value, enumLabel) => enumLabel ?? String(value),
			(value, previousValue) => {
				this._telemetryService.publicLog2<ChatThinkingEffortChangeEvent, ChatThinkingEffortChangeClassification>('chat.thinkingEffortChange', {
					model: this._selectedModel?.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(modelIdentifier) : 'unknown',
					fromValue: previousValue,
					toValue: String(value),
				});
			},
		);

		// --- Context Size ---
		appendConfigSection(
			'tokens',
			localize('chat.tokens.header', "Context Size"),
			(value, enumLabel) => enumLabel ?? formatTokenCount(Number(value)),
			(value, previousValue) => {
				this._telemetryService.publicLog2<ChatContextSizeChangeEvent, ChatContextSizeChangeClassification>('chat.contextSizeChange', {
					model: this._selectedModel?.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(modelIdentifier) : 'unknown',
					fromValue: previousValue,
					toValue: String(value),
				});
			},
		);

		// Nothing configurable for this model returns an empty list; callers
		// decide whether to show the popup.
		return items;
	}

	/**
	 * Opens the combined configuration dropdown containing the model's Thinking
	 * Effort and Context Size options (when available), in a single popup anchored
	 * to the config button. When `focusGroup` is provided, focus is moved to the
	 * first option of that section (e.g. 'navigation' for Thinking Effort or
	 * 'tokens' for Context Size).
	 */
	private _showConfigPicker(focusGroup?: string): void {
		if (this._domNode?.classList.contains('disabled') || !this._configButton || !this._selectedModel) {
			return;
		}

		const items = this._buildConfigItems();

		// Nothing configurable for this model: don't show an empty popup.
		if (!items.length) {
			return;
		}

		const previouslyFocusedElement = dom.getActiveElement();
		const delegate = {
			onSelect: async (action: IActionWidgetDropdownAction) => {
				// The config picker stays open until dismissed so users can adjust
				// multiple options. Focus the clicked item immediately so the focus
				// highlight doesn't flicker while waiting for the async config write,
				// then refresh in place keeping focus on the just-selected item.
				this._actionWidgetService.focusItemById(action.id);
				// Wait for the (async) config write to resolve so the rebuilt items
				// read back the new value before refreshing.
				await action.run();
				this._actionWidgetService.updateItems(this._buildConfigItems(), action.id);
			},
			onHide: () => {
				this._configButton?.setAttribute('aria-expanded', 'false');
				if (dom.isHTMLElement(previouslyFocusedElement)) {
					previouslyFocusedElement.focus();
				}
			}
		};

		this._configButton.setAttribute('aria-expanded', 'true');

		const showCacheBreakHint = this.shouldShowCacheBreakHint(/* excludeAutoModel */ false);

		this._actionWidgetService.show(
			'ChatModelConfigPicker',
			false,
			items,
			delegate,
			this._configButton,
			undefined,
			[],
			{
				isChecked(element: IActionListItem<IActionWidgetDropdownAction>) {
					return element.kind === ActionListItemKind.Action ? !!element?.item?.checked : undefined;
				},
				getRole: (element: IActionListItem<IActionWidgetDropdownAction>) => element.kind === ActionListItemKind.Action ? 'menuitemradio' as const : 'separator' as const,
				getWidgetRole: () => 'menu' as const,
			},
			withChatInputPickerMotion({
				headerText: showCacheBreakHint ? localize('chat.config.cacheBreakHint', "Changing these options mid-session resets the prompt cache and may increase cost.") : undefined,
				headerIcon: showCacheBreakHint ? Codicon.info : undefined,
				headerLink: showCacheBreakHint ? this.getCacheBreakLearnMoreLink() : undefined,
				headerDismiss: showCacheBreakHint ? () => this.dismissCacheBreakHint() : undefined,
			})
		);

		// Focus the requested section's first option (e.g. when opened from a
		// model hover's Thinking Effort / Context Size button).
		if (focusGroup) {
			const groupItem = items.find(item => item.kind === ActionListItemKind.Action && item.item?.id?.startsWith(`${focusGroup}.`));
			if (groupItem?.kind === ActionListItemKind.Action && groupItem.item) {
				this._actionWidgetService.focusItemById(groupItem.item.id);
			}
		}
	}
}


/**
 * Configuration property groups the config picker can render and focus.
 * Hover "configure" buttons must be limited to these so they never deep-link
 * into a section that `_showConfigPicker` cannot build (see `_buildConfigItems`).
 */
const SUPPORTED_CONFIG_GROUPS: readonly string[] = ['navigation', 'tokens'];

export function getModelHoverContent(model: ILanguageModelChatMetadataAndIdentifier, isUBB: boolean | undefined, onConfigure: ((group: string) => void) | undefined, openerService: IOpenerService): { element: HTMLElement; disposable: DisposableStore } | undefined {
	const isAuto = isAutoModel(model);
	const container = dom.$('.chat-model-hover');
	const disposables = new DisposableStore();

	// --- Title row: model name + category tag + price/discount badge (top-right) ---
	const titleRow = dom.$('.chat-model-hover-title-row');
	titleRow.appendChild(dom.$('.chat-model-hover-name', undefined, model.metadata.name));
	const tags = dom.$('.chat-model-hover-title-tags');
	const categoryLabel = !isAuto && !model.metadata.promo ? getCategoryLabel(model.metadata.category) : undefined;
	if (categoryLabel) {
		tags.appendChild(dom.$('span.chat-model-hover-category', undefined, categoryLabel));
	}
	const priceCategoryLabel = !isAuto ? getPriceCategoryLabel(model.metadata.priceCategory) : undefined;
	const badgeLabel = isAuto ? model.metadata.detail : priceCategoryLabel;
	if (badgeLabel) {
		const badge = dom.$('span.chat-model-hover-price-badge', undefined, badgeLabel);
		if (!isAuto && isHighCostCategory(model.metadata.priceCategory)) {
			badge.classList.add('high-cost');
		}
		tags.appendChild(badge);
	}
	// When a model carries a promo discount, show a discount pill alongside the price category.
	if (!isAuto && model.metadata.promo) {
		const discountLabel = localize('chat.promo.discountBadge', "{0}% discount", model.metadata.promo.discountPercent);
		tags.appendChild(dom.$('span.chat-model-hover-price-badge', undefined, discountLabel));
	}
	if (tags.childElementCount > 0) {
		titleRow.appendChild(tags);
	}
	container.appendChild(titleRow);

	// --- Warning text ---
	if (!isAuto && model.metadata.warningText) {
		const warningMessages = Object.values(model.metadata.warningText);
		for (const message of warningMessages) {
			const warningContainer = dom.$('.chat-model-hover-warning-text');
			warningContainer.appendChild(renderIcon(Codicon.warning));
			const warningMd = new MarkdownString(message, { isTrusted: false, supportThemeIcons: true });
			const rendered = disposables.add(renderMarkdown(warningMd, {
				actionHandler: (link: string) => { void openerService.open(link, { allowCommands: false, fromUserGesture: true }); },
			}));
			warningContainer.appendChild(rendered.element);
			container.appendChild(warningContainer);
		}
	}

	// --- Promo info ---
	if (!isAuto && model.metadata.promo) {
		const promoContainer = dom.$('.chat-model-hover-promo-text');
		promoContainer.appendChild(renderIcon(Codicon.info));
		const endsAtDate = new Date(model.metadata.promo.endsAt);
		const formattedDate = endsAtDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
		const promoMessage = model.metadata.promo.message + ' ' + localize('chat.promo.endsAt', "Ends {0}.", formattedDate);
		const promoMd = new MarkdownString(promoMessage, { isTrusted: false, supportThemeIcons: true });
		const rendered = disposables.add(renderMarkdown(promoMd, {
			actionHandler: (link: string) => { void openerService.open(link, { allowCommands: false, fromUserGesture: true }); },
		}));
		promoContainer.appendChild(rendered.element);
		container.appendChild(promoContainer);
	}

	// --- Cost info ---
	let costInfoRendered = false;
	let costTableRendered = false;
	if (!isAuto && isUBB) {
		const metrics: { label: string; def: number | null | undefined; long: number | null | undefined }[] = [
			{ label: localize('models.inputCostLabel', "Input"), def: model.metadata.inputCost, long: model.metadata.longContextInputCost },
			{ label: localize('models.outputCostLabel', "Output"), def: model.metadata.outputCost, long: model.metadata.longContextOutputCost },
			{ label: localize('models.cacheCostLabel', "Cache Read"), def: model.metadata.cacheCost, long: model.metadata.longContextCacheCost },
			{ label: localize('models.cacheWriteCostLabel', "Cache Write"), def: model.metadata.cacheWriteCost, long: model.metadata.longContextCacheWriteCost },
		].filter(m => m.def !== undefined || m.long !== undefined);

		if (metrics.length > 0) {
			// Show the long-context column whenever any metric has a long-context price.
			const hasLongContext = metrics.some(m => m.long !== undefined);

			const table = dom.$('.chat-model-hover-cost-table');
			if (hasLongContext) {
				container.classList.add('has-long-context');
				table.classList.add('has-long-context');
			}

			// Each row paints a single continuous dotted line behind its cells (see CSS); the
			// right-aligned number has an opaque background that masks the line so the dots read
			// as one continuous leader from the label to the number.
			const appendValueCell = (row: HTMLElement, cost: number | null | undefined): void => {
				if (cost === undefined) {
					row.appendChild(dom.$('span.chat-model-hover-cost-value.empty'));
					return;
				}
				row.appendChild(dom.$('span.chat-model-hover-cost-value', undefined,
					dom.$('span.chat-model-hover-cost-number', undefined,
						typeof cost === 'number' ? String(cost) : localize('models.cost.unknown', "Unknown")),
				));
			};

			// Header row: "Credits Per 1M Tokens" heading + (when long context) Default / Long Context labels
			const headerRow = dom.$('.chat-model-hover-cost-row.header');
			headerRow.appendChild(dom.$('span.chat-model-hover-cost-heading', undefined, localize('models.creditsPerMillionTokens', "Credits Per 1M Tokens")));
			if (hasLongContext) {
				headerRow.appendChild(dom.$('span.chat-model-hover-cost-value.subheader', undefined, localize('models.defaultContext', "Default")));
				headerRow.appendChild(dom.$('span.chat-model-hover-cost-value.subheader', undefined, localize('models.longContext', "Long Context")));
			} else {
				// Placeholder so the header occupies the full row and grid columns stay aligned.
				headerRow.appendChild(dom.$('span.chat-model-hover-cost-value.subheader'));
			}
			table.appendChild(headerRow);

			// Cost rows: label on the left, a continuous dotted line, then right-aligned credit value(s)
			for (const metric of metrics) {
				const row = dom.$('.chat-model-hover-cost-row');
				const labelCell = dom.$('.chat-model-hover-cost-label');
				labelCell.appendChild(dom.$('span.chat-model-hover-cost-label-text', undefined, metric.label));
				row.appendChild(labelCell);
				appendValueCell(row, metric.def);
				if (hasLongContext) {
					appendValueCell(row, metric.long);
				}
				table.appendChild(row);
			}

			container.appendChild(table);
			costTableRendered = true;
			costInfoRendered = true;
		} else if (model.metadata.pricing && (isMultiplierPricing(model) || !priceCategoryLabel)) {
			// No per-token credit table for this model: surface the pricing string
			// (e.g. a "2x" multiplier for PRU models) in the hover instead of the
			// credit cost breakdown table.
			const costSection = dom.$('.chat-model-hover-cost');
			costSection.appendChild(dom.$('span', undefined, localize('models.cost', 'Cost: {0}', model.metadata.pricing)));
			container.appendChild(costSection);
			costInfoRendered = true;
		}
	} else if (!isAuto && model.metadata.pricing) {
		// Non-UBB (PRU): usage is not billed in credits, so the per-token credit
		// table does not apply. Surface the pricing string (e.g. a "2x"
		// multiplier) in the hover instead.
		const costSection = dom.$('.chat-model-hover-cost');
		costSection.appendChild(dom.$('span', undefined, localize('models.cost', 'Cost: {0}', model.metadata.pricing)));
		container.appendChild(costSection);
		costInfoRendered = true;
	}

	// --- Description fallback ---
	// When there's no cost data to show (Auto, or any model without pricing), fill
	// the cost region with the model's tooltip text. Rendered as markdown so links
	// like Auto's "Learn More" work.
	if (!costInfoRendered && model.metadata.tooltip) {
		const descriptionMd = new MarkdownString(model.metadata.tooltip, { supportThemeIcons: true });
		const rendered = disposables.add(renderMarkdown(descriptionMd, {
			actionHandler: (link: string) => { void openerService.open(link, { allowCommands: false, fromUserGesture: true }); },
		}));
		rendered.element.classList.add('chat-model-hover-description');
		container.appendChild(rendered.element);
	}

	// --- Context size (only when not already shown in the cost table) ---
	if (!isAuto && !costTableRendered && (model.metadata.maxInputTokens || model.metadata.maxOutputTokens)) {
		const totalTokens = (model.metadata.maxInputTokens ?? 0) + (model.metadata.maxOutputTokens ?? 0);
		const contextSection = dom.$('.chat-model-hover-context');
		contextSection.appendChild(dom.$('.chat-model-hover-context-label', undefined, localize('models.contextSize', "Max context")));
		contextSection.appendChild(dom.$('.chat-model-hover-context-value', undefined, formatTokenCount(totalTokens)));
		container.appendChild(contextSection);
	}

	// --- Configurable properties ---
	if (!isAuto && model.metadata.configurationSchema?.properties) {
		const configButtons: { group: string; label: string }[] = [];
		const seenGroups = new Set<string>();
		for (const [, propSchema] of Object.entries(model.metadata.configurationSchema.properties)) {
			if (propSchema.enum && propSchema.enum.length >= 2 && propSchema.group && SUPPORTED_CONFIG_GROUPS.includes(propSchema.group) && !seenGroups.has(propSchema.group)) {
				const label = propSchema.title ?? propSchema.description;
				if (label) {
					seenGroups.add(propSchema.group);
					configButtons.push({ group: propSchema.group, label });
				}
			}
		}
		if (configButtons.length > 0) {
			const configRow = dom.$('.chat-model-hover-configurable');
			configRow.appendChild(dom.$('span.chat-model-hover-configurable-label', undefined, localize('models.configurable', "Configurable")));
			const buttonsContainer = dom.$('.chat-model-hover-configurable-buttons');
			for (const { group, label } of configButtons) {
				const button = disposables.add(new Button(buttonsContainer, {
					...defaultButtonStyles,
					secondary: true,
					title: label,
				}));
				button.label = label;
				disposables.add(button.onDidClick(() => onConfigure?.(group)));
			}
			configRow.appendChild(buttonsContainer);
			container.appendChild(configRow);
		}
	}

	return container.children.length > 0 ? { element: container, disposable: disposables } : undefined;
}


function isAutoModel(model: ILanguageModelChatMetadataAndIdentifier): boolean {
	return model.metadata.id === 'auto';
}
