/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from './languageModels.js';

export interface IBYOKService {
	_serviceBrand: undefined;
	showBYOKQuickPick(): Promise<void>;
}
export const IBYOKService = createDecorator<IBYOKService>('IBYOKService');

interface IVendorQuickPickItem extends IQuickPickItem {
	managementCommand?: string; // Command to manage the vendor, e.g., "ollama
	vendor: string;
}

interface IModelQuickPickItem extends IQuickPickItem {
	modelId: string;
	vendor: string;
	picked?: boolean;
}


export class BYOKService implements IBYOKService {
	readonly _serviceBrand: undefined;

	constructor(
		// @ts-ignore
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		// @ts-ignore
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		// @ts-ignore
		@IStorageService private readonly storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService
	) {
		console.log('BYOKService initialized');
	}

	async showBYOKQuickPick(): Promise<void> {
		const vendors = this.languageModelsService.getVendors();

		const quickPickItems: IVendorQuickPickItem[] = vendors.map(vendor => ({
			label: vendor.displayName,
			vendor: vendor.vendor,
			managementCommand: vendor.managementCommand,
			buttons: vendor.managementCommand ? [{
				iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
				tooltip: `Manage ${vendor.displayName}`
			}] : undefined
		}));

		const quickPick = this.quickInputService.createQuickPick<IQuickPickItem>();
		quickPick.title = 'Manage Language Models';
		quickPick.placeholder = 'Select a provider...';
		quickPick.items = quickPickItems;
		quickPick.show();

		// Handle selection
		quickPick.onDidAccept(async () => {
			const selectedItem: IVendorQuickPickItem = quickPick.selectedItems[0] as IVendorQuickPickItem;
			if (selectedItem) {
				console.log('Selected vendor:', selectedItem.vendor);
				const models = coalesce((await this.languageModelsService.selectLanguageModels({ vendor: selectedItem.vendor })).map(m => this.languageModelsService.lookupLanguageModel(m)));
				await this._showModelSelectorQuickpick(models);
			}
			quickPick.dispose();
		});

		quickPick.onDidTriggerItemButton(async (event) => {
			const managementCommand = (event.item as IVendorQuickPickItem).managementCommand;
			if (managementCommand) {
				this.commandService.executeCommand(managementCommand);
			}
		});

		quickPick.onDidHide(() => {
			quickPick.dispose();
		});
	}

	private async _showModelSelectorQuickpick(models: ILanguageModelChatMetadata[]): Promise<void> {
		const modelItems: IModelQuickPickItem[] = models.map(model => ({
			label: model.name,
			detail: model.id,
			modelId: model.id,
			vendor: model.vendor,
			picked: model.isUserSelectable // You can set this to true to pre-select items
		}));

		const quickPick = this.quickInputService.createQuickPick<IModelQuickPickItem>();
		quickPick.title = 'Manage Language Models';
		quickPick.placeholder = 'Select language models...';
		quickPick.canSelectMany = true;
		quickPick.items = modelItems;
		quickPick.show();

		// Handle selection
		quickPick.onDidAccept(async () => {
			const selectedModels: IModelQuickPickItem[] = quickPick.selectedItems as IModelQuickPickItem[];
			if (selectedModels.length > 0) {
				console.log('Selected models:', selectedModels.map(m => ({ id: m.modelId, vendor: m.vendor })));
				// Here you can implement logic to handle the selected models
				// For example, save them to storage or update some configuration
			}
			quickPick.dispose();
		});

		quickPick.onDidHide(() => {
			quickPick.dispose();
		});
	}
}
