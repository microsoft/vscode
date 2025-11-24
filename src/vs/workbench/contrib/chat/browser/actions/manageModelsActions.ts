/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize2 } from '../../../../../nls.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ProductQualityContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../common/languageModels.js';
import { CHAT_CATEGORY } from './chatActions.js';

interface IVendorQuickPickItem extends IQuickPickItem {
	managementCommand?: string;
	vendor: string;
}

interface IModelQuickPickItem extends IQuickPickItem {
	modelId: string;
	vendor: string;
}

export class ManageModelsAction extends Action2 {
	static readonly ID = 'workbench.action.chat.manageLanguageModels';

	constructor() {
		super({
			id: ManageModelsAction.ID,
			title: localize2('manageLanguageModels', 'Manage Language Models...'),
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(ProductQualityContext.isEqualTo('stable'), ChatContextKeys.enabled, ContextKeyExpr.or(
				ChatContextKeys.Entitlement.planFree,
				ChatContextKeys.Entitlement.planPro,
				ChatContextKeys.Entitlement.planProPlus,
				ChatContextKeys.Entitlement.internal
			)),
			f1: true
		});
	}
	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const languageModelsService = accessor.get(ILanguageModelsService);
		const quickInputService = accessor.get(IQuickInputService);
		const commandService = accessor.get(ICommandService);

		const vendors = languageModelsService.getVendors();
		const store = new DisposableStore();

		const quickPickItems: IVendorQuickPickItem[] = vendors.sort((v1, v2) => v1.displayName.localeCompare(v2.displayName)).map(vendor => ({
			label: vendor.displayName,
			vendor: vendor.vendor,
			managementCommand: vendor.managementCommand,
			buttons: vendor.managementCommand ? [{
				iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
				tooltip: `Manage ${vendor.displayName}`
			}] : undefined
		}));

		const quickPick = store.add(quickInputService.createQuickPick<IQuickPickItem>());
		quickPick.title = 'Manage Language Models';
		quickPick.placeholder = 'Select a provider...';
		quickPick.items = quickPickItems;
		quickPick.show();

		store.add(quickPick.onDidAccept(async () => {
			quickPick.hide();
			const selectedItem: IVendorQuickPickItem = quickPick.selectedItems[0] as IVendorQuickPickItem;
			if (selectedItem) {
				const models: ILanguageModelChatMetadataAndIdentifier[] = coalesce((await languageModelsService.selectLanguageModels({ vendor: selectedItem.vendor }, true)).map(modelIdentifier => {
					const modelMetadata = languageModelsService.lookupLanguageModel(modelIdentifier);
					if (!modelMetadata) {
						return undefined;
					}
					return {
						metadata: modelMetadata,
						identifier: modelIdentifier,
					};
				})).sort((m1, m2) => m1.metadata.name.localeCompare(m2.metadata.name));
				await this.showModelSelectorQuickpick(models, quickInputService, languageModelsService);
			}
		}));

		store.add(quickPick.onDidTriggerItemButton(async (event) => {
			const selectedItem = event.item as IVendorQuickPickItem;
			const managementCommand = selectedItem.managementCommand;
			if (managementCommand) {
				commandService.executeCommand(managementCommand, selectedItem.vendor);
			}
		}));

		store.add(quickPick.onDidHide(() => {
			store.dispose();
		}));
	}

	private async showModelSelectorQuickpick(
		modelsAndIdentifiers: ILanguageModelChatMetadataAndIdentifier[],
		quickInputService: IQuickInputService,
		languageModelsService: ILanguageModelsService
	): Promise<void> {
		const store = new DisposableStore();
		const modelItems: IModelQuickPickItem[] = modelsAndIdentifiers.map(model => ({
			label: model.metadata.name,
			detail: model.metadata.id,
			modelId: model.identifier,
			vendor: model.metadata.vendor,
			picked: model.metadata.isUserSelectable
		}));

		if (modelItems.length === 0) {
			store.dispose();
			return;
		}

		const quickPick = quickInputService.createQuickPick<IModelQuickPickItem>();
		quickPick.items = modelItems;
		quickPick.title = 'Manage Language Models';
		quickPick.placeholder = 'Select language models...';
		quickPick.selectedItems = modelItems.filter(item => item.picked);
		quickPick.canSelectMany = true;
		quickPick.show();

		// Handle selection
		store.add(quickPick.onDidAccept(async () => {
			quickPick.hide();
			const items: IModelQuickPickItem[] = quickPick.items as IModelQuickPickItem[];
			items.forEach(item => {
				languageModelsService.updateModelPickerPreference(item.modelId, quickPick.selectedItems.includes(item));
			});
		}));

		store.add(quickPick.onDidHide(() => {
			store.dispose();
		}));
	}
}
