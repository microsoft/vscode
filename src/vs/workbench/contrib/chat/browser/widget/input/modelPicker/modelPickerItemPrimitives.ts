/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, toAction } from '../../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import * as semver from '../../../../../../../base/common/semver/semver.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { ActionListItemKind, IActionListItem } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetDropdownAction } from '../../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { StateType } from '../../../../../../../platform/update/common/update.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../../services/chat/common/chatEntitlementService.js';
import { IModelControlEntry, ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../common/languageModels.js';
import { getModelHoverContent } from './modelPickerHover.js';
import { getPriceCategoryLabel, isMultiplierPricing } from './modelPickerPresentation.js';

export function isVersionAtLeast(current: string, required: string): boolean {
	const currentSemver = semver.coerce(current);
	return !!currentSemver && semver.gte(currentSemver, required);
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

export type ProviderGroupKey = string;

export interface IProviderGroupInfo {
	readonly vendor: string;
	readonly groupName: string;
}

export function getProviderGroupKey(vendor: string, groupName: string): ProviderGroupKey {
	return `${vendor}\u0000${groupName}`;
}

function getVendorDisplayName(languageModelsService: ILanguageModelsService, vendor: string): string {
	if (vendor === 'copilotcli') {
		// @vritant24: This is temporary until we we have 2 distinct vendors for Copilot CLI vs Copilot Chat.
		return localize('chat.modelPicker.copilotGroup', "Copilot");
	}
	const descriptor = languageModelsService.getVendors().find(candidate => candidate.vendor === vendor);
	return descriptor?.displayName ?? vendor.charAt(0).toUpperCase() + vendor.slice(1);
}

export function buildModelToProviderGroupMap(languageModelsService: ILanguageModelsService): Map<string, IProviderGroupInfo> {
	const map = new Map<string, IProviderGroupInfo>();
	for (const vendor of languageModelsService.getVendors()) {
		for (const group of languageModelsService.getLanguageModelGroups(vendor.vendor)) {
			const groupName = group.group?.name ?? vendor.displayName;
			for (const identifier of group.modelIdentifiers) {
				map.set(identifier, { vendor: vendor.vendor, groupName });
			}
		}
	}
	return map;
}

export function getProviderGroupForModel(
	model: ILanguageModelChatMetadataAndIdentifier,
	modelToGroup: Map<string, IProviderGroupInfo>,
	languageModelsService: ILanguageModelsService,
): IProviderGroupInfo {
	if (model.metadata.modelGroup) {
		return { vendor: model.metadata.vendor, groupName: getVendorDisplayName(languageModelsService, model.metadata.modelGroup.id) };
	}
	return modelToGroup.get(model.identifier) ?? {
		vendor: model.metadata.vendor,
		groupName: getVendorDisplayName(languageModelsService, model.metadata.vendor),
	};
}

export function createModelItem(
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
		? getModelHoverContent(model, isUBB, onConfigure ? group => onConfigure(model, group) : undefined, openerService)
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

export function createPinAction(
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

export function createModelAction(
	model: ILanguageModelChatMetadataAndIdentifier,
	selectedModelId: string | undefined,
	onSelect: (model: ILanguageModelChatMetadataAndIdentifier) => void,
	section?: string,
	suppressVendorInDetail?: boolean,
): { action: IActionWidgetDropdownAction & { section?: string }; ariaDescription?: string } {
	const pricingForDescription = isMultiplierPricing(model) ? model.metadata.pricing : undefined;
	const priceCategoryLabel = getPriceCategoryLabel(model.metadata.priceCategory);
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

export function getUnavailableReason(
	entry: IModelControlEntry,
	chatEntitlementService: IChatEntitlementService,
	currentVSCodeVersion: string,
): 'upgrade' | 'update' | 'admin' {
	const businessOrEnterprise = chatEntitlementService.entitlement === ChatEntitlement.Business || chatEntitlementService.entitlement === ChatEntitlement.Enterprise;
	if (!businessOrEnterprise) {
		return 'upgrade';
	}
	return entry.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, entry.minVSCodeVersion) ? 'update' : 'admin';
}

export function createUnavailableModelItem(
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
			run: () => { },
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
