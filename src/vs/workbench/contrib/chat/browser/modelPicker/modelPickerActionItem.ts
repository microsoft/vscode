/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../common/languageModels.js';
import { localize } from '../../../../../nls.js';
import * as dom from '../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider, IActionWidgetDropdownOptions } from '../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ChatEntitlement, IChatEntitlementService } from '../../common/chatEntitlementService.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { DEFAULT_MODEL_PICKER_CATEGORY } from '../../common/modelPicker/modelPickerWidget.js';
import { ManageModelsAction } from '../actions/manageModelsActions.js';

export interface IModelPickerDelegate {
	readonly onDidChangeModel: Event<ILanguageModelChatMetadataAndIdentifier>;
	getCurrentModel(): ILanguageModelChatMetadataAndIdentifier | undefined;
	setModel(model: ILanguageModelChatMetadataAndIdentifier): void;
	getModels(): ILanguageModelChatMetadataAndIdentifier[];
}

function modelDelegateToWidgetActionsProvider(delegate: IModelPickerDelegate): IActionWidgetDropdownActionProvider {
	return {
		getActions: () => {
			return delegate.getModels().map(model => {
				return {
					id: model.metadata.id,
					enabled: true,
					checked: model.identifier === delegate.getCurrentModel()?.identifier,
					category: model.metadata.modelPickerCategory || DEFAULT_MODEL_PICKER_CATEGORY,
					class: undefined,
					description: model.metadata.cost,
					tooltip: model.metadata.description ?? model.metadata.name,
					label: model.metadata.name,
					run: () => {
						delegate.setModel(model);
					}
				} satisfies IActionWidgetDropdownAction;
			});
		}
	};
}

function getModelPickerActionBarActions(menuService: IMenuService, contextKeyService: IContextKeyService, commandService: ICommandService, chatEntitlementService: IChatEntitlementService): IAction[] {
	const additionalActions: IAction[] = [];

	if (
		chatEntitlementService.entitlement === ChatEntitlement.Free ||
		chatEntitlementService.entitlement === ChatEntitlement.Pro ||
		chatEntitlementService.entitlement === ChatEntitlement.ProPlus ||
		chatEntitlementService.isInternal
	) {
		additionalActions.push({
			id: 'manageModels',
			label: localize('chat.manageModels', "Manage Models..."),
			enabled: true,
			tooltip: localize('chat.manageModels.tooltip', "Manage language models"),
			class: undefined,
			run: () => {
				const commandId = ManageModelsAction.ID;
				commandService.executeCommand(commandId);
			}
		});
	}

	// Add upgrade option if entitlement is free
	if (chatEntitlementService.entitlement === ChatEntitlement.Free) {
		additionalActions.push({
			id: 'moreModels',
			label: localize('chat.moreModels', "Add Premium Models"),
			enabled: true,
			tooltip: localize('chat.moreModels.tooltip', "Add premium models"),
			class: undefined,
			run: () => {
				const commandId = 'workbench.action.chat.upgradePlan';
				commandService.executeCommand(commandId);
			}
		});
	}

	return additionalActions;
}

/**
 * Action view item for selecting a language model in the chat interface.
 */
export class ModelPickerActionItem extends ActionWidgetDropdownActionViewItem {
	constructor(
		action: IAction,
		private currentModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		delegate: IModelPickerDelegate,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		// Modify the original action with a different label and make it show the current model
		const actionWithLabel: IAction = {
			...action,
			label: currentModel?.metadata.name ?? localize('chat.modelPicker.label', "Pick Model"),
			tooltip: localize('chat.modelPicker.label', "Pick Model"),
			run: () => { }
		};

		const modelPickerActionWidgetOptions: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'> = {
			actionProvider: modelDelegateToWidgetActionsProvider(delegate),
			actionBarActions: getModelPickerActionBarActions(menuService, contextKeyService, commandService, chatEntitlementService)
		};

		super(actionWithLabel, modelPickerActionWidgetOptions, actionWidgetService, keybindingService, contextKeyService);

		// Listen for model changes from the delegate
		this._register(delegate.onDidChangeModel(model => {
			this.currentModel = model;
			if (this.element) {
				this.renderLabel(this.element);
			}
		}));
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		dom.reset(element, dom.$('span.chat-model-label', undefined, this.currentModel?.metadata.name ?? localize('chat.modelPicker.label', "Pick Model")), ...renderLabelWithIcons(`$(chevron-down)`));
		this.setAriaLabelAttributes(element);
		return null;
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-modelPicker-item');
	}
}
