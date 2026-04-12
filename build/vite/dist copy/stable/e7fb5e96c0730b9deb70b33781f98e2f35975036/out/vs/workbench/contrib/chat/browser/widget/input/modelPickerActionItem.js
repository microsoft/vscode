/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as dom from '../../../../../../base/browser/dom.js';
import { renderIcon, renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { TelemetryTrustedValue } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { MANAGE_CHAT_COMMAND_ID } from '../../../common/constants.js';
import { DEFAULT_MODEL_PICKER_CATEGORY } from '../../../common/widget/input/modelPickerWidget.js';
import { ChatInputPickerActionViewItem } from './chatInputPickerActionItem.js';
function modelDelegateToWidgetActionsProvider(delegate, telemetryService, pickerOptions) {
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
                        hover: { content: localize('chat.modelPicker.auto.description', "Automatically selects the best model for your task based on capacity."), position: pickerOptions.hoverPosition },
                        run: () => { }
                    }];
            }
            return models.map(model => {
                const hoverContent = model.metadata.tooltip;
                return {
                    id: model.metadata.id,
                    enabled: true,
                    icon: model.metadata.statusIcon,
                    checked: model.identifier === delegate.currentModel.get()?.identifier,
                    category: model.metadata.modelPickerCategory || DEFAULT_MODEL_PICKER_CATEGORY,
                    class: undefined,
                    description: model.metadata.multiplier ?? model.metadata.detail,
                    tooltip: hoverContent ? '' : model.metadata.name,
                    hover: hoverContent ? { content: hoverContent, position: pickerOptions.hoverPosition } : undefined,
                    label: model.metadata.name,
                    run: () => {
                        const previousModel = delegate.currentModel.get();
                        telemetryService.publicLog2('chat.modelChange', {
                            fromModel: previousModel?.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(previousModel.identifier) : 'unknown',
                            toModel: model.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(model.identifier) : 'unknown'
                        });
                        delegate.setModel(model);
                    }
                };
            });
        }
    };
}
function getModelPickerActionBarActionProvider(commandService, chatEntitlementService, productService) {
    const actionProvider = {
        getActions: () => {
            const additionalActions = [];
            if (chatEntitlementService.entitlement === ChatEntitlement.Free ||
                chatEntitlementService.entitlement === ChatEntitlement.EDU ||
                chatEntitlementService.entitlement === ChatEntitlement.Pro ||
                chatEntitlementService.entitlement === ChatEntitlement.ProPlus ||
                chatEntitlementService.entitlement === ChatEntitlement.Business ||
                chatEntitlementService.entitlement === ChatEntitlement.Enterprise ||
                chatEntitlementService.isInternal) {
                additionalActions.push({
                    id: 'manageModels',
                    label: localize('chat.manageModels', "Manage Models..."),
                    enabled: true,
                    tooltip: localize('chat.manageModels.tooltip', "Manage Language Models"),
                    class: undefined,
                    run: () => {
                        commandService.executeCommand(MANAGE_CHAT_COMMAND_ID);
                    }
                });
            }
            // Add sign-in / upgrade option if entitlement is anonymous / free / new user
            const isNewOrAnonymousUser = !chatEntitlementService.sentiment.completed ||
                chatEntitlementService.entitlement === ChatEntitlement.Available ||
                chatEntitlementService.anonymous ||
                chatEntitlementService.entitlement === ChatEntitlement.Unknown;
            if (isNewOrAnonymousUser || chatEntitlementService.entitlement === ChatEntitlement.Free) {
                additionalActions.push({
                    id: 'moreModels',
                    label: isNewOrAnonymousUser ? localize('chat.moreModels', "Add Language Models") : localize('chat.morePremiumModels', "Add Premium Models"),
                    enabled: true,
                    tooltip: isNewOrAnonymousUser ? localize('chat.moreModels.tooltip', "Add Language Models") : localize('chat.morePremiumModels.tooltip', "Add Premium Models"),
                    class: undefined,
                    run: () => {
                        const commandId = isNewOrAnonymousUser ? 'workbench.action.chat.triggerSetup' : 'workbench.action.chat.upgradePlan';
                        commandService.executeCommand(commandId);
                    }
                });
            }
            return additionalActions;
        }
    };
    return actionProvider;
}
/**
 * Action view item for selecting a language model in the chat interface.
 */
let ModelPickerActionItem = class ModelPickerActionItem extends ChatInputPickerActionViewItem {
    constructor(action, widgetOptions, delegate, pickerOptions, actionWidgetService, contextKeyService, commandService, chatEntitlementService, keybindingService, telemetryService, productService) {
        // Modify the original action with a different label and make it show the current model
        const actionWithLabel = {
            ...action,
            label: delegate.currentModel.get()?.metadata.name ?? localize('chat.modelPicker.auto', "Auto"),
            run: () => { }
        };
        const baseActionBarActionProvider = getModelPickerActionBarActionProvider(commandService, chatEntitlementService, productService);
        const modelPickerActionWidgetOptions = {
            actionProvider: modelDelegateToWidgetActionsProvider(delegate, telemetryService, pickerOptions),
            actionBarActionProvider: { getActions: () => baseActionBarActionProvider.getActions() },
            reporter: { id: 'ChatModelPicker', name: 'ChatModelPicker', includeOptions: true },
        };
        super(actionWithLabel, widgetOptions ?? modelPickerActionWidgetOptions, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);
        this.currentModel = delegate.currentModel.get();
        // Listen for model changes from the delegate
        this._register(autorun(t => {
            const model = delegate.currentModel.read(t);
            this.currentModel = model;
            this.updateTooltip();
            if (this.element) {
                this.renderLabel(this.element);
            }
        }));
    }
    getHoverContents() {
        const label = `${localize('chat.modelPicker.label', "Pick Model")}${super.getHoverContents()}`;
        const { statusIcon, tooltip } = this.currentModel?.metadata || {};
        return statusIcon && tooltip ? `${label} • ${tooltip}` : label;
    }
    setAriaLabelAttributes(element) {
        super.setAriaLabelAttributes(element);
        const modelName = this.currentModel?.metadata.name ?? localize('chat.modelPicker.auto', "Auto");
        element.ariaLabel = localize('chat.modelPicker.ariaLabel', "Pick Model, {0}", modelName);
    }
    renderLabel(element) {
        const { name, statusIcon } = this.currentModel?.metadata || {};
        const domChildren = [];
        if (statusIcon) {
            const iconElement = renderIcon(statusIcon);
            domChildren.push(iconElement);
        }
        domChildren.push(dom.$('span.chat-input-picker-label', undefined, name ?? localize('chat.modelPicker.auto', "Auto")));
        domChildren.push(...renderLabelWithIcons(`$(chevron-down)`));
        dom.reset(element, ...domChildren);
        this.setAriaLabelAttributes(element);
        return null;
    }
};
ModelPickerActionItem = __decorate([
    __param(4, IActionWidgetService),
    __param(5, IContextKeyService),
    __param(6, ICommandService),
    __param(7, IChatEntitlementService),
    __param(8, IKeybindingService),
    __param(9, ITelemetryService),
    __param(10, IProductService)
], ModelPickerActionItem);
export { ModelPickerActionItem };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWxQaWNrZXJBY3Rpb25JdGVtLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9pbnB1dC9tb2RlbFBpY2tlckFjdGlvbkl0ZW0udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSx1Q0FBdUMsQ0FBQztBQUc3RCxPQUFPLEVBQUUsVUFBVSxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFHN0csT0FBTyxFQUFFLE9BQU8sRUFBZSxNQUFNLDZDQUE2QyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUV2RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDekYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxlQUFlLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN6SCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUV0RSxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNsRyxPQUFPLEVBQUUsNkJBQTZCLEVBQTJCLE1B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