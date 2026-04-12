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
import './media/chatSessionPickerActionItem.css';
import * as dom from '../../../../../base/browser/dom.js';
import { getActiveWindow } from '../../../../../base/browser/dom.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { renderLabelWithIcons, renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../../nls.js';
/**
 * Action view item for making an option selection for a contributed chat session
 * These options are provided by the relevant ChatSession Provider
 */
let ChatSessionPickerActionItem = class ChatSessionPickerActionItem extends ActionWidgetDropdownActionViewItem {
    constructor(action, initialState, delegate, _pickerOptions, actionWidgetService, contextKeyService, keybindingService, commandService, telemetryService) {
        const { group, item } = initialState;
        const actionWithLabel = {
            ...action,
            label: item?.name || group.name,
            tooltip: item?.description ?? group.description ?? group.name,
            run: () => { }
        };
        const sessionPickerActionWidgetOptions = {
            actionProvider: {
                getActions: () => this.getDropdownActions()
            },
            actionBarActionProvider: undefined,
            reporter: { id: group.id, name: `ChatSession:${group.name}`, includeOptions: false },
            getAnchor: () => this._getAnchorElement(),
        };
        super(actionWithLabel, sessionPickerActionWidgetOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);
        this.delegate = delegate;
        this._pickerOptions = _pickerOptions;
        this.commandService = commandService;
        this.currentOption = item;
        this._register(this.delegate.onDidChangeOption(newOption => {
            this.currentOption = newOption;
            if (this.element) {
                this.renderLabel(this.element);
            }
            this.updateEnabled();
        }));
    }
    /**
     * Returns the actions to show in the dropdown. Can be overridden by subclasses.
     */
    getDropdownActions() {
        // if locked, show the current option only
        const currentOption = this.delegate.getCurrentOption();
        if (currentOption?.locked) {
            return [this.createLockedOptionAction(currentOption)];
        }
        const group = this.delegate.getOptionGroup();
        if (!group) {
            return [];
        }
        const actions = group.items.map(optionItem => {
            const isCurrent = optionItem.id === currentOption?.id;
            return {
                id: optionItem.id,
                enabled: !optionItem.locked,
                icon: optionItem.icon,
                checked: isCurrent,
                class: undefined,
                description: optionItem.description,
                tooltip: optionItem.description ?? optionItem.name,
                label: optionItem.name,
                run: () => {
                    this.delegate.setOption(optionItem);
                }
            };
        });
        // Add commands at the end in a separate section (only if there are options)
        if (group.commands?.length) {
            const addSeparator = actions.length > 0;
            for (const command of group.commands) {
                const args = command.arguments ? [...command.arguments] : [];
                const sessionResource = this.delegate.getSessionResource();
                if (sessionResource) {
                    args.unshift(sessionResource);
                }
                actions.push({
                    id: command.command,
                    enabled: true,
                    checked: false,
                    class: undefined,
                    description: undefined,
                    tooltip: command.tooltip ?? command.title,
                    label: command.title,
                    // Use category to create a separator before commands (only if there are options)
                    category: addSeparator ? { label: '', order: Number.MAX_SAFE_INTEGER } : undefined,
                    run: () => {
                        this.commandService.executeCommand(command.command, ...args);
                    }
                });
            }
        }
        return actions;
    }
    /**
     * Creates a disabled action for a locked option.
     */
    createLockedOptionAction(option) {
        return {
            id: option.id,
            enabled: false,
            icon: option.icon,
            checked: true,
            class: undefined,
            description: option.description,
            tooltip: option.description ?? option.name,
            label: option.name,
            run: () => { }
        };
    }
    /**
     * Returns the anchor element for the dropdown.
     * Falls back to the overflow anchor if this element is not in the DOM.
     */
    _getAnchorElement() {
        if (this.element && getActiveWindow().document.contains(this.element)) {
            return this.element;
        }
        return this._pickerOptions?.getOverflowAnchor?.() ?? this.element;
    }
    renderLabel(element) {
        const domChildren = [];
        element.classList.add('chat-session-option-picker');
        const group = this.delegate.getOptionGroup();
        // If the current option is the default and has an icon, collapse the text and show only the icon
        const isDefaultWithIcon = this.currentOption?.default && this.currentOption?.icon;
        if (this.currentOption?.icon) {
            domChildren.push(renderIcon(this.currentOption.icon));
        }
        if (!isDefaultWithIcon) {
            domChildren.push(dom.$('span.chat-session-option-label', undefined, this.currentOption?.name ?? group?.description ?? localize('chat.sessionPicker.label', "Pick Option")));
        }
        domChildren.push(...renderLabelWithIcons(`$(chevron-down)`));
        dom.reset(element, ...domChildren);
        this.setAriaLabelAttributes(element);
        return null;
    }
    render(container) {
        this.container = container;
        super.render(container);
        container.classList.add(this.getContainerClass());
        // Set initial locked state on container
        if (this.currentOption?.locked) {
            container.classList.add('locked');
        }
    }
    /**
     * Returns the CSS class to add to the container. Can be overridden by subclasses.
     */
    getContainerClass() {
        return 'chat-sessionPicker-item';
    }
    updateEnabled() {
        const originalEnabled = this.action.enabled;
        if (this.currentOption?.locked) {
            this.action.enabled = false;
        }
        super.updateEnabled();
        this.action.enabled = originalEnabled;
        if (this.container) {
            this.container.classList.toggle('locked', !!this.currentOption?.locked);
        }
    }
};
ChatSessionPickerActionItem = __decorate([
    __param(4, IActionWidgetService),
    __param(5, IContextKeyService),
    __param(6, IKeybindingService),
    __param(7, ICommandService),
    __param(8, ITelemetryService)
], ChatSessionPickerActionItem);
export { ChatSessionPickerActionItem };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNlc3Npb25QaWNrZXJBY3Rpb25JdGVtLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRTZXNzaW9ucy9jaGF0U2Vzc2lvblBpY2tlckFjdGlvbkl0ZW0udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyx5Q0FBeUMsQ0FBQztBQUdqRCxPQUFPLEtBQUssR0FBRyxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUVwRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUVuSSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFMUYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLFVBQVUsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzFHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQWFqRDs7O0dBR0c7QUFDSSxJQUFNLDJCQUEyQixHQUFqQyxNQUFNLDJCQUE0QixTQUFRLGtDQUFrQztJQUlsRixZQUNDLE1BQWUsRUFDZixZQUEwRyxFQUN2RixRQUFvQyxFQUNwQyxjQUFtRCxFQUNoRCxtQkFBeUMsRUFDM0MsaUJBQXFDLEVBQ3JDLGlCQUFxQyxFQUNyQixjQUErQixFQUNoRCxnQkFBbUM7UUFFdEQsTUFB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