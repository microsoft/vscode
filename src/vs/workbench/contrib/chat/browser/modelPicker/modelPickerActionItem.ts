/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../common/languageModels.js';
import { localize } from '../../../../../nls.js';
import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon, renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider, IActionWidgetDropdownOptions } from '../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { DEFAULT_MODEL_PICKER_CATEGORY } from '../../common/modelPicker/modelPickerWidget.js';
import { IActionProvider } from '../../../../../base/browser/ui/dropdown/dropdown.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { TelemetryTrustedValue } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';

export interface IModelPickerDelegate {
	readonly onDidChangeModel: Event<ILanguageModelChatMetadataAndIdentifier>;
	getCurrentModel(): ILanguageModelChatMetadataAndIdentifier | undefined;
	setModel(model: ILanguageModelChatMetadataAndIdentifier): void;
	getModels(): ILanguageModelChatMetadataAndIdentifier[];
}

type ChatModelChangeClassification = {
	owner: 'lramos15';
	comment: 'Reporting when the model picker is switched';
	fromModel?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous chat model' };
	toModel: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new chat model' };
};

type ChatModelChangeEvent = {
	fromModel: string | TelemetryTrustedValue<string> | undefined;
	toModel: string | TelemetryTrustedValue<string>;
};


function modelDelegateToWidgetActionsProvider(delegate: IModelPickerDelegate, telemetryService: ITelemetryService): IActionWidgetDropdownActionProvider {
	return {
		getActions: () => {
			const models = delegate.getModels();
			if (models.length === 0) {
				// Show a fake "Auto" entry when no models are available
				return [{
					id: 'auto',
					enabled: true,
					checked: true,
					category: DEFAULT_MODEL_PICKER_CATEGORY,
					class: undefined,
					tooltip: localize('chat.modelPicker.auto', "Auto"),
					label: localize('chat.modelPicker.auto', "Auto"),
					run: () => { }
				} satisfies IActionWidgetDropdownAction];
			}
			return models.map(model => {
				return {
					id: model.metadata.id,
					enabled: true,
					icon: model.metadata.statusIcon,
					checked: model.identifier === delegate.getCurrentModel()?.identifier,
					category: model.metadata.modelPickerCategory || DEFAULT_MODEL_PICKER_CATEGORY,
					class: undefined,
					description: model.metadata.detail,
					tooltip: model.metadata.tooltip ?? model.metadata.name,
					label: model.metadata.name,
					run: () => {
						const previousModel = delegate.getCurrentModel();
						telemetryService.publicLog2<ChatModelChangeEvent, ChatModelChangeClassification>('chat.modelChange', {
							fromModel: previousModel?.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(previousModel.identifier) : 'unknown',
							toModel: model.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(model.identifier) : 'unknown'
						});
						delegate.setModel(model);
					}
				} satisfies IActionWidgetDropdownAction;
			});
		}
	};
}

// DSpace: Disabled additional model management actions in the picker
// We only want users to select between DSpace Online and DSpace Local
function getModelPickerActionBarActionProvider(_commandService: ICommandService, _chatEntitlementService: IChatEntitlementService, _productService: IProductService): IActionProvider {
	const actionProvider: IActionProvider = {
		getActions: () => {
			// Return empty array - no additional actions needed for DSpace
			return [];
		}
	};
	return actionProvider;
}

/**
 * Action view item for selecting a language model in the chat interface.
 */
export class ModelPickerActionItem extends ActionWidgetDropdownActionViewItem {
	private readonly tooltipDisposable = this._register(new MutableDisposable());

	constructor(
		action: IAction,
		protected currentModel: ILanguageModelChatMetadataAndIdentifier | undefined,
		widgetOptions: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'> | undefined,
		delegate: IModelPickerDelegate,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IProductService productService: IProductService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		// Modify the original action with a different label and make it show the current model
		const actionWithLabel: IAction = {
			...action,
			label: currentModel?.metadata.name ?? localize('chat.modelPicker.auto', "Auto"),
			tooltip: localize('chat.modelPicker.label', "Pick Model"),
			run: () => { }
		};

		const modelPickerActionWidgetOptions: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'> = {
			actionProvider: modelDelegateToWidgetActionsProvider(delegate, telemetryService),
			actionBarActionProvider: getModelPickerActionBarActionProvider(commandService, chatEntitlementService, productService)
		};

		super(actionWithLabel, widgetOptions ?? modelPickerActionWidgetOptions, actionWidgetService, keybindingService, contextKeyService);

		// Listen for model changes from the delegate
		this._register(delegate.onDidChangeModel(model => {
			this.currentModel = model;
			if (this.element) {
				this.renderLabel(this.element);
			}
		}));
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		const { name, statusIcon, tooltip } = this.currentModel?.metadata || {};
		const domChildren = [];

		if (statusIcon) {
			const iconElement = renderIcon(statusIcon);
			domChildren.push(iconElement);
			if (tooltip) {
				this.tooltipDisposable.value = this.hoverService.setupDelayedHoverAtMouse(iconElement, () => ({ content: tooltip }));
			}
		}

		domChildren.push(dom.$('span.chat-model-label', undefined, name ?? localize('chat.modelPicker.auto', "Auto")));
		domChildren.push(...renderLabelWithIcons(`$(chevron-down)`));

		dom.reset(element, ...domChildren);
		this.setAriaLabelAttributes(element);
		return null;
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-modelPicker-item');
	}
}
