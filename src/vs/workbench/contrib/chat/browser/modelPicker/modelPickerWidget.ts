/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../../base/common/actions.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IAnchor } from '../../../../../base/browser/ui/contextview/contextview.js';
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

interface IModelPickerActionItem {
	model: ILanguageModelChatMetadataAndIdentifier;
	isCurrent: boolean;
}

/**
 * Widget for picking a language model for chat.
 */
export class ModelPickerWidget extends Disposable {
	private readonly _onDidChangeModel = this._register(new Emitter<ILanguageModelChatMetadataAndIdentifier>());
	readonly onDidChangeModel = this._onDidChangeModel.event;

	constructor(
		private currentModel: ILanguageModelChatMetadataAndIdentifier,
		private readonly getModels: () => ILanguageModelChatMetadataAndIdentifier[],
		private readonly setModel: (model: ILanguageModelChatMetadataAndIdentifier) => void,
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
	}

	/**
	 * Get the label to display in the button that shows the current model
	 */
	get buttonLabel(): string {
		return this.currentModel.metadata.name;
	}

	/**
	 * Convert available models to action items for display
	 */
	private getActionItems(): IModelPickerActionItem[] {
		const items: IModelPickerActionItem[] = this.getModels().map(model => ({
			model,
			isCurrent: model.identifier === this.currentModel.identifier
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
	showAt(anchor: IAnchor, container?: HTMLElement): void {
		const items: IActionListItem<ILanguageModelChatMetadataAndIdentifier>[] = this.getActionItems().map(item => ({
			item: item.model,
			kind: ActionListItemKind.Action,
			canPreview: false,
			group: { title: '', icon: ThemeIcon.fromId(item.isCurrent ? Codicon.check.id : Codicon.blank.id) },
			disabled: false,
			hideIcon: false,
			label: item.model.metadata.name,
		} satisfies IActionListItem<ILanguageModelChatMetadataAndIdentifier>));

		const delegate = {
			onSelect: (item: ILanguageModelChatMetadataAndIdentifier) => {
				if (item.identifier !== this.currentModel.identifier) {
					this.setModel(item);
					this.currentModel = item;
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
			anchor,
			container,
			buttonBar
		);
	}
}
