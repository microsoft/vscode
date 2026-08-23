/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../../../../base/common/collections.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { ActionListItemKind, IActionListItem } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetDropdownAction } from '../../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { ChatEntitlement, IChatEntitlementService, isProUser } from '../../../../../../services/chat/common/chatEntitlementService.js';
import { MANAGE_CHAT_COMMAND_ID } from '../../../../common/constants.js';
import { IModelControlEntry, ILanguageModelChatMetadataAndIdentifier, IModelsControlManifest } from '../../../../common/languageModels.js';
import { buildFlatModelItems, buildGroupedModelItems, buildUnavailableStateItems, RESTRICTED_MODE_TRUST_ACTION_ID, SETUP_REQUIRED_SIGN_IN_ACTION_ID } from './modelPickerItemSections.js';
import type { IBuildModelPickerItemsOptions } from './modelPickerItemTypes.js';

export type { IBuildModelPickerItemsOptions } from './modelPickerItemTypes.js';
export { ModelPickerSection } from './modelPickerItemSections.js';

const PICKER_COMMAND_ACTION_IDS: ReadonlySet<string> = new Set([RESTRICTED_MODE_TRUST_ACTION_ID, SETUP_REQUIRED_SIGN_IN_ACTION_ID]);

export function getControlModelsForEntitlement(manifest: IModelsControlManifest, entitlement: ChatEntitlement): IStringDictionary<IModelControlEntry> {
	return isProUser(entitlement) && entitlement !== ChatEntitlement.EDU ? manifest.paid : manifest.free;
}

export function getModelPickerControlModels(
	manifest: IModelsControlManifest,
	entitlement: ChatEntitlement,
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
): IStringDictionary<IModelControlEntry> {
	if (entitlement !== ChatEntitlement.Unknown) {
		return getControlModelsForEntitlement(manifest, entitlement);
	}

	const availableModelIds = new Set(models
		.filter(model => !model.metadata.isBYOK && !model.metadata.byokModelIdentifier && !!model.metadata.targetChatSessionType)
		.map(model => model.metadata.id));
	const controlModels: IStringDictionary<IModelControlEntry> = {};
	for (const tier of [manifest.free, manifest.paid]) {
		for (const [id, entry] of Object.entries(tier)) {
			if (entry.featured && availableModelIds.has(id)) {
				controlModels[id] = { ...entry, exists: true };
			}
		}
	}
	return controlModels;
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
		run: () => { commandService.executeCommand(MANAGE_CHAT_COMMAND_ID); },
	};
}

/** Builds the ordered model picker sections for the current presentation state. */
export function buildModelPickerItems(options: IBuildModelPickerItemsOptions): IActionListItem<IActionWidgetDropdownAction>[] {
	const unavailableItems = buildUnavailableStateItems(options);
	if (unavailableItems) {
		return unavailableItems;
	}
	return options.presentation.useGroupedModelPicker
		? buildGroupedModelItems(options)
		: buildFlatModelItems(options);
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
			if (element.kind === ActionListItemKind.Action && !(element.item?.id && PICKER_COMMAND_ACTION_IDS.has(element.item.id))) {
				return !!element.item?.checked;
			}
			return undefined;
		},
		getRole: (element: IActionListItem<IActionWidgetDropdownAction>) => {
			if (element.isSectionToggle) {
				return 'menuitem';
			}
			switch (element.kind) {
				case ActionListItemKind.Action:
					return element.item?.id && PICKER_COMMAND_ACTION_IDS.has(element.item.id) ? 'menuitem' : 'menuitemradio';
				case ActionListItemKind.Separator:
				default:
					return 'separator';
			}
		},
		getWidgetRole: () => 'menu',
	} as const;
}
