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
import { IActionWidgetService } from './actionWidget.js';
import { BaseDropdown } from '../../../base/browser/ui/dropdown/dropdown.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { Codicon } from '../../../base/common/codicons.js';
import { getActiveElement, isHTMLElement } from '../../../base/browser/dom.js';
import { IKeybindingService } from '../../keybinding/common/keybinding.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
/**
 * Action widget dropdown is a dropdown that uses the action widget under the hood to simulate a native dropdown menu
 * The benefits of this include non native features such as headers, descriptions, icons, and button bar
 */
let ActionWidgetDropdown = class ActionWidgetDropdown extends BaseDropdown {
    constructor(container, _options, actionWidgetService, keybindingService, telemetryService) {
        super(container, _options);
        this._options = _options;
        this.actionWidgetService = actionWidgetService;
        this.keybindingService = keybindingService;
        this.telemetryService = telemetryService;
        this._enabled = true;
    }
    show() {
        if (!this._enabled) {
            return;
        }
        const actionBarActions = this._options.actionBarActions ?? this._options.actionBarActionProvider?.getActions() ?? [];
        const actions = this._options.actions ?? this._options.actionProvider?.getActions() ?? [];
        // Track the currently selected option before opening
        const optionBeforeOpen = actions.find(a => a.checked);
        let selectedOption = optionBeforeOpen;
        const actionWidgetItems = [];
        const actionsByCategory = new Map();
        for (const action of actions) {
            let category = action.category;
            if (!category) {
                category = { label: '', order: Number.MIN_SAFE_INTEGER };
            }
            if (!actionsByCategory.has(category.label)) {
                actionsByCategory.set(category.label, []);
            }
            actionsByCategory.get(category.label).push(action);
        }
        // Sort categories by order
        const sortedCategories = Array.from(actionsByCategory.entries())
            .sort((a, b) => {
            const aOrder = a[1][0]?.category?.order ?? Number.MAX_SAFE_INTEGER;
            const bOrder = b[1][0]?.category?.order ?? Number.MAX_SAFE_INTEGER;
            return aOrder - bOrder;
        });
        for (let i = 0; i < sortedCategories.length; i++) {
            const [categoryLabel, categoryActions] = sortedCategories[i];
            const showHeader = categoryActions[0]?.category?.showHeader ?? false;
            if (showHeader && categoryLabel) {
                actionWidgetItems.push({
                    kind: "header" /* ActionListItemKind.Header */,
                    label: categoryLabel,
                    canPreview: false,
                    disabled: false,
                    hideIcon: false,
                });
            }
            // Push actions for each category
            for (const action of categoryActions) {
                actionWidgetItems.push({
                    item: action,
                    tooltip: action.tooltip,
                    description: action.description,
                    hover: action.hover,
                    toolbarActions: action.toolbarActions,
                    kind: "action" /* ActionListItemKind.Action */,
                    canPreview: false,
                    group: { title: '', icon: action.icon ?? ThemeIcon.fromId(action.checked ? Codicon.check.id : Codicon.blank.id) },
                    disabled: !action.enabled,
                    hideIcon: false,
                    label: action.label,
                    keybinding: this._options.showItemKeybindings ?
                        this.keybindingService.lookupKeybinding(action.id) :
                        undefined,
                });
            }
            // Add separator after each category except the last one
            if (i < sortedCategories.length - 1) {
                actionWidgetItems.push({
                    label: '',
                    kind: "separator" /* ActionListItemKind.Separator */,
                    canPreview: false,
                    disabled: false,
                    hideIcon: false,
                });
            }
        }
        const previouslyFocusedElement = getActiveElement();
        const auxiliaryActionIds = new Set(actionBarActions.map(action => action.id));
        const actionWidgetDelegate = {
            onSelect: (action, preview) => {
                if (!auxiliaryActionIds.has(action.id)) {
                    selectedOption = action;
                }
                this.actionWidgetService.hide();
                action.run();
            },
            onHide: () => {
                this.hide();
                if (isHTMLElement(previouslyFocusedElement)) {
                    previouslyFocusedElement.focus();
                }
                this._emitCloseEvent(optionBeforeOpen, selectedOption);
            }
        };
        if (actionBarActions.length) {
            if (actionWidgetItems.length) {
                actionWidgetItems.push({
                    label: '',
                    kind: "separator" /* ActionListItemKind.Separator */,
                    canPreview: false,
                    disabled: false,
                    hideIcon: false,
                });
            }
            for (const action of actionBarActions) {
                actionWidgetItems.push({
                    item: action,
                    tooltip: action.tooltip,
                    kind: "action" /* ActionListItemKind.Action */,
                    canPreview: false,
                    group: { title: '', icon: ThemeIcon.fromId(Codicon.blank.id) },
                    disabled: !action.enabled,
                    hideIcon: false,
                    label: action.label,
                });
            }
        }
        const accessibilityProvider = {
            isChecked(element) {
                return element.kind === "action" /* ActionListItemKind.Action */ && !!element?.item?.checked;
            },
            getRole: (e) => {
                switch (e.kind) {
                    case "action" /* ActionListItemKind.Action */:
                        // Auxiliary actions are not checkable options, so use 'menuitem' to
                        // avoid screen readers announcing them as unchecked checkboxes.
                        return e.item && auxiliaryActionIds.has(e.item.id) ? 'menuitem' : 'menuitemcheckbox';
                    case "separator" /* ActionListItemKind.Separator */:
                        return 'separator';
                    default:
                        return 'separator';
                }
            },
            getWidgetRole: () => 'menu',
        };
        super.show();
        this.actionWidgetService.show(this._options.label ?? '', false, actionWidgetItems, actionWidgetDelegate, this._options.getAnchor?.() ?? this.element, undefined, [], accessibilityProvider, this._options.listOptions);
    }
    setEnabled(enabled) {
        this._enabled = enabled;
    }
    _emitCloseEvent(optionBeforeOpen, selectedOption) {
        const optionBefore = optionBeforeOpen;
        const optionAfter = selectedOption;
        if (this._options.reporter) {
            this.telemetryService.publicLog2('actionWidgetDropdownClosed', {
                id: this._options.reporter.id,
                name: this._options.reporter.name,
                selectionChanged: optionBefore?.id !== optionAfter?.id,
                optionIdBefore: this._options.reporter.includeOptions ? optionBefore?.id : undefined,
                optionIdAfter: this._options.reporter.includeOptions ? optionAfter?.id : undefined,
                optionLabelBefore: this._options.reporter.includeOptions ? optionBefore?.label : undefined,
                optionLabelAfter: this._options.reporter.includeOptions ? optionAfter?.label : undefined,
            });
        }
    }
};
ActionWidgetDropdown = __decorate([
    __param(2, IActionWidgetService),
    __param(3, IKeybindingService),
    __param(4, ITelemetryService)
], ActionWidgetDropdown);
export { ActionWidgetDropdown };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWN0aW9uV2lkZ2V0RHJvcGRvd24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXREcm9wZG93bi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUV6RCxPQUFPLEVBQUUsWUFBWSxFQUF5QyxNQUFNLCtDQUErQyxDQUFDO0FBRXBILE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLGdCQUFnQixFQUFFLGFBQWEsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQy9FLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRTNFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBK0N4RTs7O0dBR0c7QUFDSSxJQUFNLG9CQUFvQixHQUExQixNQUFNLG9CQUFxQixTQUFRLFlBQVk7SUFJckQsWUFDQyxTQUFzQixFQUNMLFFBQXNDLEVBQ2pDLG1CQUEwRCxFQUM1RCxpQkFBc0QsRUFDdkQsZ0JBQW9EO1FBRXZFLEtBQUssQ0FBQyxTQUFTLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFMVixhQUFRLEdBQVIsUUFBUSxDQUE4QjtRQUNoQix3QkFBbUIsR0FBbkIsbUJBQW1CLENBQXNCO1FBQzNDLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBb0I7UUFDdEMscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFtQjtRQVBoRSxhQUFRLEdBQVksSUFBSSxDQUFDO0lBVWpDLENBQUM7SUFFUSxJQUFJO1FBQ1osSUFBSSxDQUFDLElBQUksQ0FBQyxR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