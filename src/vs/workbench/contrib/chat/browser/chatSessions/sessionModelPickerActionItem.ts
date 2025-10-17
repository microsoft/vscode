/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../../base/common/actions.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../common/languageModels.js';
import { localize } from '../../../../../nls.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider, IActionWidgetDropdownOptions } from '../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IModelPickerDelegate, ModelPickerActionItem } from '../modelPicker/modelPickerActionItem.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';


function modelDelegateToWidgetActionsProvider(delegate: IModelPickerDelegate): IActionWidgetDropdownActionProvider {
	return {
		getActions: () => {
			return delegate.getModels().map(model => {
				return {
					id: model.metadata.id,
					enabled: true,
					icon: model.metadata.statusIcon,
					checked: model.identifier === delegate.getCurrentModel()?.identifier,
					class: undefined,
					description: model.metadata.detail,
					tooltip: model.metadata.tooltip ?? model.metadata.name,
					label: model.metadata.name,
					run: () => {
						delegate.setModel(model);

					}
				} satisfies IActionWidgetDropdownAction;
			});
		}
	};
}

/**
 * Action view item for selecting the model for a contributed chat session
 * These models are also contributed by the chat session provider and cannot be used outside that context
 * This may also be generalized into eg 'Chat Session Picker 1' to be used however the provider wants
 */
export class ChatSessionModelPickerActionItem extends ModelPickerActionItem {
	constructor(
		action: IAction,
		currentModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		delegate: IModelPickerDelegate,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		const actionWithLabel: IAction = {
			...action,
			label: currentModel?.metadata.name ?? localize('chat.modelPicker.label', "Pick Model"),
			tooltip: localize('chat.modelPicker.label', "Pick Model"),
			run: () => { }
		};

		const modelPickerActionWidgetOptions: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'> = {
			actionProvider: modelDelegateToWidgetActionsProvider(delegate),
			actionBarActionProvider: undefined,
		};

		super(actionWithLabel, currentModel, modelPickerActionWidgetOptions, delegate, actionWidgetService, contextKeyService, commandService, chatEntitlementService, keybindingService, telemetryService);
		this._register(delegate.onDidChangeModel(model => {
			this.currentModel = model;
			if (this.element) {
				this.renderLabel(this.element);
			}
		}));
	}
}
