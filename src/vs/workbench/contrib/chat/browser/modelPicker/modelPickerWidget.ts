/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../../base/common/actions.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../common/languageModels.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { localize } from '../../../../../nls.js';
import { MenuId, IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IChatEntitlementService, ChatEntitlement } from '../../common/chatEntitlementService.js';
import { getFlatActionBarActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { ActionListItemKind, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { BaseDropdown, ILabelRenderer } from '../../../../../base/browser/ui/dropdown/dropdown.js';

interface IModelPickerActionItem {
	model: ILanguageModelChatMetadataAndIdentifier;
	isCurrent: boolean;
}

/**
 * Widget for picking a language model for chat.
 */
export class ModelPickerWidget extends BaseDropdown {
	private readonly _onDidChangeModel = this._register(new Emitter<ILanguageModelChatMetadataAndIdentifier>());
	readonly onDidChangeModel = this._onDidChangeModel.event;

	constructor(
		container: HTMLElement,
		labelRenderer: ILabelRenderer,
		private readonly getCurrentModel: () => ILanguageModelChatMetadataAndIdentifier,
		private readonly getModels: () => ILanguageModelChatMetadataAndIdentifier[],
		private readonly setModel: (model: ILanguageModelChatMetadataAndIdentifier) => void,
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(container, { labelRenderer });
	}

	/**
	 * Convert available models to action items for display
	 */
	private getActionItems(): IModelPickerActionItem[] {
		const items: IModelPickerActionItem[] = this.getModels().map(model => ({
			model,
			isCurrent: model.identifier === this.getCurrentModel().identifier
		}));

		return items;
	}

	/**
	 * Get any additional actions to add to the picker menu
	 */
	private getAdditionalActions(): IAction[] {
		const menuActions = this.menuService.createMenu(MenuId.ChatModelPicker, this.contextKeyService);
		const menuContributions = getFlatActionBarActions(menuActions.getActions());
		menuActions.dispose();

		const additionalActions: IAction[] = [];

		// Add menu contributions from extensions
		if (menuContributions.length > 0) {
			additionalActions.push(...menuContributions);
		}

		// Add upgrade option if entitlement is limited
		if (this.chatEntitlementService.entitlement === ChatEntitlement.Limited) {
			additionalActions.push({
				id: 'moreModels',
				label: localize('chat.moreModels', "Add Premium Models"),
				enabled: true,
				tooltip: localize('chat.moreModels.tooltip', "Add premium models"),
				class: undefined,
				run: () => {
					const commandId = 'workbench.action.chat.upgradePlan';
					this.commandService.executeCommand(commandId);
				}
			});
		}

		return additionalActions;
	}

	/**
	 * Shows the picker at the specified anchor
	 */
	override show(): void {
		const actionItems = this.getActionItems();
		const items: IActionListItem<ILanguageModelChatMetadataAndIdentifier>[] = [];

		// Group models by categories
		const modelsByCategory = new Map<string, IModelPickerActionItem[]>();

		// First, group models by their categories
		for (const item of actionItems) {
			const category = item.model.metadata.modelPickerCategory;
			if (!modelsByCategory.has(category.label)) {
				modelsByCategory.set(category.label, []);
			}
			modelsByCategory.get(category.label)!.push(item);
		}

		for (const [categoryLabel, modelsInCategory] of modelsByCategory.entries()) {
			// Skip empty categories
			if (modelsInCategory.length === 0) {
				continue;
			}

			// Add category header
			items.push({
				label: categoryLabel,
				kind: ActionListItemKind.Header,
				canPreview: false,
				disabled: false,
				hideIcon: true,
			} satisfies IActionListItem<ILanguageModelChatMetadataAndIdentifier>);

			// Add models in this category
			for (const item of modelsInCategory) {
				items.push({
					item: item.model,
					description: item.model.metadata.description,
					kind: ActionListItemKind.Action,
					canPreview: false,
					group: { title: '', icon: ThemeIcon.fromId(item.isCurrent ? Codicon.check.id : Codicon.blank.id) },
					disabled: false,
					hideIcon: false,
					label: item.model.metadata.name,
				} satisfies IActionListItem<ILanguageModelChatMetadataAndIdentifier>);
			}

			// Remove this category from the map so we don't process it again
			modelsByCategory.delete(categoryLabel);
		}

		const delegate = {
			onSelect: (item: ILanguageModelChatMetadataAndIdentifier) => {
				if (item.identifier !== this.getCurrentModel().identifier) {
					this.setModel(item);
					this._onDidChangeModel.fire(item);
				}
				this.actionWidgetService.hide(false);
				return true;
			},
			onHide: () => { },
			getWidgetAriaLabel: () => localize('modelPicker', "Model Picker")
		};

		// Get additional actions to show in the picker
		const additionalActions = this.getAdditionalActions();
		let buttonBar: IAction[] = [];

		// If we have additional actions, add them to the button bar
		if (additionalActions.length > 0) {
			buttonBar = additionalActions;
		}

		this.actionWidgetService.show(
			'modelPicker',
			false,
			items,
			delegate,
			this.element,
			undefined,
			buttonBar
		);
	}
}
